// tex.js —— KaTeX 统一入口：块级公式与行内符号都从这里渲染，全页不留裸文本公式。

const OPTS = { throwOnError: false, strict: 'ignore', output: 'html' };

export function renderTex(el, tex, displayMode = false) {
  const katex = window.katex;
  if (!katex) {
    el.textContent = tex;
    return;
  }
  try {
    katex.render(tex, el, { ...OPTS, displayMode });
  } catch (_) {
    el.textContent = tex;
  }
}

export function texify(root = document) {
  for (const el of root.querySelectorAll('[data-tex]')) {
    if (el.dataset.texDone) continue;
    renderTex(el, el.getAttribute('data-tex') || '', el.classList.contains('formula'));
    el.dataset.texDone = '1';
  }
}
