/**
 * AI 分析面板
 */
import { DEMO_NOTICE } from '../config.js';
import { state } from '../state.js';
import { fetchAIAnalysis as apiFetchAIAnalysis } from '../api.js';

export function resetAIPanel() {
  document.getElementById('aiContent').innerHTML =
    '<p class="ai-placeholder">选中句子后，AI 将自动分析历代注疏的演变脉络与思想差异。</p>';
}

export function updateLocalAIAnalysis(para) {
  const aiContent = document.getElementById('aiContent');
  const anns = para.annotations || [];
  const eras = [...new Set(anns.map(a => a.era_name))];
  const authors = anns.map(a => a.author).join('、');
  aiContent.innerHTML = `
    <div class="ai-analysis">
      <p><strong>注疏概况：</strong>共 <strong>${anns.length}</strong> 条注疏，跨越 <strong>${eras.length}</strong> 个时代（${eras.join('、') || '—'}），注家：${authors || '—'}。</p>
      <p style="margin-top:12px;color:var(--muted);">${DEMO_NOTICE}</p>
    </div>
  `;
}

export async function fetchAIAnalysis(paragraphId) {
  const aiContent = document.getElementById('aiContent');
  aiContent.innerHTML = '<p class="ai-placeholder">正在生成 AI 脉络分析...</p>';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const data = await apiFetchAIAnalysis(paragraphId, controller.signal);
    clearTimeout(timeout);

    if (data.error) {
      aiContent.innerHTML = `<p class="ai-placeholder">AI 分析出错：${data.error}</p>`;
    } else if (data.analysis) {
      const html = (typeof marked !== 'undefined' && marked.parse)
        ? marked.parse(data.analysis)
        : data.analysis;
      aiContent.innerHTML = `<div class="ai-analysis">${html}</div>`;
    } else {
      aiContent.innerHTML = '<p class="ai-placeholder">未能生成分析，请稍后重试。</p>';
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error('Failed to fetch AI analysis', e);
    if (e.name === 'AbortError') {
      aiContent.innerHTML = '<p class="ai-placeholder">AI 分析超时（30秒），请稍后重试。</p>';
    } else {
      aiContent.innerHTML = '<p class="ai-placeholder">AI 分析暂时不可用，请稍后再试。</p>';
    }
  }
}
