/**
 * 作品详情弹窗
 */
import { BOOKS } from '../config.js';

export function toggleBookDetail(bookId) {
  const panel = document.getElementById('bookDetail');
  const content = document.getElementById('bookDetailContent');

  if (panel.classList.contains('visible') && panel.dataset.book === bookId) {
    closeBookDetail();
    return;
  }

  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return;

  panel.dataset.book = bookId;
  content.innerHTML = `
    <div class="book-detail-header">
      <h2 class="book-detail-title">《${book.name}》</h2>
      <span class="book-detail-subtitle">${book.chapter}</span>
    </div>
    <div class="book-detail-section">
      <h3 class="book-detail-section-title">作品介绍</h3>
      <p class="book-detail-text">${book.introduction}</p>
    </div>
    <div class="book-detail-section">
      <h3 class="book-detail-section-title">时代背景</h3>
      <p class="book-detail-text">${book.background}</p>
    </div>
  `;

  panel.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

export function closeBookDetail() {
  document.getElementById('bookDetail').classList.remove('visible');
  document.body.style.overflow = '';
}
