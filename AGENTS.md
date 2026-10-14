# FOM AI development rules

Read README.md, DATA_POLICY.md and docs/migration.md before changing extraction or evaluation behavior.

- Keep model weights, runtime binaries, private datasets and raw runs outside the repository. Do not read production records or contact external AI APIs.
- Preserve original evidence, null versus zero, price ambiguity and human review. Do not create orders or bypass FOM Platform permissions.
- No model training happens automatically. Model downloads and real inference are explicit local commands; CI is deterministic and requires no secrets.
- Never silently rewrite historical reports or frozen protocols. The original frozen-v1.json is historical; frozen-public-v1.json identifies the public import. Version intentional changes and document their effect on reproducibility.
- New examples must be synthetic with original contact details removed. Known cases and paraphrases belong to development, not fresh held-out evidence.
- FOM Platform is a separate checkout and currently retains its own implementation. Do not edit or require it unless the task explicitly involves integration. Use scripts/check_platform.py for optional read-only parity checks.
- Run pnpm typecheck, pnpm build, pnpm test, python -m pytest -q and python scripts/check_public.py for relevant implementation changes. Use the pinned Python 3.12 environment. Do not suppress unrelated failures.
- Do not publish packages, model files, GitHub releases, or deploy inference without explicit authorization.
