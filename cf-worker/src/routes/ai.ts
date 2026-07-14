import { Hono } from 'hono';
import type { Bindings } from '../index';

type Env = { Bindings: Bindings };

export const aiRoutes = new Hono<Env>();

const TEXT_GEN_MODELS = Object.freeze([
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-4.7-flash',
]);

const EMBEDDING_MODELS = Object.freeze([
  '@cf/qwen/qwen3-embedding-0.6b',
  '@cf/baai/bge-m3',
]);

const EMBEDDING_MODEL_DIMS: Readonly<Record<string, number>> = {
  '@cf/qwen/qwen3-embedding-0.6b': 1024,
  '@cf/baai/bge-m3': 1024,
  '@cf/baai/bge-small-zh-v1.5': 512,
};

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
    } catch (e) {
      const msg = e?.message || String(e || 'Unknown AI error');
      failures.push({ model, message: msg, params: modelParams } as any);
      if (isDeprecationError(e)) {
        console.warn(`[AI] model ${model} deprecated, trying next fallback: ${msg}`);
      } else {
        console.warn(`[AI] model ${model} failed: ${msg}`);
      }
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
  return vec as number[];
}

const PROCESS_NOISE_RE = /(好[，,。.]\s*现在|现在我[需要就来来为]|让我|首先我|我[来需要现先]|我们来|按照要求|题目给|先看一下|接下来我|逐步|下面我来|第一步|第二步|第三步|第四步|根据(题目|要求|任务)|根据所?提供?的|需要为这个|按照要求|需要按照要求|需要(进行)?(逐)?步(分析|完成|生成)|首先[,，]|接下来[,，]|然后[,，]|最后[,，])/;
const HEADING_NOISE_RE = /^[\s（(【\[]*(分析|解读|回答|说明|解释|注疏解读|历代注疏分析|修正|检查)[\]）)】]*[：:．.\s]*/i;
const SELF_CORRECT_RE = /^[\s（(【\[]*(请检查|修正|检查并修|修正后的版本|.*版\s*本\s*[）)】\]]|（检查|[(（]检查)/;

function extractAiTextResponse(resp: any, opts?: { maxChars?: number }): string {
  const maxChars = opts?.maxChars;
  let text = '';
  if (!resp) return '';
  if (typeof resp === 'string') text = resp;
  else if (typeof resp.response === 'string') text = resp.response;
  else if (resp.output?.text && typeof resp.output.text === 'string') text = resp.output.text;
  else if (Array.isArray(resp.response)) text = resp.response.map((x: any) => x.response || x.text || '').join('');
  else {
    const choices = resp.choices || resp.output?.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0];
      if (typeof first === 'string') text = first;
      else if (typeof first.message?.content === 'string') text = first.message.content;
      else if (typeof first.delta?.content === 'string') text = first.delta.content;
      else if (typeof first.text === 'string') text = first.text;
    }
  }

  if (!text) return '';
  text = text.replace(/^[\s\S]*?<\/think>/, '');
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  text = text.replace(/<\/think>/g, '');
  text = text.replace(/^[\s\S]*?(现在请开始回答|现在开始回答|请直接回答|请作答|现在请根据以上要求.*?完成任务.*?[：:\n]|答案[：:]\s*(好的[,，。. ]?)*)/i, '$');
  text = text.replace(/^【(注|参考示例|示例|参考)】.*$/gm, '');
  text = text.replace(/(好的[,，。.]\s*)?在需要处理用户的这个请求[。.]?\s*$/im, '');
  text = text.replace(/[（(【\[]\s*注[：:]?\s*实际字数[为是]?\s*\d+\s*字[^）)\]】]*[）)\]】]/g, '');
  text = text.replace(/^\s*Assistant\s*[:：]\s*/im, '');
  text = text.replace(/[（(]\s*注意[：:][^）)]*[）)]/g, '');
  text = text.replace(/(^|\n)\s*请用中文输出[，,。.]?\s*(无需其他内容)?\s*。?$/g, '');
  text = text.replace(/^[,，。.\s]*不作赘述.*$/gm, '');
  text = text.replace(/^\s+|\s+$/g, '');
  if (!text) return '';

  const lines: string[] = [];
  const seenShort = new Set<string>();
  for (let rawLine of text.split(/\n+/)) {
    rawLine = rawLine.replace(/^\s+|\s+$/g, '');
    if (!rawLine) continue;
    let line = rawLine.replace(/^[\d一二三四五六七八九十]+[.、．)\]]\s*/, '');
    line = line.replace(HEADING_NOISE_RE, '');
    if (!line) continue;
    if (SELF_CORRECT_RE.test(line)) continue;
    if (PROCESS_NOISE_RE.test(line)) {
      line = line.replace(PROCESS_NOISE_RE, '').replace(/^[,，。.\s]+/, '');
      if (!line) continue;
    }
    const compact = line.replace(/\s+/g, '');
    if (!compact) continue;
    const sig = compact.slice(0, 40);
    if (seenShort.has(sig)) continue;
    seenShort.add(sig);
    lines.push(line);
    if (lines.length >= 12) break;
  }
  text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');
  if (!text) return '';

  if (maxChars && maxChars > 0) {
    const arr = Array.from(text);
    if (arr.length > maxChars) {
      let cut = maxChars;
      const stopRe = /[。！？!?；;\n]/;
      for (let i = maxChars - 1; i >= Math.max(0, maxChars - 60); i--) {
        if (stopRe.test(arr[i])) { cut = i + 1; break; }
      }
      text = arr.slice(0, cut).join('') + '…';
    }
  }
  return text;
}

const ERA_ORDER = ['han', 'wei_jin', 'tang', 'song', 'ming', 'qing', 'modern'];

const ERA_BACKGROUNDS: Record<string, string> = {
  '汉': '汉代经学注重名物训诂，讲究字字落实，奠定了后世注疏的基本范式。汉代学者在经学传承中形成了严谨的释义传统。',
  '魏晋': '魏晋时期玄学兴盛，清谈成风，注疏风格趋于简远玄淡，注重义理发挥而不再拘泥于名物考证。',
  '南北朝': '南北朝时期经学南北分立，南方偏重义理，北方注重训诂，形成不同的学术风格。',
  '隋': '隋代统一后，南北学风开始融合，为唐代义疏之学奠定基础。',
  '唐': '唐代义疏之学鼎盛，官方注疏规范化，形成《五经正义》等标准文本，强调注疏的权威性和统一性。',
  '宋': '宋代理学兴起，注疏转向义理发挥，以理学思想诠释经典，注重经典背后的义理和心性之学。',
  '元': '元代程朱理学继续保持统治地位，注疏多沿袭宋代理学传统，缺乏创新。',
  '明': '明代王阳明心学兴起，与程朱理学分庭抗礼，注疏风格出现心学与理学的对立。',
  '清': '清代考据学复兴，乾嘉学派注重名物训诂、考证辨伪，反对空谈义理，恢复汉唐注疏传统。',
  '近代': '近代以来，西方学术思想传入，学者开始用新的方法研究古籍，注疏呈现多元化特点。',
  '现代': '现代学术注重文本分析、历史考证与跨学科研究，注疏方法更加科学和规范。',
};

aiRoutes.post('/query', async (c) => {
  try {
    const { query, top_k = 3 } = await c.req.json();
    if (!query) return c.json({ error: 'query 不能为空' }, 400);

    const ai = c.env.AI;
    const vectorIndex = c.env.VECTOR_INDEX;
    const bucket = c.env.KNOWLEDGE_BUCKET;

    const embedRaw = await runAiWithFallback(ai, EMBEDDING_MODELS, { text: query });
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
      const chapterId = paragraphId.split('-').slice(0, -1).join('-');
      const classicId = chapterId.split('-').slice(0, -1).join('-');

      let chapterData: any = null;
      for (const prefix of [`content/${classicId}/${chapterId}.json`, 'content/']) {
        if (prefix.endsWith('/')) {
          const listed = await bucket.list({ prefix });
          for (const obj of listed.objects) {
            if (obj.key.endsWith(`/${chapterId}.json`)) {
              const obj2 = await bucket.get(obj.key);
              if (obj2) chapterData = JSON.parse(await obj2.text());
              break;
            }
          }
        } else {
          const obj = await bucket.get(prefix);
          if (obj) chapterData = JSON.parse(await obj.text());
        }
        if (chapterData) break;
      }

      if (!chapterData) continue;
      const para = (chapterData.paragraphs || []).find((p: any) => p.id === paragraphId);
      if (!para) continue;

      const annotations = (para.annotations || []).filter((a: any) => {
        if (meta.annotation_id) return a.id === meta.annotation_id;
        return true;
      }).map((a: any) => ({
        id: a.id || '',
        paragraph_id: paragraphId,
        era: a.era || '',
        era_name: a.era_name || '',
        author: a.author || '',
        author_id: a.author_id || '',
        source: a.source || '',
        view_angle: a.view_angle || '',
        content: a.content || '',
        chapter_title: chapterData.title || '',
      }));

      results.push({
        paragraph: {
          id: para.id,
          content: para.content,
          classic_id: chapterData.classic_id || classicId,
          chapter_title: chapterData.title || '',
          keywords: para.keywords || [],
        },
        annotations,
        score: match.score,
      });
    }

    return c.json({ results, ai_model: embedRaw.model });
  } catch (e: any) {
    console.error('[AI /query error]', e?.stack || e);
    return c.json(
      { error: '语义搜索失败', detail: e?.message || String(e || ''), failures: e?.failures || undefined },
      500,
    );
  }
});



aiRoutes.post('/analyze', async (c) => {
  try {
    const { paragraph_id } = await c.req.json();
    if (!paragraph_id) return c.json({ error: 'paragraph_id 不能为空' }, 400);

    const bucket = c.env.KNOWLEDGE_BUCKET;

    const chapterId = paragraph_id.split('-').slice(0, -1).join('-');
    const classicId = chapterId.split('-').slice(0, -1).join('-');

    let chapterData: any = null;
    for (const prefix of [`content/${classicId}/${chapterId}.json`, 'content/']) {
      if (prefix.endsWith('/')) {
        const listed = await bucket.list({ prefix });
        for (const obj of listed.objects) {
          if (obj.key.endsWith(`/${chapterId}.json`)) {
            const obj2 = await bucket.get(obj.key);
            if (obj2) chapterData = JSON.parse(await obj2.text());
            break;
          }
        }
      } else {
        const obj = await bucket.get(prefix);
        if (obj) chapterData = JSON.parse(await obj.text());
      }
      if (chapterData) break;
    }

    if (!chapterData) return c.json({ error: '段落不存在' }, 404);
    const para = (chapterData.paragraphs || []).find((p: any) => p.id === paragraph_id);
    if (!para) return c.json({ error: '段落不存在' }, 404);

    const annotations = para.annotations || [];
    const eras = Array.from(new Set(annotations.map((a: any) => a.era_name || a.era)));
    const authors = annotations.map((a: any) => a.author).filter(Boolean);
    const viewAngles = Array.from(new Set(annotations.map((a: any) => a.view_angle).filter(Boolean)));

    if (annotations.length === 0) {
      return c.json({ paragraph_id, analysis: '暂无注疏数据' });
    }

    const ai = c.env.AI;
    const prompt = `你是中华书局版古籍整理的资深编辑。请撰写一段关于以下古籍段落历代注疏的学术性分析综述。

【原文】 ${para.content}
【注疏概况】 共${annotations.length}条，时代：${eras.join('、')}；注家：${authors.join('、')}；视角：${viewAngles.length ? viewAngles.join('、') : '多元'}。

请以中华书局/上海古籍出版社经典注本的前言风格，以严谨典雅的书面语写作一段200字以内的连贯综述。内容须自然融入：历代注疏侧重点的差异、注疏视角的演变脉络、主要核心分歧所在。严格依据上述注疏信息，不要臆造注家时代、身份或未给出的具体观点出处；只输出综述正文，不要分条、不要标题、不要写执行过程或提示说明。`;

    const respRaw = await runAiWithFallback(ai, TEXT_GEN_MODELS, {
      prompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 360,
    });
    const analysisText = extractAiTextResponse(respRaw.result, { maxChars: 250 });

    return c.json({
      paragraph_id,
      analysis: analysisText || '分析生成失败，请稍后重试',
      ai_model: respRaw.model,
    });
  } catch (e: any) {
    console.error('[AI /analyze error]', e?.stack || e);
    return c.json(
      { error: 'AI 分析失败', detail: e?.message || String(e || ''), failures: e?.failures || undefined },
      500,
    );
  }
});

aiRoutes.post('/annotation/interpret', async (c) => {
  try {
    const { annotation } = await c.req.json();
    if (!annotation) return c.json({ error: 'annotation 不能为空' }, 400);

    const era = annotation.era_name || annotation.era;
    const background = ERA_BACKGROUNDS[era] || '该时代注疏风格独特，具有其历史背景下的学术特点。';

    const ai = c.env.AI;
    const prompt = `你是中华书局版古籍整理的资深编辑。请为下面这条古代注疏撰写通俗易懂的现代解读。

【注疏原文】 ${annotation.content}
【注家】 ${annotation.author}　【时代】 ${annotation.era_name}（${annotation.era}）
【出处】 ${annotation.source}　【视角】 ${annotation.view_angle || '综合解读'}
【时代背景】 ${background}

请以中华书局“古典名著选译丛书”注解的风格，写作一段100-150字之间的完整书面语段落。内容须自然融合：本条注疏的具体释义、结合注家时代背景的语境说明、帮助现代读者理解古人读此原文的切入点。严格依据上述信息，不要臆造注家生平、时代或未给出的观点细节；只输出解读正文，不要分条、不要标题、不要写执行过程或提示说明。`;

    const interpRaw = await runAiWithFallback(ai, TEXT_GEN_MODELS, {
      prompt,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 260,
    });
    const interpretationText = extractAiTextResponse(interpRaw.result, { maxChars: 150 });

    return c.json({
      annotation_id: annotation.id || '',
      interpretation: interpretationText || '解读生成失败',
      ai_model: interpRaw.model,
    });
  } catch (e: any) {
    console.error('[AI /annotation/interpret error]', e?.stack || e);
    return c.json(
      { error: '注疏解读失败', detail: e?.message || String(e || ''), failures: e?.failures || undefined },
      500,
    );
  }
});

aiRoutes.post('/search', async (c) => {
  const { filters, top_k = 10 } = await c.req.json();
  if (!filters) return c.json({ error: 'filters 不能为空' }, 400);

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

  const listed = await bucket.list({ prefix: 'content/' });
  const chapterFiles: string[] = [];
  for (const obj of listed.objects) {
    if (obj.key.endsWith('.json')) chapterFiles.push(obj.key);
  }

  for (const key of chapterFiles.slice(0, 30)) {
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

      pushResult(para, chapterTitle, annotations.map((a: any) => ({
        id: a.id || '',
        paragraph_id: para.id,
        era: a.era || '',
        era_name: a.era_name || '',
        author: a.author || '',
        author_id: a.author_id || '',
        source: a.source || '',
        view_angle: a.view_angle || '',
        content: a.content || '',
        chapter_title: chapterTitle,
      })));
    }
  }

  return c.json({ results: results.slice(0, top_k), source: 'r2' });
});
