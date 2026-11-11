/**
 * 阅读器：段落渲染、章节导航、选段交互
 */
import { focusText, scrollBehavior, switchContent } from '../motion/index.js';
import { BOOKS, DEMO_DATA } from '../config.js';
import { state, consumePendingRead } from '../state.js';
import { fetchParagraphs, fetchParagraphAnnotations, fetchChapters } from '../api.js';
import * as timeline from './timeline.js';
import * as aiPanel from './aiPanel.js';
import * as bookshelf from './bookshelf.js';
import * as authorCards from './authorCards.js';
import { isLoggedIn, updateMyReadingProgress } from './communityApi.js';
import { writeReadingRoute } from '../readingRoute.js';
import { sourceDetails } from './sourceDetails.js';
import {analytics} from '../analytics/index.js';
import {createShareControl} from './share.js';
import {createReadingFeedback} from './feedback.js';

// ===== 读书进度自动保存（节流 1.2s，避免频繁请求）=====
let _saveTimer = null;
let pendingSave = null;
let saveQueue = Promise.resolve();
let saveVersion = 0;
let loadVersion = 0;
let chapterVersion = 0;
let retryLoad = null;
function saveReadingProgress(extraParagraphId = null) {
  if (!isLoggedIn() || !state.currentBook) return;
  const classicId = state.currentBook;
  const chapterIndex = Number(state.currentChapterIndex || 0);
  const totalChapters = Math.max(1, state.chapters.length || 1);
  const progressPct = state.chapters.length > 0
    ? Math.max(0, Math.min(1, (chapterIndex + 1) / totalChapters))
    : 0;
  const paragraphId = extraParagraphId || state.selectedParagraph?.id || state.currentParagraphs[0]?.id || null;
  const payload = {
    classic_id: classicId,
    chapter_index: chapterIndex,
    progress_pct: progressPct,
  };
  if (paragraphId) payload.paragraph_id = String(paragraphId);
  if (_saveTimer) clearTimeout(_saveTimer);
  pendingSave = { payload, version: ++saveVersion };
  _saveTimer = setTimeout(flushReadingProgress, 1200);
}

function flushReadingProgress() {
  clearTimeout(_saveTimer);
  const pending = pendingSave;
  pendingSave = null;
  if (!pending) return;
  const { payload, version } = pending;
  saveQueue = saveQueue.catch(() => {}).then(() => updateMyReadingProgress(payload)).then(result => {
    if (version !== saveVersion || state.currentBook !== payload.classic_id || state.currentChapterIndex !== payload.chapter_index) return;
    const status = document.getElementById('readingStatus');
    if (status) status.textContent = result?.error ? '阅读进度保存失败，请检查登录或网络后重新选句。' : '阅读进度已保存';
  });
}

export function renderParagraphs(paragraphs) {
  const container = document.getElementById('originalText');
  container.innerHTML = '';

  paragraphs.forEach((para, idx) => {
    const p = document.createElement('p');
    p.className = 'ancient-text';
    p.dataset.id = para.id;
    p.tabIndex = 0;
    p.setAttribute('role', 'button');
    p.setAttribute('aria-expanded', 'false');
    p.setAttribute('aria-controls', 'detailPanels');
    p.dataset.content = para.content;
    p.dataset.order = idx + 1;
    p.textContent = para.content;

    const hint = document.createElement('span');
    hint.className = 'click-hint';
    hint.textContent = '点击查看注疏';
    p.appendChild(hint);

    container.appendChild(p);
  });
  switchContent(container);
}

export async function selectParagraph(para, {deferAI=true}={}) {
  if (!state.currentParagraphs.includes(para)) return;
  if (state.selectedParagraph === para && !para.annotationError) {
    saveReadingProgress(para.id);
    return;
  }
  document.querySelectorAll('.ancient-text').forEach(el => {
    el.classList.remove('selected');
    el.setAttribute('aria-expanded', 'false');
  });
  const selectedEl = document.querySelector(`[data-id="${para.id}"]`);
  if (selectedEl) { selectedEl.classList.add('selected'); selectedEl.setAttribute('aria-expanded', 'true'); focusText(selectedEl); }

  aiPanel.cancelAIAnalysis();
  state.selectedParagraph = para;

  if ((!para.annotations || para.annotations.length === 0) && state.apiAvailable) {
    let data;
    try { data = await fetchParagraphAnnotations(para.id); }
    catch { data = { annotations: [], error: true }; }
    if (state.selectedParagraph !== para) return;
    if (data) {
      para.annotationError = Boolean(data.error);
      para.annotations = data.annotations || [];
      if (data.paragraph) para.chapter_title = data.paragraph.chapter_title;
    }
  }

  if (state.selectedParagraph !== para) return;
  let displayPara=para;
  if(state.guidedExample){
    if(para.id===state.guidedExample.paragraph_id)displayPara={...para,annotations:state.guidedExample.annotations};
    else {state.guidedExample=null;showReaderGuide(para,{animate:false});}
  }
  timeline.openTimeline(displayPara);
  const chapter=state.chapters[state.currentChapterIndex];
  const guide=document.getElementById('readerGuide');
  if(guide && (guide.hidden || guide.dataset.paragraphId!==para.id))showReaderGuide(para,{animate:false});
  if(chapter && !state.guidedExample)writeReadingRoute(state.currentBook,chapter.chapter_id,para.id);
  saveReadingProgress(para.id);
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.getElementById('timelinePanel')?.focus({preventScroll:true});
    document.getElementById('detailPanels').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  if (state.apiAvailable && (deferAI || state.guidedExample)) {
    aiPanel.offerAIAnalysis(para);
  } else if (state.apiAvailable) {
    await aiPanel.fetchAIAnalysis(para.id);
  } else {
    aiPanel.updateLocalAIAnalysis(para);
  }


}

export async function loadCurrentChapter() {
  const version = ++chapterVersion;
  const guide=document.getElementById('readerGuide');if(guide)guide.hidden=true;
  const ch = state.chapters[state.currentChapterIndex];
  flushReadingProgress();
  const progressStatus = document.getElementById('readingStatus');
  if (progressStatus) progressStatus.textContent = '';
  timeline.closeTimeline();
  state.currentParagraphs = [];
  setReaderMessage('正在载入原文…', true);
  aiPanel.cancelAIAnalysis();
  state.selectedParagraph = null;
  if (!ch) return;
  const bookInfo = BOOKS.find(b => b.id === state.currentBook);
  updateChapterControls();

  document.getElementById('currentBookTitle').textContent =
    `《${bookInfo?.name || state.currentBook}》· ${ch.title}`;
  document.getElementById('chapterIndicator').textContent =
    `${state.currentChapterIndex + 1}/${state.chapters.length}`;

  let paragraphs;
  try { paragraphs = await fetchParagraphs(ch.chapter_id); }
  catch {
    if (version === chapterVersion) setReaderMessage('原文加载失败，请检查网络后重试。', false, true);
    return;
  }
  if (version !== chapterVersion || state.chapters[state.currentChapterIndex] !== ch) return;
  document.getElementById('originalText').setAttribute('aria-busy', 'false');
  if (!paragraphs.length) { setReaderMessage('本章暂无原文，请切换其他章节。'); return; }
  state.currentParagraphs = paragraphs;  // 存储含注疏的段落
  renderParagraphs(paragraphs);
  const originalHost=document.getElementById('originalText');originalHost.dataset.workId=state.currentBook;originalHost.dataset.chapterId=ch.chapter_id;
  if(!document.hidden&&document.getElementById('page-reader')?.classList.contains('active'))analytics.readingOpened(state.currentBook,ch.chapter_id);
  updateChapterControls();
  timeline.closeTimeline();
  aiPanel.resetAIPanel();

  const currentChapter=state.chapters[state.currentChapterIndex];
  if(currentChapter && !state.guidedExample)writeReadingRoute(state.currentBook,currentChapter.chapter_id);
  saveReadingProgress();
}

/** Invalidate late navigation responses without changing public reading permissions. */
export function cancelReaderLoad(){++loadVersion;++chapterVersion;aiPanel.cancelAIAnalysis();}

export function prevChapter() {
  if (state.currentChapterIndex > 0) {
    state.guidedExample=null;
    state.currentChapterIndex--;
    loadCurrentChapter();
  }
}

export function nextChapter() {
  if (state.currentChapterIndex + 1 < state.chapters.length) {
    state.guidedExample=null;
    state.currentChapterIndex++;
    loadCurrentChapter();
  }
}

export function loadDemoBook(bookId) {
  const book = DEMO_DATA[bookId];
  const bookInfo = BOOKS.find(b => b.id === bookId);
  state.chapters = [];
  state.currentParagraphs = book?.paragraphs || [];
  updateChapterControls();

  if (!book) {
    document.getElementById('currentBookTitle').textContent =
      `《${bookInfo.name}》· 内容暂不可用`;
    document.getElementById('chapterIndicator').textContent = '0/0';
    document.getElementById('originalText').innerHTML =
      `<p class="ai-placeholder">当前为阅读演示，仅提供李清照《如梦令》的一段原文与预置注疏。完整馆藏与 AI 解读将在服务恢复后可用。</p>`;
    timeline.closeTimeline();
    aiPanel.resetAIPanel();
    return;
  }

  document.getElementById('currentBookTitle').textContent =
    `《${book.name}》· ${book.chapter}`;
  document.getElementById('chapterIndicator').textContent = '1/1';
  renderParagraphs(book.paragraphs);
  timeline.closeTimeline();
  aiPanel.resetAIPanel();

  document.getElementById('aiContent').innerHTML = `<p class="ai-placeholder">当前为阅读演示，仅提供李清照《如梦令》的一段原文与预置注疏。完整馆藏与 AI 解读将在服务恢复后可用。</p>`;
}

export async function loadBook(bookId, options={}) {
  const version = ++loadVersion;
  ++chapterVersion;
  flushReadingProgress();
  const progressStatus = document.getElementById('readingStatus');
  if (progressStatus) progressStatus.textContent = '';
  // 若从个人主页的读书进度卡点进来，优先按 pendingRead 跳转
  const storedPending = consumePendingRead();
  const pending = options.paragraphId || options.chapterId ? null : storedPending;
  retryLoad=()=>loadBook(bookId,options);
  state.guidedExample=options.guidedExample || null;
  const guide=document.getElementById('readerGuide');if(guide)guide.hidden=true;
  let targetChapterIndex = null;
  let targetParagraphId = options.paragraphId || null;
  if (pending && pending.classicId) {
    bookId = pending.classicId;
    targetChapterIndex = pending.chapterIndex != null ? Number(pending.chapterIndex) : null;
    targetParagraphId = pending.paragraphId || null;
  }

  aiPanel.cancelAIAnalysis();
  timeline.closeTimeline();
  state.currentParagraphs = [];
  state.selectedParagraph = null;
  state.chapters = [];
  state.currentBook = bookId;
  state.currentChapterIndex = 0;

  bookshelf.updateBookshelfActive(bookId);
  authorCards.selectAuthorCard(bookId);
  authorCards.closeAuthorDetail();

  const bookInfo = BOOKS.find(book => book.id === bookId);
  document.getElementById('currentBookTitle').textContent = `《${bookInfo?.name || bookId}》`;
  document.getElementById('chapterIndicator').textContent = '—';
  updateChapterControls();
  setReaderMessage('正在载入作品…', true);
  let chapters;
  try { chapters = await fetchChapters(bookId); }
  catch { if (version === loadVersion) setReaderMessage('作品加载失败，请检查网络后重试。', false, true); return; }
  if (version !== loadVersion) return;
  state.apiAvailable = true;
  state.chapters = chapters;
  if (!chapters.length) {
    setReaderMessage('此作品暂无可读章节，请选择其他作品。');
    return;
  }

  if(options.paragraphId || options.chapterId){
    const index=chapters.findIndex(ch=>options.chapterId ? ch.chapter_id===options.chapterId : options.paragraphId.startsWith(ch.chapter_id+'-'));
    if(index<0){setReaderMessage('阅读链接对应的章节不存在，请从书架重新选择作品。');return false}
    state.currentChapterIndex=index;
  } else if(targetChapterIndex!=null && Number.isSafeInteger(targetChapterIndex) && targetChapterIndex>=0 && targetChapterIndex<chapters.length){
    state.currentChapterIndex=targetChapterIndex;
  }
  await loadCurrentChapter();
  if(version!==loadVersion)return false;
  if(targetParagraphId){
    const para=state.currentParagraphs.find(p=>p.id===targetParagraphId);
    if(!para){const status=document.getElementById('readingStatus');if(status)status.textContent='指定原文未找到，请在本章选择其他句子。';return false}
    if(state.guidedExample){
      const sample=state.guidedExample;
      const unchanged=para.content===sample.original.content && sample.annotations.every(a=>para.annotations.some(raw=>raw.id===a.id && raw.content===a.content && raw.author===a.author && (raw.dynasty||raw.era_name||raw.era)===a.dynasty));
      if(!unchanged){state.guidedExample=null;const status=document.getElementById('readingStatus');if(status)status.textContent='体验文献已更新，需重新核验；当前仅展示普通馆藏原文。';}
    }
    const element=[...document.querySelectorAll('.ancient-text')].find(el=>el.dataset.id===para.id);
    element?.classList.add('is-reading-target');element?.focus({preventScroll:true});focusText(element);
    element?.scrollIntoView({behavior:scrollBehavior(),block:'center'});
    if(options.selectTarget===false){
      showReaderGuide(para);
      if(state.guidedExample)window.history.replaceState(window.history.state,'','#experience');
      else writeReadingRoute(bookId,chapters[state.currentChapterIndex].chapter_id,para.id);
    }else await selectParagraph(para);
  }else if(!state.guidedExample)writeReadingRoute(bookId,chapters[state.currentChapterIndex].chapter_id);
  return true;
}

export function showReaderGuide(para,{animate=true}={}){
  const host=document.getElementById('readerGuide');if(!host)return;
  host.replaceChildren();host.hidden=false;host.dataset.paragraphId=para.id;
  const note=document.createElement('p');note.textContent=state.guidedExample?'01 读这段原文 → 02 对照已核验注疏 → 03 核对来源。AI 辅助解读单独生成。':'已定位到这段馆藏原文。选择下方按钮查看注疏；未核验出处会明确标注。';host.appendChild(note);
  const view=document.createElement('button');view.type='button';view.className='btn btn-primary';view.textContent='查看历代注疏';view.setAttribute('aria-controls','detailPanels');view.setAttribute('aria-expanded',String(state.selectedParagraph===para));
  view.addEventListener('click',()=>{if(state.currentParagraphs.includes(para))selectParagraph(para,{deferAI:true})});
  const proceed=document.createElement('button');proceed.type='button';proceed.className='btn btn-secondary';proceed.textContent='继续阅读完整作品';
  proceed.addEventListener('click',continueReading);
  host.append(view,proceed);
  const chapter=state.chapters[state.currentChapterIndex];
  if(chapter)host.appendChild(createShareControl({workId:state.currentBook,chapterId:chapter.chapter_id,paragraphId:para.id}));
  if(state.guidedExample?.original)host.appendChild(sourceDetails(state.guidedExample.original));
  host.appendChild(createReadingFeedback({work_id:state.currentBook,paragraph_id:para.id,target:'reading'},{problemOnly:true,label:'阅读中遇到问题？'}));
  if(animate)switchContent(host);
}

export function continueReading(){
  const host=document.getElementById('readerGuide');
  const paragraphId=state.selectedParagraph?.id || host?.dataset.paragraphId;
  state.guidedExample=null;timeline.closeTimeline();if(host)host.hidden=true;
  const chapter=state.chapters[state.currentChapterIndex];
  if(chapter)writeReadingRoute(state.currentBook,chapter.chapter_id,paragraphId);
  const target=[...document.querySelectorAll('.ancient-text')].find(el=>el.dataset.id===paragraphId);
  document.querySelectorAll('.is-reading-target').forEach(el=>el.classList.remove('is-reading-target'));
  if(target){target.classList.add('is-reading-target');target.focus({preventScroll:true});target.scrollIntoView({behavior:scrollBehavior(),block:'center'});}
}

// 重新暴露以便搜索模块使用
export async function jumpToParagraph(classicId, paragraphId) {
  return loadBook(classicId,{paragraphId});
}

function updateChapterControls() {
  document.querySelector('[data-action="prevChapter"]').disabled = state.currentChapterIndex <= 0;
  document.querySelector('[data-action="nextChapter"]').disabled = state.currentChapterIndex + 1 >= state.chapters.length;
}

function setReaderMessage(message, busy = false, retry = false) {
  const container = document.getElementById('originalText');
  container.setAttribute('aria-busy', String(busy));
  container.replaceChildren();
  const status = document.createElement('p');
  status.className = 'ai-placeholder'; status.setAttribute('role', 'status'); status.textContent = message;
  container.appendChild(status);
  if (retry) {
    const button = document.createElement('button'); button.className = 'btn btn-secondary';
    button.textContent = '重新加载'; button.addEventListener('click', () => retryLoad?.(), { once: true });
    container.appendChild(button);
  }
}
