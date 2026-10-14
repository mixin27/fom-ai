# Local model launcher

From this repository root, run `python tools/ai-prototype/serve.py` with the Python environment active and pinned artifacts already prepared. It reuses `~/.cache/fom-ai-evaluation`, prints the current loopback URL, and stops its owned process on Ctrl+C. See the [quick start](../../README.md#extract-with-the-local-model).

The standalone CLI uses this URL in `FOM_AI_LOCAL_URL`, with `NODE_ENV=development` and `FOM_AI_LOCAL_ENABLED=true`.

FOM Platform's existing development API can also use the printed URL on the same Mac. Start its API/web from the **separate FOM Platform checkout**, following that repository's prototype instructions. FOM AI has no `dev` web/API command, login page, database or order-creation route. Starting this launcher does not make FOM Platform consume this repository's updated extraction code; see [migration](../../docs/migration.md).

Use one launcher/evaluation at a time per cache. The inference server remains numeric-loopback only. No runtime/model download happens during launch. Read the [architecture](../../docs/ai-current-implementation.md) for how inference differs from prompts, source constraints and training.

## Phone correction constraints

The imported source policy constrains phone choices to digit sequences present in the message, recognizing a limited set of explicit English/Myanmar correction phrases. Recognized competing unqualified details yield a null suggestion and a review warning. It never invents digits or pads leading zeroes. Other wording still requires human review; original-source evidence alone does not prove the correct number was selected. See `apps/api/src/orders/ai/ai-phone-policy.ts` and its regression tests for the supported boundary. The historical phone report describes its original run, not a new measurement in this repository.
