import { switchContent } from '../motion/index.js';

/**
 * AI 分析面板
 */
import { state } from '../state.js';
import { fetchAIAnalysis as apiFetchAIAnalysis } from '../api.js';
import { renderAnalysis } from './safeContent.js';
import { appendAIEvidence } from './sourceDetails.js';
import { createReadingFeedback } from './feedback.js';
import {analytics,EVENTS} from '../analytics/index.js';

let activeController = null;
let requestVersion = 0;
export function cancelAIAnalysis() {
  requestVersion++; activeController?.abort(); activeController = null;
  document.getElementById('aiContent')?.setAttribute('aria-busy', 'false');
}

export function resetAIPanel() {
  cancelAIAnalysis();
  document.getElementById('aiContent').innerHTML =
    '<p class="ai-placeholder">选中句子后，AI 将依据馆藏文本辅助解读；历史归属和文献出处仍需核验。</p>';
}

export function updateLocalAIAnalysis(para) {
  const aiContent = document.getElementById('aiContent');
  const anns = para.annotations || [];
  const eras = [...new Set(anns.map(a => a.era_name))];
  const authors = anns.map(a => a.author).join('、');
  aiContent.innerHTML = `
    <div class="ai-analysis">
      <p><strong>注疏概况：</strong>共 <strong>${anns.length}</strong> 条注疏，跨越 <strong>${eras.length}</strong> 个时代（${eras.join('、') || '—'}），注家：${authors || '—'}。</p>
      <p style="margin-top:12px;color:var(--muted);">当前为阅读演示，仅提供李清照《如梦令》的一段原文与预置注疏。完整馆藏与 AI 解读将在服务恢复后可用。</p>
    </div>
  `;
}

export function offerAIAnalysis(para){
  cancelAIAnalysis();const host=document.getElementById('aiContent');host.replaceChildren();
  const p=document.createElement('p');p.textContent='文献注疏与 AI 解释分别展示。AI 可能误读；服务或额度不可用时仍可阅读原文和注疏。';
  const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent='查看 AI 辅助解读';
  button.addEventListener('click',()=>{if(state.selectedParagraph===para){analytics.track(EVENTS.AI,{work_id:state.currentBook,paragraph_id:para.id,usage_kind:'analysis'},analytics.operationId());fetchAIAnalysis(para.id)}});
  host.append(p,button);
}

export async function fetchAIAnalysis(paragraphId) {
  const aiContent = document.getElementById('aiContent');
  aiContent.innerHTML = '<p class="ai-placeholder">正在生成 AI 脉络分析...</p>';

  cancelAIAnalysis();
  const version = requestVersion;
  const controller = new AbortController();
  activeController = controller;
  aiContent.setAttribute('aria-busy', 'true');
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const data = await apiFetchAIAnalysis(paragraphId, controller.signal);
    clearTimeout(timeout);
    if (version !== requestVersion || state.selectedParagraph?.id !== paragraphId) return;

    if (data.error) {
      aiContent.textContent = `AI 分析出错：${data.error}`;
    } else if (data.analysis) {
      renderAnalysis(aiContent, data.analysis);
      appendAIEvidence(aiContent, data);
      aiContent.appendChild(createReadingFeedback({work_id:state.currentBook,paragraph_id:paragraphId,target:'ai_analysis',...(data.ai_response_id?{ai_response_id:data.ai_response_id}:{}),prompt_version:data.prompt_version||null,model:data.ai_model||null},{problemOnly:data.generation_status!=='validated',label:data.generation_status==='validated'?'这段解读对你有帮助吗？':'AI 解读暂未生成，也可反馈使用中遇到的问题。'}));
    } else {
      aiContent.innerHTML = '<p class="ai-placeholder">未能生成分析，请稍后重试。</p>';
    }
    switchContent(aiContent);
  } catch (e) {
    clearTimeout(timeout);
    if (version !== requestVersion || state.selectedParagraph?.id !== paragraphId) return;
    if (e.name === 'AbortError') {
      aiContent.innerHTML = '<p class="ai-placeholder">AI 分析超时（30秒），请稍后重试。</p>';
    } else {
      aiContent.innerHTML = '<p class="ai-placeholder">AI 分析暂时不可用，请稍后再试。</p>';
    }
  } finally {
    clearTimeout(timeout);
    if (version === requestVersion) { activeController = null; aiContent.setAttribute('aria-busy', 'false'); }
  }
}
