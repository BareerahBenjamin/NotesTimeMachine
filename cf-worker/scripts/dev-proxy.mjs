#!/usr/bin/env node
/** Local-only dev launcher for networks that require HTTP(S)_PROXY. */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env };
const proxy = environment.HTTPS_PROXY || environment.https_proxy || environment.HTTP_PROXY || environment.http_proxy;
if (proxy) {
  const preload = JSON.stringify(join(root, 'scripts/dev-proxy.cjs'));
  environment.NODE_OPTIONS = `${environment.NODE_OPTIONS || ''} --use-env-proxy --require ${preload}`.trim();
}
environment.NO_PROXY = [environment.NO_PROXY, environment.no_proxy, 'localhost', '127.0.0.1', '::1'].filter(Boolean).join(',');
environment.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
environment.WRANGLER_LOG_PATH ||= join(tmpdir(), 'ntm-worker-dev.log');
environment.WRANGLER_SEND_METRICS = 'false';
const child = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--ip', '127.0.0.1', '--port', '8787', '--var', 'ENVIRONMENT:development', '--show-interactive-dev-session=false', ...process.argv.slice(2)], {
  cwd: root, env: environment, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
