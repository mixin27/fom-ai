import { readFileSync } from 'node:fs';

export function configuredOrigin(
  value: string | undefined,
  allowHttp = false,
): string {
  const url = new URL(value ?? '');
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && url.hostname !== '127.0.0.1' && !allowHttp)
  ) {
    throw new Error(
      'Invalid service origin; use HTTPS or explicitly permit a trusted private HTTP network.',
    );
  }
  return url.origin;
}

export function secret(env: NodeJS.ProcessEnv, name: string): string {
  const file = env[`${name}_FILE`];
  if (file && env[name])
    throw new Error(`Configure only one source for ${name}`);
  return (file ? readFileSync(file, 'utf8') : (env[name] ?? '')).trim();
}

export function serviceConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = secret(env, 'FOM_AI_SERVICE_TOKEN');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token))
    throw new Error('A strong FOM_AI_SERVICE_TOKEN is required.');
  const port = Number(env.PORT ?? 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  return {
    enabled: env.FOM_AI_SERVICE_ENABLED === 'true',
    token,
    port,
    host: env.HOST ?? '127.0.0.1',
    origin: configuredOrigin(
      env.FOM_AI_INFERENCE_URL,
      env.FOM_AI_ALLOW_PRIVATE_HTTP === 'true',
    ),
    inferenceToken: secret(env, 'FOM_AI_INFERENCE_TOKEN'),
  };
}
export type ServiceConfig = ReturnType<typeof serviceConfig>;
