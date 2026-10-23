#!/bin/sh
set -eu
model=/models/Qwen3-4B-Q4_K_M.gguf
printf '%s  %s\n' f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a "$model" | sha256sum -c - >/dev/null
exec /usr/local/bin/llama-server --model "$model" --host 0.0.0.0 --port 8080 \
  -c 8192 -np 1 -ngl 0 -t "${FOM_AI_THREADS:-2}" --fit off --flash-attn on \
  --no-context-shift --jinja --reasoning off \
  --chat-template-kwargs '{"enable_thinking":false}' --no-webui
