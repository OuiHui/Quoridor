import onnxruntime as ort
import numpy as np

class ONNXModelEvaluator:
    def __init__(self, onnx_path):
        providers = ort.get_available_providers()
        selected_providers = []
        if 'CUDAExecutionProvider' in providers:
            selected_providers.append('CUDAExecutionProvider')
        if 'TensorrtExecutionProvider' in providers:
            selected_providers.append('TensorrtExecutionProvider')
        if 'DmlExecutionProvider' in providers:
            selected_providers.append('DmlExecutionProvider')
        if 'CPUExecutionProvider' in providers:
            selected_providers.append('CPUExecutionProvider')
            
        print(f"ONNX Runtime trying providers: {selected_providers}")
        
        # Read model into memory to prevent Windows file locking issues during active training
        with open(onnx_path, "rb") as f:
            model_bytes = f.read()
            
        try:
            self.session = ort.InferenceSession(model_bytes, providers=selected_providers)
            self.input_name = self.session.get_inputs()[0].name
            # Run test inference to verify execution provider stability
            dummy = np.zeros((1, 11, 9, 9), dtype=np.float32)
            self.session.run(['policy', 'value'], {self.input_name: dummy})
            print(f"ONNX Runtime successfully initialized with: {self.session.get_providers()}")
        except Exception as e:
            print(f"Warning: Selected providers failed test inference ({e}). Falling back to CPUExecutionProvider...")
            self.session = ort.InferenceSession(model_bytes, providers=['CPUExecutionProvider'])
            self.input_name = self.session.get_inputs()[0].name
            print("ONNX Runtime successfully initialized with: ['CPUExecutionProvider']")
        
    def evaluate_batch(self, input_array):
        """
        Takes input_array of shape [M, 11, 9, 9] (as numpy array),
        runs inference, and returns a tuple of:
          - policies: shape [M, 140] (softmax probabilities)
          - values: shape [M]
        """
        # Run ONNX session
        outputs = self.session.run(['policy', 'value'], {self.input_name: input_array})
        logits = outputs[0]  # shape: [M, 140]
        values = outputs[1]  # shape: [M, 1]
        
        # Softmax on logits along axis=1
        logits_max = np.max(logits, axis=1, keepdims=True)
        e_x = np.exp(logits - logits_max)
        policies = e_x / np.sum(e_x, axis=1, keepdims=True)
        
        return policies.astype(np.float32), values.ravel().astype(np.float32)
