import os
import sys
import shutil
import torch

from quoridor_model import QuoridorNet, export_to_onnx

CHECKPOINT_PATH = "quoridor_checkpoint.pth"
OUTPUT_PATH = os.path.join("public", "quoridor_model.onnx")


def _detect_arch(state_dict):
    conv_init = state_dict.get("conv_init.weight")
    channels = conv_init.shape[0] if conv_init is not None else 192

    block_indices = {
        int(k.split(".")[1])
        for k in state_dict
        if k.startswith("res_blocks.")
    }
    num_blocks = len(block_indices) if block_indices else 20

    return channels, num_blocks


def main():
    if not os.path.exists(CHECKPOINT_PATH):
        print(f"Error: checkpoint not found at '{CHECKPOINT_PATH}'")
        sys.exit(1)

    print(f"Loading checkpoint: {CHECKPOINT_PATH}")
    checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
    state_dict = checkpoint["model_state_dict"]
    epoch = checkpoint.get("epoch", "?")

    channels, num_blocks = _detect_arch(state_dict)
    print(f"Detected architecture: {num_blocks} blocks, {channels} channels (epoch {epoch})")

    model = QuoridorNet(num_residual_blocks=num_blocks, channels=channels)
    model.load_state_dict(state_dict)

    os.makedirs("public", exist_ok=True)
    export_to_onnx(model, OUTPUT_PATH)

    size_mb = os.path.getsize(OUTPUT_PATH) / 1_048_576
    print(f"Exported -> {OUTPUT_PATH} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()

