import { BOOK_NAMES } from '../config.js';
import { state } from '../state.js';
import { semanticSearchApi } from '../api.js';
import { jumpToParagraph } from './reader.js';

const SEARCH_INPUT_IDS = Object.freeze(['heroSemanticSearch', 'readerSemanticSearch']);
const SEARCH_RESULTS_IDS = Object.freeze(['heroSearchResults', 'readerSearchResults']);

function getActiveQueryInfo() {
  const inputs = SEARCH_INPUT_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (inputs.length === 0) return { query: '' };
  const active = document.activeElement;
  const activeInput = inputs.find(el => el === active) || inputs.find(el => el.value.trim() !== '') || inputs[0];
  const query = activeInput.value.trim();
  return { query, activeInput };
}

function renderAllResults(html) {
  for (const id of SEARCH_RESULTS_IDS) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}

export async function semanticSearch() {
  const { query } = getActiveQueryInfo();
  if (!query) {
    renderAllResults('<div class="search-error">请先输入检索关键词。</div>');
    return;
  }

  if (!state.apiAvailable) {
    renderAllResults('<div class="search-error">后端未启动，无法进行语义搜索。</div>');
    return;
  }

  renderAllResults('<div class="search-loading">正在检索...</div>');

  try {
    const data = await semanticSearchApi(query, 5);

    if (data.error) {
      renderAllResults(`<div class="search-error">搜索失败：${data.error}</div>`);
      return;
    }

    const results = data.results || [];
    if (results.length === 0) {
      renderAllResults('<div class="search-loading">未找到相关段落。</div>');
      return;
    }

    const html = results.map(r => {
      const p = r.paragraph;
      const bookName = BOOK_NAMES[p.classic_id] || p.classic_id;
      const annCount = (r.annotations || []).length;
      return `
        <div class="search-result-item" data-action="jumpToParagraph"
             data-classic="${p.classic_id}" data-paragraph="${p.id}">
          <div class="search-result-meta">${bookName} · ${p.chapter_title} · ${annCount} 条注疏</div>
          <div class="search-result-text">${p.content}</div>
        </div>
      `;
    }).join('');
    renderAllResults(html);
  } catch (e) {
    console.error('Semantic search failed', e);
    const detail = e?.message ? `（${String(e.message).slice(0, 120)}）` : '';
    renderAllResults(`<div class="search-error">搜索失败，请检查后端连接。${detail}</div>`);
  }
}

export function clearSearch() {
  for (const id of SEARCH_RESULTS_IDS) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
  for (const id of SEARCH_INPUT_IDS) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  }
}
