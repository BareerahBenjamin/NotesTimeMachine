/**
 * 阅读器：段落渲染、章节导航、选段交互
 */
import { BOOKS, BOOK_NAMES, DEMO_DATA, DEMO_NOTICE } from '../config.js';
import { state } from '../state.js';
import { fetchParagraphs, fetchParagraphAnnotations, fetchChapters } from '../api.js';
import * as timeline from './timeline.js';
import * as aiPanel from './aiPanel.js';
import * as bookshelf from './bookshelf.js';
import * as authorCards from './authorCards.js';

export function renderParagraphs(paragraphs) {
  const container = document.getElementById('originalText');
  container.innerHTML = '';

  paragraphs.forEach((para, idx) => {
    const p = document.createElement('p');
    p.className = 'ancient-text';
    p.dataset.id = para.id;
    p.dataset.content = para.content;
    p.dataset.order = idx + 1;
    p.textContent = para.content;

    const hint = document.createElement('span');
    hint.className = 'click-hint';
    hint.textContent = '点击查看注疏';
    p.appendChild(hint);

    container.appendChild(p);
  });
}

export async function selectParagraph(para) {
  document.querySelectorAll('.ancient-text').forEach(el => {
    el.classList.remove('selected');
  });
  const selectedEl = document.querySelector(`[data-id="${para.id}"]`);
  if (selectedEl) selectedEl.classList.add('selected');

  state.selectedParagraph = para;

  if ((!para.annotations || para.annotations.length === 0) && state.apiAvailable) {
    const data = await fetchParagraphAnnotations(para.id);
    if (data) {
      para.annotations = data.annotations || [];
      if (data.paragraph) para.chapter_title = data.paragraph.chapter_title;
    }
  }

  timeline.openTimeline(para);

  if (state.apiAvailable) {
    await aiPanel.fetchAIAnalysis(para.id);
  } else {
    aiPanel.updateLocalAIAnalysis(para);
  }
}

export async function loadCurrentChapter() {
  const ch = state.chapters[state.currentChapterIndex];
  if (!ch) return;
  const bookInfo = BOOKS.find(b => b.id === state.currentBook);

  document.getElementById('currentBookTitle').textContent =
    `《${bookInfo.name}》· ${ch.title}`;
  document.getElementById('chapterIndicator').textContent =
    `${state.currentChapterIndex + 1}/${state.chapters.length}`;

  const paragraphs = await fetchParagraphs(ch.chapter_id);
  state.currentParagraphs = paragraphs;  // 存储含注疏的段落
  renderParagraphs(paragraphs);
  timeline.closeTimeline();
  aiPanel.resetAIPanel();
}

export function prevChapter() {
  if (state.currentChapterIndex > 0) {
    state.currentChapterIndex--;
    loadCurrentChapter();
  }
}

export function nextChapter() {
  if (state.currentChapterIndex + 1 < state.chapters.length) {
    state.currentChapterIndex++;
    loadCurrentChapter();
  }
}

export function loadDemoBook(bookId) {
  const book = DEMO_DATA[bookId];
  const bookInfo = BOOKS.find(b => b.id === bookId);
  state.chapters = [];

  if (!book) {
    document.getElementById('currentBookTitle').textContent =
      `《${bookInfo.name}》· 后端未启动`;
    document.getElementById('chapterIndicator').textContent = '0/0';
    document.getElementById('originalText').innerHTML =
      `<p class="ai-placeholder">${DEMO_NOTICE}</p>`;
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

  document.getElementById('aiContent').innerHTML = `<p class="ai-placeholder">${DEMO_NOTICE}</p>`;
}

export async function loadBook(bookId) {
  state.currentBook = bookId;
  state.currentChapterIndex = 0;

  bookshelf.updateBookshelfActive(bookId);
  authorCards.selectAuthorCard(bookId);
  authorCards.closeAuthorDetail();

  if (!state.apiAvailable) {
    loadDemoBook(bookId);
    return;
  }

  state.chapters = await fetchChapters(bookId);

  if (state.chapters.length === 0) {
    loadDemoBook(bookId);
    return;
  }
  await loadCurrentChapter();
}

// 重新暴露以便搜索模块使用
export async function jumpToParagraph(classicId, paragraphId) {
  await loadBook(classicId);
  for (let i = 0; i < state.chapters.length; i++) {
    if (paragraphId.startsWith(state.chapters[i].chapter_id)) {
      state.currentChapterIndex = i;
      await loadCurrentChapter();
      const el = document.querySelector(`[data-id="${paragraphId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 模拟点击：查找段落数据并选中
        const paragraphs = await fetchParagraphs(state.chapters[i].chapter_id);
        const para = paragraphs.find(p => p.id === paragraphId);
        if (para) await selectParagraph(para);
      }
      return;
    }
  }
}
