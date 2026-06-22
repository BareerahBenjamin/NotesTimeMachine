/**
 * 作者卡片与详情弹窗
 */
import { AUTHOR_DATA } from '../config.js';

export function selectAuthorCard(bookId) {
  document.querySelectorAll('.author-card').forEach(el => {
    el.classList.toggle('active', el.dataset.book === bookId);
  });
}

export function toggleAuthorDetail(bookId) {
  const modal = document.getElementById('authorDetail');
  const content = document.getElementById('authorDetailContent');

  if (modal.classList.contains('visible') && modal.dataset.book === bookId) {
    closeAuthorDetail();
    return;
  }

  const data = AUTHOR_DATA[bookId];
  if (!data) return;

  modal.dataset.book = bookId;

  const eraMap = {
    '东汉': { code: 'han', label: '汉代' },
    '唐代': { code: 'tang', label: '唐代' },
    '宋代': { code: 'song', label: '宋代' },
    '清代': { code: 'qing', label: '清代' },
  };
  const era = eraMap[data.dynasty] || { code: 'modern', label: data.dynasty };

  content.innerHTML = `
    <div class="modal-header-band" style="background: ${data.color}"></div>
    <button class="modal-close" data-action="closeAuthorDetail">&#x2715;</button>

    <div class="author-profile-header">
      <div class="author-avatar-large" style="--avatar-bg: ${data.color}; --avatar-text: white">
        ${data.avatarImg
          ? `<img src="${data.avatarImg}" alt="${data.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
          : data.avatar}
      </div>
      <div class="author-profile-info">
        <h3>${data.name}</h3>
        <div class="author-profile-meta">${data.dynasty} · ${data.years}</div>
      </div>
    </div>

    <div class="author-detail-divider"></div>

    <div class="author-detail-body">
      <div class="author-era-bar">
        <span class="author-era-dot" style="background: var(--${era.code})"></span>
        <span class="author-era-label">所属时代：${era.label}</span>
      </div>

      <div class="author-detail-bio">
        <p>${data.bio}</p>
      </div>

      <div class="author-detail-section">
        <div class="author-detail-section-title">历代评价</div>
        <div class="author-detail-quotes">
          ${data.quotes.map(q => `<div class="author-detail-quote">${q}</div>`).join('')}
        </div>
      </div>
    </div>
  `;

  modal.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

export function closeAuthorDetail() {
  const modal = document.getElementById('authorDetail');
  modal.classList.remove('visible');
  modal.dataset.book = '';
  document.body.style.overflow = '';
}
