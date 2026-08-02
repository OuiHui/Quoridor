import os
import sys
import time
import socket
import select
import struct
import numpy as np
import onnxruntime as ort
import torch

PORT = 5555
HOST = "127.0.0.1"
DEFAULT_ONNX_PATH = "quoridor_model.onnx"
CHECKPOINT_PATH = "quoridor_checkpoint.pth"

def get_latest_model_path():
    """Finds the path to the newest available ONNX model."""
    epoch = 0
    if os.path.exists(CHECKPOINT_PATH):
        try:
            checkpoint = torch.load(CHECKPOINT_PATH, map_location='cpu', weights_only=False)
            epoch = checkpoint.get('epoch', 0)
        except Exception:
            pass
            
    candidates = [
        f"quoridor_model_epoch_{epoch+1:03d}.onnx",
        f"quoridor_model_epoch_{epoch:03d}.onnx",
        DEFAULT_ONNX_PATH
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

class InferenceEngine:
    """Manages the ONNX Runtime session with CUDA optimizations."""
    def __init__(self, model_path):
        self.model_path = model_path
        self.session = None
        self.input_name = None
        self.mtime = None
        self.load_model(model_path)

    def load_model(self, path):
        if not os.path.exists(path):
            return False
            
        providers = ort.get_available_providers()
        selected_providers = []
        if 'CUDAExecutionProvider' in providers:
            selected_providers.append((
                'CUDAExecutionProvider', {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4 GB max memory limit
                    'cudnn_conv_algo_search': 'EXHAUSTIVE',
                    'do_copy_in_default_stream': True,
                }
            ))
        if 'CPUExecutionProvider' in providers:
            selected_providers.append('CPUExecutionProvider')

        with open(path, "rb") as f:
            model_bytes = f.read()

        try:
            session_options = ort.SessionOptions()
            session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            self.session = ort.InferenceSession(model_bytes, session_options, providers=selected_providers)
            self.input_name = self.session.get_inputs()[0].name
            self.model_path = path
            self.mtime = os.path.getmtime(path)
            
            # Warmup run
            dummy = np.zeros((1, 11, 9, 9), dtype=np.float32)
            self.session.run(['policy', 'value'], {self.input_name: dummy})
            
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Loaded ONNX model '{path}' using {self.session.get_providers()[0]}", flush=True)
            return True
        except Exception as e:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] [GPU Server] Error loading ONNX model '{path}': {e}", flush=True)
            return False

    def check_and_reload(self):
        latest = get_latest_model_path()
        if latest and latest != self.model_path:
            self.load_model(latest)
        elif latest and os.path.exists(latest):
            current_mtime = os.path.getmtime(latest)
            if self.mtime is None or current_mtime > self.mtime:
                self.load_model(latest)

    def evaluate_combined(self, batch_input):
        outputs = self.session.run(['policy', 'value'], {self.input_name: batch_input})
        logits = outputs[0]
        values = outputs[1]

        logits_max = np.max(logits, axis=1, keepdims=True)
        e_x = np.exp(logits - logits_max)
        policies = e_x / np.sum(e_x, axis=1, keepdims=True)

        return policies.astype(np.float32), values.ravel().astype(np.float32)

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
    model_path = get_latest_model_path()
    while model_path is None:
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] [GPU Server] Waiting for ONNX model file to exist...", flush=True)
        time.sleep(3)
        model_path = get_latest_model_path()

    engine = InferenceEngine(model_path)

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
                else:
                    pass

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
