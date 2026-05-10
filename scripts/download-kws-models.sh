#!/usr/bin/env bash
# Download KWS (keyword spotting) and VAD models for wake word detection.
# Idempotent: skips download if files already exist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

KWS_DIR="$PROJECT_ROOT/resources/sherpa-onnx/kws"
VAD_DIR="$PROJECT_ROOT/resources/sherpa-onnx/vad"

KWS_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
KWS_TARBALL="sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"

VAD_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"

echo "=== Downloading KWS and VAD models ==="

# --- KWS model ---
if [ -f "$KWS_DIR/encoder-epoch-13-avg-2-chunk-16-left-64.onnx" ] && [ -f "$KWS_DIR/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" ] && [ -f "$KWS_DIR/joiner-epoch-13-avg-2-chunk-16-left-64.onnx" ]; then
  echo "[KWS] Model files already exist in $KWS_DIR, skipping."
else
  echo "[KWS] Downloading model..."
  mkdir -p "$KWS_DIR"
  TMPDIR_KWS="$(mktemp -d)"
  curl -L --progress-bar -o "$TMPDIR_KWS/$KWS_TARBALL" "$KWS_URL"
  echo "[KWS] Extracting..."
  tar -xjf "$TMPDIR_KWS/$KWS_TARBALL" -C "$TMPDIR_KWS"
  # The tarball extracts into a directory named sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20/
  cp -r "$TMPDIR_KWS/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20/"* "$KWS_DIR/"
  rm -rf "$TMPDIR_KWS"
  echo "[KWS] Done. Files saved to $KWS_DIR"
fi

# --- VAD model ---
if [ -f "$VAD_DIR/silero_vad.onnx" ]; then
  echo "[VAD] Model file already exists in $VAD_DIR, skipping."
else
  echo "[VAD] Downloading silero_vad.onnx..."
  mkdir -p "$VAD_DIR"
  curl -L --progress-bar -o "$VAD_DIR/silero_vad.onnx" "$VAD_URL"
  echo "[VAD] Done. File saved to $VAD_DIR/silero_vad.onnx"
fi

echo "=== All models ready ==="
