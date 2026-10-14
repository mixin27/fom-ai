# Third-party notices

FOM AI's MIT license applies to its own code and authored material. It does not replace upstream terms. No model weights, runtime binaries, or vendored upstream source are distributed in this repository.

| Component | Recorded upstream license | Provenance |
| --- | --- | --- |
| llama.cpp runtime (`llama-server`) | MIT | [Upstream license](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE); exact release/archive/executable hashes in `tools/ai-evaluation/artifacts.json` |
| Qwen3-1.7B Q4_K_M GGUF | Apache-2.0 | [Pinned artifact repository](https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/tree/d7f544eead698dbd1f15126ef60b45a1e1933222); [base-model license](https://huggingface.co/Qwen/Qwen3-1.7B/blob/main/LICENSE) |
| Qwen3-4B Q4_K_M GGUF | Apache-2.0 | [Pinned artifact repository](https://huggingface.co/unsloth/Qwen3-4B-GGUF/tree/22c9fc8a8c7700b76a1789366280a6a5a1ad1120); [base-model license](https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE) |

Downloads are opt-in and checksum-verified. If distributing upstream binaries/weights yourself, review and carry their applicable licenses/notices; the root LICENSE is not a substitute. Node and Python dependencies retain the licenses delivered in their packages; dependency versions are recorded in `pnpm-lock.yaml` and `tools/ai-evaluation/requirements.txt`.

Historical FOM code was imported with the repository owner's authorization to release the selected code under MIT. Original file hashes are in `migration/fom-platform-import.json`. Referenced external commerce pages are provenance links only; their content is not relicensed here.

MIT text reference: [Open Source Initiative](https://opensource.org/license/mit).
