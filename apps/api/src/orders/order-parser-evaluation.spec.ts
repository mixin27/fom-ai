import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { OrderMessageParserService } from './order-message-parser.service';

describe('evaluation JSONL runner parity', () => {
  it('preserves the unchanged parser result across its existing scenario families', () => {
    const messages = [
      'Name: May Sample\nPhone: 09000123456\nProduct: Bag\nQty: 2\nPrice: 12000\nDeli: 3000',
      'နာမည်: မေ\nဖုန်း: ၀၉၀၀၀၁၂၃၄၅၆\nပစ္စည်း: Bag x၂ ၁၂၀၀၀\nငွေလွှဲပြီး',
      'Bag x2 12000\nShirt x1 9000',
      'Product: Bag\nColor: Blue\nSize: M\nQty: 2\nPrice: 12000\nProduct: Shirt\nQty: 1\nPrice: 9000',
      'Product: Bag x2 12000, Shirt x1 9000',
      'Customer Name May\nPh 09000123456\n2 x Bag 12000',
      'Product Bag / Qty 2 / Price 12000',
      'Product: Bag\nQty: 2\nPrice: 12000\nProduct: Shirt\nQty: 1',
      'Product: Bag x2 12000 total 24000',
      'Township: San Chaung Township, Yangon\nProduct: Bag',
      'Address: 12 Sample Road\nSan Chaung Township, Yangon\nProduct: Bag',
    ];
    const input = messages
      .map((text, index) => JSON.stringify({ id: String(index), text }))
      .join('\n');
    const stdout = execFileSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        'scripts/evaluate-order-parser.ts',
      ],
      {
        cwd: resolve(__dirname, '../..'),
        input: input + '\n',
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    const rows = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const parser = new OrderMessageParserService();
    expect(rows).toHaveLength(messages.length);
    rows.forEach((row, index) => {
      expect(row.id).toBe(String(index));
      expect(row.result).toEqual(parser.parseMessage(messages[index]));
      expect(row.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
