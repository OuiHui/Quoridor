import os
import sys
import time
import socket
import struct
import queue
import threading
import numpy as np
import torch
from quoridor_model import QuoridorNet

PORT = 5555
HOST = "127.0.0.1"
CHECKPOINT_PATH = "quoridor_checkpoint.pth"

# Enable cuDNN autotuner for maximum GPU kernel performance
torch.backends.cudnn.benchmark = True

def get_latest_checkpoint_path():
    """Finds the newest available PyTorch model checkpoint."""
    if os.path.exists(CHECKPOINT_PATH):
        return CHECKPOINT_PATH
    return None

class PyTorchCUDAInferenceEngine:
    """High-throughput PyTorch CUDA Inference Engine using FP16 Tensor Cores."""
    def __init__(self, checkpoint_path=None):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = QuoridorNet(num_residual_blocks=10, channels=128).to(self.device).eval()
        self.checkpoint_path = None
        self.mtime = None
        
        if checkpoint_path and os.path.exists(checkpoint_path):
            self.load_checkpoint(checkpoint_path)
        else:
            self.check_and_reload()

        # Warmup run with FP16 Autocast
        dummy = torch.zeros((1, 11, 9, 9), device=self.device)
        with torch.inference_mode(), torch.amp.autocast('cuda', enabled=(self.device.type == 'cuda')):
            _ = self.model(dummy)
        
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [GPU Server] PyTorch FP16 Engine active on: {torch.cuda.get_device_name(0) if self.device.type == 'cuda' else 'CPU'}", flush=True)

    def load_checkpoint(self, path):
        if not os.path.exists(path):
            return False
        try:
            ckpt = torch.load(path, map_location=self.device, weights_only=False)
            state_dict = ckpt['model_state_dict'] if 'model_state_dict' in ckpt else ckpt
            self.model.load_state_dict(state_dict, strict=False)
            
            self.checkpoint_path = path
            self.mtime = os.path.getmtime(path)
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Loaded checkpoint '{path}' onto {self.device} (strict=False)", flush=True)
            return True
        except Exception as e:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Error loading checkpoint '{path}': {e}", flush=True)
            return False

    def check_and_reload(self):
        latest = get_latest_checkpoint_path()
        if latest:
            if self.checkpoint_path != latest or os.path.getmtime(latest) > (self.mtime or 0):
                self.load_checkpoint(latest)

    def evaluate_combined(self, batch_input):
        tensor_in = torch.from_numpy(batch_input).to(self.device, non_blocking=True)
        with torch.inference_mode(), torch.amp.autocast('cuda', enabled=(self.device.type == 'cuda')):
            logits, values = self.model(tensor_in)
            policies = torch.softmax(logits, dim=1)
            
        policies_np = np.ascontiguousarray(policies.float().cpu().numpy(), dtype=np.float32)
        values_np = np.ascontiguousarray(values.float().ravel().cpu().numpy(), dtype=np.float32)
        return policies_np, values_np

# Global request queue: items are tuples (conn, m_count, input_arr, result_dict, done_event)
request_queue = queue.Queue()

def client_handler(conn, addr):
    conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [GPU Server] Actor client connected from {addr}", flush=True)

    try:
        while True:
            hdr = conn.recv(4, socket.MSG_WAITALL)
            if not hdr or len(hdr) < 4:
                break
            m_count = struct.unpack('!I', hdr)[0]
            expected_bytes = m_count * 11 * 9 * 9 * 4
            raw_data = conn.recv(expected_bytes, socket.MSG_WAITALL)
            if not raw_data or len(raw_data) < expected_bytes:
                break

            input_arr = np.frombuffer(raw_data, dtype=np.float32).reshape(m_count, 11, 9, 9)
            
            done_event = threading.Event()
            result_container = {}
            request_queue.put((m_count, input_arr, result_container, done_event))
            
            done_event.wait()

            p_bytes = result_container['policies'].tobytes()
            v_bytes = result_container['values'].tobytes()
            conn.sendall(struct.pack('!II', len(p_bytes), len(v_bytes)) + p_bytes + v_bytes)

    except (socket.error, ConnectionResetError):
        pass
    finally:
        conn.close()
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [GPU Server] Actor client disconnected from {addr}", flush=True)

def gpu_worker_loop(engine):
    total_evals = 0
    total_batches = 0
    start_time = time.time()
    last_reload_check = time.time()

    while True:
        # Periodically reload model checkpoint if updated
        now = time.time()
        if now - last_reload_check > 3.0:
            engine.check_and_reload()
            last_reload_check = now

        items = []
        try:
            # Block briefly for first request
            first_item = request_queue.get(timeout=0.005)
            items.append(first_item)
            # Pull any additional pending requests to micro-batch across actors
            while not request_queue.empty():
                try:
                    items.append(request_queue.get_nowait())
                except queue.Empty:
                    break
        except queue.Empty:
            continue

        if not items:
            continue

        batch_inputs = [item[1] for item in items]
        combined_input = np.concatenate(batch_inputs, axis=0)

        policies, values = engine.evaluate_combined(combined_input)

        total_evals += len(combined_input)
        total_batches += 1

        offset = 0
        for m_count, _, res_dict, done_evt in items:
            res_dict['policies'] = policies[offset:offset + m_count]
            res_dict['values'] = values[offset:offset + m_count]
            offset += m_count
            done_evt.set()

        if total_batches % 500 == 0:
            elapsed = time.time() - start_time
            rate = total_evals / max(0.001, elapsed)
            avg_b = total_evals / total_batches
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Processed {total_evals} evaluations in {total_batches} batches (avg batch: {avg_b:.1f}, rate: {rate:.1f} evals/s)", flush=True)

def run_server(port=PORT):
    engine = PyTorchCUDAInferenceEngine()

    # Start GPU worker thread
    gpu_thread = threading.Thread(target=gpu_worker_loop, args=(engine,), daemon=True)
    gpu_thread.start()

    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind((HOST, port))
    server_sock.listen(64)

    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [GPU Server] Listening on tcp://{HOST}:{port}", flush=True)

    try:
        while True:
            conn, addr = server_sock.accept()
            t = threading.Thread(target=client_handler, args=(conn, addr), daemon=True)
            t.start()
    finally:
        server_sock.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Centralized GPU Inference Server for Quoridor AlphaZero.")
    parser.add_argument("--port", type=int, default=PORT, help="Port to listen on")
    args = parser.parse_args()
    run_server(port=args.port)
