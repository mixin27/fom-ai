import 'reflect-metadata';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { AppHttpException } from '../common/http/app-http.exception';
import { AiDraftService } from '../orders/ai/ai-draft.service';
import { serviceConfig, type ServiceConfig } from './config';

const digest = (s: string) => createHash('sha256').update(s).digest();
const MAX_BODY = 64 * 1024;

function send(res: ServerResponse, status: number, value: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(status === 429 ? { 'retry-after': '5' } : {}),
  });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<unknown> {
  if (
    req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ||
    req.headers['content-encoding']
  )
    throw new AppHttpException(415, { code: 'UNSUPPORTED_MEDIA', message: '' });
  const chunks: Buffer[] = [];
  let bytes = 0;
  const timer = setTimeout(() => req.destroy(), 10000);
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_BODY)
        throw new AppHttpException(413, { code: 'INPUT_LIMIT', message: '' });
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    clearTimeout(timer);
  }
}

export function createAiServer(
  config: ServiceConfig,
  extractor = new AiDraftService(),
) {
  const active = new Set<AbortController>();
  let busy = false,
    stopping = false;
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 },
    async (req, res) => {
      if (req.method === 'GET' && req.url === '/health/live') {
        send(res, stopping ? 503 : 200, {
          status: stopping ? 'stopping' : 'ok',
        });
        return;
      }
      if (
        !timingSafeEqual(
          digest(req.headers.authorization ?? ''),
          digest(`Bearer ${config.token}`),
        )
      ) {
        send(res, 401, {
          protocol_version: '1',
          error: { code: 'UNAUTHORIZED' },
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/health/ready') {
        let ready = false;
        if (config.enabled && !stopping) {
          try {
            const r = await fetch(`${config.origin}/health`, {
              redirect: 'error',
              signal: AbortSignal.timeout(3000),
              headers: config.inferenceToken
                ? { authorization: `Bearer ${config.inferenceToken}` }
                : {},
            });
            ready = r.ok;
            await r.body?.cancel();
          } catch {
            /* Return a sanitized readiness status. */
          }
        }
        send(res, ready ? 200 : 503, {
          status: ready ? 'ready' : 'unavailable',
        });
        return;
      }
      const fail = (status: number, code: string, request_id?: string) =>
        send(res, status, {
          protocol_version: '1',
          ...(request_id ? { request_id } : {}),
          error: { code },
        });
      if (
        req.method !== 'POST' ||
        req.url !== '/v1/extractions' ||
        !config.enabled
      ) {
        fail(404, 'NOT_FOUND');
        return;
      }
      if (stopping) {
        fail(503, 'UNAVAILABLE');
        return;
      }
      if (busy) {
        fail(429, 'BUSY');
        return;
      }
      busy = true;
      const abort = new AbortController();
      active.add(abort);
      const disconnect = () => {
        if (!res.writableEnded) abort.abort();
      };
      res.on('close', disconnect);
      let id: string | undefined;
      try {
        const input = (await body(req)) as Record<string, unknown>;
        if (
          !input ||
          Array.isArray(input) ||
          typeof input !== 'object' ||
          Object.keys(input).sort().join(',') !==
            'message,protocol_version,request_id' ||
          input.protocol_version !== '1' ||
          typeof input.request_id !== 'string' ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(input.request_id) ||
          typeof input.message !== 'string'
        ) {
          fail(422, 'INVALID_REQUEST');
          return;
        }
        id = input.request_id;
        const data = await extractor.extract(input.message, {
          origin: config.origin,
          token: config.inferenceToken,
          signal: abort.signal,
        });
        send(res, 200, { protocol_version: '1', request_id: id, data });
      } catch (error) {
        // Never expose raw provider errors, message text, tokens or internal URLs.
        const status =
          error instanceof AppHttpException
            ? error.getStatus()
            : error instanceof SyntaxError
              ? 422
              : 503;
        fail(
          status,
          status === 422
            ? 'INVALID_REQUEST'
            : status === 413
              ? 'INPUT_LIMIT'
              : status === 415
                ? 'UNSUPPORTED_MEDIA'
                : status === 502
                  ? 'INVALID_EXTRACTION'
                  : status === 429
                    ? 'BUSY'
                    : 'UNAVAILABLE',
          id,
        );
      } finally {
        res.off('close', disconnect);
        active.delete(abort);
        busy = false;
      }
    },
  );
  server.maxConnections = 64;
  server.maxRequestsPerSocket = 100;
  server.keepAliveTimeout = 5000;
  return {
    server,
    async stop() {
      stopping = true;
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

if (require.main === module) {
  try {
    const config = serviceConfig();
    const app = createAiServer(config);
    app.server.on('error', () => {
      process.stderr.write('FOM AI listener failed.\n');
      process.exitCode = 1;
    });
    app.server.listen(config.port, config.host, () =>
      process.stdout.write('FOM AI service listening.\n'),
    );
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.once(signal, () => {
        void app.stop();
      });
  } catch {
    process.stderr.write(
      'FOM AI configuration invalid; inspect service environment and secret files.\n',
    );
    process.exitCode = 1;
  }
}
