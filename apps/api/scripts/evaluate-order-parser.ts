/** Evaluation-only JSONL adapter. No Nest bootstrap, environment loading or database. */
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { OrderMessageParserService } from '../src/orders/order-message-parser.service';

const parser = new OrderMessageParserService();
export function evaluateOrderMessage(text: string) {
  return parser.parseMessage(text);
}

if (require.main === module) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    let id: string | null = null;
    try {
      const input = JSON.parse(line) as { id: string; text: string };
      id = input.id;
      if (typeof id !== 'string' || typeof input.text !== 'string') {
        throw new Error('Expected {id: string, text: string}');
      }
      if (!input.text.length || [...input.text].length > 5000) {
        throw new Error('Message must contain 1–5000 characters');
      }
      const start = performance.now();
      const result = evaluateOrderMessage(input.text);
      process.stdout.write(
        JSON.stringify({ id, result, latency_ms: performance.now() - start }) +
          '\n',
      );
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          id,
          error: error instanceof Error ? error.message : 'Parser failure',
        }) + '\n',
      );
    }
  });
}
