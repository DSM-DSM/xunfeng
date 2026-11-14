// theme.js —— 明暗主题：默认跟随系统偏好，手动切换后记住选择。

const root = document.documentElement;
const KEY = 'll-theme';

function readStored() {
  try { return localStorage.getItem(KEY); } catch (_) { return null; }
}

function store(theme) {
  try { localStorage.setItem(KEY, theme); } catch (_) { /* 隐私模式忽略 */ }
}

export function applyTheme(theme, { persist = false } = {}) {
  root.dataset.theme = theme;
  if (persist) store(theme);

  const light = theme === 'light';
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(light));
    btn.setAttribute('aria-label', light ? '当前浅色主题，切换到深色' : '当前深色主题，切换到浅色');
    btn.title = light ? '切换到深色主题' : '切换到浅色主题';
  }
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = light ? '浅色' : '深色';

  // 通知演示区（Three.js 场景）跟着换配色
  document.dispatchEvent(new CustomEvent('ll:theme', { detail: { theme } }));
}

export function initTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  applyTheme(readStored() || (mq.matches ? 'light' : 'dark'));

  // 没有手动选择时，跟随系统实时变化
  mq.addEventListener('change', (e) => {
    if (!readStored()) applyTheme(e.matches ? 'light' : 'dark');
  });

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light', { persist: true });
  });
}
