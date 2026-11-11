/** Presentation only: native motion, no API or reading state dependencies. */
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
const perElement = new WeakMap();
export const motionTokens = Object.freeze({ fast: 180, base: 280, slow: 320, line: 400, stagger: 60,
  out: 'cubic-bezier(0.16, 1, 0.3, 1)', in: 'cubic-bezier(0.4, 0, 1, 1)' });
export const scrollBehavior = () => preference.matches ? 'instant' : 'smooth';

export function animate(element, frames, options = {}) {
  if (!element) return null;
  perElement.get(element)?.cancel();
  if (preference.matches || !element.animate) return null;
  const animation = element.animate(frames, { duration: motionTokens.base, easing: motionTokens.out, fill: 'backwards', ...options });
  perElement.set(element, animation);
  running.add(animation);
  const cleanup = () => { running.delete(animation); if (perElement.get(element) === animation) perElement.delete(element); };
  animation.addEventListener('finish', cleanup, { once: true });
  animation.addEventListener('cancel', cleanup, { once: true });
  return animation;
}
export function enter(element, options) {
  return animate(element, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], options);
}
export function switchContent(element) {
  return enter(element, { duration: 220 });
}
export function focusText(element) {
  return animate(element, [{ opacity: 0.65 }, { opacity: 1 }], { duration: 180 });
}
// At most three entrances per batch; larger groups remain immediately readable.
export function stagger(elements, duration = 220) {
  [...elements].slice(0, 3).forEach((element, index) => enter(element, {
    duration, delay: index * motionTokens.stagger,
  }));
}
const panelVersions = new WeakMap();
export function setPanelVisible(element, visible) {
  if (!element) return;
  const version = (panelVersions.get(element) || 0) + 1;
  panelVersions.set(element, version);
  const wasVisible = element.classList.contains('visible');
  const wasHidden = element.inert;
  element.inert = !visible;
  element.setAttribute('aria-hidden', String(!visible));
  if (visible) {
    element.classList.add('visible');
    if (!wasVisible || wasHidden) enter(element);
  } else {
    if (!wasVisible) return;
    const animation = animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: motionTokens.in });
    const finish = () => { if (panelVersions.get(element) === version) element.classList.remove('visible'); };
    if (animation) { animation.finished.then(finish, finish); } else finish();
  }
}

let disposeMotion = null;
export function initMotion() {
  if (disposeMotion) return disposeMotion;
  const controller = new AbortController();
  const observers = [];
  const cancelAll = () => running.forEach(animation => animation.cancel());
  preference.addEventListener('change', cancelAll, { signal: controller.signal });
  // CSS ScrollTimeline enhances capable browsers; others retain the static landscape.
  // Slow module delivery must not hide text the visitor has already seen.
  const painted = performance.getEntriesByType('paint').some(entry => entry.name === 'first-contentful-paint');
  if(!painted)stagger(document.querySelectorAll('[data-hero-enter]'), motionTokens.slow);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      stagger(visible.map(entry => entry.target));
      visible.forEach(entry => observer.unobserve(entry.target));
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    observers.push(observer);
  }
  const onPageChange = ({ detail: { pageId } }) => {
    document.querySelectorAll('.page').forEach(page => perElement.get(page)?.cancel());
    // Reader content supplies its own feedback; avoid a second whole-page entrance.
    if(pageId!=='reader')enter(document.getElementById(`page-${pageId}`), { duration: motionTokens.slow });
  };
  document.addEventListener('page-change', onPageChange, { signal: controller.signal });
  window.addEventListener('pagehide', cancelAll, { signal: controller.signal });
  disposeMotion = () => {
    cancelAll(); controller.abort(); observers.forEach(observer => observer.disconnect()); disposeMotion = null;
  };
  return disposeMotion;
}
