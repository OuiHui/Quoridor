import * as ort from 'onnxruntime-web';
import { initWorkerONNX } from './worker-manager.js';
import { state } from './state.js';

export function updateEngineStatusUI(statusClass, label) {
    const el = document.getElementById('ai-engine-status');
    if (!el) return;
    el.className = `engine-status-pill ${statusClass}`;
    const textEl = el.querySelector('.engine-status-text');
    if (textEl) {
        textEl.textContent = label;
    } else {
        el.textContent = label;
    }
}

export async function loadONNXModel() {
    updateEngineStatusUI('loading', 'Loading...');
    try {
        const timestamp = Date.now();
        const modelRes = await fetch(`./quoridor_model.onnx?t=${timestamp}`);
        if (!modelRes.ok) throw new Error(`HTTP error status: ${modelRes.status}`);
        const modelBuffer = await modelRes.arrayBuffer();

        const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
        if (ort.env && ort.env.wasm) {
            ort.env.wasm.numThreads = isCrossOriginIsolated && navigator.hardwareConcurrency 
                ? Math.min(4, navigator.hardwareConcurrency) 
                : 1;
            ort.env.wasm.simd = true;
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
        }

        // Initialize Web Worker first
        const workerOk = await initWorkerONNX(modelBuffer.slice(0));

        // Initialize main thread session for eval bar / diagnostics
        try {
            window.quoridorONNXSession = await ort.InferenceSession.create(new Uint8Array(modelBuffer.slice(0)), {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            console.log("AlphaZero ONNX model loaded successfully on main thread!");
        } catch (mainErr) {
            console.warn("Main thread session init non-critical error:", mainErr);
        }

        if (workerOk) {
            state.isAlphaZeroReady = true;
            updateEngineStatusUI('ready', 'Active');
            console.log("AlphaZero MCTS engine verified and active in worker.");
            return true;
        } else {
            throw new Error("Web Worker failed to initialize ONNX session.");
        }
    } catch (e) {
        state.isAlphaZeroReady = false;
        updateEngineStatusUI('error', 'Offline');
        console.error("AlphaZero ONNX model could not be loaded:", e);
        return false;
    }
}
