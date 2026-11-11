import { Hono } from 'hono';
import type { AppEnv } from '../reliability';
import { ApiError, integer, jsonObject, text } from '../reliability';
import { loadParagraph, normalizeAnnotation } from '../sources';
import type { Source } from '../sources';
import { groundedPrompt, validateReading, presentReading, GroundingError, INSUFFICIENT, PROMPT_VERSION } from '../grounding';

export const aiRoutes = new Hono<AppEnv>();

const TEXT_GEN_MODELS = Object.freeze([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.2-3b-instruct',
]);

// Must match the index's embedding model. No cross-model fallback.
const EMBEDDING_MODELS = Object.freeze(['@cf/qwen/qwen3-embedding-0.6b']);
const EMBEDDING_MODEL_DIMS: Readonly<Record<string,number>> = {'@cf/qwen/qwen3-embedding-0.6b':1024};

const EXPECTED_VECTOR_DIM = 1024;

function isDeprecationError(e: any): boolean {
  const msg = (e?.message || String(e || '')).toLowerCase();
  return msg.includes('5028') || msg.includes('deprecated') || msg.includes('no longer available');
}

function buildAiParamsForModel(model: string, params: any): any {
  const isTextGen = (params.prompt != null) || (Array.isArray(params.messages));
  const maxTokens = params.max_tokens ?? params.max_completion_tokens ?? params.max_new_tokens;

  if (!isTextGen) {
    const out: any = { ...params };
    for (const k of Object.keys(out)) {
      if (k.startsWith('max_') && k !== 'max_tokens') delete out[k];
    }
    return out;
  }

  const promptText: string = typeof params.prompt === 'string'
    ? params.prompt
    : (Array.isArray(params.messages) && params.messages[0]?.content && typeof params.messages[0].content === 'string'
      ? params.messages[0].content
      : '');

  if (model.includes('glm')) {
    const out: any = {
      messages: [{ role: 'developer', content: promptText }],
    };
    if (maxTokens != null) {
      out.max_tokens = maxTokens;
      out.max_completion_tokens = maxTokens;
      out.max_new_tokens = maxTokens;
    }
    return out;
  }

  if (model.includes('qwen3-30b') || model.includes('deepseek')) {
    const out: any = { prompt: promptText };
    if (maxTokens != null) out.max_tokens = maxTokens;
    return out;
  }

  if (model.includes('llama')) {
    const out: any = {
      messages: [{ role: 'user', content: promptText }],
      ...(params.response_format ? {response_format:params.response_format} : {}),
      temperature:0.1,
    };
    if (maxTokens != null) out.max_tokens = maxTokens;
    return out;
  }

  const out: any = { prompt: promptText };
  if (maxTokens != null) out.max_tokens = maxTokens;
  return out;
}

async function runAiWithFallback(ai: any, models: readonly string[], params: any): Promise<any> {
  const failures: Array<{ model: string; message: string }> = [];
  for (const model of models) {
    const modelParams = buildAiParamsForModel(model, params);
    try {
      const result = await ai.run(model, modelParams);
      return { model, result, failures };
    } catch (e: any) {
      failures.push({ model, message: 'model_unavailable' });
      console.warn({event:'ai_model_failure',model,error_type:isDeprecationError(e)?'model_deprecated':'model_unavailable'});
    }
  }
  const summaryMsg = failures.map(f => `[${f.model}] ${f.message}`).join(' || ');
  const err = new Error(summaryMsg);
  (err as any).failures = failures;
  throw err;
}

function extractEmbeddingVector(result: any, expectedDim?: number): number[] {
  if (!result) throw new Error('Embedding result is empty');
  let vec: any = null;
  if (Array.isArray(result)) vec = result;
  else if (Array.isArray(result.data) && result.data.length > 0) {
    const first = result.data[0];
    if (typeof first === 'number') vec = result.data;
    else if (Array.isArray(first)) vec = first;
    else if (Array.isArray(first?.embedding)) vec = first.embedding;
    else if (Array.isArray(first?.vector)) vec = first.vector;
  } else if (Array.isArray(result.embedding)) vec = result.embedding;
  else if (Array.isArray(result.vector)) vec = result.vector;
  if (!Array.isArray(vec) || vec.length === 0) throw new Error(`无法从 embedding 结果中解析向量，data类型=${typeof result.data}，result keys=${Object.keys(result || {})}`);
  if (expectedDim != null && vec.length !== expectedDim) {
    throw new Error(`向量维度不匹配：期望 ${expectedDim}，实际 ${vec.length}。请确认 EMBEDDING_MODELS 输出维度与 Vectorize 索引 dimensions 一致。`);
  }
  if (!vec.every((x:unknown)=>typeof x==='number' && Number.isFinite(x))) throw new Error('Invalid embedding values');
  return vec as number[];
}

aiRoutes.post('/query', async (c) => {
  try {
    const body = await jsonObject(c);
    const query = text(body.query,'query',2000);
    const top_k = integer(body.top_k ?? 3,'top_k',1,20);

    const ai = c.env.AI;
    const vectorIndex = c.env.VECTOR_INDEX;
    const bucket = c.env.KNOWLEDGE_BUCKET;

    const embedRaw = await runAiWithFallback(ai, [EMBEDDING_MODELS[0]], { text: query });
    const vector = extractEmbeddingVector(embedRaw.result, EXPECTED_VECTOR_DIM);
    const expectedModelDim = EMBEDDING_MODEL_DIMS[embedRaw.model];
    if (expectedModelDim && expectedModelDim !== EXPECTED_VECTOR_DIM) {
      throw new Error(`维度一致性错误：embedding 模型 ${embedRaw.model} 输出 ${expectedModelDim}d，但 Vectorize 索引需要 ${EXPECTED_VECTOR_DIM}d。请调整 EMBEDDING_MODELS 或重建索引。`);
    }

    const matches = await vectorIndex.query(vector, { topK: top_k, returnMetadata: true, returnValues: false });

    const results: any[] = [];
    for (const match of matches.matches || []) {
      const meta = match.metadata as any;
      if (!meta) continue;

      const paragraphId = meta.paragraph_id;
      if (typeof paragraphId !== 'string' || !/^[a-z0-9_-]{1,160}$/i.test(paragraphId)) continue;
      const context = await loadParagraph(bucket,paragraphId);
      if (!context) continue;
      const {paragraph:para,chapter:chapterData} = context;
      const annotations = context.annotations.filter((a:any)=>!meta.annotation_id || a.id===meta.annotation_id);
      if (meta.annotation_id && !annotations.length) continue; // Stale index entries are not source evidence.

      results.push({
        paragraph: {
          id: para.id,
          content: para.content,
          classic_id: chapterData.classic_id || context.classic?.id || '',
          chapter_title: chapterData.title || '',
          keywords: para.keywords || [],
        },
        annotations,
        original_source:context.sources[0],
        score: match.score,
      });
    }

    return c.json({ results, ai_model: embedRaw.model });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(503,'retrieval_unavailable','语义检索暂时不可用，请稍后重试。',null,{cause:e});
  }
});



const READING_SCHEMA = {type:'object',properties:{readings:{type:'array',maxItems:3,items:{type:'object',properties:{source_id:{type:'string'},quote:{type:'string'},explanation:{type:'string'}},required:['source_id','quote','explanation'],additionalProperties:false}},uncertainty:{type:'string'}},required:['readings','uncertainty'],additionalProperties:false};

function modelFailure(error: unknown) {
  if (error instanceof GroundingError) return {error_type:error.code,provider_code:null};
  // Inspect bounded cause chains without returning raw provider messages or credentials.
  const parts: string[] = [];
  for (let current = error, depth = 0; current instanceof Error && depth < 4; current = current.cause, depth++) {
    const code = 'code' in current ? String(current.code) : '';
    parts.push(current.message, code);
  }
  const message = parts.join(' ');
  const providerCode = message.match(/\b(?:[345]\d{3}|[45]\d{2})\b/)?.[0] || null;
  // 4006 alone is not a documented quota guarantee; require the message or known 3036.
  const errorType = /quota|daily free allocation|\b3036\b|neurons.*(?:exceed|limit)|(?:exceed|limit).*neurons/i.test(message) ? 'model_quota_exceeded'
    : /rate.limit|too many requests|\b(?:429|3040)\b/i.test(message) ? 'model_rate_limited'
    : /timed?\s*out|timeout|\b(?:408|3007|3008)\b/i.test(message) ? 'model_provider_timeout'
    : /fetch failed|network connection|socket|ECONN|UND_ERR|ENOTFOUND|EAI_AGAIN/i.test(message) ? 'model_transport'
    : /\b(?:401|403|5016|5018|3023|3041|5035)\b/i.test(message) ? 'model_access_denied'
    : /\b(?:5007|3042|5028)\b|no such model|deprecated|no longer available/i.test(message) ? 'model_invalid'
    : /JSON Mode|JSON schema/i.test(message) ? 'model_output_constraint' : 'model_unavailable';
  return {error_type:errorType,provider_code:providerCode};
}

async function groundedAnalysis(ai: Ai, sources: Source[], task: string) {
  const evidence = sources.filter(s => s.content_type !== 'ai_interpretation' && s.content).slice(0, 8);
  const prompt = groundedPrompt(evidence, task);
  const started = Date.now();
  const failures: Array<{model:string;error_type:string;provider_code:string|null}> = [];
  for (const model of TEXT_GEN_MODELS) {
    const remaining = 22000 - (Date.now() - started);
    if (remaining < 1000) break;
    let stopTimer = () => {};
    try {
      const raw = await Promise.race([
        (ai.run as any)(model, buildAiParamsForModel(model, {prompt, max_tokens:1000,response_format:{type:'json_schema',json_schema:READING_SCHEMA}})),
        new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new GroundingError('model_timeout')),Math.min(10000,remaining));stopTimer=()=>clearTimeout(timer);}),
      ]);
      const validated = validateReading(raw, evidence);
      return { ...validated, analysis:presentReading(validated.readings), ai_model:model, generation_status:'validated', validation_failures:failures, sources:evidence, omitted_source_count:sources.length-evidence.length };
    } catch (error) {
      failures.push({model,...modelFailure(error)});
      // Shared account/network failures must not trigger another same-account inference.
      if (['model_quota_exceeded','model_rate_limited','model_transport','model_provider_timeout','model_access_denied','model_timeout'].includes(failures.at(-1)!.error_type)) break;
    } finally { stopTimer(); }
  }
  // Preserve actual source material without displaying rejected model prose.
  return {analysis:failures.some(f=>f.error_type==='model_quota_exceeded') ? 'AI 服务当前额度不可用，暂未生成解读；仍可查看下方真实馆藏记录及其待核验出处。' : '未能生成符合引用校验要求的解读，请查看下方来源原文。',readings:[],uncertainty:INSUFFICIENT,ai_model:null,generation_status:'withheld',validation_failures:failures,sources:evidence,omitted_source_count:sources.length-evidence.length};
}

aiRoutes.post('/analyze', async c => {
  const body = await jsonObject(c);
  const paragraphId = text(body.paragraph_id,'paragraph_id',160);
  const context = await loadParagraph(c.env.KNOWLEDGE_BUCKET, paragraphId);
  if (!context) throw new ApiError(404,'not_found','段落不存在');
  const result = await groundedAnalysis(c.env.AI,context.sources,'依据原文比较馆藏所录观点，无法核实归属时明确说明');
  console.log({event:'ai_grounding',timestamp:new Date().toISOString(),request_id:c.get('requestId'),generation_status:result.generation_status,model:result.ai_model,validation_failures:result.validation_failures,rejection_types:result.validation_failures.map(f=>f.error_type),source_count:result.sources.length});
  return c.json({paragraph_id:paragraphId,content_label:'AI 辅助解读',prompt_version:PROMPT_VERSION,...result});
});

aiRoutes.post('/annotation/interpret', async c => {
  const body = await jsonObject(c);
  const input = body.annotation;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400,'invalid_parameter','annotation 必须包含段落编号和注疏编号');
  const ann = input as Record<string,unknown>;
  const paragraphId = text(body.paragraph_id ?? ann.paragraph_id,'paragraph_id',160);
  const annotationId = text(ann.id,'annotation.id',200);
  const context = await loadParagraph(c.env.KNOWLEDGE_BUCKET,paragraphId);
  const canonical = context?.annotations.find((a:any)=>a.id===annotationId);
  if (!context || !canonical) throw new ApiError(404,'not_found','对应注疏不存在');
  if (canonical.ai_generated) return c.json({annotation_id:annotationId,content_label:'AI 辅助解读',generation_status:'insufficient_evidence',interpretation:'此条为 AI 模拟或整理内容，不能归属于历史人物，也不能用作历史文献证据。请先核对古籍原文。',uncertainty:INSUFFICIENT,sources:[canonical],readings:[],prompt_version:PROMPT_VERSION});
  const result = await groundedAnalysis(c.env.AI,[context.sources[0],canonical],'先依据原文，再解释这条待核验的馆藏观点；不得确认其历史归属');
  console.log({event:'ai_grounding',timestamp:new Date().toISOString(),request_id:c.get('requestId'),generation_status:result.generation_status,model:result.ai_model,validation_failures:result.validation_failures,source_count:result.sources.length});
  return c.json({annotation_id:annotationId,content_label:'AI 辅助解读',prompt_version:PROMPT_VERSION,...result,interpretation:result.analysis});
});

aiRoutes.post('/search', async (c) => {
  const body = await jsonObject(c);
  const top_k = integer(body.top_k ?? 10,'top_k',1,20);
  if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters)) throw new ApiError(400,'invalid_parameter','filters 必须为对象');
  const filters = body.filters as Record<string,any>;
  for (const key of ['classic_id','era','author']) if (filters[key] != null) text(filters[key],key,160);
  if (filters.keywords != null && (!Array.isArray(filters.keywords) || filters.keywords.length > 20 || filters.keywords.some((x:unknown)=>typeof x !== 'string' || x.length > 100))) throw new ApiError(400,'invalid_parameter','keywords 必须为关键词数组');

  const bucket = c.env.KNOWLEDGE_BUCKET;
  const results: any[] = [];
  const seen = new Set<string>();

  const pushResult = (para: any, chapterTitle: string, annotations: any[]) => {
    if (seen.has(para.id)) return;
    seen.add(para.id);
    results.push({
      paragraph: {
        id: para.id,
        content: para.content,
        classic_id: para.classic_id,
        chapter_title: chapterTitle,
        keywords: para.keywords || [],
      },
      annotations,
    });
  };

  const chapterFiles: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({prefix:filters.classic_id ? `content/${filters.classic_id}/` : 'content/',cursor});
    chapterFiles.push(...listed.objects.filter(o=>o.key.endsWith('.json')).map(o=>o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  for (const key of chapterFiles) {
    if (results.length >= top_k) break;
    const obj = await bucket.get(key);
    if (!obj) continue;
    const data = JSON.parse(await obj.text());
    const chapterTitle = data.title || '';
    const classicId = data.classic_id || '';

    for (const para of data.paragraphs || []) {
      if (results.length >= top_k) break;
      para.classic_id = classicId;

      if (filters.classic_id && classicId !== filters.classic_id) continue;
      if (filters.keywords && filters.keywords.length) {
        const pk = para.keywords || [];
        if (!filters.keywords.some((k: string) => pk.includes(k))) continue;
      }

      const annotations = (para.annotations || []).filter((a: any) => {
        if (filters.era && a.era !== filters.era && a.era_name !== filters.era) return false;
        if (filters.author && !a.author?.includes(filters.author)) return false;
        return true;
      });

      if (filters.era || filters.author) {
        if (annotations.length === 0) continue;
      }

      pushResult(para, chapterTitle, annotations.map((a: any) => ({...normalizeAnnotation(a,para.id),chapter_title:chapterTitle})));
    }
  }

  return c.json({ results: results.slice(0, top_k), source: 'r2' });
});
