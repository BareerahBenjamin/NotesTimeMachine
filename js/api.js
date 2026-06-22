/**
 * API 请求封装
 */
import { API_BASE, DEMO_NOTICE } from './config.js';
import { state } from './state.js';

/**
 * 健康检查
 */
export async function checkApiConnection() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    state.apiAvailable = response.ok;
  } catch (e) {
    state.apiAvailable = false;
  }
  console.log('API available:', state.apiAvailable);
  return state.apiAvailable;
}

/**
 * 加载某本书的章节列表
 */
export async function fetchChapters(bookId) {
  if (!state.apiAvailable) return [];
  try {
    const r = await fetch(`${API_BASE}/api/chapters/${bookId}`);
    const data = await r.json();
    return (data.chapters || []).sort((a, b) =>
      a.chapter_id.localeCompare(b.chapter_id, 'zh')
    );
  } catch (e) {
    console.error('Failed to load chapter list', e);
    return [];
  }
}

/**
 * 加载某章的段落列表
 */
export async function fetchParagraphs(chapterId) {
  if (!state.apiAvailable) return [];
  try {
    const r = await fetch(`${API_BASE}/api/paragraphs/${chapterId}`);
    const data = await r.json();
    return data.paragraphs || [];
  } catch (e) {
    console.error('Failed to load paragraphs', e);
    return [];
  }
}

/**
 * 根据段落 ID 获取注疏
 */
export async function fetchParagraphAnnotations(paraId) {
  if (!state.apiAvailable) return null;
  try {
    const r = await fetch(`${API_BASE}/api/paragraph/${paraId}`);
    return await r.json();
  } catch (e) {
    console.error('Failed to fetch annotations', e);
    return null;
  }
}

/**
 * AI 脉络分析
 */
export async function fetchAIAnalysis(paragraphId, signal) {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paragraph_id: paragraphId }),
    signal
  });
  return await response.json();
}

/**
 * 语义搜索
 */
export async function semanticSearchApi(query, topK = 5) {
  const response = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });
  return await response.json();
}

/**
 * 获取单条注疏的 AI 解读
 */
export async function fetchAnnotationInterpretation(annotation) {
  const response = await fetch(`${API_BASE}/api/annotation/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotation }),
  });
  return await response.json();
}
