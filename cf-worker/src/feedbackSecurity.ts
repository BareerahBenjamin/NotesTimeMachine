import type { Context } from 'hono';
import {timingSafeEqual} from 'node:crypto';
import { ApiError } from './reliability';
import type { AppEnv } from './reliability';

export const feedbackUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const feedbackIssues = ['inaccurate_content','questionable_source','unclear_explanation','interaction_problem','other'];
export const feedbackStatuses = ['new','triaged','in_progress','resolved','rejected'];
export function feedbackOrigins(c: Context<AppEnv>): string[] {
  return (c.env.FEEDBACK_ALLOWED_ORIGINS || '').split(',').map(v=>v.trim()).filter(value=>{
    try { const u=new URL(value);return u.origin===value&&(u.protocol==='https:'||(c.env.ENVIRONMENT!=='production'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))); } catch {return false;}
  });
}
export function feedbackConfigured(c: Context<AppEnv>) {
  return c.env.FEEDBACK_ENABLED==='true'&&feedbackOrigins(c).length>0&&(c.env.FEEDBACK_RATE_LIMIT_SECRET?.length||0)>=32;
}
export function feedbackOrigin(c: Context<AppEnv>,optional=false) {
  const origin=c.req.header('Origin');
  if(optional&&!origin)return;
  if(!origin||!feedbackOrigins(c).includes(origin)||c.req.header('Sec-Fetch-Site')==='cross-site'&&origin===new URL(c.req.url).origin)throw new ApiError(403,'origin_not_allowed','此来源不能提交或查看反馈。');
}
export function feedbackJSON(c: Context<AppEnv>) {
  if(c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ApiError(415,'unsupported_media_type','反馈请求须使用 JSON 格式。');
}
export async function requireFeedbackAdmin(c: Context<AppEnv>) {
  c.header('Cache-Control','no-store');
  const secret=c.env.FEEDBACK_ADMIN_TOKEN;
  if(!secret||secret.length<32||secret.length>256||/\s/.test(secret))throw new ApiError(503,'review_not_configured','反馈查看功能尚未配置。');
  const token=c.req.header('Authorization')?.match(/^Bearer ([^\s]{32,256})$/)?.[1];
  if(!token)throw new ApiError(401,'review_unauthorized','需要独立的反馈管理凭据。');
  const bytes=await Promise.all([secret,token].map(v=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));
  if(!timingSafeEqual(new Uint8Array(bytes[0]),new Uint8Array(bytes[1])))throw new ApiError(401,'review_unauthorized','反馈管理凭据无效。');
  feedbackOrigin(c,true);
}
export async function feedbackNetworkKey(c: Context<AppEnv>,day: number) {
  const address=c.req.header('CF-Connecting-IP');
  if(!address||address.length>64||!/^[a-f0-9:.]+$/i.test(address))throw new ApiError(503,'feedback_network_unavailable','暂时无法验证反馈请求，请稍后重试。');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.env.FEEDBACK_RATE_LIMIT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${day}:${address}`));
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
