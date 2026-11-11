import { BOOK_NAMES } from '../config.js';
import { state } from '../state.js';
import { semanticSearchApi, checkApiConnection } from '../api.js';
import {analytics,EVENTS} from '../analytics/index.js';

const INPUT_IDS = ['heroSemanticSearch', 'readerSemanticSearch'];
const RESULT_IDS = ['heroSearchResults', 'readerSearchResults'];
let version = 0;
let controller;

function showMessage(message, error = false) {
  for (const id of RESULT_IDS) {
    const element = document.getElementById(id);
    if (!element) continue;
    const status = document.createElement('div');
    status.className = error ? 'search-error' : 'search-loading';
    status.textContent = message;
    element.replaceChildren(status);
  }
}

export async function semanticSearch() {
  const inputs = INPUT_IDS.map(id => document.getElementById(id)).filter(Boolean);
  const input = inputs.find(el => el.closest('.page.active')) || inputs.find(el => el === document.activeElement) || inputs[0];
  const query = input?.value.trim();
  const current = ++version;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  if (!query) { showMessage('请先输入检索关键词。', true); return; }
  const searchId=analytics.operationId();
  analytics.track(EVENTS.SEARCH,{search_id:searchId,query_length:query.length},searchId);
  showMessage('正在检索…');
  try {
    if (!state.apiAvailable) await checkApiConnection();
    if (current !== version) return;
    const data = await semanticSearchApi(query, 5, signal);
    if (current !== version) return;
    if (data.error) throw new Error(data.error);
    const unique = new Map();
    for (const result of data.results || []) {
      const p = result.paragraph;
      if (!p?.id || !p.classic_id) continue;
      const key = `${p.classic_id}:${p.id}`;
      if (!unique.has(key)) unique.set(key, { paragraph: p, annotations: new Map() });
      for (const ann of result.annotations || []) unique.get(key).annotations.set(ann.id || `${ann.author}:${ann.content}`, ann);
    }
    if (!unique.size) { showMessage('未找到相关段落。'); return; }
    for (const id of RESULT_IDS) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.replaceChildren();
      let position=0;
      for (const { paragraph: p, annotations } of unique.values()) {
        const resultPosition=++position;
        const button = document.createElement('button');
        button.className = 'search-result-item'; button.dataset.action = 'jumpToParagraph';
        button.dataset.classic = p.classic_id; button.dataset.paragraph = p.id;
        const meta = document.createElement('span'); meta.className = 'search-result-meta';
        meta.textContent = `${BOOK_NAMES[p.classic_id] || p.classic_id} · ${p.chapter_title || ''} · ${annotations.size} 条匹配注疏`;
        const content = document.createElement('span'); content.className = 'search-result-text'; content.textContent = p.content;
        button.append(meta, content); element.appendChild(button);
        button.addEventListener('click',()=>analytics.track(EVENTS.SEARCH_CLICK,{work_id:p.classic_id,paragraph_id:p.id,search_id:searchId,result_position:resultPosition,entry_point:'search'},searchId?`${searchId}:${p.id}`:undefined));
      }
    }
  } catch (error) {
    if (current !== version) return;
    showMessage(error.name === 'AbortError' ? '检索超时，请重试。' : '搜索失败，请检查后端连接后重试。', true);
  } finally { if (current === version) controller = null; }
}

export function clearSearch() {
  ++version; controller?.abort(); controller = null;
  RESULT_IDS.forEach(id => document.getElementById(id)?.replaceChildren());
  INPUT_IDS.forEach(id => { const input = document.getElementById(id); if (input) input.value = ''; });
}
