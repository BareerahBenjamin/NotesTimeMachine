import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { knowledgeRoutes } from './routes/knowledge';
import { communityRoutes } from './routes/community';
import { aiRoutes } from './routes/ai';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Bindings = {
  KNOWLEDGE_BUCKET: R2Bucket;
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
  ASSETS?: Fetcher;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
};

type Env = {
  Bindings: Bindings;
  Variables: {
    userId?: number;
  };
};

const app = new Hono<Env>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (o) => {
      if (!o) return true;
      return o;
    },
    allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400,
    credentials: true,
  })
);

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    rag_available: !!c.env.VECTOR_INDEX,
    environment: c.env.ENVIRONMENT,
  });
});

app.route('/api', knowledgeRoutes);
app.route('/api/community', communityRoutes);
app.route('/api', aiRoutes);

// ==================== 前端静态资源（仅本地 dev 有效；生产前端走 Cloudflare Pages）====================
let PROJECT_ROOT: string | null = null;
try {
  const url = String(import.meta?.url ?? '');
  if (url.startsWith('file:')) {
    const __filename = fileURLToPath(url);
    const SRC_DIR = resolve(__filename, '..');
    const WORKER_DIR = resolve(SRC_DIR, '..');
    PROJECT_ROOT = resolve(WORKER_DIR, '..');
  }
} catch {
  PROJECT_ROOT = null;
}

const MIMES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function mimeOf(p: string): string {
  const lower = p.toLowerCase();
  for (const ext of Object.keys(MIMES)) {
    if (lower.endsWith(ext)) return MIMES[ext];
  }
  return 'application/octet-stream';
}

function safeJoin(root: string, userPath: string): string | null {
  const clean = normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const target = resolve(root, '.' + sep + clean);
  if (!target.startsWith(root)) return null;
  return target;
}

function readLocalAsset(urlPath: string): { body: ArrayBuffer | string; type: string; html: boolean } | null {
  if (!PROJECT_ROOT) return null;
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = safeJoin(PROJECT_ROOT, rel);
  if (!full || !existsSync(full)) return null;
  try {
    if (!statSync(full).isFile()) return null;
    const ext = rel.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    const isText = ['.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.md'].includes(ext);
    const body = isText ? readFileSync(full, 'utf-8') : readFileSync(full);
    return { body, type: mimeOf(rel), html: ext === '.html' || ext === '.htm' };
  } catch {
    return null;
  }
}

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    return c.json({ error: 'Not Found' }, 404);
  }

  const local = readLocalAsset(path);
  if (local) {
    return c.body(local.body as any, 200, {
      'Content-Type': local.type,
      'Cache-Control': local.html ? 'no-cache' : 'public, max-age=3600',
    });
  }

  if (!path.includes('.')) {
    const fallback = readLocalAsset('/index.html');
    if (fallback) {
      return c.body(fallback.body as any, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
    }
  }

  if (c.env.ASSETS) {
    try {
      const assetPath = path === '/' || path === '' ? '/index.html' : path;
      const assetResp = await c.env.ASSETS.fetch(new Request(assetPath, c.req.raw));
      if (assetResp && assetResp.status < 400) {
        const newResp = new Response(assetResp.body, assetResp);
        const ext = assetPath.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
        if (ext && MIMES[ext]) newResp.headers.set('Content-Type', MIMES[ext]);
        const isHtml = ext === '.html' || ext === '.htm' || !ext;
        newResp.headers.set('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=3600');
        return newResp;
      }
      if (!path.includes('.')) {
        const fb = await c.env.ASSETS.fetch(new Request('/index.html', c.req.raw));
        if (fb && fb.status < 400) {
          const newResp = new Response(fb.body, fb);
          newResp.headers.set('Content-Type', 'text/html; charset=utf-8');
          newResp.headers.set('Cache-Control', 'no-cache');
          return newResp;
        }
      }
    } catch {}
  }

  return c.body(`Not Found: ${path}`, 404, { 'Content-Type': 'text/plain; charset=utf-8' });
});

app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

export default app;
