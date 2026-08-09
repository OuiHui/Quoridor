import { initWorkerONNX } from './worker-manager.js';

export async function loadONNXModel() {
    try {
        const timestamp = Date.now();
        const modelRes = await fetch(`./quoridor_model.onnx?t=${timestamp}`);
        if (!modelRes.ok) throw new Error(`HTTP error status: ${modelRes.status}`);
        const modelBuffer = await modelRes.arrayBuffer();

        // Pass model buffer copy to worker
        initWorkerONNX(modelBuffer.slice(0));

        if (window.ort) {
            window.quoridorONNXSession = await ort.InferenceSession.create(new Uint8Array(modelBuffer));
            console.log("AlphaZero ONNX model loaded successfully on main thread!");
        }
    } catch (e) {
        console.warn("AlphaZero ONNX model could not be loaded. AI will fall back to Minimax evaluation:", e);
    }
}
