import socket
import struct
import numpy as np
import onnxruntime as ort

def receive_exact(sock, n_bytes):
    """Utility function to receive exact byte count from TCP socket using MSG_WAITALL."""
    try:
        data = sock.recv(n_bytes, socket.MSG_WAITALL)
        if not data or len(data) < n_bytes:
            return None
        return data
    except socket.error:
        return None

class RemoteModelEvaluator:
    """Client interface for Centralized GPU Inference Server over TCP IPC."""
    def __init__(self, host="127.0.0.1", port=5555):
        self.host = host
        self.port = port
        self.sock = None
        self.connect()

    def connect(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            self.sock.connect((self.host, self.port))
            print(f"RemoteModelEvaluator connected to GPU server at tcp://{self.host}:{self.port}")
            return True
        except Exception as e:
            self.sock = None
            print(f"RemoteModelEvaluator failed to connect to GPU server: {e}")
            return False

    def evaluate_batch(self, input_array):
        """
        Sends input_array of shape [M, 11, 9, 9] float32 to GPU server,
        and returns tuple of (policies [M, 140], values [M]).
        """
        if self.sock is None:
            if not self.connect():
                raise RuntimeError("No active connection to GPU inference server.")

        m_count = input_array.shape[0]
        input_bytes = input_array.astype(np.float32).tobytes()
        header = struct.pack('!I', m_count)

        try:
            self.sock.sendall(header + input_bytes)

            resp_header = receive_exact(self.sock, 8)
            if resp_header is None:
                raise ConnectionResetError("GPU server closed connection unexpectedly.")

            p_bytes_len, v_bytes_len = struct.unpack('!II', resp_header)
            payload = receive_exact(self.sock, p_bytes_len + v_bytes_len)
            if payload is None:
                raise ConnectionResetError("Truncated response from GPU server.")

            p_bytes = payload[:p_bytes_len]
            v_bytes = payload[p_bytes_len:]

            policies = np.frombuffer(p_bytes, dtype=np.float32).reshape(m_count, 140)
            values = np.frombuffer(v_bytes, dtype=np.float32).reshape(m_count)

            return policies, values

        except (socket.error, ConnectionResetError) as e:
            print(f"RemoteModelEvaluator socket error ({e}), retrying connection...")
            self.connect()
            raise e

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

class ONNXModelEvaluator:
    """Local ONNX Runtime model evaluator for fallback or standalone mode."""
    def __init__(self, onnx_path):
        providers = ort.get_available_providers()
        selected_providers = []
        if 'CUDAExecutionProvider' in providers:
            selected_providers.append((
                'CUDAExecutionProvider', {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 2 * 1024 * 1024 * 1024,
                    'cudnn_conv_algo_search': 'HEURISTIC',
                    'do_copy_in_default_stream': True,
                }
            ))
        if 'CPUExecutionProvider' in providers:
            selected_providers.append('CPUExecutionProvider')
            
        print(f"ONNX Runtime initializing with providers: {[p[0] if isinstance(p, tuple) else p for p in selected_providers]}")
        
        with open(onnx_path, "rb") as f:
            model_bytes = f.read()
            
        try:
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self.session = ort.InferenceSession(model_bytes, opts, providers=selected_providers)
            self.input_name = self.session.get_inputs()[0].name
            dummy = np.zeros((1, 11, 9, 9), dtype=np.float32)
            self.session.run(['policy', 'value'], {self.input_name: dummy})
            print(f"ONNX Runtime initialized with: {self.session.get_providers()}")
        except Exception as e:
            print(f"Warning: Selected providers failed test inference ({e}). Falling back to CPU...")
            self.session = ort.InferenceSession(model_bytes, providers=['CPUExecutionProvider'])
            self.input_name = self.session.get_inputs()[0].name
        
    def evaluate_batch(self, input_array):
        outputs = self.session.run(['policy', 'value'], {self.input_name: input_array})
        logits = outputs[0]
        values = outputs[1]
        
        logits_max = np.max(logits, axis=1, keepdims=True)
        e_x = np.exp(logits - logits_max)
        policies = e_x / np.sum(e_x, axis=1, keepdims=True)
        
        return policies.astype(np.float32), values.ravel().astype(np.float32)

def create_evaluator(onnx_path, use_central_server=True, port=5555):
    """
    Factory function: Attempts to create a RemoteModelEvaluator first.
    Falls back to local ONNXModelEvaluator if server is unreachable or disabled.
    """
    if use_central_server:
        try:
            remote = RemoteModelEvaluator(port=port)
            return remote
        except Exception as e:
            print(f"Central GPU server unavailable ({e}). Falling back to local ONNX evaluator.")

    return ONNXModelEvaluator(onnx_path)
