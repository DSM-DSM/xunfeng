// main.js —— 装配：场景 + 输入 + 仪表盘 + API 主循环。
// 参数 μ 由键盘驱动，每 50ms 向后端要一次评估结果（离线时由 api.js 的本地模型兜底）。

import { LikelihoodScene } from './scene.js';
import { InputController } from './input.js';
import { HUD } from './hud.js';
import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);

const stageEl = $('#stage');
const panelEl = $('#panel');
const statusEl = $('#status');
const toastEl = $('#toast');
const resultEl = $('#result');
const demoBtn = $('#demoBtn');
const followChk = $('#followChk');
const introEl = $('#intro');

const scene = new LikelihoodScene(stageEl);
const input = new InputController(window);
const hud = new HUD(panelEl);

// 回归测试用的只读句柄：只有带 ?debug=1 打开时才挂到 window 上
if (location.search.includes('debug=1')) window.__peakScene = scene;

const EVAL_INTERVAL = 0.05; // 秒 → 20fps

// 曲面取景窗口（half）。lik 模式的纵轴已按 (L/L_peak)^(1/n) 压缩，
// half=2.3 时默认参数下网格最小高度≈5e-6、中位数≈0.075，钟形山完整可见且留出山脚。
const SURFACE_HALF = 2.3;

const state = {
  mu: [0, 0],
  sentMu: null,
  mode: 'lik',
  busy: false,
  inFlight: false,
  acc: 0,
  anim: null,
  surfaceLog: null,
};

// ---------------------------------------------------------------- 状态徽标

api.onStatus((online, version) => {
  if (online === null) {
    statusEl.className = 'status status-wait';
    statusEl.textContent = '连接中…';
  } else if (online) {
    statusEl.className = 'status status-ok';
    statusEl.textContent = `后端在线 v${version || '1.0.0'}`;
  } else {
    statusEl.className = 'status status-warn';
    statusEl.textContent = '后端未连接 · 本地计算';
  }
});

// ---------------------------------------------------------------- 世界加载

async function loadWorld() {
  const [cfgRes, dataRes, logRes, likRes] = await Promise.all([
    api.getConfig(),
    api.getData(),
    api.getSurface('log', 72, 52, SURFACE_HALF),
    api.getSurface('lik', 72, 52, SURFACE_HALF),
  ]);

  const data = dataRes.data;
  const surfLog = logRes.surface;
  const surfLik = likRes.surface;

  state.surfaceLog = surfLog;
  scene.setWorld({ samples: data.points, mean: data.mean, surfLog, surfLik, n: data.n });

  const [x0, x1] = surfLog.mu_range[0];
  const [y0, y1] = surfLog.mu_range[1];
  input.setBounds(x0, x1, y0, y1);

  // 起点放在半坡：既有明显的上山方向，又不至于一开局就在峰顶
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  state.mu = [data.mean[0] + spanX * 0.2, data.mean[1] - spanY * 0.16];
  state.sentMu = null;
  scene.setPerson(state.mu);
  scene.clearAllPaths();
  syncSliders(cfgRes.config);
}

// ---------------------------------------------------------------- 评估循环

function evalTick(dtEval) {
  if (state.inFlight) return false;
  state.inFlight = true;
  // prev 必须取「上次真正发出 eval 时的 μ」，才与 dtEval（两次请求的间隔）匹配；
  // 否则 prev 是上一帧的 μ，dt 却是 50ms，速度会系统性偏小。
  const prev = state.sentMu ? [state.sentMu[0], state.sentMu[1]] : null;
  const mu = [state.mu[0], state.mu[1]];
  state.sentMu = mu;
  api
    .postEval({ mu, prev, dt: dtEval, mode: state.mode })
    .then(({ eval: d }) => {
      if (!d) return;
      hud.setEval(d);
      scene.setGradient(d);
      scene.setEllipse(d.crlb_ellipse);
    })
    .finally(() => {
      state.inFlight = false;
    });
  return true;
}

// ---------------------------------------------------------------- 演示动画

function runDemo() {
  if (state.busy) return;
  state.busy = true;
  demoBtn.disabled = true;
  resultEl.classList.remove('done');
  resultEl.textContent = '正在计算两条路径…';

  const from = [state.mu[0], state.mu[1]];

  api.getPaths(from, 2500).then(({ paths }) => {
    if (!paths) {
      state.busy = false;
      demoBtn.disabled = false;
      resultEl.textContent = '路径计算失败，请重试。';
      return;
    }

    scene.clearAllPaths();
    scene.buildPath('newton', paths.newton.points);
    scene.buildPath('gradient', paths.gradient.points);

    // 动画时长随迭代步数走：步数多给足时间看，但最短 0.9s、最长 3.2s
    const durOf = (iter) => Math.min(3200, Math.max(900, 400 + 2.2 * iter));
    state.anim = {
      t0: performance.now(),
      durNewton: durOf(paths.newton.iterations),
      durGradient: durOf(paths.gradient.iterations),
      doneNewton: false,
      doneGradient: false,
      info: paths,
    };

    const nIter = paths.newton.iterations;
    const gIter = paths.gradient.iterations;
    const gConv = paths.gradient.converged;
    resultEl.innerHTML =
      `牛顿法：<b>${nIter}</b> 步登顶　·　梯度上升：<b>${gIter}</b> 步` +
      (gConv ? '' : '（未收敛）') +
      '<br><span>牛顿法先问「碗有多弯」，一步跳到顶；梯度上升只问「哪边高」，走一步看一步。</span>';
    resultEl.classList.add('done');
    showToast('橙色是牛顿法，紫色是梯度上升');
  });
}

function updateAnim(now) {
  const a = state.anim;
  if (!a) return;

  if (!a.doneNewton) {
    const t = Math.min(1, (now - a.t0) / a.durNewton);
    const pose = scene.pathPoseAt('newton', easeOutCubic(t));
    if (pose) scene.setPathProgress('newton', pose);
    if (t >= 1) {
      a.doneNewton = true;
      scene.pathFinished('newton');
    }
  }

  if (!a.doneGradient) {
    const t = Math.min(1, (now - a.t0) / a.durGradient);
    const pose = scene.pathPoseAt('gradient', easeOutCubic(t));
    if (pose) scene.setPathProgress('gradient', pose);
    if (t >= 1) {
      a.doneGradient = true;
      scene.pathFinished('gradient');
    }
  }

  if (a.doneNewton && a.doneGradient) {
    state.anim = null;
    state.busy = false;
    demoBtn.disabled = false;
  }
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// 玩家一动手，就收起上一次的演示路径
input.onFirstMove = () => {
  if (!state.busy) scene.clearAllPaths();
};

// ---------------------------------------------------------------- 主循环

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!state.busy) {
    state.mu = input.update(dt, scene.camera, state.mu);
  }

  scene.setPerson(state.mu);

  state.acc += dt;
  if (state.acc >= EVAL_INTERVAL) {
    // 请求被跳过（上一发还在路上）时保留 acc，下一次把真实间隔作为 dt 发出去
    if (evalTick(state.acc)) state.acc = 0;
  }

  hud.update(dt);
  updateAnim(now);
  scene.update(dt);

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 交互绑定

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  scene.setBlendTarget(mode === 'lik' ? 1 : 0);
  // 演示路径的高度依赖当前模式的纵轴刻度，切换后旧路径会悬空，先清掉
  if (!state.busy) scene.clearAllPaths();
  for (const btn of document.querySelectorAll('#modeSwitch button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  showToast(
    mode === 'lik'
      ? '这是单个观测的形状，n 不会改变它；n 改变的是下方那颗椭圆。'
      : '对数似然：钟形摊开成碗，曲率（也就是 Fisher 信息）显形了'
  );
}

document.querySelectorAll('#modeSwitch button').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

followChk.addEventListener('change', () => {
  scene.follow = followChk.checked;
});

demoBtn.addEventListener('click', runDemo);

// ---- 参数滑块 ----

const SLIDERS = [
  { id: 's1', out: 's1out', key: 'sigma1', digits: 3 },
  { id: 's2', out: 's2out', key: 'sigma2', digits: 3 },
  { id: 'rho', out: 'rhoout', key: 'rho', digits: 3 },
  { id: 'n', out: 'nout', key: 'n', digits: 0 },
];

const sliderEls = {};

for (const s of SLIDERS) {
  const el = document.getElementById(s.id);
  const out = document.getElementById(s.out);
  sliderEls[s.key] = el;

  el.addEventListener('input', () => {
    out.textContent = Number(el.value).toFixed(s.digits);
  });

  // 用 change（松手）触发重算，避免拖动过程中反复重建曲面
  el.addEventListener('change', () => {
    if (state.busy) return;
    applyConfig();
  });
}

function syncSliders(config) {
  if (!config) return;
  for (const s of SLIDERS) {
    const el = sliderEls[s.key];
    if (!el || config[s.key] === undefined) continue;
    el.value = config[s.key];
    document.getElementById(s.out).textContent = Number(config[s.key]).toFixed(s.digits);
  }
}

let applyTimer = null;

function applyConfig() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    const partial = {
      sigma1: Number(sliderEls.sigma1.value),
      sigma2: Number(sliderEls.sigma2.value),
      rho: Number(sliderEls.rho.value),
      n: Math.round(Number(sliderEls.n.value)),
    };
    await api.postConfig(partial);
    await loadWorld();
    showToast('模型变了：看碗的形状和椭圆怎么一起变');
  }, 160);
}

// ---- 引导浮层 ----

let introTimer = null;

function closeIntro() {
  introEl.classList.add('hide');
  clearTimeout(introTimer);
}

function armIntro() {
  introTimer = setTimeout(closeIntro, 5000);
}

$('#introClose').addEventListener('click', closeIntro);
introEl.addEventListener('click', (e) => {
  if (e.target === introEl) closeIntro();
});

// ---- toast ----

let toastTimer = null;

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- 启动

// 主题：演示区跟随页面主题，不锁死深色
scene.setTheme(document.documentElement.dataset.theme || 'dark');
document.addEventListener('ll:theme', (e) => {
  scene.setTheme(e.detail?.theme || 'dark');
});

let worldReady = false;
let revealed = false;
let started = false;

function maybeStart() {
  if (started || !worldReady || !revealed) return;
  started = true;
  // 展开后才真正有尺寸：重建画布并重新构图
  scene.resize();
  scene.fitView();
  armIntro();
  last = performance.now();
  requestAnimationFrame(frame);
}

// 「开始看山」展开演示区后由外壳派发
document.addEventListener('ll:reveal', () => {
  revealed = true;
  maybeStart();
});

loadWorld()
  .then(() => {
    // 默认就是 L(μ) 钟形山：首帧直接落到 lik，不从对数似然慢慢过渡
    scene.setBlendTarget(1, true);
    worldReady = true;
    const stage = document.getElementById('demoStage');
    revealed = !stage || !stage.hidden;
    maybeStart();
  })
  .catch((err) => {
    console.error(err);
    statusEl.className = 'status status-warn';
    statusEl.textContent = '初始化失败';
    resultEl.textContent = '页面初始化失败，请刷新重试。';
  });
