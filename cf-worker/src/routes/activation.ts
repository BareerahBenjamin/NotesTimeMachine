import { Hono } from 'hono';
import type { AppEnv } from '../reliability';
import { ApiError } from '../reliability';
import { loadParagraph } from '../sources';
import type { Source } from '../sources';

export const activationRoutes = new Hono<AppEnv>();
const missing = (reason: string, message = '已核验的体验文献尚未备齐。你可以先阅读馆藏原文，未核验注疏会明确标注。') => ({available:false,reason,message});
const required = ['source_id','source_title','author','dynasty','edition','reference','reference_url','content_sha256','verification_id','reviewed_at'];
const eras = new Set(['han','wei_jin','tang','song','ming','qing']);
export async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** The separately reviewed manifest is opt-in. Never infer verification from legacy flags. */
export async function resolveActivationExample(bucket: R2Bucket) {
  const object = await bucket.get('metadata/activation-example.json');
  if (!object) return missing('verified_example_missing');
  let manifest: any;
  try { manifest = await object.json(); } catch { return missing('invalid_manifest','体验文献的核验记录格式异常，暂不展示示例。普通阅读仍可使用。'); }
  if (manifest?.schema_version !== 1 || typeof manifest.paragraph_id !== 'string' || !Array.isArray(manifest.sources) || manifest.sources.length < 3 || manifest.sources.length > 12) return missing('invalid_manifest');
  const context = await loadParagraph(bucket,manifest.paragraph_id);
  if (!context || context.classic?.id !== manifest.classic_id) return missing('example_not_found');
  const reviewed = new Map<string, any>();
  for (const proof of manifest.sources) {
    if (!proof || required.some(k=>typeof proof[k] !== 'string' || !proof[k].trim() || proof[k].length > 1000)) return missing('verification_incomplete');
    const source = context.sources.find(s=>s.source_id===proof.source_id);
    if (!source || !source.content || source.content_type==='ai_interpretation' || source.content_type==='modern_research' || reviewed.has(proof.source_id)) return missing('verification_incomplete');
    let reference: URL;
    try { reference = new URL(proof.reference_url); } catch { return missing('verification_incomplete'); }
    if (reference.protocol !== 'https:' || !reference.hostname || reference.username || reference.password) return missing('verification_incomplete');
    if (proof.source_title !== source.source_title || proof.author !== source.author || proof.dynasty !== source.dynasty || !/^https:\/\//.test(proof.reference_url) || !Number.isFinite(Date.parse(proof.reviewed_at)) || Date.parse(proof.reviewed_at) > Date.now()) return missing('verification_incomplete');
    if (!/^[a-f0-9]{64}$/.test(proof.content_sha256) || await sha256(source.content) !== proof.content_sha256) return missing('source_changed','体验文献与核验记录不一致，暂不展示时间轴。请先阅读普通馆藏。');
    reviewed.set(source.source_id,{...proof,status:'verified'});
  }
  const original = context.sources[0];
  if (!reviewed.has(original.source_id)) return missing('original_unverified');
  const annotations = context.annotations.filter((a:any)=>reviewed.has(a.source_id));
  if (annotations.length < 2 || annotations.some((a:any)=>!eras.has(a.era)) || new Set(annotations.map((a:any)=>a.era)).size < 2) return missing('historical_comparison_missing');
  const attach = (source: Source) => ({...source,edition:reviewed.get(source.source_id).edition,reference:reviewed.get(source.source_id).reference,verification_status:'verified',verification_record:reviewed.get(source.source_id)});
  return {available:true,example:{classic_id:context.classic.id,paragraph_id:context.paragraph.id,chapter_id:context.chapter.chapter_id,chapter_title:context.chapter.title,original:attach(original),annotations:annotations.map(attach)}};
}
activationRoutes.get('/activation/example',async c=>{
  c.header('Cache-Control','no-store');
  try { return c.json(await resolveActivationExample(c.env.KNOWLEDGE_BUCKET)); }
  catch(error) { if (error instanceof ApiError) throw error; throw new ApiError(503,'activation_unavailable','体验文献暂时无法读取，请稍后重试。',null,{cause:error}); }
});
