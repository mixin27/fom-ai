import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAiServer } from './server';
import { serviceConfig, configuredOrigin } from './config';
import { AiDraftService } from '../orders/ai/ai-draft.service';

const token = 'synthetic-test-service-token-000000000000';
const config = () =>
  serviceConfig({
    FOM_AI_SERVICE_TOKEN: token,
    FOM_AI_SERVICE_ENABLED: 'true',
    FOM_AI_INFERENCE_URL: 'http://127.0.0.1:8765',
  });
const input = {
  protocol_version: '1',
  request_id: 'test-1',
  message: 'Product: Cup\nQty: 1\nUnit price: 1000',
};
const result = {
  schema_version: '1.0',
  draft: {
    customer: { name: null, phone: null, address: null, township: null },
    items: [{ product_name: 'Cup', qty: 1, unit_price: 1000 }],
    delivery_fee: null,
    note: null,
  },
  evidence: [
    { field: 'items.0.product_name', quote: 'Product: Cup' },
    { field: 'items.0.qty', quote: 'Qty: 1' },
    { field: 'items.0.unit_price', quote: 'Unit price: 1000' },
  ],
  review_warnings: [],
  model: 'test',
  elapsed_ms: 1,
};
async function start(
  extract = jest.fn().mockResolvedValue(result),
  enabled = true,
) {
  const app = createAiServer({ ...config(), enabled }, {
    extract,
  } as unknown as AiDraftService);
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const post = (
    value: unknown = input,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ) =>
    fetch(`${url}/v1/extractions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(value),
      signal,
    });
  return { ...app, extract, url, post };
}

it('requires explicit trusted transport and a strong configured secret', () => {
  expect(() => serviceConfig({})).toThrow();
  expect(() =>
    serviceConfig({ ...config(), FOM_AI_SERVICE_TOKEN: 'short' } as never),
  ).toThrow();
  for (const url of [
    'http://llama:8080',
    'https://user:pass@example.test',
    'https://example.test/path',
    'https://example.test?x=1',
  ])
    expect(() => configuredOrigin(url)).toThrow();
  expect(configuredOrigin('http://llama:8080', true)).toBe('http://llama:8080');
  expect(configuredOrigin('https://ai.example.test')).toBe(
    'https://ai.example.test',
  );
  expect(
    serviceConfig({
      FOM_AI_SERVICE_TOKEN: token,
      FOM_AI_INFERENCE_URL: 'http://127.0.0.1:8080',
    }).enabled,
  ).toBe(false);
});

it('authenticates before processing and returns only the versioned envelope', async () => {
  const app = await start();
  try {
    expect(
      (await app.post(input, { authorization: 'Bearer wrong' })).status,
    ).toBe(401);
    expect(app.extract).not.toHaveBeenCalled();
    const r = await app.post();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({
      protocol_version: '1',
      request_id: 'test-1',
      data: result,
    });
    expect(app.extract).toHaveBeenCalledWith(
      input.message,
      expect.objectContaining({
        origin: config().origin,
        signal: expect.any(AbortSignal),
      }),
    );
  } finally {
    await app.stop();
  }
});

it('fails closed when disabled and bounds the HTTP request contract', async () => {
  const off = await start(undefined, false);
  try {
    expect((await off.post()).status).toBe(404);
    expect(off.extract).not.toHaveBeenCalled();
  } finally {
    await off.stop();
  }
  const app = await start();
  try {
    for (const bad of [
      null,
      [],
      { ...input, protocol_version: '2' },
      { ...input, extra: 1 },
      { ...input, request_id: '\nsecret' },
    ])
      expect((await app.post(bad)).status).toBe(422);
    expect(
      (await app.post(input, { 'content-type': 'text/plain' })).status,
    ).toBe(415);
    expect(
      (await app.post({ ...input, message: 'x'.repeat(70000) })).status,
    ).toBe(413);
    expect(app.extract).not.toHaveBeenCalled();
    expect((await fetch(`${app.url}/health/live`)).status).toBe(200);
    expect((await fetch(`${app.url}/health/ready`)).status).toBe(401);
  } finally {
    await app.stop();
  }
});

it('rejects excess requests without queueing and aborts on disconnect', async () => {
  let signal: AbortSignal | undefined;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const extract = jest.fn().mockImplementation(
    (_m, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        entered();
        signal!.addEventListener(
          'abort',
          () => reject(new Error('private provider text')),
          { once: true },
        );
      }),
  );
  const app = await start(extract);
  const abort = new AbortController();
  try {
    const first = app.post(input, {}, abort.signal).catch(() => null);
    await started;
    const busy = await app.post();
    expect(busy.status).toBe(429);
    expect(busy.headers.get('retry-after')).toBe('5');
    expect(extract).toHaveBeenCalledTimes(1);
    abort.abort();
    await first;
    await new Promise<void>((resolve) =>
      signal!.aborted
        ? resolve()
        : signal!.addEventListener('abort', () => resolve(), { once: true }),
    );
    expect(signal!.aborted).toBe(true);
  } finally {
    await app.stop();
  }
});

it('sanitizes failures and releases the extraction slot', async () => {
  const extract = jest
    .fn()
    .mockRejectedValueOnce(new Error('sensitive message token host'))
    .mockResolvedValue(result);
  const app = await start(extract);
  try {
    const r = await app.post();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain('sensitive');
    expect((await app.post()).status).toBe(200);
  } finally {
    await app.stop();
  }
});

it('runs the real extraction transport through an HTTP inference stub', async () => {
  const paths: string[] = [];
  const upstream = createServer((req, res) => {
    paths.push(req.url!);
    req.resume();
    const value =
      req.url === '/health'
        ? { status: 'ok' }
        : req.url === '/apply-template'
          ? { prompt: 'synthetic template' }
          : req.url === '/tokenize'
            ? { tokens: [1, 2] }
            : {
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: JSON.stringify({
                        schema_version: '1.0',
                        draft: {
                          ...result.draft,
                          items: [
                            {
                              ...result.draft.items[0],
                              sources: {
                                product_name: [1],
                                qty: [2],
                                unit_price: [3],
                              },
                            },
                          ],
                        },
                        sources: {
                          customer: {
                            name: [],
                            phone: [],
                            address: [],
                            township: [],
                          },
                          delivery_fee: [],
                          note: [],
                        },
                      }),
                    },
                  },
                ],
              };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(value));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const app = createAiServer({
    ...config(),
    origin: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  try {
    expect(
      (
        await fetch(`${url}/health/ready`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(200);
    const r = await fetch(`${url}/v1/extractions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).data.draft).toEqual(result.draft);
    expect(paths).toEqual([
      '/health',
      '/apply-template',
      '/tokenize',
      '/v1/chat/completions',
    ]);
  } finally {
    await app.stop();
    upstream.closeAllConnections();
    await new Promise<void>((r) => upstream.close(() => r()));
  }
});
