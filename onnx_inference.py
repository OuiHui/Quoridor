import socket
import struct
import time
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
    def __init__(self, host="127.0.0.1", port=5555, max_retries=15, retry_delay=1.0):
        self.host = host
        self.port = port
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.sock = None
        self.connect()

    def connect(self, retries=1, delay=1.0):
        for attempt in range(retries):
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
                self.sock = None
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                s.connect((self.host, self.port))
                self.sock = s
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] RemoteModelEvaluator connected to GPU server at tcp://{self.host}:{self.port}")
                return True
            except Exception as e:
                self.sock = None
                if attempt < retries - 1:
                    time.sleep(delay)
                else:
                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] RemoteModelEvaluator failed to connect to GPU server: {e}")
        return False

    def evaluate_batch(self, input_array):
        """
        Sends input_array of shape [M, 11, 9, 9] float32 to GPU server,
        and returns tuple of (policies [M, 140], values [M]).
        """
        m_count = input_array.shape[0]
        input_bytes = input_array.astype(np.float32).tobytes()
        header = struct.pack('!I', m_count)
        request_payload = header + input_bytes

        for attempt in range(self.max_retries + 1):
            if self.sock is None:
                if not self.connect(retries=1):
                    if attempt < self.max_retries:
                        time.sleep(self.retry_delay)
                        continue
                    else:
                        raise RuntimeError(f"No active connection to GPU inference server at tcp://{self.host}:{self.port}.")

            try:
                self.sock.sendall(request_payload)

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
                ts = time.strftime("%H:%M:%S")
                if self.sock:
                    try:
                        self.sock.close()
                    except Exception:
                        pass
                    self.sock = None

                if attempt < self.max_retries:
                    print(f"[{ts}] RemoteModelEvaluator socket error ({e}), retrying (attempt {attempt + 1}/{self.max_retries})...")
                    time.sleep(self.retry_delay)
                else:
                    print(f"[{ts}] RemoteModelEvaluator retries exhausted ({self.max_retries} attempts).")
                    raise e

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

class ONNXModelEvaluator:
    """Local ONNX Runtime model evaluator for fallback or standalone mode."""
    def __init__(self, onnx_path):
        providers = ort.get_available_providers()
        selected_providers = []
        if 'TensorrtExecutionProvider' in providers:
            selected_providers.append((
                'TensorrtExecutionProvider', {
                    'device_id': 0,
                    'trt_fp16_enable': True,
                    'trt_engine_cache_enable': True,
                    'trt_engine_cache_path': './trt_cache',
                }
            ))
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

class OpenVINOModelEvaluator:
    """Local OpenVINO NPU evaluator targeting Intel Core Ultra 9 285H NPU."""
    def __init__(self, onnx_path="quoridor_model.onnx", device="NPU"):
        import openvino as ov
        self.core = ov.Core()
        model = self.core.read_model(onnx_path)
        
        # OpenVINO NPU targets fixed static shape [32, 11, 9, 9] for peak NPU hardware acceleration
        model.reshape({model.inputs[0]: [32, 11, 9, 9]})
        self.compiled_model = self.core.compile_model(model, device)
        
        self.output_p = self.compiled_model.outputs[0]
        self.output_v = self.compiled_model.outputs[1]
        print(f"OpenVINO NPU Evaluator initialized successfully on hardware target: {device}")

    def evaluate_batch(self, input_array):
        b_size = input_array.shape[0]
        policies_list = []
        values_list = []
        
        for i in range(0, b_size, 32):
            chunk = input_array[i:i+32]
            c_len = chunk.shape[0]
            if c_len < 32:
                padded = np.zeros((32, 11, 9, 9), dtype=np.float32)
                padded[:c_len] = chunk
                results = self.compiled_model([padded])
                logits = results[self.output_p][:c_len]
                values = results[self.output_v][:c_len]
            else:
                results = self.compiled_model([chunk])
                logits = results[self.output_p]
                values = results[self.output_v]
            
            policies_list.append(logits)
            values_list.append(values)

        logits = np.concatenate(policies_list, axis=0) if len(policies_list) > 1 else policies_list[0]
        values = np.concatenate(values_list, axis=0) if len(values_list) > 1 else values_list[0]

        logits_max = np.max(logits, axis=1, keepdims=True)
        e_x = np.exp(logits - logits_max)
        policies = e_x / np.sum(e_x, axis=1, keepdims=True)
        
        return policies.astype(np.float32), values.ravel().astype(np.float32)

def create_evaluator(onnx_path, use_central_server=True, port=5555, evaluator_type="auto"):
    """
    Factory function: 
    - evaluator_type 'npu' or 'openvino': uses Intel OpenVINO NPU on Core Ultra 9 285H
    - evaluator_type 'central' or 'auto': attempts RemoteModelEvaluator first (NVIDIA GPU), falls back to local ONNX
    """
    if evaluator_type in ("npu", "openvino"):
        try:
            return OpenVINOModelEvaluator(onnx_path, device="NPU")
        except Exception as e:
            print(f"Failed to initialize OpenVINO NPU evaluator ({e}). Falling back to central GPU/local ONNX.")

    if use_central_server:
        try:
            remote = RemoteModelEvaluator(port=port)
            if remote.sock is not None:
                return remote
            else:
                print(f"Central GPU server at tcp://127.0.0.1:{port} unavailable. Falling back to local ONNX evaluator.")
        except Exception as e:
            print(f"Central GPU server unavailable ({e}). Falling back to local ONNX evaluator.")

    return ONNXModelEvaluator(onnx_path)
