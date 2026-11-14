// shell.js —— 外壳入口：主题、左侧导航、本地 KaTeX 公式渲染、演示区展开。

import { initTheme } from './theme.js';
import { initNav } from './nav.js';
import { texify } from './tex.js';

initTheme();
initNav();
texify(document);

// 「开始看山」：默认不展开、不播放；点了才展开并把视口滚到演示区
const startBtn = document.getElementById('startBtn');
const demoStage = document.getElementById('demoStage');

// 「跳转到演示区」只是锚点：演示区默认展开，不做展开开关
if (startBtn && demoStage) {
  startBtn.addEventListener('click', (e) => {
    e.preventDefault();
    demoStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// 导航里「函数实验室」若指向站内锚点，保持默认行为；占位态由 nav.js 处理
