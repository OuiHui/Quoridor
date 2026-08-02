import os
import sys
import time
import socket
import select
import struct
import numpy as np
import torch
from quoridor_model import QuoridorNet

PORT = 5555
HOST = "127.0.0.1"
CHECKPOINT_PATH = "quoridor_checkpoint.pth"
DEFAULT_ONNX_PATH = "quoridor_model.onnx"

def get_latest_checkpoint_path():
    """Finds the newest available PyTorch model checkpoint or ONNX model."""
    if os.path.exists(CHECKPOINT_PATH):
        return CHECKPOINT_PATH
    return None

class PyTorchCUDAInferenceEngine:
    """High-throughput PyTorch CUDA Inference Engine for NVIDIA GPUs."""
    def __init__(self, checkpoint_path=None):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = QuoridorNet(num_residual_blocks=10, channels=128).to(self.device).eval()
        self.checkpoint_path = None
        self.mtime = None
        
        if checkpoint_path and os.path.exists(checkpoint_path):
            self.load_checkpoint(checkpoint_path)
        else:
            self.check_and_reload()

        # Warmup run
        dummy = torch.zeros((1, 11, 9, 9), device=self.device)
        with torch.inference_mode():
            _ = self.model(dummy)
        
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [GPU Server] PyTorch Engine running on: {torch.cuda.get_device_name(0) if self.device.type == 'cuda' else 'CPU'}", flush=True)

    def load_checkpoint(self, path):
        if not os.path.exists(path):
            return False
        try:
            ckpt = torch.load(path, map_location=self.device, weights_only=False)
            state_dict = ckpt['model_state_dict'] if 'model_state_dict' in ckpt else ckpt
            self.model.load_state_dict(state_dict)
            self.checkpoint_path = path
            self.mtime = os.path.getmtime(path)
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Successfully loaded weights from '{path}' onto {self.device}", flush=True)
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
        with torch.inference_mode():
            logits, values = self.model(tensor_in)
            policies = torch.softmax(logits, dim=1)
            
        policies_np = policies.cpu().numpy().astype(np.float32)
        values_np = values.ravel().cpu().numpy().astype(np.float32)
        return policies_np, values_np

def receive_exact(sock, n_bytes):
    """Utility to receive exactly n_bytes from a socket."""
    buf = bytearray()
    while len(buf) < n_bytes:
        chunk = sock.recv(n_bytes - len(buf))
        if not chunk:
            return None
        buf.extend(chunk)
    return bytes(buf)

def run_server(port=PORT):
    engine = PyTorchCUDAInferenceEngine()

    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind((HOST, port))
    server_sock.listen(16)
    server_sock.setblocking(False)

    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [GPU Server] Listening on tcp://{HOST}:{port}", flush=True)

    client_sockets = []
    last_reload_check = time.time()

    total_evals = 0
    total_batches = 0
    start_time = time.time()

    try:
        while True:
            # Check model reload every 3 seconds
            now = time.time()
            if now - last_reload_check > 3.0:
                engine.check_and_reload()
                last_reload_check = now

            rlist, _, _ = select.select([server_sock] + client_sockets, [], [], 0.001)

            for s in rlist:
                if s is server_sock:
                    conn, addr = server_sock.accept()
                    conn.setblocking(False)
                    conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                    client_sockets.append(conn)
                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] [GPU Server] Actor client connected from {addr}", flush=True)

            # Read pending requests from connected client sockets
            pending_requests = []
            disconnected = []

            for s in client_sockets:
                try:
                    header = s.recv(4)
                    if not header:
                        disconnected.append(s)
                        continue
                    if len(header) < 4:
                        rem = receive_exact(s, 4 - len(header))
                        if rem is None:
                            disconnected.append(s)
                            continue
                        header = header + rem
                    
                    m_count = struct.unpack('!I', header)[0]
                    expected_bytes = m_count * 11 * 9 * 9 * 4
                    raw_data = receive_exact(s, expected_bytes)
                    if raw_data is None:
                        disconnected.append(s)
                        continue

                    input_arr = np.frombuffer(raw_data, dtype=np.float32).reshape(m_count, 11, 9, 9)
                    pending_requests.append((s, m_count, input_arr))
                except (BlockingIOError, socket.error):
                    continue

            for d_sock in disconnected:
                if d_sock in client_sockets:
                    client_sockets.remove(d_sock)
                    d_sock.close()
                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] [GPU Server] Actor client disconnected.", flush=True)

            if not pending_requests:
                continue

            # Batch aggregation across all ready client requests
            batch_inputs = [req[2] for req in pending_requests]
            combined_input = np.concatenate(batch_inputs, axis=0)

            policies, values = engine.evaluate_combined(combined_input)

            total_evals += len(combined_input)
            total_batches += 1

            # Dispatch sliced outputs back to corresponding client sockets
            offset = 0
            for s, m_count, _ in pending_requests:
                p_sub = policies[offset:offset + m_count]
                v_sub = values[offset:offset + m_count]
                offset += m_count

                p_bytes = p_sub.tobytes()
                v_bytes = v_sub.tobytes()

                header_resp = struct.pack('!II', len(p_bytes), len(v_bytes))
                s.sendall(header_resp + p_bytes + v_bytes)

            if total_batches % 500 == 0:
                elapsed = time.time() - start_time
                rate = total_evals / max(0.001, elapsed)
                avg_b = total_evals / total_batches
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] [GPU Server] Processed {total_evals} evaluations in {total_batches} batches (avg batch: {avg_b:.1f}, rate: {rate:.1f} evals/s)", flush=True)

    finally:
        server_sock.close()
        for s in client_sockets:
            s.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Centralized GPU Inference Server for Quoridor AlphaZero.")
    parser.add_argument("--port", type=int, default=PORT, help="Port to listen on")
    args = parser.parse_args()
    run_server(port=args.port)
