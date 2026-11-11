/**
 * 时间轴渲染与筛选 + AI 解读
 */
import { setPanelVisible, stagger, switchContent } from '../motion/index.js';
import { cancelAIAnalysis } from './aiPanel.js';
import { ERA_ORDER, ERA_CLASS_MAP } from '../config.js';
import { state } from '../state.js';
import { fetchAnnotationInterpretation } from '../api.js';
import { appendAIEvidence, sourceDetails, isVerifiedSource } from './sourceDetails.js';
import { createReadingFeedback } from './feedback.js';
import {analytics,EVENTS} from '../analytics/index.js';
import {observeAnnotations,stopAnnotationObservation,refreshAnnotationObservation} from '../analytics/engagement.js';

let selectedNode = null;
const interpretationRequests = new Set();
function cancelInterpretations() {
  interpretationRequests.forEach(controller => controller.abort());
  interpretationRequests.clear();
}

export function openTimeline(para) {
  stopAnnotationObservation();
  cancelInterpretations();
  selectedNode = null;
  const detailPanels = document.getElementById('detailPanels');
  const timelinePanel = document.getElementById('timelinePanel');
  setPanelVisible(detailPanels, true);
  timelinePanel.classList.add('visible');

  document.getElementById('selectedSentence').textContent = para.content;

  const track = document.getElementById('timelineTrack');
  track.innerHTML = '';

  const nodes = document.getElementById('eraNavigation');
  nodes.replaceChildren();
  const allNode = document.createElement('button');
  allNode.className = 'era-node'; allNode.textContent = '全部注疏';
  allNode.dataset.node = 'all'; allNode.setAttribute('aria-pressed', 'true');
  allNode.addEventListener('click', () => filterTimeline(null));
  nodes.appendChild(allNode);

  const sortedAnnotations = [...(para.annotations || [])].sort((a, b) => {
    const order=era=>ERA_ORDER.includes(era)?ERA_ORDER.indexOf(era):ERA_ORDER.length;
    return order(a.era) - order(b.era);
  });

  const observed=[];
  sortedAnnotations.forEach((ann, idx) => {
    const item = document.createElement('div');
    const eraClass = ERA_CLASS_MAP[ann.era] || 'han';
    item.className = `timeline-item ${eraClass}`;
    item.style.setProperty('--index', idx);
    item.dataset.era = ann.era || 'unknown';
    item.dataset.node = String(idx);
    const node = document.createElement('button');
    node.className = 'era-node'; node.textContent = ann.ai_generated ? 'AI 辅助解读' : `${ann.era_name} · ${ann.author}`;
    node.dataset.node = String(idx); node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => selectTimelineNode(idx));
    nodes.appendChild(node);
    item.innerHTML = `
      <div class="timeline-era"></div>
      <div class="timeline-author"></div>
      <div class="timeline-annotation"></div>
      <button class="btn-interpret" data-annotation-id="${idx}">
        <span class="interpret-icon">&#x2736;</span> AI 解读
      </button>
      <div class="annotation-interpretation" id="interp-${idx}" style="display:none;"></div>
    `;

    // Text uses textContent so an annotation is always treated as literary content.
    item.querySelector('.timeline-era').textContent = ann.ai_generated ? 'AI 辅助解读' : isVerifiedSource(ann) ? `${ann.era_name || ann.era} · 文献已核验` : `${ann.era_name || ann.era} · ${ann.content_type === 'modern_research' ? '现代研究出处待核验' : '历史归属待核验'}`;
    item.querySelector('.timeline-author').textContent = ann.ai_generated ? 'AI 模拟或整理；非历史人物原文' : ann.author || '署名未提供';
    const copy=document.createElement('div');copy.className='annotation-copy';copy.textContent=ann.content || '';
    item.querySelector('.timeline-annotation').appendChild(copy);
    if(!ann.ai_generated&&ann.content_type!=='ai_interpretation'&&ann.content&&ann.id)observed.push({element:copy,annotation:ann,verified:isVerifiedSource(ann)});
    const source = document.createElement('span'); source.className = 'timeline-source';
    source.textContent = `${ann.source_title || ann.source || '出处未提供'} · ${ann.ai_generated ? 'AI 辅助解读，不作历史依据' : isVerifiedSource(ann) ? '文献已核验，可查看版本与定位' : '出处待核验'}`;
    item.querySelector('.timeline-annotation').appendChild(source);
    const feedback=createReadingFeedback({work_id:state.currentBook,paragraph_id:para.id,annotation_id:ann.id,target:'annotation'},{label:ann.ai_generated?'这段 AI 整理对你有帮助吗？':'这条馆藏注疏对你有帮助吗？'});
    item.querySelector('.timeline-annotation').appendChild(sourceDetails(ann,{onReportIssue:event=>feedback.openIssue('questionable_source',event.currentTarget)}));
    item.appendChild(feedback);
    const interpretButton = item.querySelector('.btn-interpret');
    interpretButton.dataset.annotationId = ann.id;
    interpretButton.setAttribute('aria-expanded', 'false');
    interpretButton.setAttribute('aria-controls', `interp-${idx}`);

    // 点击 AI 解读按钮
    item.querySelector('.btn-interpret').addEventListener('click', async (e) => {
      e.stopPropagation();
      const interpDiv = item.querySelector('.annotation-interpretation');
      const btn = item.querySelector('.btn-interpret');

      // 如果已经加载过，切换显示
      if (interpDiv.dataset.loaded) {
        const isVisible = interpDiv.style.display !== 'none';
        interpDiv.style.display = isVisible ? 'none' : 'block';
        btn.classList.toggle('active');
        btn.setAttribute('aria-expanded', String(!isVisible));
        if (!isVisible) switchContent(interpDiv);
        return;
      }

      if (!state.apiAvailable) {
        interpDiv.style.display = 'block';
        interpDiv.textContent = '当前为阅读演示，AI 解读暂不可用。';
        btn.setAttribute('aria-expanded', 'true');
        return;
      }

      // 显示加载状态
      btn.disabled = true;
      btn.setAttribute('aria-expanded', 'true');
      interpDiv.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="interpret-icon">&#x2736;</span> 生成中...';
      interpDiv.style.display = 'block';
      interpDiv.innerHTML = '<div class="interpretation-loading">正在核对馆藏文本并生成 AI 辅助解读...</div>';

      const controller = new AbortController();
      interpretationRequests.add(controller);
      analytics.track(EVENTS.AI,{work_id:state.currentBook,paragraph_id:para.id,annotation_id:ann.id,usage_kind:'annotation'},analytics.operationId());
      try {
        const result = await fetchAnnotationInterpretation({...ann,paragraph_id:para.id}, controller.signal);
        if (controller.signal.aborted || !item.isConnected) return;
        if (result.interpretation) {
          interpDiv.innerHTML = `<div class="interpretation-content">
            <div class="interpretation-text"></div>
          </div>`;
          interpDiv.querySelector('.interpretation-text').textContent = result.interpretation;
          appendAIEvidence(interpDiv.querySelector('.interpretation-content'),result);
          interpDiv.appendChild(createReadingFeedback({work_id:state.currentBook,paragraph_id:para.id,annotation_id:ann.id,target:'annotation_interpretation',...(result.ai_response_id?{ai_response_id:result.ai_response_id}:{}),prompt_version:result.prompt_version||null,model:result.ai_model||null},{problemOnly:result.generation_status!=='validated'}));
          switchContent(interpDiv);
          interpDiv.dataset.loaded = 'true';
          btn.classList.add('active');
        } else {
          interpDiv.innerHTML = `<div class="interpretation-error">解读生成失败</div>`;
        }
      } catch (err) {
        if (controller.signal.aborted || !item.isConnected) return;
        interpDiv.innerHTML = `<div class="interpretation-error">网络错误，请重试</div>`;
      } finally {
        interpretationRequests.delete(controller);
        btn.disabled = false;
        interpDiv.setAttribute('aria-busy', 'false');
        btn.innerHTML = '<span class="interpret-icon">&#x2736;</span> AI 解读';
      }
    });

    track.appendChild(item);
  });

  const empty = document.createElement('p'); empty.className = 'empty-timeline';
  empty.textContent = para.annotationError ? '注疏加载失败，请重新选择原文重试。' : sortedAnnotations.length ? '这一时代暂无注疏，可选择其他时代或查看全部。' : '这段原文暂无注疏，可继续阅读其他段落。';
  empty.hidden = sortedAnnotations.length > 0; track.appendChild(empty);
  // Panel entrance + at most two node entrances share the three-motion budget.
  stagger([...nodes.children].slice(0, 2));
  state.timelineFilter = null;
  document.querySelector('#readerGuide .btn-primary')?.setAttribute('aria-expanded','true');
  updateLegendState();
  const chapter=state.chapters[state.currentChapterIndex];
  if(chapter)observeAnnotations({workId:state.currentBook,chapterId:chapter.chapter_id,paragraphId:para.id,entries:observed});
}

export function filterTimeline(era) {
  selectedNode = null;
  state.timelineFilter = era;
  const items = document.querySelectorAll('.timeline-item');
  items.forEach(item => {
    item.classList.remove('node-inactive');
    if (era === null) {
      item.classList.remove('hidden-era');
    } else {
      item.classList.toggle('hidden-era', item.dataset.era !== era);
    }
  });
  document.querySelectorAll('#eraNavigation .era-node').forEach(node => node.setAttribute('aria-pressed', String(era === null && node.dataset.node === 'all')));
  const visible = [...items].filter(item => !item.classList.contains('hidden-era'));
  const empty = document.querySelector('#timelineTrack .empty-timeline');
  if (empty) empty.hidden = visible.length > 0;
  switchContent(document.getElementById('timelineTrack'));
  refreshAnnotationObservation();
  updateLegendState();
}

export function selectTimelineNode(index) {
  selectedNode = index;
  state.timelineFilter = null;
  document.querySelectorAll('.timeline-item').forEach(item => {
    item.classList.remove('hidden-era');
    item.classList.toggle('node-inactive', item.dataset.node !== String(index));
  });
  document.querySelectorAll('#eraNavigation .era-node').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.node === String(index))));
  const empty = document.querySelector('#timelineTrack .empty-timeline');
  if (empty) empty.hidden = true;
  switchContent(document.getElementById('timelineTrack'));
  refreshAnnotationObservation();
  updateLegendState();
}

export function updateLegendState() {
  document.querySelectorAll('.legend-item[data-era]').forEach(el => {
    el.setAttribute('aria-pressed', String(state.timelineFilter === el.dataset.era));
    el.classList.toggle('dimmed', state.timelineFilter !== null && el.dataset.era !== state.timelineFilter);
  });
  
  // 更新"全部"按钮状态
  const resetBtn = document.querySelector('.legend-reset');
  if (resetBtn) {
    resetBtn.setAttribute('aria-pressed', String(state.timelineFilter === null && selectedNode === null));
    resetBtn.classList.toggle('active', state.timelineFilter === null && selectedNode === null);
  }
}

export function closeTimeline({restorePosition=false}={}) {
  stopAnnotationObservation();
  const original=[...document.querySelectorAll('.ancient-text')].find(el=>el.dataset.id===state.selectedParagraph?.id);
  cancelInterpretations();
  const detailPanels = document.getElementById('detailPanels');
  if (detailPanels.contains(document.activeElement)) document.querySelector('.ancient-text.selected')?.focus({ preventScroll: true });
  setPanelVisible(detailPanels, false);
  cancelAIAnalysis();

  const timelinePanel = document.getElementById('timelinePanel');
  timelinePanel.classList.remove('visible');

  document.querySelectorAll('.ancient-text').forEach(el => {
    el.classList.remove('selected');
    el.setAttribute('aria-expanded', 'false');
  });

  state.selectedParagraph = null;
  state.timelineFilter = null;
  document.querySelector('#readerGuide .btn-primary')?.setAttribute('aria-expanded','false');
  if(restorePosition && original){original.focus({preventScroll:true});original.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}
}
