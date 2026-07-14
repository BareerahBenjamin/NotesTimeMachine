import { Hono } from 'hono';
import type { Bindings } from '../index';

type Env = { Bindings: Bindings };

export const knowledgeRoutes = new Hono<Env>();

const cache = new Map<string, any>();
const CACHE_MAX_AGE = 10 * 60 * 1000;

async function readJsonFromR2(bucket: R2Bucket, key: string): Promise<any | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_MAX_AGE) {
    return cached.value;
  }
  const obj = await bucket.get(key);
  if (!obj) return null;
  const text = await obj.text();
  const value = JSON.parse(text);
  cache.set(key, { ts: now, value });
  return value;
}

function listFromCachePrefix(prefix: string): Array<{ key: string; value: any }> {
  const results: Array<{ key: string; value: any }> = [];
  for (const [key, entry] of cache.entries()) {
    if (key.startsWith(prefix)) {
      results.push({ key, value: entry.value });
    }
  }
  return results;
}

knowledgeRoutes.get('/classics', async (c) => {
  const bucket = c.env.KNOWLEDGE_BUCKET;
  const data = await readJsonFromR2(bucket, 'metadata/classics.json');
  if (!data) return c.json({ error: 'classics.json 未找到，请先上传知识库到 R2' }, 404);
  return c.json(data);
});

knowledgeRoutes.get('/chapters/:classicId', async (c) => {
  const classicId = c.req.param('classicId');
  const bucket = c.env.KNOWLEDGE_BUCKET;

  const prefix = `content/${classicId}/`;
  const listed = await bucket.list({ prefix });
  const chapters: Array<{ chapter_id: string; title: string; paragraph_count: number }> = [];

  for (const obj of listed.objects) {
    const data = await readJsonFromR2(bucket, obj.key);
    if (data) {
      chapters.push({
        chapter_id: data.chapter_id,
        title: data.title,
        paragraph_count: (data.paragraphs || []).length,
      });
    }
  }

  chapters.sort((a, b) => a.chapter_id.localeCompare(b.chapter_id, 'zh'));
  return c.json({ chapters });
});

knowledgeRoutes.get('/paragraphs/:chapterId', async (c) => {
  const chapterId = c.req.param('chapterId');
  const bucket = c.env.KNOWLEDGE_BUCKET;
  const classicId = chapterId.split('-').slice(0, -1).join('-');

  let data = await readJsonFromR2(bucket, `content/${classicId}/${chapterId}.json`);

  if (!data) {
    const listed = await bucket.list({ prefix: 'content/' });
    for (const obj of listed.objects) {
      if (obj.key.endsWith(`/${chapterId}.json`)) {
        data = await readJsonFromR2(bucket, obj.key);
        break;
      }
    }
  }

  if (!data) return c.json({ error: '篇章不存在' }, 404);

  return c.json({
    chapter_id: data.chapter_id,
    title: data.title,
    paragraphs: (data.paragraphs || []).map((p: any) => ({
      id: p.id,
      content: p.content,
      keywords: p.keywords || [],
      annotations: (p.annotations || []).map((ann: any) => ({
        id: ann.id || '',
        era: ann.era || '',
        era_name: ann.era_name || '',
        author: ann.author || '',
        author_id: ann.author_id || '',
        source: ann.source || '',
        view_angle: ann.view_angle || '',
        content: ann.content || '',
        ai_generated: ann.ai_generated || false,
      })),
    })),
  });
});

knowledgeRoutes.get('/paragraph/:paragraphId', async (c) => {
  const paragraphId = c.req.param('paragraphId');
  const chapterId = paragraphId.split('-').slice(0, -1).join('-');
  const bucket = c.env.KNOWLEDGE_BUCKET;
  const classicId = chapterId.split('-').slice(0, -1).join('-');

  let data = await readJsonFromR2(bucket, `content/${classicId}/${chapterId}.json`);
  if (!data) {
    const listed = await bucket.list({ prefix: 'content/' });
    for (const obj of listed.objects) {
      if (obj.key.endsWith(`/${chapterId}.json`)) {
        data = await readJsonFromR2(bucket, obj.key);
        break;
      }
    }
  }

  if (!data) return c.json({ error: '段落不存在' }, 404);

  const para = (data.paragraphs || []).find((p: any) => p.id === paragraphId);
  if (!para) return c.json({ error: '段落不存在' }, 404);

  const annotations = (para.annotations || []).map((ann: any) => ({
    id: ann.id || '',
    paragraph_id: paragraphId,
    era: ann.era || '',
    era_name: ann.era_name || '',
    author: ann.author || '',
    author_id: ann.author_id || '',
    source: ann.source || '',
    view_angle: ann.view_angle || '',
    content: ann.content || '',
    chapter_title: data.title || '',
  }));

  return c.json({
    paragraph: {
      id: para.id,
      content: para.content,
      classic_id: data.classic_id || classicId,
      chapter_title: data.title || '',
      keywords: para.keywords || [],
    },
    annotations,
    source: 'r2',
  });
});
