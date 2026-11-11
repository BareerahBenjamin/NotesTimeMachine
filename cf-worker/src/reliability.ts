import type { Context, MiddlewareHandler } from 'hono';
import type { Bindings } from './index';

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userId?: number; requestId: string; database?: D1Database; databaseOperation?: string; failure?: ApiError };
};
export class ApiError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503, readonly errorType: string, readonly publicMessage: string, readonly databaseOperation: string | null = null, options?: ErrorOptions) {
    super(publicMessage, options); this.name = 'ApiError';
  }
}
function messages(error: unknown): string {
  const parts: string[] = [];
  for (let value = error, depth = 0; value instanceof Error && depth < 4; value = value.cause, depth++) parts.push(value.message);
  return parts.join(' ');
}
function stackFrames(error: unknown): string[] {
  const frames: string[] = [];
  // Error messages can include SQL values. Only retain stack frames, never the message line.
  for (let value = error, depth = 0; value instanceof Error && depth < 3; value = value.cause, depth++) {
    frames.push(...(value.stack || '').split('\n').filter(line => /^\s+at /.test(line)).map(line => line.replace(/\?[^\s)]+/g, '?[redacted]').slice(0, 300)));
  }
  return [...new Set(frames)].slice(0, 12);
}
function databaseError(error: unknown, operation: string): ApiError {
  if (error instanceof ApiError) return error;
  const text = messages(error);
  if (/fetch failed|Failed to parse body as JSON|Network connection lost|Replica disconnected|ECONN|UND_ERR|timed?\s*out|timeout|DB reset|transient issue|DB is overloaded/i.test(text)) {
    return new ApiError(503, 'database_transport', '数据库服务暂时不可用，请稍后重试。写入结果可能尚未确认，请先刷新核对。', operation, { cause: error });
  }
  if (/UNIQUE constraint failed/i.test(text)) return new ApiError(409, 'conflict', '数据已存在或已被其他请求更新。', operation, { cause: error });
  if (/FOREIGN KEY constraint failed/i.test(text)) return new ApiError(409, 'reference_conflict', '关联数据不存在或已发生变化，请刷新后重试。', operation, { cause: error });
  if (/no such table|no such column|has no column named/i.test(text)) return new ApiError(500, 'schema_mismatch', '数据库结构与服务不兼容。', operation, { cause: error });
  return new ApiError(500, 'database_error', '数据库操作失败，请凭请求编号联系维护人员。', operation, { cause: error });
}
function operationOf(sql: string): string {
  const verb = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|EXPLAIN)/i)?.[1]?.toLowerCase() || 'other';
  const table = sql.match(/\b(?:FROM|INTO|UPDATE)\s+(users|posts|comments|likes|categories|reading_progress|content_feedback|feedback_workflow|feedback_status_history|feedback_rate_limits|feedback_review)\b/i)?.[1]?.toLowerCase() || 'database';
  return `${table}.${verb}`;
}

/** Request-scoped decorator: no global mutable binding, no SQL/parameters in logs, no retries. */
export function database(c: Context<AppEnv>): D1Database {
  const cached = c.get('database');
  if (cached) return cached;
  if (!c.env.DB) throw new ApiError(500, 'binding_missing', '数据库配置不可用。', 'database.binding');
  const statements = new WeakMap<D1PreparedStatement, { native: D1PreparedStatement; operation: string }>();
  const execute = async <T>(operation: string, action: () => Promise<T>): Promise<T> => {
    c.set('databaseOperation', operation);
    try { return await action(); } catch (error) { throw databaseError(error, operation); }
  };
  const decorate = (statement: D1PreparedStatement, operation: string): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => {
          try { return decorate(target.bind(...values), operation); }
          catch (error) { throw databaseError(error, operation); }
        };
        if (['first', 'all', 'run', 'raw'].includes(String(property))) {
          return (...args: unknown[]) => execute(operation, async () => Reflect.apply(Reflect.get(target, property), target, args));
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    statements.set(proxy, { native: statement, operation }); return proxy;
  };
  const db = new Proxy(c.env.DB, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => {
        const operation = operationOf(sql);
        try { return decorate(target.prepare(sql), operation); }
        catch (error) { throw databaseError(error, operation); }
      };
      if (property === 'batch') return (items: D1PreparedStatement[]) => {
        const operation = `batch:${[...new Set(items.map(item => statements.get(item)?.operation || 'database.other'))].join(',')}`;
        return execute(operation, () => target.batch(items.map(item => statements.get(item)?.native || item)));
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  c.set('database', db); return db;
}
export const observeRequests: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = crypto.randomUUID(); const started = performance.now();
  c.set('requestId', requestId); c.header('X-Request-ID', requestId);
  await next();
  if (!c.req.path.startsWith('/api/')) return;
  const failure = c.get('failure');
  const entry = {
    event: 'api_request', timestamp: new Date().toISOString(), request_id: requestId,
    route: c.req.routePath === '*' ? '/api/unmatched' : c.req.routePath,
    method: c.req.method, status: c.res.status, duration_ms: Math.round(performance.now() - started),
    error_type: failure?.errorType || (c.res.status >= 400 ? 'request_rejected' : null),
    database_operation: failure?.databaseOperation || c.get('databaseOperation') || null,
    exception_stack: failure ? stackFrames(failure) : [],
  };
  if (c.res.status >= 500) console.error(entry); else console.log(entry);
};
export function handleError(error: Error, c: Context<AppEnv>): Response {
  const failure = error instanceof ApiError ? error : new ApiError(500, 'internal_error', '服务暂时不可用，请凭请求编号联系维护人员。', null, { cause: error });
  c.set('failure', failure);
  return c.json({ error: failure.publicMessage, error_type: failure.errorType, request_id: c.get('requestId') }, failure.status);
}
export async function jsonObject(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object required');
    return body;
  } catch { throw new ApiError(400, 'invalid_json', '请求体必须是有效 JSON 对象。'); }
}
export function integer(value: unknown, name: string, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  const number = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new ApiError(400, 'invalid_parameter', `${name} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  return number;
}
export function text(value: unknown, name: string, maximum: number, required = true): string {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > maximum) throw new ApiError(400, 'invalid_parameter', `${name} 必须是有效文本，且不超过 ${maximum} 字。`);
  return value;
}
