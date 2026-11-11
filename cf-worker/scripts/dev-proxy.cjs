// Development transport only. Run all Worker code locally and let Node forward
// Miniflare outbound fetches through the user's existing HTTPS_PROXY.
// Do not change TLS verification, auth, bindings, or project Worker source.
const path = require.resolve('miniflare', { paths: [process.cwd()] });
const original = require(path);
const NativeMiniflare = original.Miniflare;
const { EnvHttpProxyAgent, setGlobalDispatcher } = require(require.resolve('undici', {paths:[process.cwd()]}));
const dispatcher = new EnvHttpProxyAgent({noProxy:'localhost,127.0.0.1,::1'});
setGlobalDispatcher(dispatcher);
const forward = require('./dev-transport.cjs').createTransport(dispatcher);
function withTransport(options) {
  if (!options?.workers) return options;
  return { ...options, workers: options.workers.map(worker => ({
    ...worker,
    dev: { ...worker.dev, outboundService: worker.dev?.outboundService || {
      type: 'fetcher',
      handler: async request => {
        const started = Date.now();
        try { return await forward(request); } catch (error) {
          const causes = [];
          for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth++) {
            const reason = /^(invalid|duplicate) (transfer-encoding|keep-alive|upgrade|connection|host|content-length) header$/.test(current.message || '') ? current.message : null;
            causes.push({name: current.name, code: current.code || null, reason});
          }
          console.error(JSON.stringify({event: 'dev_transport_error', timestamp: new Date().toISOString(), request_id: require('node:crypto').randomUUID(), route: 'remote_binding', method: request.method, status: 502, duration_ms: Date.now() - started, error_type: 'transport', database_operation: 'remote_binding_fetch', causes, exception_stack: String(error.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 8)}));
          throw error;
        }
      },
    } },
  })) };
}
class ProxiedMiniflare extends NativeMiniflare {
  constructor(options) { super(withTransport(options)); }
  setOptions(options) { return super.setOptions(withTransport(options)); }
}
require.cache[path].exports = { ...original, Miniflare: ProxiedMiniflare };
