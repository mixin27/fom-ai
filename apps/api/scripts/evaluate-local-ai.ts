/** Evaluation-only adapter for the actual web prototype service. No Nest bootstrap or DB. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { AppHttpException } from '../src/common/http/app-http.exception';
import { AiDraftService } from '../src/orders/ai/ai-draft.service';

export async function evaluateLocalAi(
  input: unknown,
  service: Pick<AiDraftService, 'extract'> = new AiDraftService(),
) {
  const start = performance.now();
  if (
    !input ||
    typeof input !== 'object' ||
    !('id' in input) ||
    typeof input.id !== 'string' ||
    !('text' in input) ||
    typeof input.text !== 'string'
  )
    throw new Error('Expected {id: string, text: string}');
  try {
    const result = await service.extract(input.text);
    return {
      id: input.id,
      ...result,
      error: null,
      schema_valid: true,
      evidence_valid: true,
      latency_ms: performance.now() - start,
    };
  } catch (error) {
    // Never serialize exception messages/stacks or server bodies into diagnostics.
    const response =
      error instanceof AppHttpException ? error.getResponse() : null;
    const details =
      response && typeof response === 'object'
        ? (response as {
            code?: string;
            context?: { reason?: string; field?: string };
          })
        : null;
    return {
      id: input.id,
      error: details?.code ?? 'runner_failure',
      reason: details?.context?.reason ?? null,
      field: details?.context?.field ?? null,
      schema_valid: false,
      evidence_valid: false,
      latency_ms: performance.now() - start,
    };
  }
}

if (require.main === module) {
  evaluateLocalAi(JSON.parse(readFileSync(0, 'utf8')) as unknown)
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(() => {
      process.stderr.write('Local AI adapter failed.\n');
      process.exitCode = 1;
    });
}
