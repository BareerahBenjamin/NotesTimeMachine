/**
 * 语义搜索
 */
import { BOOK_NAMES } from '../config.js';
import { state } from '../state.js';
import { semanticSearchApi } from '../api.js';
import { jumpToParagraph } from './reader.js';

export async function semanticSearch() {
  const input = document.getElementById('semanticSearch');
  const resultsDiv = document.getElementById('searchResults');
  const query = input.value.trim();
  if (!query) return;

  if (!state.apiAvailable) {
    resultsDiv.innerHTML = '<div class="search-error">后端未启动，无法进行语义搜索。</div>';
    return;
  }

  resultsDiv.innerHTML = '<div class="search-loading">正在检索...</div>';

  try {
    const data = await semanticSearchApi(query, 5);

    if (data.error) {
      resultsDiv.innerHTML = `<div class="search-error">${data.error}</div>`;
      return;
    }

    const results = data.results || [];
    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="search-loading">未找到相关段落。</div>';
      return;
    }

    resultsDiv.innerHTML = results.map(r => {
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
  } catch (e) {
    console.error('Semantic search failed', e);
    resultsDiv.innerHTML = '<div class="search-error">搜索失败，请检查后端连接。</div>';
  }
}

export function clearSearch() {
  document.getElementById('searchResults').innerHTML = '';
}
