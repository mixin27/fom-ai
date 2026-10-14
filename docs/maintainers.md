# Publishing and maintaining the repository

## Before the first public push

1. Review `git diff --cached --stat` and staged content. Run `python scripts/check_public.py`, all deterministic tests and the build. Confirm no FOM Git history, environments, real contacts, private runs, model files or credentials are staged.
2. Confirm the root MIT license matches the owner's intended grant and keep third-party notices. Review the dataset provenance and historical-result limitations.
3. Commit and push only after review. This setup does not push, change repository visibility or publish a package. The `private: true` package flag prevents accidental npm publication; it does not restrict the GitHub repository's license or visibility.
4. On GitHub, enable private vulnerability reporting, dependency alerts and secret scanning/push protection where available. Configure a branch ruleset requiring PR review and the `deterministic` CI job. These settings require repository-owner access and are not applied by files in this checkout.
5. Use a description such as “Local Myanmar/English order extraction with evidence validation and reproducible evaluations.” Suggested topics: `myanmar`, `order-extraction`, `llama-cpp`, `qwen`, `typescript`, `evaluation`.

## Pull requests and releases

CI uses read-only repository permissions and `pull_request`, never `pull_request_target`. It runs without secrets, inference or model downloads. Do not add raw run uploads as public artifacts. Maintainers should review workflow changes before running them with privileged environments.

Review dependency updates separately from accuracy claims; lockfile changes alter current-service fingerprints. Intentionally frozen historical evaluation dependencies are not automatically rewritten. To upgrade them, create a new evaluation version and document the differences.

There is no package/container publishing workflow yet. Before introducing one, define the public contract and version policy, license/notice packaging, supported platforms, security fixes and integration tests. A successful test run alone is not production approval.
