# Contributing

FOM AI is experimental. Start with the README setup, architecture and roadmap. Discuss large contract/runtime changes in an issue before implementation.

## Development checks

```bash
pnpm install --prod=false --ignore-scripts --frozen-lockfile
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/ai-evaluation/requirements.txt
pnpm typecheck
pnpm build
pnpm test
python -m pytest -q
python scripts/check_public.py
```

CI runs these deterministic checks on public runners without a model, secrets or access to FOM Platform. Model inference is explicit local work. Use a new external output directory and report machine/configuration/failures when submitting measured improvements. Do not claim the historical benchmark as fresh evidence.

Add a minimal synthetic regression for a bug. Preserve null versus zero, source evidence, explicit price ambiguity and correction semantics. Never silently loosen validation just to improve acceptance rates. Do not add automatic order writes, provider retries, cloud APIs or training jobs without a separately reviewed design.

Do not reformat frozen benchmark files. Version intentional protocol/dataset changes and preserve historical manifests/reports. Keep familiar cases in development; related paraphrases must not cross into held-out splits.

## Pull requests

Describe the behavior, why it changes, tests, limitations, and whether output contracts or recorded protocols change. Include only aggregate/anonymized evidence permitted by the data policy. New runtime dependencies must be justified and locked. PRs should not require maintainers to run untrusted scripts with credentials.

## Contributions and licensing

Submit only code, text and fixtures you have the right to contribute under this repository's MIT license. Preserve applicable third-party notices. Model files, copied merchant conversations, private shop data and third-party scraped datasets are not accepted in Git. No contribution implies transferring ownership of your work.
