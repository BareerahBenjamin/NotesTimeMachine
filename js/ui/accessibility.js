/** Shared keyboard and dialog behavior, including dynamic community dialogs. */
import { enter } from '../motion/index.js';
let disposeAccessibility;
export function initAccessibility() {
  if (disposeAccessibility) return disposeAccessibility;
  const controller = new AbortController();
  document.querySelectorAll('.page').forEach(page => { page.inert = !page.classList.contains('active'); });
  document.querySelectorAll('.author-card').forEach(card => {
    card.removeAttribute('tabindex'); card.setAttribute('role', 'group');
    const heading = card.querySelector('h4');
    card.setAttribute('aria-label', `${heading?.textContent}作者档案`);
    if (heading && !heading.querySelector('button')) {
      const read = document.createElement('button'); read.className = 'author-read';
      read.dataset.action = 'selectAuthorCard'; read.textContent = heading.textContent;
      read.setAttribute('aria-label', `阅读${heading.textContent}的作品`);
      heading.replaceChildren(read);
    }
  });
  document.querySelectorAll('.author-detail-btn').forEach(button => button.setAttribute('aria-label', '查看作者简介'));
  const selector = '.author-detail-modal, .book-detail-modal, body > .modal-overlay';
  const background = [...document.querySelectorAll('main, header, footer')];
  const focusable = 'button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]';
  const controls = modal => [...modal.querySelectorAll(focusable)].filter(element => !element.closest('[inert]') && element.getClientRects().length);
  let activeModal = null;
  let returnFocus = null;
  let previousOverflow = '';
  const update = () => {
    const modals = [...document.querySelectorAll(selector)];
    const visible = modals.filter(modal => modal.classList.contains('visible'));
    const next = visible[visible.length - 1] || null;
    if (next !== activeModal) {
      if (next) {
        if (!activeModal) { returnFocus = document.activeElement; previousOverflow = ''; }
        activeModal = next;
        next.inert = false; next.tabIndex = -1;
        next.setAttribute('role', 'dialog'); next.setAttribute('aria-modal', 'true');
        next.setAttribute('aria-label', ({ authModal: '登录或注册', postModal: '发布话题', bookDetail: '作品详情', authorDetail: '作者简介' })[next.id] || '对话框');
        enter(next.querySelector('.modal-content, .modal') || next);
        (controls(next)[0] || next).focus({ preventScroll: true });
      } else {
        activeModal = null;
        background.forEach(element => { element.inert = false; });
        if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
      }
    }
    background.forEach(element => { if (element.inert !== Boolean(next)) element.inert = Boolean(next); });
    document.body.style.overflow = next ? 'hidden' : previousOverflow;
    modals.forEach(modal => {
      const hidden = modal !== next;
      if (modal.inert !== hidden) modal.inert = hidden;
      if (modal.getAttribute('aria-hidden') !== String(hidden)) modal.setAttribute('aria-hidden', String(hidden));
    });
  };
  const observer = new MutationObserver(update);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  update();
  document.addEventListener('keydown', event => {
    if (activeModal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        activeModal.querySelector('.modal-close, [data-action="closePostModal"], [data-action="closeAuthModal"]')?.click();
      }
      if (event.key === 'Tab') {
        const elements = controls(activeModal), first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); activeModal.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.ancient-text, .reading-card')) {
      event.preventDefault(); event.target.click();
    }
  }, { signal: controller.signal });
  disposeAccessibility = () => { observer.disconnect(); controller.abort(); disposeAccessibility = null; };
  return disposeAccessibility;
}
