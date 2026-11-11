/** Real Worker transport; failures stay failures, never become demo content. */
import { API_BASE } from './config.js';
import { state } from './state.js';

async function requestJSON(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { credentials:'omit', ...options, signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error('服务返回了无法识别的响应，请稍后重试。'); }
    if (!response.ok) { const error=new Error(data.error || `请求失败（${response.status}）`);error.status=response.status;error.code=data.error_type;error.requestId=data.request_id||response.headers.get('X-Request-ID');throw error; }
    return data;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function checkApiConnection() {
  try {
    await requestJSON(`${API_BASE}/api/health`, {}, 8000);
    state.apiAvailable = true;
  } catch {
    state.apiAvailable = false;
  }
  return state.apiAvailable;
}

export async function fetchChapters(bookId) {
  const data = await requestJSON(`${API_BASE}/api/chapters/${encodeURIComponent(bookId)}`);
  return (data.chapters || []).sort((a, b) => a.chapter_id.localeCompare(b.chapter_id, 'zh'));
}

export async function fetchParagraphs(chapterId) {
  const data = await requestJSON(`${API_BASE}/api/paragraphs/${encodeURIComponent(chapterId)}`);
  return data.paragraphs || [];
}

export async function fetchParagraphAnnotations(paraId) {
  return requestJSON(`${API_BASE}/api/paragraph/${encodeURIComponent(paraId)}`);
}

/**
 * AI 脉络分析
 */
export async function fetchAIAnalysis(paragraphId, signal) {
  return requestJSON(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paragraph_id: paragraphId }),
    signal
  });
}

/**
 * 语义搜索
 */
export async function semanticSearchApi(query, topK = 5, signal) {
  return requestJSON(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
    signal,
  });
}

/**
 * 获取单条注疏的 AI 解读
 */
export async function fetchAnnotationInterpretation(annotation, signal) {
  return requestJSON(`${API_BASE}/api/annotation/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annotation }),
    signal,
  });
}

/** Anonymous, public document context only. No community token or cookies. */
export const fetchActivationExample = signal => requestJSON(`${API_BASE}/api/activation/example`,{signal,credentials:'omit'});
export const fetchFeedbackAvailability = () => requestJSON(`${API_BASE}/api/feedback/availability`,{credentials:'omit'});
export const submitReadingFeedback = payload => requestJSON(`${API_BASE}/api/feedback`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
