/**
 * 时间轴渲染与筛选 + AI 解读
 */
import { ERA_ORDER, ERA_CLASS_MAP } from '../config.js';
import { state } from '../state.js';
import { fetchAnnotationInterpretation } from '../api.js';

export function openTimeline(para) {
  const detailPanels = document.getElementById('detailPanels');
  const timelinePanel = document.getElementById('timelinePanel');
  detailPanels.classList.add('visible');
  timelinePanel.classList.add('visible');

  document.getElementById('selectedSentence').textContent = para.content;

  const track = document.getElementById('timelineTrack');
  track.innerHTML = '';

  const sortedAnnotations = [...para.annotations].sort((a, b) => {
    return ERA_ORDER.indexOf(a.era) - ERA_ORDER.indexOf(b.era);
  });

  sortedAnnotations.forEach((ann, idx) => {
    const item = document.createElement('div');
    const eraClass = ERA_CLASS_MAP[ann.era] || 'han';
    item.className = `timeline-item ${eraClass}`;
    item.style.setProperty('--index', idx);
    item.dataset.era = eraClass;
    item.innerHTML = `
      <div class="timeline-era">${ann.era_name}</div>
      <div class="timeline-author">${ann.author}</div>
      <div class="timeline-annotation">${ann.content}</div>
      <button class="btn-interpret" data-annotation-id="${ann.id}">
        <span class="interpret-icon">&#x2736;</span> AI 解读
      </button>
      <div class="annotation-interpretation" id="interp-${ann.id}" style="display:none;"></div>
    `;

    // 点击注疏项展开/收起初释
    item.querySelector('.timeline-annotation').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

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
        return;
      }

      // 显示加载状态
      btn.disabled = true;
      btn.innerHTML = '<span class="interpret-icon">&#x2736;</span> 生成中...';
      interpDiv.style.display = 'block';
      interpDiv.innerHTML = '<div class="interpretation-loading">正在结合时代背景生成解读...</div>';

      try {
        const result = await fetchAnnotationInterpretation(ann);
        if (result.interpretation) {
          interpDiv.innerHTML = `<div class="interpretation-content">
            <div class="interpretation-label">&#x2736; AI 解读</div>
            <div class="interpretation-text">${result.interpretation}</div>
          </div>`;
          interpDiv.dataset.loaded = 'true';
          btn.classList.add('active');
        } else {
          interpDiv.innerHTML = `<div class="interpretation-error">解读生成失败</div>`;
        }
      } catch (err) {
        interpDiv.innerHTML = `<div class="interpretation-error">网络错误，请重试</div>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="interpret-icon">&#x2736;</span> AI 解读';
      }
    });

    track.appendChild(item);
  });

  state.timelineFilter = null;
  updateLegendState();
}

export function filterTimeline(era) {
  state.timelineFilter = era;
  const items = document.querySelectorAll('.timeline-item');
  items.forEach(item => {
    if (era === null) {
      item.classList.remove('hidden-era');
    } else {
      item.classList.toggle('hidden-era', item.dataset.era !== era);
    }
  });
  updateLegendState();
}

export function updateLegendState() {
  document.querySelectorAll('.legend-item[data-era]').forEach(el => {
    el.classList.toggle('dimmed', state.timelineFilter !== null && el.dataset.era !== state.timelineFilter);
  });
  
  // 更新"全部"按钮状态
  const resetBtn = document.querySelector('.legend-reset');
  if (resetBtn) {
    resetBtn.classList.toggle('active', state.timelineFilter === null);
  }
}

export function closeTimeline() {
  const detailPanels = document.getElementById('detailPanels');
  detailPanels.classList.remove('visible');

  const timelinePanel = document.getElementById('timelinePanel');
  timelinePanel.classList.remove('visible');

  document.querySelectorAll('.ancient-text').forEach(el => {
    el.classList.remove('selected');
  });

  state.selectedParagraph = null;
  state.timelineFilter = null;
}