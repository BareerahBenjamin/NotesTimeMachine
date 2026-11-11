/** Allow literary formatting, never executable model/API HTML or URL attributes. */
export function renderAnalysis(container, text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-analysis';
  if (typeof marked === 'undefined' || !marked.parse) {
    wrapper.textContent = text;
  } else {
    const source = new DOMParser().parseFromString(marked.parse(String(text)), 'text/html');
    const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
    const copy = (node, parent) => {
      if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH'].includes(node.tagName)) return;
      const target = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : parent;
      if (target !== parent) parent.appendChild(target);
      node.childNodes.forEach(child => copy(child, target));
    };
    source.body.childNodes.forEach(node => copy(node, wrapper));
  }
  container.replaceChildren(wrapper);
}
