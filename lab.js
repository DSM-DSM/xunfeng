// lab.js —— 「二元函数求极值实验室」单屏三栏交互。
// 纯前端自足：只依赖本地 Three.js 与本地 KaTeX，不请求后端。

import * as THREE from 'three';
import {
  PRESETS, MULTI_STARTS, LOGISTIC_DATA,
  solveStep, classifyHessian, hessianText,
  inDomain, heightInfo, domainScale,
} from './lab-math.js';

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const WORLD = 9.0;
const TARGET_H = 3.6;
const SEG = 150;
const CONTOUR_SEG = 118;
const CONTOUR_LEVELS = 13;

const THEME = {
  dark: {
    fog: 0x08131d,
    gridMajor: 0x1b3c4b,
    gridMinor: 0x102a37,
    hemiSky: 0x9fe4ff,
    hemiGround: 0x0a1720,
    hemiIntensity: 1.15,
    key: 0xfff2dc,
    keyIntensity: 2.55,
    fill: 0x5fb6d9,
    fillIntensity: 0.55,
    surface: [0x082330, 0x0d5563, 0x139a9b, 0x63d9c6, 0xf2c96b],
    slopeTint: 0xf0784f,
    contour: 0xd6f9ff,
    contourOpacity: 0.4,
    contourMajorOpacity: 0.78,
    accent: 0x67e8f9,
    warm: 0xfbbf24,
    rose: 0xf472b6,
    violet: 0xa78bfa,
    ok: 0x6ee7b7,
    shadow: 0x000000,
    shadowOpacity: 0.26,
    char: {
      jacket: 0xffb347, jacketDark: 0xd9852d, pants: 0x24425a, skin: 0xffd6b2,
      hat: 0xe05757, pack: 0x2f8f83, boot: 0x222c39, eye: 0x10202b,
    },
  },
  light: {
    fog: 0xe7f1ee,
    gridMajor: 0xb4cec7,
    gridMinor: 0xcfe0db,
    hemiSky: 0xffffff,
    hemiGround: 0x9db8b1,
    hemiIntensity: 1.2,
    key: 0xfff7e9,
    keyIntensity: 2.1,
    fill: 0x9fd8ff,
    fillIntensity: 0.4,
    surface: [0xdcece8, 0xa9d6cf, 0x62b9ae, 0x2c8d83, 0xd08a4e],
    slopeTint: 0xb45309,
    contour: 0x14535a,
    contourOpacity: 0.46,
    contourMajorOpacity: 0.8,
    accent: 0x0e7490,
    warm: 0xb45309,
    rose: 0xbe185d,
    violet: 0x6d28d9,
    ok: 0x047857,
    shadow: 0x1d3a36,
    shadowOpacity: 0.18,
    char: {
      jacket: 0xf2a23c, jacketDark: 0xc67c22, pants: 0x2c4c63, skin: 0xffd6b2,
      hat: 0xcf4b4b, pack: 0x2f8f83, boot: 0x263238, eye: 0x10202b,
    },
  },
};

const TAB_NOTE = {
  f: '目标函数：把 (x, y) 喂进去，得到山的高度。',
  grad: '梯度 ∇f：两条偏导装在一起，指向最陡的上坡方向。',
  hess: 'Hessian H：这个点往各个方向弯得有多厉害。',
  iter: '牛顿迭代：用 H 修正方向，直接跳到局部二次近似的顶点。',
};

const params = new URLSearchParams(location.search);
let themeName = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
let theme = THEME[themeName];

const els = {
  app: $('#app'),
  stage: $('#stage'),
  stage3d: $('#stage3d'),
  cards: $('#cards'),
  controls: $('#controls'),
  presetName: $('#presetName'),
  presetTag: $('#presetTag'),
  hudK: $('#hudK'),
  hudF: $('#hudF'),
  hudG: $('#hudG'),
  sceneFormulaBody: $('#sceneFormulaBody'),
  tagUp: $('#arrowTags .tag-up'),
  tagDown: $('#arrowTags .tag-down'),
  tagNewton: $('#arrowTags .tag-newton'),
  formulaTitle: $('#formulaTitle'),
  presetPlain: $('#presetPlain'),
  formulaTabs: $('#formulaTabs'),
  formulaBody: $('#formulaBody'),
  behaviorText: $('#behaviorText'),
  hessBadge: $('#hessBadge'),
  hessPlain: $('#hessPlain'),
  startX: $('#startX'),
  startY: $('#startY'),
  resetStartBtn: $('#resetStartBtn'),
  algoSeg: $('#algoSeg'),
  alpha: $('#alpha'),
  alphaOut: $('#alphaOut'),
  speed: $('#speed'),
  speedOut: $('#speedOut'),
  toggles: $('#toggles'),
  userModeBtn: $('#userModeBtn'),
  settleBtn: $('#settleBtn'),
  swapStartBtn: $('#swapStartBtn'),
  playBtn: $('#playBtn'),
  stepBtn: $('#stepBtn'),
  kNum: $('#kNum'),
  badge: $('#badge'),
  algoChip: $('#algoChip'),
  helpBtn: $('#helpBtn'),
  fsBtn: $('#fsBtn'),
  bottom: $('#bottom'),
  chart: $('#chart'),
  line1: $('#line1'),
  line2: $('#line2'),
  line3: $('#line3'),
  logisticPanel: $('#logisticPanel'),
  scatter: $('#scatter'),
  lpBeta: $('#lpBeta'),
  lpNote: $('#lpNote'),
  userBanner: $('#userBanner'),
  intro: $('#intro'),
  introGo: $('#introGo'),
  introClose: $('#introClose'),
  toast: $('#toast'),
};

const state = {
  pi: 0,
  preset: PRESETS[0],
  pos: { ...PRESETS[0].start },
  start: { ...PRESETS[0].start },
  startIndex: 0,
  algo: 'newton',
  alpha: 1,
  speed: 1,
  steps: 0,
  status: 'idle',
  history: [],
  stepInfo: null,
  conclusion: '',
  walk: null,
  auto: false,
  timer: 0,
  userMode: false,
  userSteps: 0,
  compare: null,
  tab: 'f',
  toggles: { grad: true, quad: true, hess: false, contour: true, trail: true },
  gRef: 1,
  lastHud: 0,
  trailCount: 0,
  lastTrail: null,
  draggingStart: false,
};

const ALGO_LABEL = { newton: '纯牛顿', damped: '带阻尼牛顿', gradient: '梯度上升' };
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setStatus(status) {
  state.status = status;
  els.badge.dataset.state = status;
  els.badge.textContent = statusLabel();
}

function statusLabel() {
  const p = state.preset;
  if (state.status === 'idle') return '待出发';
  if (state.status === 'running') return '正在走';
  if (state.status === 'ready') return '可继续';
  if (state.status === 'diverged') return '发散 · 越界';
  if (state.status === 'stalled') return '未收敛';
  if (p.id === 'saddle') return '收敛 · 驻点（非极值）';
  if (p.id === 'logistic') return '收敛 · 唯一山顶';
  if (p.id === 'multipeak') return '收敛 · 局部极大';
  if (p.tone === 'max') return '收敛 · 极大';
  return '收敛 · 极小';
}

function conclusionSentence() {
  const p = state.preset;
  const n = state.steps;
  if (state.status === 'diverged') return '这一步越界了：裸牛顿不再可靠。';
  if (state.status === 'stalled') return '步数用尽或走不动，没有到达驻点。';
  if (p.id === 'bowl') return `走了 ${n} 步到碗底。`;
  if (p.id === 'dome') return `走了 ${n} 步到山顶（最大值）。`;
  if (p.id === 'saddle') return '停在鞍点：这里不是最低点，也不是最高点。';
  if (p.id === 'rosenbrock') return `走了 ${n} 步到香蕉谷的谷底。`;
  if (p.id === 'multipeak') {
    const fStop = p.f(state.pos.x, state.pos.y);
    const hi = heightInfo(p).hi;
    if (hi - fStop > 0.05) {
      return `走了 ${n} 步停在这里：这里是局部极大，不是全局最高——牛顿法只保证找到停下的地方（全图最高 f≈${fmt(hi)}）。`;
    }
    return `走了 ${n} 步到全图最高的峰。`;
  }
  if (p.id === 'logistic') return `走了 ${n} 步到唯一山顶。`;
  return `走了 ${n} 步。`;
}

// ------------------------------------------------------------------ 左栏卡片
const SURFACE_LABEL = {
  bowl: '碗', dome: '倒扣', saddle: '鞍点', banana: '香蕉谷', peaks: '多峰', sigmoid: 'logistic',
};

function buildCards() {
  els.cards.innerHTML = '';
  PRESETS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fn-card' + (i === 0 ? ' active' : '');
    b.title = p.name;
    const cv = document.createElement('canvas');
    cv.width = 116;
    cv.height = 88;
    const meta = document.createElement('span');
    meta.className = 'fn-meta';
    const name = document.createElement('span');
    name.className = 'fn-name';
    name.textContent = p.short;
    const tag = document.createElement('span');
    tag.className = 'fn-tag';
    tag.textContent = p.tag;
    meta.append(name, tag);
    b.append(cv, meta);
    b.addEventListener('click', () => selectPreset(i));
    els.cards.appendChild(b);
    drawThumb(cv, p);
  });
}

function hexRGB(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function paletteHex(t) {
  const stops = theme.surface;
  const s = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.floor(s);
  const f = s - i;
  const a = hexRGB(stops[Math.min(i, stops.length - 1)]);
  const b = hexRGB(stops[Math.min(i + 1, stops.length - 1)]);
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ];
}

function drawThumb(canvas, p) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const info = heightInfo(p);
  const span = info.mapHi - info.mapLo || 1;
  const nx = 38;
  const ny = 28;
  const img = ctx.createImageData(W, H);
  const { x0, x1, y0, y1 } = p.domain;
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const x = x0 + (x1 - x0) * px / (W - 1);
      const y = y1 - (y1 - y0) * py / (H - 1);
      const f = p.f(x, y);
      let t = (f - info.mapLo) / span;
      t = Number.isFinite(t) ? clamp(t, 0, 1) : 0;
      let [r, g, b] = paletteHex(t);
      const [gx, gy] = p.grad(x, y);
      const shade = clamp(Math.hypot(gx, gy) * 0.05, 0, 0.45);
      r = Math.round(r * (1 - shade) + 250 * shade);
      g = Math.round(g * (1 - shade) + 140 * shade);
      b = Math.round(b * (1 - shade) + 70 * shade);
      const i = (py * W + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, H - 12, W, 12);
  ctx.fillStyle = themeName === 'light' ? '#0b7f9e' : '#67e8f9';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(SURFACE_LABEL[p.glyph] || p.short, 5, H - 3);
  // 起点小点
  const sx = (p.start.x - x0) / (x1 - x0) * W;
  const sy = (y1 - p.start.y) / (y1 - y0) * H;
  ctx.beginPath();
  ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  void nx;
  void ny;
}

// ------------------------------------------------------------------ 公式与 Hessian
function renderFormula() {
  const p = state.preset;
  const tex = p.formula[state.tab] || '';
  els.formulaBody.classList.toggle('dense', p.id === 'logistic' || p.id === 'multipeak');
  els.formulaBody.innerHTML = '';
  if (window.katex) {
    window.katex.render(tex, els.formulaBody, { throwOnError: false, displayMode: false, strict: 'ignore' });
  } else {
    els.formulaBody.textContent = tex;
  }
  // 右上角的函数速览（三维图上的公式位置）
  if (els.sceneFormulaBody) {
    const dense = p.id === 'logistic' || p.id === 'multipeak';
    els.sceneFormulaBody.classList.toggle('dense', dense);
    els.sceneFormulaBody.innerHTML = '';
    const chipTex = p.formula.chip || p.formula.f;
    if (window.katex) {
      window.katex.render(chipTex, els.sceneFormulaBody, { throwOnError: false, displayMode: false, strict: 'ignore' });
    } else {
      els.sceneFormulaBody.textContent = chipTex;
    }
  }
  [...els.formulaTabs.querySelectorAll('button')].forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  els.formulaBody.title = TAB_NOTE[state.tab] || '';
}

function updateHessian(x, y) {
  const p = state.preset;
  const [a, b, c] = p.hess(x, y);
  const cls = classifyHessian(a, b, c);
  const t = (p.hessText && p.hessText[cls.kind]) || hessianText(cls.kind);
  els.hessBadge.textContent = t.label;
  els.hessBadge.dataset.kind = cls.kind;
  els.hessPlain.textContent = t.plain;
  state.hessCls = cls;
  return cls;
}

// ------------------------------------------------------------------ 旁白
function fmt(v, d = 2) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(d);
  return v.toFixed(d + 1);
}

function setLine(el, text, cls) {
  el.textContent = text;
  const li = el.parentElement;
  li.classList.remove('good', 'bad', 'hi');
  if (cls) li.classList.add(cls);
}

function deg(rad) {
  return Math.round(rad * 180 / Math.PI);
}

function renderNarration(info) {
  const p = state.preset;
  const maximize = !!p.maximize;
  if (!info) {
    setLine(els.line1, '还没出发。');
    setLine(els.line2, '点「下一步」，这里会说出按弯曲程度能迈多远。');
    setLine(els.line3, '实际走了多远、有没有被拦，也会写在这里。');
    return;
  }
  const d = deg(info.angle);
  const steepName = maximize ? '最陡上坡 +∇f' : '最陡下坡 −∇f';
  let dirText;
  let dirCls = 'hi';
  if (info.gNorm < 1e-9) {
    dirText = '梯度已经为零，没有方向可走。';
  } else if (info.algorithm === 'user') {
    dirText = `你走的方向与${steepName}夹 ${d}°。`;
  } else if (state.algo === 'gradient') {
    dirText = `就沿${steepName}走，夹角 0°。`;
  } else if (d <= 4) {
    dirText = `牛顿步正对${steepName}。`;
  } else if (d < 90) {
    dirText = `牛顿步与${steepName}夹 ${d}°：曲率把它掰弯了。`;
  } else {
    dirText = `牛顿步与${steepName}夹 ${d}°，几乎横着走。`;
    dirCls = 'bad';
  }
  setLine(els.line1, dirText, dirCls);

  let curveText;
  if (state.algo === 'gradient') {
    curveText = `曲率 ${fmt(Math.max(Math.abs(info.cls.l1), Math.abs(info.cls.l2)), 2)}；按它只敢走 ${fmt(info.allowedLen)}。`;
  } else if (info.singular) {
    curveText = 'Hessian 接近奇异，曲率给不出可靠步长。';
  } else {
    curveText = `按曲率最多能迈 ${fmt(info.newtonLen)}（H⁻¹∇f 的长度）。`;
  }
  setLine(els.line2, curveText);

  const better = info.improvement > 1e-10;
  const worse = info.improvement < -1e-10;
  let actualText = `实际迈了 ${fmt(info.actualLen)}`;
  if (state.algo !== 'newton') actualText += `（α=${info.alphaUsed.toFixed(2)}）`;
  if (worse) actualText += '，高度反而变差了。';
  else if (better) actualText += maximize ? '，高度上升了。' : '，高度下降了。';
  else actualText += '，高度几乎没变。';
  if (info.note) actualText += ` ${info.note}。`;
  if (info.outOfDomain && state.algo === 'newton') actualText += ' 落点越界，已夹回边界显示。';
  if (state.status === 'converged' || state.status === 'stalled' || state.status === 'diverged') {
    actualText += ` ${state.conclusion}`;
  }
  setLine(els.line3, actualText, worse ? 'bad' : (better ? 'good' : ''));
}

// ------------------------------------------------------------------ 曲线
function drawChart() {
  const c = els.chart;
  if (!c) return;
  const rect = c.getBoundingClientRect();
  if (rect.width < 24 || rect.height < 24) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(rect.width * dpr));
  const H = Math.max(1, Math.round(rect.height * dpr));
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const padL = Math.round(36 * dpr);
  const padR = Math.round(20 * dpr);
  const padT = Math.round(16 * dpr);
  const padB = Math.round(22 * dpr);
  const plotW = Math.max(1, W - padL - padR);
  const plotH = Math.max(1, H - padT - padB);

  const axisC = themeName === 'light' ? 'rgba(20,52,84,0.42)' : 'rgba(120,170,230,0.42)';
  const gridC = themeName === 'light' ? 'rgba(20,52,84,0.12)' : 'rgba(120,170,230,0.13)';
  const textC = themeName === 'light' ? 'rgba(20,52,84,0.66)' : 'rgba(160,186,212,0.78)';
  const accent = themeName === 'light' ? '#0b7f9e' : '#67e8f9';
  const lastC = themeName === 'light' ? '#b45309' : '#fbbf24';
  const font = `${(9.5 * dpr).toFixed(1)}px "JetBrains Mono", Consolas, monospace`;

  ctx.font = font;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = axisC;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  const hist = state.history;
  if (!hist.length) {
    ctx.fillStyle = textC;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('按「下一步」开始记录', padL + plotW / 2, padT + plotH / 2);
    return;
  }

  const vals = hist.map((h) => h.f);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
  if (hi - lo < 1e-9) {
    const pad0 = (Math.abs(hi) || 1) * 0.5;
    lo -= pad0;
    hi += pad0;
  }
  const padY = (hi - lo) * 0.16;
  lo -= padY;
  hi += padY;
  const n = Math.max(1, hist.length - 1);
  const X = (k) => padL + plotW * (k / n);
  const Y = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));

  // 横向网格与 f 刻度
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 2; i += 1) {
    const v = lo + (hi - lo) * i / 2;
    const y = Y(v);
    ctx.strokeStyle = gridC;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillStyle = textC;
    ctx.fillText(fmt(v, 1), padL - 5 * dpr, y);
  }

  // 曲线下方的淡色填充
  ctx.beginPath();
  ctx.moveTo(X(0), padT + plotH);
  hist.forEach((h, i) => ctx.lineTo(X(i), Y(h.f)));
  ctx.lineTo(X(n), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = themeName === 'light' ? 'rgba(11,127,158,0.1)' : 'rgba(103,232,249,0.1)';
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.8 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  hist.forEach((h, i) => {
    const x = X(i);
    const y = Y(h.f);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  hist.forEach((h, i) => {
    const last = i === hist.length - 1;
    ctx.beginPath();
    ctx.arc(X(i), Y(h.f), (last ? 3.4 : 2.1) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = last ? lastC : accent;
    ctx.fill();
  });

  // k 轴刻度：起点、中点、当前
  const ticks = [...new Set([0, Math.round(n / 2), n])];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = textC;
  ticks.forEach((k) => {
    ctx.fillText(String(k), clamp(X(k), padL, padL + plotW), padT + plotH + 5 * dpr);
  });
}

// ------------------------------------------------------------------ Three 场景
let renderer = null;
let scene = null;
let camera = null;
let lights = null;
let grid = null;
let surfaceMesh = null;
let surfaceNF = null;
let mapper = null;
let surfaceGroup = null;
let surfaceMats = [];
let markerGroup = null;
let footGroup = null;
let startMarker = null;
let goalMarker = null;
let pulseMarker = null;
let pulseT = 0;
let trailLine = null;
let trailGeo = null;
let trailPositions = null;
let trailMat = null;
let hikerRoot = null;
let hikerRig = null;
let limbs = null;
let gradArrow = null;
let gradDownArrow = null;
let newtonArrow = null;
let compareArrow = null;
let axisGroup = null;
let ellipseLine = null;
let quadMesh = null;
let quadWire = null;
let quadGeo = null;
let charForward = new THREE.Vector3(0, 0, 1);
let charLean = 0;
let walkPhase = 0;
const camState = { az: 0.72, el: 0.58, dist: 12.4, target: new THREE.Vector3() };
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();
const tmpV5 = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpUpA = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpF2 = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const tmpEye = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tintColor = new THREE.Color();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let surfaceStops = [];

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  els.stage3d.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.fog, 16, 40);

  camera = new THREE.PerspectiveCamera(42, 1, 0.06, 160);
  camera.position.set(8, 7, 10);

  lights = {
    hemi: new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity),
    key: new THREE.DirectionalLight(theme.key, theme.keyIntensity),
    fill: new THREE.DirectionalLight(theme.fill, theme.fillIntensity),
  };
  lights.key.position.set(8, 14, 6);
  lights.fill.position.set(-9, 7, -8);
  scene.add(lights.hemi, lights.key, lights.fill);

  surfaceGroup = new THREE.Group();
  markerGroup = new THREE.Group();
  footGroup = new THREE.Group();
  axisGroup = new THREE.Group();
  scene.add(surfaceGroup, markerGroup, footGroup, axisGroup);

  makeGrid();
  makeTrail();
  makeCharacter();
  makeArrows();
  makeEllipse();
  makeQuad();
  makeStartMarker();
  addGroundKey();

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  onResize();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(els.stage3d);
    ro.observe(els.bottom);
  }
}

function makeGrid() {
  if (grid && scene) {
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
  }
  grid = new THREE.GridHelper(19, 19, theme.gridMajor, theme.gridMinor);
  grid.position.y = -TARGET_H / 2 - 0.08;
  grid.material.transparent = true;
  grid.material.opacity = themeName === 'dark' ? 0.2 : 0.24;
  grid.material.depthWrite = false;
  if (scene) scene.add(grid);
}

function addGroundKey() {
  // 一条淡淡的基准平面，让「地面投等高线」有落处。
  const g = new THREE.CircleGeometry(WORLD * 0.72, 64);
  const m = new THREE.MeshBasicMaterial({
    color: themeName === 'light' ? 0xcfdfda : 0x081820,
    transparent: true,
    opacity: themeName === 'light' ? 0.32 : 0.42,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(g, m);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -TARGET_H / 2 - 0.42;
  disc.userData.groundKey = true;
  scene.add(disc);
}

function makeTrail() {
  trailPositions = new Float32Array(24000 * 3);
  trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setDrawRange(0, 0);
  trailMat = new THREE.LineBasicMaterial({
    color: theme.accent, transparent: true, opacity: 0.8, depthWrite: false,
  });
  trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.frustumCulled = false;
  trailLine.renderOrder = 4;
  trailLine.visible = state.toggles.trail;
  scene.add(trailLine);
}

function makeArrows() {
  gradArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, theme.warm, 0.17, 0.1);
  gradDownArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, theme.rose, 0.17, 0.1);
  newtonArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, theme.accent, 0.17, 0.1);
  compareArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, theme.violet, 0.17, 0.1);
  [gradArrow, gradDownArrow, newtonArrow, compareArrow].forEach((a) => {
    a.renderOrder = 6;
    a.line.material.depthWrite = false;
    a.cone.material.depthWrite = false;
    a.line.material.transparent = true;
    a.cone.material.transparent = true;
    a.line.material.opacity = 0.9;
    a.cone.material.opacity = 0.95;
    a.visible = false;
    scene.add(a);
  });
}

function makeEllipse() {
  const pts = [];
  for (let i = 0; i < 64; i += 1) {
    const a = i / 64 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  ellipseLine = new THREE.LineLoop(g, new THREE.LineBasicMaterial({
    color: theme.warm, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  ellipseLine.matrixAutoUpdate = false;
  ellipseLine.visible = false;
  ellipseLine.renderOrder = 6;
  scene.add(ellipseLine);
}

function makeQuad() {
  const N = 10;
  const n = N + 1;
  const positions = new Float32Array(n * n * 3);
  const indices = [];
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  quadGeo.setIndex(indices);
  const mat = new THREE.MeshStandardMaterial({
    color: theme.accent, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
    roughness: 0.6, metalness: 0.05, depthWrite: false,
  });
  quadMesh = new THREE.Mesh(quadGeo, mat);
  quadMesh.userData.N = N;
  quadMesh.renderOrder = 3;
  quadMesh.visible = state.toggles.quad;
  scene.add(quadMesh);

  quadWire = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
    color: theme.accent, wireframe: true, transparent: true, opacity: 0.26, depthWrite: false,
  }));
  quadWire.renderOrder = 4;
  quadWire.visible = state.toggles.quad;
  scene.add(quadWire);
}

function makeStartMarker() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.014, 6, 30),
    new THREE.MeshBasicMaterial({ color: theme.warm, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.renderOrder = 7;
  startMarker = ring;
  markerGroup.add(ring);

  const goal = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.016, 6, 30),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  goal.renderOrder = 7;
  goal.visible = false;
  goalMarker = goal;
  markerGroup.add(goal);
}

function mapperNorm(f) {
  const span = mapper.hi - mapper.lo || 1;
  const t = clamp((f - mapper.lo) / span, 0, 1);
  if (mapper.warp > 1) return Math.log1p(mapper.warp * t) / Math.log1p(mapper.warp);
  return t;
}

function mapperDYDF(f) {
  const span = mapper.hi - mapper.lo || 1;
  if (mapper.warp > 1) {
    const t = clamp((f - mapper.lo) / span, 0, 1);
    return TARGET_H * (mapper.warp / (1 + mapper.warp * t)) / Math.log1p(mapper.warp) / span;
  }
  return TARGET_H / span;
}

function surfaceY(x, y) {
  return mapper.baseY + mapperNorm(state.preset.f(x, y)) * TARGET_H;
}

function worldPoint(x, y, out = new THREE.Vector3()) {
  out.set(
    (x - mapper.cx) * mapper.scale,
    surfaceY(x, y),
    -(y - mapper.cy) * mapper.scale,
  );
  return out;
}

function normalAt(x, y, out = new THREE.Vector3()) {
  const [gx, gy] = state.preset.grad(x, y);
  const d = mapperDYDF(state.preset.f(x, y));
  const sx = gx * d / mapper.scale;
  const sz = -gy * d / mapper.scale;
  return out.set(-sx, 1, -sz).normalize();
}

function paletteAt(t, out) {
  const s = clamp(t, 0, 1) * (surfaceStops.length - 1);
  const i = Math.floor(s);
  const frac = s - i;
  if (i >= surfaceStops.length - 1) return out.copy(surfaceStops[surfaceStops.length - 1]);
  return out.copy(surfaceStops[i]).lerp(surfaceStops[i + 1], frac);
}

function paintSurfaceColors() {
  if (!surfaceMesh || !surfaceNF) return;
  const attr = surfaceMesh.geometry.getAttribute('color');
  const arr = attr.array;
  tintColor.set(theme.slopeTint);
  for (let i = 0; i < surfaceNF.t.length; i += 1) {
    paletteAt(surfaceNF.t[i], tmpColor);
    const s = surfaceNF.slope[i];
    const mix = clamp(s / (s + 1.6), 0, 1) * 0.42;
    tmpColor.lerp(tintColor, mix);
    arr[i * 3] = tmpColor.r;
    arr[i * 3 + 1] = tmpColor.g;
    arr[i * 3 + 2] = tmpColor.b;
  }
  attr.needsUpdate = true;
}

function rebuildSurface() {
  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    surfaceMesh.geometry.dispose();
    surfaceMesh.material.dispose();
    surfaceMesh = null;
  }
  const p = state.preset;
  const { x0, x1, y0, y1 } = p.domain;
  const w = x1 - x0;
  const h = y1 - y0;
  const info = heightInfo(p);
  mapper = {
    scale: WORLD / Math.max(w, h),
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    lo: info.mapLo,
    hi: info.mapHi,
    warp: p.displayWarp || 1,
    baseY: -TARGET_H / 2,
  };
  groundPlane.constant = -mapper.baseY;
  surfaceStops = theme.surface.map((hex) => new THREE.Color(hex));

  const n = SEG + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const nfs = new Float32Array(n * n);
  const slopes = new Float32Array(n * n);
  const indices = new Uint32Array(SEG * SEG * 6);

  let v = 0;
  for (let j = 0; j < n; j += 1) {
    const y = y0 + (y1 - y0) * j / SEG;
    for (let i = 0; i < n; i += 1) {
      const x = x0 + (x1 - x0) * i / SEG;
      const f = p.f(x, y);
      const t = mapperNorm(f);
      const [gx, gy] = p.grad(x, y);
      const d = mapperDYDF(f);
      const slope = Math.hypot(gx, gy) * d / mapper.scale;
      positions[v * 3] = (x - mapper.cx) * mapper.scale;
      positions[v * 3 + 1] = mapper.baseY + t * TARGET_H;
      positions[v * 3 + 2] = -(y - mapper.cy) * mapper.scale;
      nfs[v] = t;
      slopes[v] = slope;
      v += 1;
    }
  }

  let k = 0;
  for (let j = 0; j < SEG; j += 1) {
    for (let i = 0; i < SEG; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[k] = a; indices[k + 1] = b; indices[k + 2] = c;
      indices[k + 3] = b; indices[k + 4] = d; indices[k + 5] = c;
      k += 6;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.05, side: THREE.FrontSide,
  });
  surfaceMesh = new THREE.Mesh(geo, mat);
  surfaceMesh.renderOrder = 1;
  scene.add(surfaceMesh);

  surfaceNF = { t: nfs, slope: slopes };
  paintSurfaceColors();
  rebuildContours();
  rebuildAxes();
}

function edgePoint(x0, y0, x1, y1, v0, v1, v2, v3, edge, level, out) {
  let t;
  if (edge === 0) {
    t = (level - v0) / (v1 - v0 || 1e-12);
    out[0] = x0 + (x1 - x0) * t;
    out[1] = y0;
  } else if (edge === 1) {
    t = (level - v1) / (v2 - v1 || 1e-12);
    out[0] = x1;
    out[1] = y0 + (y1 - y0) * t;
  } else if (edge === 2) {
    t = (level - v2) / (v3 - v2 || 1e-12);
    out[0] = x1 + (x0 - x1) * t;
    out[1] = y1;
  } else {
    t = (level - v3) / (v0 - v3 || 1e-12);
    out[0] = x0;
    out[1] = y1 + (y0 - y1) * t;
  }
  return out;
}

const EDGE_TABLE = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[0, 1], [2, 3]], [[0, 2]], [[3, 2]],
  [[2, 3]], [[2, 0]], [[0, 3], [1, 2]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], [],
];

function rebuildContours() {
  surfaceGroup.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  surfaceGroup.clear();
  surfaceMats = [];
  const p = state.preset;
  const { x0, x1, y0, y1 } = p.domain;
  const n = CONTOUR_SEG + 1;
  const vals = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    const y = y0 + (y1 - y0) * j / CONTOUR_SEG;
    for (let i = 0; i < n; i += 1) {
      const x = x0 + (x1 - x0) * i / CONTOUR_SEG;
      vals[j * n + i] = p.f(x, y);
    }
  }
  const sMajor = [];
  const sMinor = [];
  const e1 = [0, 0];
  const e2 = [0, 0];
  const SURF_LIFT = 0.022;
  const SUB = 2;

  // 把一段等值线贴到曲面上：两端本来就在 f=level 处，
  // 中间再采两次真实高度，避免长直弦切进山体或浮在空中。
  const pushSurfaceSeg = (ax, az, bx, bz, arr) => {
    const px = [];
    const py = [];
    for (let s = 0; s <= SUB; s += 1) {
      const t = s / SUB;
      const wx = ax + (bx - ax) * t;
      const wz = az + (bz - az) * t;
      const gx = wx / mapper.scale + mapper.cx;
      const gy = mapper.cy - wz / mapper.scale;
      const wy = mapper.baseY + mapperNorm(p.f(gx, gy)) * TARGET_H + SURF_LIFT;
      px.push(wx);
      py.push(wy);
    }
    for (let s = 0; s < SUB; s += 1) {
      arr.push(px[s], py[s], az + (bz - az) * (s / SUB), px[s + 1], py[s + 1], az + (bz - az) * ((s + 1) / SUB));
    }
  };

  for (let k = 0; k < CONTOUR_LEVELS; k += 1) {
    const level = mapper.lo + (mapper.hi - mapper.lo) * (k + 1) / (CONTOUR_LEVELS + 1);
    const major = k % 4 === 0;
    const arr = major ? sMajor : sMinor;
    for (let j = 0; j < CONTOUR_SEG; j += 1) {
      const ya = y0 + (y1 - y0) * j / CONTOUR_SEG;
      const yb = y0 + (y1 - y0) * (j + 1) / CONTOUR_SEG;
      for (let i = 0; i < CONTOUR_SEG; i += 1) {
        const xa = x0 + (x1 - x0) * i / CONTOUR_SEG;
        const xb = x0 + (x1 - x0) * (i + 1) / CONTOUR_SEG;
        const v0 = vals[j * n + i];
        const v1 = vals[j * n + i + 1];
        const v2 = vals[(j + 1) * n + i + 1];
        const v3 = vals[(j + 1) * n + i];
        let mask = 0;
        if (v0 > level) mask |= 1;
        if (v1 > level) mask |= 2;
        if (v2 > level) mask |= 4;
        if (v3 > level) mask |= 8;
        const pairs = EDGE_TABLE[mask];
        if (!pairs.length) continue;
        for (const pair of pairs) {
          edgePoint(xa, ya, xb, yb, v0, v1, v2, v3, pair[0], level, e1);
          edgePoint(xa, ya, xb, yb, v0, v1, v2, v3, pair[1], level, e2);
          const ax = (e1[0] - mapper.cx) * mapper.scale;
          const az = -(e1[1] - mapper.cy) * mapper.scale;
          const bx = (e2[0] - mapper.cx) * mapper.scale;
          const bz = -(e2[1] - mapper.cy) * mapper.scale;
          pushSurfaceSeg(ax, az, bx, bz, arr);
        }
      }
    }
  }

  const addLines = (arr, major) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const m = new THREE.LineBasicMaterial({
      color: theme.contour,
      transparent: true,
      opacity: major ? theme.contourMajorOpacity : theme.contourOpacity,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(g, m);
    line.renderOrder = 3;
    line.frustumCulled = false;
    m.userData.major = major;
    surfaceGroup.add(line);
    surfaceMats.push(m);
  };
  addLines(sMajor, true);
  addLines(sMinor, false);
  surfaceGroup.visible = state.toggles.contour;
}

// ------------------------------------------------------------------ 坐标轴
// 把显示高度反算回真实的 f 值：z 轴刻度要读函数值，而不是 0–1 的归一化数。
function unmapNorm(t) {
  const span = mapper.hi - mapper.lo || 1;
  let s = t;
  if (mapper.warp > 1) {
    s = (Math.exp(t * Math.log1p(mapper.warp)) - 1) / mapper.warp;
  }
  return mapper.lo + s * span;
}

function makeAxisLabel(text, colorCss, scale = 1) {
  const fontPx = 44;
  const pad = 10;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `600 ${fontPx}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
  const w = Math.max(40, Math.ceil(probe.measureText(text).width) + pad * 2);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = fontPx + pad * 2;
  const ctx = c.getContext('2d');
  ctx.font = probe.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colorCss;
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false,
  }));
  const h = 0.23 * scale;
  sp.scale.set(h * (c.width / c.height), h, 1);
  sp.renderOrder = 12;
  return sp;
}

function rebuildAxes() {
  if (!axisGroup) return;
  axisGroup.children.forEach((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  });
  axisGroup.clear();
  if (!mapper) return;

  const p = state.preset;
  const { x0, x1, y0, y1 } = p.domain;
  const halfW = (x1 - x0) * mapper.scale / 2;
  const halfD = (y1 - y0) * mapper.scale / 2;
  const baseY = mapper.baseY;
  const zTop = baseY + TARGET_H * 1.06;
  const lineColor = themeName === 'light' ? 0x2f6c78 : 0x8fd0e2;
  const labelColor = themeName === 'light' ? 'rgba(22,60,72,0.92)' : 'rgba(200,230,244,0.94)';
  const lineMat = new THREE.LineBasicMaterial({
    color: lineColor, transparent: true, opacity: 0.6, depthWrite: false,
  });
  const addLine = (pts) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
    const l = new THREE.Line(g, lineMat);
    l.renderOrder = 8;
    axisGroup.add(l);
  };

  // x 轴：前边（参数 x）；y 轴：左边（参数 y）；z 轴：左前角（函数值 f）
  addLine([[-halfW, baseY, halfD], [halfW + 0.4, baseY, halfD]]);
  addLine([[-halfW, baseY, halfD], [-halfW, baseY, -halfD - 0.4]]);
  addLine([[-halfW, baseY, halfD], [-halfW, zTop, halfD]]);

  const tick = [];
  const pushTick = (a, b) => {
    tick.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  const nx = 4;
  for (let i = 0; i <= nx; i += 1) {
    const t = i / nx;
    const wx = -halfW + 2 * halfW * t;
    pushTick([wx, baseY, halfD], [wx, baseY + 0.13, halfD]);
    const sp = makeAxisLabel(fmt(x0 + (x1 - x0) * t, 1), labelColor, 0.78);
    sp.position.set(wx, baseY - 0.26, halfD + 0.3);
    axisGroup.add(sp);
  }

  const ny = 3;
  for (let i = 0; i <= ny; i += 1) {
    const t = i / ny;
    const wz = halfD - 2 * halfD * t;
    pushTick([-halfW, baseY, wz], [-halfW - 0.13, baseY, wz]);
    const sp = makeAxisLabel(fmt(y0 + (y1 - y0) * t, 1), labelColor, 0.78);
    sp.position.set(-halfW - 0.3, baseY - 0.26, wz);
    axisGroup.add(sp);
  }

  const nz = 3;
  for (let i = 0; i <= nz; i += 1) {
    const t = i / nz;
    const wy = baseY + t * TARGET_H;
    pushTick([-halfW, wy, halfD], [-halfW - 0.13, wy, halfD]);
    const sp = makeAxisLabel(fmt(unmapNorm(t), 1), labelColor, 0.78);
    sp.position.set(-halfW - 0.52, wy, halfD);
    axisGroup.add(sp);
  }

  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tick, 3));
  const tl = new THREE.LineSegments(tg, lineMat);
  tl.renderOrder = 8;
  axisGroup.add(tl);

  // 轴名始终朝向镜头，旋转后也能读
  const lx = makeAxisLabel('x（参数）', labelColor, 1);
  lx.position.set(halfW + 0.42, baseY + 0.05, halfD);
  axisGroup.add(lx);
  const ly = makeAxisLabel('y（参数）', labelColor, 1);
  ly.position.set(-halfW, baseY + 0.05, -halfD - 0.5);
  axisGroup.add(ly);
  const lz = makeAxisLabel('z = f(x,y)', labelColor, 1);
  lz.position.set(-halfW - 0.1, zTop + 0.26, halfD);
  axisGroup.add(lz);
}

// ------------------------------------------------------------------ 小人
function makeCharacter() {
  const c = theme.char;
  const mat = {
    jacket: new THREE.MeshStandardMaterial({ color: c.jacket, roughness: 0.72 }),
    jacketDark: new THREE.MeshStandardMaterial({ color: c.jacketDark, roughness: 0.78 }),
    pants: new THREE.MeshStandardMaterial({ color: c.pants, roughness: 0.82 }),
    skin: new THREE.MeshStandardMaterial({ color: c.skin, roughness: 0.65 }),
    hat: new THREE.MeshStandardMaterial({ color: c.hat, roughness: 0.7 }),
    pack: new THREE.MeshStandardMaterial({ color: c.pack, roughness: 0.8 }),
    boot: new THREE.MeshStandardMaterial({ color: c.boot, roughness: 0.85 }),
    eye: new THREE.MeshBasicMaterial({ color: c.eye }),
  };
  const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  hikerRoot = new THREE.Group();
  hikerRig = new THREE.Group();
  hikerRoot.add(hikerRig);

  add(hikerRig, new THREE.CapsuleGeometry(0.095, 0.2, 4, 12), mat.jacket, 0, 0.375, 0);
  add(hikerRig, new THREE.SphereGeometry(0.115, 18, 14), mat.skin, 0, 0.6, 0);
  add(hikerRig, new THREE.CylinderGeometry(0.16, 0.16, 0.018, 22), mat.hat, 0, 0.702, 0);
  add(hikerRig, new THREE.CylinderGeometry(0.07, 0.098, 0.11, 18), mat.hat, 0, 0.762, 0);
  add(hikerRig, new THREE.TorusGeometry(0.088, 0.016, 6, 18), mat.jacketDark, 0, 0.505, 0).rotation.x = Math.PI / 2;
  add(hikerRig, new THREE.SphereGeometry(0.016, 8, 6), mat.eye, -0.043, 0.616, 0.106);
  add(hikerRig, new THREE.SphereGeometry(0.016, 8, 6), mat.eye, 0.043, 0.616, 0.106);
  add(hikerRig, new THREE.BoxGeometry(0.14, 0.16, 0.07), mat.pack, 0, 0.435, -0.108);
  add(hikerRig, new THREE.BoxGeometry(0.026, 0.17, 0.02), mat.jacketDark, -0.07, 0.44, 0.088);
  add(hikerRig, new THREE.BoxGeometry(0.026, 0.17, 0.02), mat.jacketDark, 0.07, 0.44, 0.088);

  const armGeo = new THREE.CapsuleGeometry(0.029, 0.13, 3, 8);
  const legGeo = new THREE.CapsuleGeometry(0.035, 0.13, 3, 8);
  const bootGeo = new THREE.BoxGeometry(0.075, 0.055, 0.12);

  const armL = new THREE.Group();
  armL.position.set(-0.135, 0.455, 0);
  armL.rotation.z = 0.14;
  add(armL, armGeo, mat.jacket, 0, -0.075, 0);
  hikerRig.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.135, 0.455, 0);
  armR.rotation.z = -0.14;
  add(armR, armGeo, mat.jacket, 0, -0.075, 0);
  hikerRig.add(armR);

  const legL = new THREE.Group();
  legL.position.set(-0.052, 0.215, 0);
  add(legL, legGeo, mat.pants, 0, -0.085, 0);
  add(legL, bootGeo, mat.boot, 0, -0.158, 0.022);
  hikerRig.add(legL);

  const legR = new THREE.Group();
  legR.position.set(0.052, 0.215, 0);
  add(legR, legGeo, mat.pants, 0, -0.085, 0);
  add(legR, bootGeo, mat.boot, 0, -0.158, 0.022);
  hikerRig.add(legR);

  limbs = { armL, armR, legL, legR };

  const shadowMat = new THREE.MeshBasicMaterial({
    color: theme.shadow, transparent: true, opacity: theme.shadowOpacity, depthWrite: false,
  });
  const shadow = add(hikerRoot, new THREE.CircleGeometry(0.19, 24), shadowMat, 0, 0.006, 0);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;

  hikerRoot.scale.setScalar(1.05);
  scene.add(hikerRoot);
}

function setCharacterPose(x, y, forward, lean) {
  if (!hikerRoot) return;
  const pos = worldPoint(x, y, tmpV2);
  const n = normalAt(x, y, tmpV);
  const up = tmpUpA.copy(n).lerp(tmpUp, 0.28).normalize();
  const f = tmpFwd.copy(forward);
  f.addScaledVector(up, -f.dot(up));
  if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
  f.normalize();
  tmpRight.crossVectors(up, f).normalize();
  tmpF2.crossVectors(tmpRight, up).normalize();
  tmpMat.makeBasis(tmpRight, up, tmpF2);
  hikerRoot.quaternion.setFromRotationMatrix(tmpMat);
  hikerRoot.position.copy(pos).addScaledVector(n, 0.02);
  hikerRig.rotation.x = lean;
}

function animateLimbs(dt, moving, effort) {
  if (!limbs) return;
  if (moving) walkPhase += dt * (7 + effort * 6);
  const s = moving ? Math.sin(walkPhase) * 0.72 : 0;
  const k = 1 - Math.exp(-12 * dt);
  limbs.legL.rotation.x = lerp(limbs.legL.rotation.x, s, k);
  limbs.legR.rotation.x = lerp(limbs.legR.rotation.x, -s, k);
  limbs.armL.rotation.x = lerp(limbs.armL.rotation.x, -s * 0.8, k);
  limbs.armR.rotation.x = lerp(limbs.armR.rotation.x, s * 0.8, k);
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 0.025 : 0;
  hikerRig.position.y = lerp(hikerRig.position.y, bob, k);
}

// ------------------------------------------------------------------ 轨迹 / 脚印 / 标记
function resetTrail() {
  state.trailCount = 0;
  state.lastTrail = null;
  if (trailGeo) trailGeo.setDrawRange(0, 0);
}

function addTrailPoint(x, y, force = false) {
  if (!trailGeo || state.trailCount >= 24000) return;
  if (!force && state.lastTrail) {
    const dx = x - state.lastTrail.x;
    const dy = y - state.lastTrail.y;
    if (Math.hypot(dx, dy) < 0.014) return;
  }
  const pos = worldPoint(x, y, tmpV2);
  const n = normalAt(x, y, tmpV);
  const i = state.trailCount * 3;
  trailPositions[i] = pos.x + n.x * 0.024;
  trailPositions[i + 1] = pos.y + n.y * 0.024;
  trailPositions[i + 2] = pos.z + n.z * 0.024;
  state.trailCount += 1;
  state.lastTrail = { x, y };
  trailGeo.setDrawRange(0, state.trailCount);
  trailGeo.getAttribute('position').needsUpdate = true;
}

// ------------------------------------------------------------------ 迭代历史可视化
// 在曲面上把每一步的位置标出来：所有点留小标记，最近 5 步带「k / f」标签与梯度箭头。
let histGroup = null;

function clearHistGroup() {
  if (!histGroup) return;
  histGroup.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  });
  histGroup.clear();
}

function rebuildHistoryVisuals() {
  if (!scene || !mapper || !state.preset) return;
  if (!histGroup) {
    histGroup = new THREE.Group();
    histGroup.renderOrder = 6;
    scene.add(histGroup);
  }
  clearHistGroup();
  const hist = state.history.filter((h) => Number.isFinite(h.x) && Number.isFinite(h.y));
  const RECENT = 5;
  const labelColor = themeName === 'light' ? '#3b2a12' : '#f6ecd6';
  const from = Math.max(0, hist.length - RECENT);
  hist.forEach((h, i) => {
    const p3 = worldPoint(h.x, h.y, new THREE.Vector3());
    const n = normalAt(h.x, h.y, new THREE.Vector3()).normalize();
    p3.addScaledVector(n, 0.035);
    const last = i === hist.length - 1;
    const recent = i >= from;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(last ? 0.072 : (recent ? 0.05 : 0.03), 12, 10),
      new THREE.MeshBasicMaterial({
        color: last ? theme.warm : theme.accent,
        transparent: true,
        opacity: last ? 1 : (recent ? 0.92 : 0.5),
        depthWrite: false,
      }),
    );
    dot.position.copy(p3);
    dot.renderOrder = 7;
    histGroup.add(dot);
    if (!recent) return;
    // 最近若干步：标 k 与该点的 f
    const tag = makeAxisLabel(`k=${h.k} · f=${fmt(h.f, 2)}`, labelColor, 0.64);
    tag.position.copy(p3).add(new THREE.Vector3(0, last ? 0.3 : 0.22, 0));
    histGroup.add(tag);
    if (last) return;
    // 该点的梯度方向（贴着曲面，指向最陡上坡）
    const [gx, gy] = state.preset.grad(h.x, h.y);
    if (Math.hypot(gx, gy) < 1e-7) return;
    const dir = new THREE.Vector3(gx, 0, -gy).normalize();
    dir.addScaledVector(n, -dir.dot(n));
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const arrow = new THREE.ArrowHelper(dir.clone(), p3.clone(), 0.5, theme.warm, 0.13, 0.075);
    arrow.line.material.transparent = true;
    arrow.line.material.opacity = 0.9;
    arrow.line.material.depthWrite = false;
    arrow.cone.material.transparent = true;
    arrow.cone.material.opacity = 0.9;
    arrow.cone.material.depthWrite = false;
    histGroup.add(arrow);
  });
  histGroup.visible = state.toggles.trail;

  // 地面投影：把同一条路径压到 xy 平面，颜色规则与曲面上的点一致
  const gY = mapper.baseY - 0.05;
  const gpts = hist.map((h) => new THREE.Vector3(
    (h.x - mapper.cx) * mapper.scale,
    gY,
    -(h.y - mapper.cy) * mapper.scale,
  ));
  if (gpts.length > 1) {
    const lg = new THREE.BufferGeometry().setFromPoints(gpts);
    const lm = new THREE.LineBasicMaterial({
      color: theme.accent, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false,
    });
    const ln = new THREE.Line(lg, lm);
    ln.renderOrder = 9;
    histGroup.add(ln);
  }
  gpts.forEach((gp, i) => {
    const last = i === gpts.length - 1;
    const recent = i >= from;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(last ? 0.07 : (recent ? 0.045 : 0.028), 10, 8),
      new THREE.MeshBasicMaterial({
        color: last ? theme.warm : theme.accent,
        transparent: true,
        opacity: last ? 1 : (recent ? 0.9 : 0.45),
        depthWrite: false,
        depthTest: false,
      }),
    );
    dot.position.copy(gp);
    dot.renderOrder = 9;
    histGroup.add(dot);
    // 每一步的移动方向：地面上的一小段箭头
    if (i > 0 && recent) {
      const dir = gp.clone().sub(gpts[i - 1]);
      const len = dir.length();
      if (len > 1e-4) {
        const arrow = new THREE.ArrowHelper(
          dir.normalize(), gpts[i - 1].clone(), len * 0.9, theme.accent, Math.min(0.12, len * 0.45), 0.055,
        );
        [arrow.line, arrow.cone].forEach((m) => {
          m.material.transparent = true;
          m.material.opacity = 0.95;
          m.material.depthTest = false;
          m.material.depthWrite = false;
          m.renderOrder = 9;
        });
        histGroup.add(arrow);
      }
    }
  });
  // 收敛/停住的点：地面上加一圈，标出极值位置
  if (gpts.length && (state.status === 'converged' || state.status === 'stalled')) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.105, 0.145, 26),
      new THREE.MeshBasicMaterial({
        color: theme.warm, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(gpts[gpts.length - 1]);
    ring.position.y = gY + 0.006;
    ring.renderOrder = 9;
    histGroup.add(ring);
    const goalTag = makeAxisLabel('极值', themeName === 'light' ? '#b45309' : '#fbbf24', 0.56);
    goalTag.position.copy(gpts[gpts.length - 1]).add(new THREE.Vector3(0, 0.2, 0));
    histGroup.add(goalTag);
  }
}

function addFootprint(x, y, good) {
  const geo = new THREE.RingGeometry(0.045, 0.075, 18);
  const mat = new THREE.MeshBasicMaterial({
    color: good ? theme.ok : theme.rose,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  const pos = worldPoint(x, y, tmpV2);
  const n = normalAt(x, y, tmpV);
  m.position.copy(pos).addScaledVector(n, 0.03);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.renderOrder = 6;
  footGroup.add(m);
  if (footGroup.children.length > 120) {
    const first = footGroup.children[0];
    first.geometry.dispose();
    first.material.dispose();
    footGroup.remove(first);
  }
}

function updateStartMarker() {
  if (!startMarker) return;
  const pos = worldPoint(state.start.x, state.start.y, tmpV2);
  const n = normalAt(state.start.x, state.start.y, tmpV);
  startMarker.position.copy(pos).addScaledVector(n, 0.03);
  startMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  startMarker.visible = !state.userMode || state.steps === 0;
}

function clearGoal() {
  if (goalMarker) goalMarker.visible = false;
  pulseMarker = null;
}

function setGoal(x, y) {
  if (!goalMarker) return;
  const pos = worldPoint(x, y, tmpV2);
  const n = normalAt(x, y, tmpV);
  goalMarker.position.copy(pos).addScaledVector(n, 0.03);
  goalMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  goalMarker.visible = true;
  goalMarker.scale.setScalar(1);
  pulseMarker = goalMarker;
  pulseT = 0;
}

// ------------------------------------------------------------------ 箭头 / 椭圆 / 二次近似
function effortAt(x, y) {
  const p = state.preset;
  const [gx, gy] = p.grad(x, y);
  const g = Math.hypot(gx, gy);
  return clamp(g / (state.gRef || 1), 0, 1);
}

// 把箭头名签贴到三维箭头的尖端：每帧按相机投影换算，旋转视角后也能读。
function placeTag(el, worldVec, on) {
  if (!el) return;
  if (!on || !camera || !renderer) {
    el.classList.remove('on');
    return;
  }
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const v = tmpV5.copy(worldVec).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  const host = els.stage3d.getBoundingClientRect();
  el.style.left = `${(v.x * 0.5 + 0.5) * rect.width + (rect.left - host.left)}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * rect.height + (rect.top - host.top)}px`;
  el.classList.add('on');
}

function updateArrows(x, y) {
  if (!gradArrow) return;
  const p = state.preset;
  const [gx, gy] = p.grad(x, y);
  const g = Math.hypot(gx, gy);
  const pos = worldPoint(x, y, tmpV2);
  const n = normalAt(x, y, tmpV);
  const base = tmpEye.copy(pos).addScaledVector(n, 0.06);
  const showGrad = state.toggles.grad && g > 1e-6;

  // 两根方向箭头一起画：+∇f（最陡上坡）与 −∇f（最陡下坡）。
  // 它们和牛顿步 −H⁻¹∇f 不是一回事，夹角正是这一页要看的东西。
  let gradLen = 0;
  if (showGrad) {
    const dir = tmpDir.set(gx, 0, -gy);
    dir.addScaledVector(n, -dir.dot(n));
    if (dir.lengthSq() > 1e-9) {
      dir.normalize();
      gradLen = 0.4 + effortAt(x, y) * 0.85;
      gradArrow.position.copy(base);
      gradArrow.setDirection(dir);
      gradArrow.setLength(gradLen, 0.16, 0.09);
      gradArrow.visible = true;
      gradDownArrow.position.copy(base);
      gradDownArrow.setDirection(tmpV4.copy(dir).negate());
      gradDownArrow.setLength(gradLen, 0.16, 0.09);
      gradDownArrow.visible = true;
      placeTag(els.tagUp, tmpV4.copy(base).addScaledVector(dir, gradLen), true);
      placeTag(els.tagDown, tmpV4.copy(base).addScaledVector(dir, -gradLen), true);
    } else {
      gradArrow.visible = false;
      gradDownArrow.visible = false;
      placeTag(els.tagUp, base, false);
      placeTag(els.tagDown, base, false);
    }
  } else {
    gradArrow.visible = false;
    gradDownArrow.visible = false;
    placeTag(els.tagUp, base, false);
    placeTag(els.tagDown, base, false);
  }

  // 普通模式：显示下一步牛顿会去哪；「我来走」模式下要等用户走完才浮现。
  let showNewton = false;
  let target = null;
  if (!state.userMode) {
    if (state.status !== 'converged' && state.status !== 'diverged' && g > p.gTol) {
      const s = solveStep(p, x, y, state.algo, state.alpha);
      if (s.actualLen > 0.02) {
        target = s.next;
        showNewton = true;
      }
    }
  } else if (state.compare) {
    const from = state.compare.from;
    const s = state.compare.info;
    const fromPos = worldPoint(from.x, from.y, tmpV3);
    const fromN = normalAt(from.x, from.y, tmpUpA);
    const fromBase = fromPos.addScaledVector(fromN, 0.06);
    const toPos = worldPoint(s.next.x, s.next.y, tmpV);
    const d = tmpDir.copy(toPos).sub(fromBase);
    const len = d.length();
    if (len > 0.04) {
      const shown = Math.min(2.2, 0.4 + len * 0.24);
      compareArrow.position.copy(fromBase);
      compareArrow.setDirection(d.normalize());
      compareArrow.setLength(shown, 0.17, 0.095);
      compareArrow.visible = true;
      if (els.tagNewton) {
        els.tagNewton.textContent = '牛顿会走到这里';
        els.tagNewton.dataset.mode = 'compare';
        placeTag(els.tagNewton, tmpV4.copy(fromBase).addScaledVector(d, shown), true);
      }
    } else {
      compareArrow.visible = false;
      placeTag(els.tagNewton, base, false);
    }
  } else {
    compareArrow.visible = false;
    placeTag(els.tagNewton, base, false);
  }

  if (showNewton && target) {
    const to = worldPoint(target.x, target.y, tmpV);
    const d = tmpDir.copy(to).sub(base);
    const len = d.length();
    if (len > 0.04) {
      const shown = Math.min(2.2, 0.4 + len * 0.24);
      newtonArrow.position.copy(base);
      newtonArrow.setDirection(d.normalize());
      newtonArrow.setLength(shown, 0.17, 0.095);
      newtonArrow.visible = true;
      if (els.tagNewton) {
        els.tagNewton.textContent = '牛顿步 −H⁻¹∇f';
        els.tagNewton.dataset.mode = 'newton';
        placeTag(els.tagNewton, tmpV4.copy(base).addScaledVector(d, shown), true);
      }
    } else {
      newtonArrow.visible = false;
      placeTag(els.tagNewton, base, false);
    }
  } else {
    newtonArrow.visible = false;
    if (!state.userMode || !state.compare) placeTag(els.tagNewton, base, false);
  }
}

function updateEllipse(x, y) {
  if (!ellipseLine) return;
  if (!state.toggles.hess) { ellipseLine.visible = false; return; }
  const p = state.preset;
  const [a, b, c] = p.hess(x, y);
  const theta = 0.5 * Math.atan2(2 * b, a - c);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const l1 = a * ct * ct + 2 * b * ct * st + c * st * st;
  const l2 = a * st * st - 2 * b * ct * st + c * ct * ct;
  const r1 = clamp(0.72 / Math.sqrt(Math.abs(l1) + 0.16), 0.14, 1.5);
  const r2 = clamp(0.72 / Math.sqrt(Math.abs(l2) + 0.16), 0.14, 1.5);
  const n = normalAt(x, y, tmpV);
  const e1 = new THREE.Vector3(ct, 0, -st);
  e1.addScaledVector(n, -e1.dot(n));
  if (e1.lengthSq() < 1e-9) e1.set(1, 0, 0);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  const pos = worldPoint(x, y, tmpV2).addScaledVector(n, 0.05);
  const m = new THREE.Matrix4().makeBasis(
    e1.clone().multiplyScalar(r1),
    e2.clone().multiplyScalar(r2),
    n,
  );
  m.setPosition(pos);
  ellipseLine.matrix.copy(m);
  ellipseLine.visible = true;
}

function updateQuad(x, y) {
  if (!quadMesh) return;
  if (!state.toggles.quad) { quadMesh.visible = false; quadWire.visible = false; return; }
  const p = state.preset;
  const N = quadMesh.userData.N;
  const n = N + 1;
  const posAttr = quadGeo.getAttribute('position');
  const [gx, gy] = p.grad(x, y);
  const [hxx, hxy, hyy] = p.hess(x, y);
  const f0 = p.f(x, y);
  const dydf = mapperDYDF(f0);
  const base = worldPoint(x, y, tmpV2);
  const nrm = normalAt(x, y, tmpV);
  base.addScaledVector(nrm, 0.01);
  const r = 0.14 * Math.min(p.domain.x1 - p.domain.x0, p.domain.y1 - p.domain.y0);
  for (let j = 0; j < n; j += 1) {
    const v = (j / N * 2 - 1) * r;
    for (let i = 0; i < n; i += 1) {
      const u = (i / N * 2 - 1) * r;
      const q = f0 + gx * u + gy * v + 0.5 * (hxx * u * u + 2 * hxy * u * v + hyy * v * v);
      const idx = (j * n + i) * 3;
      posAttr.array[idx] = base.x + u * mapper.scale;
      posAttr.array[idx + 1] = base.y + (q - f0) * dydf;
      posAttr.array[idx + 2] = base.z - v * mapper.scale;
    }
  }
  posAttr.needsUpdate = true;
  quadGeo.computeVertexNormals();
  quadMesh.visible = true;
  quadWire.visible = true;
}

// ------------------------------------------------------------------ 镜头
function focusCamera() {
  if (!mapper) return;
  const p = state.preset;
  const mid = worldPoint((p.domain.x0 + p.domain.x1) / 2, (p.domain.y0 + p.domain.y1) / 2, tmpV2);
  camState.target.copy(mid).add(new THREE.Vector3(0, 0.45, 0));
  camState.az = 0.72;
  camState.el = params.get('view') === 'top' ? 1.33 : 0.7;
  camState.dist = params.get('view') === 'top' ? 13.6 : 12.4;
}

function updateCamera(dt) {
  if (!camera || !mapper) return;
  const pos = worldPoint(state.pos.x, state.pos.y, tmpV2);
  const p = state.preset;
  const mid = worldPoint((p.domain.x0 + p.domain.x1) / 2, (p.domain.y0 + p.domain.y1) / 2, tmpV3);
  const target = tmpEye.copy(mid).lerp(pos, 0.32).add(new THREE.Vector3(0, 0.45, 0));
  camState.target.lerp(target, 1 - Math.exp(-6 * dt));
  const horiz = Math.cos(camState.el) * camState.dist;
  camera.position.set(
    camState.target.x + Math.sin(camState.az) * horiz,
    camState.target.y + Math.sin(camState.el) * camState.dist,
    camState.target.z + Math.cos(camState.az) * horiz,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(camState.target);
}

let drag = null;

function projectToScreen(v3) {
  const p = v3.clone().project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: (p.x * 0.5 + 0.5) * rect.width,
    y: (-p.y * 0.5 + 0.5) * rect.height,
  };
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (startMarker && startMarker.visible) {
    const s = projectToScreen(worldPoint(state.start.x, state.start.y, tmpV2));
    if (Math.hypot(s.x - mx, s.y - my) < 26) {
      state.draggingStart = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'crosshair';
      return;
    }
  }
  drag = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (state.draggingStart) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const x = hit.x / mapper.scale + mapper.cx;
      const y = mapper.cy - hit.z / mapper.scale;
      setStartPoint(x, y, true);
    }
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  camState.az -= dx * 0.005;
  camState.el = clamp(camState.el + dy * 0.004, 0.1, 1.35);
}

function onPointerUp(e) {
  state.draggingStart = false;
  drag = null;
  if (renderer) renderer.domElement.style.cursor = 'grab';
  if (e && renderer && renderer.domElement.hasPointerCapture(e.pointerId)) {
    renderer.domElement.releasePointerCapture(e.pointerId);
  }
}

function onWheel(e) {
  e.preventDefault();
  camState.dist = clamp(camState.dist * Math.exp(e.deltaY * 0.001), 7, 26);
}

function onResize() {
  if (!renderer || !camera) return;
  const w = Math.max(1, els.stage3d.clientWidth);
  const h = Math.max(1, els.stage3d.clientHeight);
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  drawChart();
  drawScatter();
}

// ------------------------------------------------------------------ logistic 散点
function drawScatter() {
  if (!els.scatter || state.preset.id !== 'logistic' || els.logisticPanel.hidden) return;
  const c = els.scatter;
  const rect = c.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(rect.width * dpr);
  const H = Math.round(rect.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  const padL = 26 * dpr;
  const padR = 9 * dpr;
  const padT = 10 * dpr;
  const padB = 20 * dpr;
  const x0 = 0;
  const x1 = 7;
  const X = (v) => padL + (W - padL - padR) * ((v - x0) / (x1 - x0));
  const Y = (p) => H - padB - (H - padT - padB) * p;

  const grid = themeName === 'light' ? 'rgba(20,52,84,0.12)' : 'rgba(120,170,230,0.14)';
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1 * dpr;
  for (let i = 0; i <= 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(X(i), padT);
    ctx.lineTo(X(i), H - padB);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i += 1) {
    const yy = padT + (H - padT - padB) * i / 4;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(W - padR, yy);
    ctx.stroke();
  }

  ctx.fillStyle = themeName === 'light' ? 'rgba(20,52,84,0.55)' : 'rgba(147,167,194,0.7)';
  ctx.font = `${9 * dpr}px ui-monospace, monospace`;
  ctx.fillText('1', 8 * dpr, Y(1) + 3 * dpr);
  ctx.fillText('0', 8 * dpr, Y(0) + 3 * dpr);
  for (let i = 0; i <= 7; i += 1) {
    ctx.fillText(String(i), X(i) - 2.5 * dpr, H - 6 * dpr);
  }
  ctx.fillText('学习小时', X(3.2), H - 6 * dpr + 0);

  const b0 = state.pos.x;
  const b1 = state.pos.y;
  const sig = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
  // 50% 分界
  if (Math.abs(b1) > 1e-7) {
    const xb = -b0 / b1;
    if (xb >= x0 && xb <= x1) {
      ctx.fillStyle = themeName === 'light' ? 'rgba(11,127,158,0.07)' : 'rgba(103,232,249,0.06)';
      ctx.fillRect(X(xb), padT, W - padR - X(xb), H - padT - padB);
      ctx.strokeStyle = themeName === 'light' ? '#0b7f9e' : '#67e8f9';
      ctx.lineWidth = 1.4 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(X(xb), padT);
      ctx.lineTo(X(xb), H - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = themeName === 'light' ? '#0b7f9e' : '#67e8f9';
      ctx.fillText(`${xb.toFixed(1)}h`, X(xb) + 3 * dpr, padT + 9 * dpr);
    }
  }
  // S 曲线
  ctx.strokeStyle = themeName === 'light' ? '#b45309' : '#fbbf24';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  for (let i = 0; i <= 120; i += 1) {
    const xx = x0 + (x1 - x0) * i / 120;
    const yy = Y(sig(b0 + b1 * xx));
    if (i === 0) ctx.moveTo(X(xx), yy);
    else ctx.lineTo(X(xx), yy);
  }
  ctx.stroke();
  // 散点：同一类别内按序号加一点纵向抖动，避免叠成一条线
  const xs = LOGISTIC_DATA;
  xs.forEach((d, i) => {
    const jitter = ((i * 37) % 13 - 6) / 6 * 0.035;
    const yy = clamp(d.y + jitter, 0, 1);
    ctx.beginPath();
    ctx.arc(X(d.x), Y(yy), 2.6 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = d.y ? (themeName === 'light' ? '#0b7f9e' : '#67e8f9') : (themeName === 'light' ? '#be185d' : '#f472b6');
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  if (els.lpBeta) {
    const tex = `\\beta=(${b0.toFixed(2)},\\;${b1.toFixed(2)})`;
    if (window.katex) window.katex.render(tex, els.lpBeta, { throwOnError: false, displayMode: false, strict: 'ignore' });
    else els.lpBeta.textContent = tex;
  }
}

// ------------------------------------------------------------------ 流程
function maxIterFor() {
  const p = state.preset;
  if (state.algo === 'gradient') return Math.max(p.maxIter, 90);
  return p.maxIter;
}

function gradNormAt(x, y) {
  const [gx, gy] = state.preset.grad(x, y);
  return Math.hypot(gx, gy);
}

function isTerminal() {
  return state.status === 'converged' || state.status === 'diverged' || state.status === 'stalled';
}

function updateSceneHud() {
  if (!els.hudK) return;
  const p = state.preset;
  els.hudK.textContent = String(state.steps);
  els.hudF.textContent = fmt(p.f(state.pos.x, state.pos.y), 2);
  els.hudG.textContent = fmt(gradNormAt(state.pos.x, state.pos.y), 2);
}

function updateHud() {
  els.kNum.textContent = String(state.steps);
  els.algoChip.textContent = ALGO_LABEL[state.algo];
  [...els.algoSeg.querySelectorAll('button')].forEach((b) => {
    b.classList.toggle('active', b.dataset.algo === state.algo);
  });
  els.alpha.disabled = state.algo === 'newton';
  updateSceneHud();
}

function clearFootprints() {
  if (!footGroup) return;
  footGroup.children.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  footGroup.clear();
}

function setStartPoint(x, y, dragging = false) {
  const p = state.preset;
  const sx = (p.domain.x1 - p.domain.x0) * 0.02;
  const sy = (p.domain.y1 - p.domain.y0) * 0.02;
  state.start = {
    x: clamp(x, p.domain.x0 + sx, p.domain.x1 - sx),
    y: clamp(y, p.domain.y0 + sy, p.domain.y1 - sy),
  };
  els.startX.value = state.start.x.toFixed(2);
  els.startY.value = state.start.y.toFixed(2);
  resetRun(dragging);
}

function resetRun(keepCamera = false) {
  const p = state.preset;
  state.pos = { ...state.start };
  state.steps = 0;
  state.stepInfo = null;
  state.conclusion = '';
  state.compare = null;
  state.userSteps = 0;
  state.history = [{ k: 0, f: p.f(state.pos.x, state.pos.y), x: state.pos.x, y: state.pos.y }];
  state.walk = null;
  state.gRef = Math.max(gradNormAt(state.pos.x, state.pos.y), 1e-9);
  setStatus('idle');
  resetTrail();
  addTrailPoint(state.pos.x, state.pos.y, true);
  rebuildHistoryVisuals();
  clearFootprints();
  clearGoal();
  if (compareArrow) compareArrow.visible = false;
  updateStartMarker();
  updateHessian(state.pos.x, state.pos.y);
  charForward.set(0, 0, 1);
  charLean = 0;
  setCharacterPose(state.pos.x, state.pos.y, charForward, 0);
  renderNarration(null);
  updateHud();
  updateArrows(state.pos.x, state.pos.y);
  updateEllipse(state.pos.x, state.pos.y);
  updateQuad(state.pos.x, state.pos.y);
  drawChart();
  drawScatter();
  if (!keepCamera) focusCamera();
}

function updatePresetChrome() {
  const p = state.preset;
  els.presetName.textContent = p.name;
  els.presetTag.textContent = p.tag;
  els.formulaTitle.textContent = p.name;
  els.presetPlain.textContent = p.plain;
  els.behaviorText.textContent = p.behavior;
  els.logisticPanel.hidden = p.id !== 'logistic';
  els.swapStartBtn.hidden = p.id !== 'multipeak';
  els.startX.min = p.domain.x0;
  els.startX.max = p.domain.x1;
  els.startY.min = p.domain.y0;
  els.startY.max = p.domain.y1;
  els.startX.value = state.start.x.toFixed(2);
  els.startY.value = state.start.y.toFixed(2);
  [...els.cards.children].forEach((c, i) => c.classList.toggle('active', i === state.pi));
  [...els.algoSeg.querySelectorAll('button')].forEach((b) => {
    b.classList.toggle('active', b.dataset.algo === state.algo);
  });
  renderFormula();
  drawScatter();
}

function selectPreset(i) {
  stopAuto();
  state.pi = i;
  state.preset = PRESETS[i];
  state.start = { ...state.preset.start };
  state.startIndex = 0;
  state.algo = state.preset.quadratic ? 'newton' : 'damped';
  state.alpha = 1;
  state.speed = 1;
  state.tab = 'f';
  state.userMode = false;
  els.alpha.value = '1';
  els.alphaOut.textContent = '1.00';
  els.speed.value = '1';
  els.speedOut.textContent = '1.0×';
  els.userModeBtn.classList.remove('active');
  els.userModeBtn.textContent = '我来走';
  els.userBanner.hidden = true;
  els.settleBtn.hidden = true;
  els.playBtn.disabled = false;
  els.stepBtn.disabled = false;
  updatePresetChrome();
  rebuildSurface();
  resetRun();
}

function startWalk(to, duration, done) {
  state.walk = {
    from: { ...state.pos },
    to: { ...to },
    t: 0,
    dur: Math.max(60, duration),
    done,
  };
}

function updateWalk(dt, now) {
  const w = state.walk;
  if (!w) return;
  w.t += (dt * 1000) / w.dur;
  const t = clamp(w.t, 0, 1);
  const e = smooth(t);
  const x = lerp(w.from.x, w.to.x, e);
  const y = lerp(w.from.y, w.to.y, e);
  state.pos = { x, y };
  const dx = w.to.x - w.from.x;
  const dy = w.to.y - w.from.y;
  if (Math.hypot(dx, dy) > 1e-6) charForward.set(dx, 0, -dy).normalize();
  const effort = effortAt(x, y);
  charLean = 0.1 + effort * 0.4;
  setCharacterPose(x, y, charForward, charLean);
  animateLimbs(dt, true, effort);
  addTrailPoint(x, y);
  if (now - state.lastHud > 90) {
    state.lastHud = now;
    updateHessian(x, y);
    updateArrows(x, y);
    updateEllipse(x, y);
    updateQuad(x, y);
  }
  if (t >= 1) {
    const cb = w.done;
    state.walk = null;
    animateLimbs(dt, false, effort);
    if (cb) cb();
  }
}

function doStep() {
  if (state.walk || state.userMode) return;
  if (isTerminal()) { showToast('已经到结论了；按 R 重新出发。'); return; }
  const p = state.preset;
  const s = solveStep(p, state.pos.x, state.pos.y, state.algo, state.alpha);
  state.stepInfo = s;
  setStatus('running');
  renderNarration(s);
  const duration = prefersReduced ? 90 : 400 / state.speed;
  startWalk(s.next, duration, () => finishStep(s));
}

function finishStep(s) {
  const p = state.preset;
  state.pos = { ...s.next };
  state.steps += 1;
  state.history.push({ k: state.steps, f: p.f(state.pos.x, state.pos.y), x: state.pos.x, y: state.pos.y });
  const gNext = gradNormAt(state.pos.x, state.pos.y);
  const tol = Math.max(p.gTol, 1e-7);
  if (s.diverged) {
    setStatus('diverged');
  } else if (gNext < tol) {
    setStatus('converged');
  } else if (s.actualLen < 1e-7 || Math.abs(s.improvement) < 1e-12) {
    setStatus(gNext < 1e-3 ? 'converged' : 'stalled');
  } else if (state.steps >= maxIterFor()) {
    setStatus('stalled');
  } else {
    setStatus('ready');
  }
  state.conclusion = isTerminal() ? conclusionSentence() : '';
  if (state.status === 'converged') setGoal(state.pos.x, state.pos.y);
  updateHessian(state.pos.x, state.pos.y);
  updateArrows(state.pos.x, state.pos.y);
  updateEllipse(state.pos.x, state.pos.y);
  updateQuad(state.pos.x, state.pos.y);
  renderNarration(s);
  updateHud();
  drawChart();
  drawScatter();
  rebuildHistoryVisuals();

  if (s.diverged) {
    showToast('裸牛顿这一步会飞出定义域；已夹回边界显示。换成「带阻尼牛顿」再看。', 4200);
  } else if (state.status === 'stalled' && state.algo === 'gradient') {
    showToast('梯度上升步数用尽还没到驻点：它只看坡度，不看曲率。', 3600);
  } else if (state.status === 'converged' && p.id === 'bowl') {
    showToast('二次型上牛顿法一步收敛：一次就命中碗底。', 3000);
  } else if (state.status === 'converged' && p.id === 'saddle') {
    showToast('停在这里，但这是鞍点：梯度为零不等于极值。', 3600);
  }
  if (state.auto) scheduleNextAuto(300 / state.speed);
}

function showToast(msg, ms = 2600) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function updatePlayIcon() {
  els.playBtn.classList.toggle('playing', state.auto);
  els.playBtn.innerHTML = state.auto
    ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="1" fill="currentColor"/><rect x="11.6" y="4" width="3.4" height="12" rx="1" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg>';
  els.playBtn.setAttribute('aria-label', state.auto ? '暂停' : '播放');
}

function scheduleNextAuto(delay) {
  if (!state.auto) return;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    if (!state.auto) return;
    if (isTerminal()) { stopAuto(); return; }
    autoTick();
  }, delay);
}

function autoTick() {
  if (!state.auto) return;
  if (isTerminal()) { stopAuto(); return; }
  if (state.walk) { scheduleNextAuto(120); return; }
  doStep();
}

function toggleAuto() {
  if (state.userMode) { showToast('「我来走」模式请用方向键走。'); return; }
  state.auto = !state.auto;
  updatePlayIcon();
  if (state.auto) {
    if (isTerminal()) resetRun();
    autoTick();
  } else {
    stopAuto();
  }
}

function stopAuto() {
  state.auto = false;
  clearTimeout(state.timer);
  updatePlayIcon();
}

function swapStart() {
  const p = state.preset;
  if (p.id !== 'multipeak' || !MULTI_STARTS.length) return;
  state.startIndex = (state.startIndex + 1) % MULTI_STARTS.length;
  const s = MULTI_STARTS[state.startIndex];
  state.start = { x: s.x, y: s.y };
  els.startX.value = state.start.x.toFixed(2);
  els.startY.value = state.start.y.toFixed(2);
  stopAuto();
  resetRun();
  showToast(`换到「${s.label}」：结果跟着起点变。`, 3000);
}

// ------------------------------------------------------------------ 「我来走」
function simulateNewton(p, start, algo, alpha) {
  let x = start.x;
  let y = start.y;
  let steps = 0;
  let converged = false;
  for (let i = 0; i < 80; i += 1) {
    const s = solveStep(p, x, y, algo, alpha);
    x = s.next.x;
    y = s.next.y;
    steps += 1;
    if (s.diverged) break;
    const g = Math.hypot(...p.grad(x, y));
    if (g < p.gTol || s.actualLen < 1e-7 || Math.abs(s.improvement) < 1e-12) {
      converged = true;
      break;
    }
  }
  return { steps, x, y, converged };
}

function toggleUserMode() {
  stopAuto();
  if (!state.userMode) {
    state.userMode = true;
    els.userBanner.hidden = false;
    els.settleBtn.hidden = false;
    els.userModeBtn.classList.add('active');
    els.userModeBtn.textContent = '退出我来走';
    els.playBtn.disabled = true;
    els.stepBtn.disabled = true;
    resetRun();
    showToast('用方向键选一个方向走一步；走完才显示牛顿会去哪。', 3600);
  } else {
    state.userMode = false;
    els.userBanner.hidden = true;
    els.settleBtn.hidden = true;
    els.userModeBtn.classList.remove('active');
    els.userModeBtn.textContent = '我来走';
    els.playBtn.disabled = false;
    els.stepBtn.disabled = false;
    resetRun();
  }
}

function moveUser(dx, dy) {
  if (!state.userMode || state.walk) return;
  const p = state.preset;
  // 按区域长短边分别取步长：逻辑回归的 β 定义域又扁又长，等比步长会一步出界。
  const stepX = 0.06 * (p.domain.x1 - p.domain.x0);
  const stepY = 0.06 * (p.domain.y1 - p.domain.y0);
  const prev = { ...state.pos };
  let nx = prev.x + dx * stepX;
  let ny = prev.y + dy * stepY;
  if (!inDomain(p, nx, ny)) {
    nx = clamp(nx, p.domain.x0 + stepX * 0.15, p.domain.x1 - stepX * 0.15);
    ny = clamp(ny, p.domain.y0 + stepY * 0.15, p.domain.y1 - stepY * 0.15);
  }
  const len = Math.hypot(nx - prev.x, ny - prev.y);
  if (len < 1e-3) { showToast('到边界了，换个方向。'); return; }
  const ux = (nx - prev.x) / len;
  const uy = (ny - prev.y) / len;
  const fFrom = p.f(prev.x, prev.y);
  const fTo = p.f(nx, ny);
  const delta = p.maximize ? fTo - fFrom : fFrom - fTo;
  const good = delta > 0;
  const wantX = p.maximize ? p.grad(prev.x, prev.y)[0] : -p.grad(prev.x, prev.y)[0];
  const wantY = p.maximize ? p.grad(prev.x, prev.y)[1] : -p.grad(prev.x, prev.y)[1];
  const wn = Math.hypot(wantX, wantY);
  const angle = wn > 1e-9 ? Math.acos(clamp((ux * wantX + uy * wantY) / wn, -1, 1)) : 0;
  state.userSteps += 1;
  startWalk({ x: nx, y: ny }, 200, () => {
    addFootprint(nx, ny, good);
    state.steps = state.userSteps;
    state.history.push({ k: state.steps, f: fTo, x: nx, y: ny });
    rebuildHistoryVisuals();
    const [gx, gy] = p.grad(prev.x, prev.y);
    const [hxx, hxy, hyy] = p.hess(prev.x, prev.y);
    const info = {
      algorithm: 'user',
      g: [gx, gy],
      gNorm: Math.hypot(gx, gy),
      cls: classifyHessian(hxx, hxy, hyy),
      singular: false,
      newtonLen: 0,
      curvSafeLen: 0,
      allowedLen: 0,
      actualLen: len,
      alphaUsed: 1,
      dx: nx - prev.x,
      dy: ny - prev.y,
      next: { x: nx, y: ny },
      outOfDomain: false,
      diverged: false,
      note: good ? `这一步让目标改善了 ${fmt(delta)}` : `这一步让目标变差了 ${fmt(-delta)}`,
      fFrom,
      fTo,
      improvement: delta,
      angle,
      stuck: false,
    };
    const ns = solveStep(p, prev.x, prev.y, 'damped', state.alpha);
    info.newtonLen = ns.newtonLen;
    info.allowedLen = ns.newtonLen;
    state.stepInfo = info;
    state.compare = { from: prev, info: ns };
    state.conclusion = '';
    updateHessian(nx, ny);
    renderNarration(info);
    updateArrows(nx, ny);
    updateEllipse(nx, ny);
    updateQuad(nx, ny);
    updateHud();
    drawChart();
    drawScatter();
    showToast('粉色箭头：牛顿这一步会走到这里。', 2600);
    const path = simulateNewton(p, state.start, 'damped', state.alpha);
    const dist = Math.hypot(nx - path.x, ny - path.y);
    if (dist < 0.16 * Math.hypot(p.domain.x1 - p.domain.x0, p.domain.y1 - p.domain.y0)) {
      settleUser(true);
    }
  });
}

function settleUser(auto = false) {
  if (!state.userMode) return;
  const p = state.preset;
  const path = simulateNewton(p, state.start, 'damped', state.alpha);
  const diag = Math.hypot(p.domain.x1 - p.domain.x0, p.domain.y1 - p.domain.y0);
  const dist = Math.hypot(state.pos.x - path.x, state.pos.y - path.y);
  const reached = dist < 0.2 * diag;
  const msg = reached
    ? (auto ? `你走了 ${state.userSteps} 步到顶，牛顿用了 ${path.steps} 步。` : `你走了 ${state.userSteps} 步，离目标还有 ${dist.toFixed(2)}；牛顿用了 ${path.steps} 步。`)
    : `你走了 ${state.userSteps} 步，还没到顶；牛顿从同一起点用了 ${path.steps} 步。`;
  state.conclusion = msg;
  setLine(els.line3, msg, reached ? 'good' : 'bad');
  showToast(msg, 4600);
}

// ------------------------------------------------------------------ 主题
function applySceneTheme() {
  if (!scene) return;
  theme = THEME[themeName];
  scene.fog.color.setHex(theme.fog);
  if (lights) {
    lights.hemi.color.setHex(theme.hemiSky);
    lights.hemi.groundColor.setHex(theme.hemiGround);
    lights.hemi.intensity = theme.hemiIntensity;
    lights.key.color.setHex(theme.key);
    lights.key.intensity = theme.keyIntensity;
    lights.fill.color.setHex(theme.fill);
    lights.fill.intensity = theme.fillIntensity;
  }
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = null; }
  makeGrid();
  scene.children.forEach((c) => {
    if (c.userData && c.userData.groundKey) {
      c.material.color.setHex(themeName === 'light' ? 0xcfdfda : 0x081820);
      c.material.opacity = themeName === 'light' ? 0.32 : 0.42;
    }
  });
  surfaceStops = theme.surface.map((hex) => new THREE.Color(hex));
  paintSurfaceColors();
  const allContours = [...surfaceMats];
  allContours.forEach((m) => {
    m.color.setHex(theme.contour);
    m.opacity = m.userData.major ? theme.contourMajorOpacity : theme.contourOpacity;
  });
  if (gradArrow) gradArrow.setColor(new THREE.Color(theme.warm));
  if (gradDownArrow) gradDownArrow.setColor(new THREE.Color(theme.rose));
  if (newtonArrow) newtonArrow.setColor(new THREE.Color(theme.accent));
  if (compareArrow) compareArrow.setColor(new THREE.Color(theme.violet));
  if (ellipseLine) ellipseLine.material.color.setHex(theme.warm);
  if (quadMesh) quadMesh.material.color.setHex(theme.accent);
  if (quadWire) quadWire.material.color.setHex(theme.accent);
  if (trailMat) trailMat.color.setHex(theme.accent);
  if (goalMarker) goalMarker.material.color.setHex(theme.accent);
  if (startMarker) startMarker.material.color.setHex(theme.warm);
  footGroup.children.forEach((m) => { /* 脚印保留当时的对错颜色 */ });
  if (mapper) rebuildAxes();
  rebuildHistoryVisuals();
}

function applyTheme(redraw = true) {
  themeName = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  theme = THEME[themeName];
  applySceneTheme();
  if (!redraw) return;
  [...els.cards.children].forEach((card, i) => {
    const cv = card.querySelector('canvas');
    if (cv) drawThumb(cv, PRESETS[i]);
  });
  drawChart();
  drawScatter();
}

// ------------------------------------------------------------------ 交互绑定
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function openIntro() {
  els.intro.classList.remove('hide');
  els.intro.style.display = '';
}
function closeIntro() {
  els.intro.classList.add('hide');
  setTimeout(() => { els.intro.style.display = 'none'; }, 520);
}

function bindUi() {
  els.playBtn.addEventListener('click', toggleAuto);
  els.stepBtn.addEventListener('click', () => { stopAuto(); doStep(); });
  els.fsBtn.addEventListener('click', toggleFullscreen);
  els.helpBtn.addEventListener('click', openIntro);
  els.introGo.addEventListener('click', () => {
    toggleFullscreen();
    closeIntro();
  });
  els.introClose.addEventListener('click', closeIntro);

  els.formulaTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    renderFormula();
  });

  els.algoSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-algo]');
    if (!b) return;
    stopAuto();
    state.algo = b.dataset.algo;
    if (isTerminal()) resetRun();
    updateHud();
    updateArrows(state.pos.x, state.pos.y);
    if (state.algo === 'gradient') showToast('梯度上升只看坡度、不看曲率，通常慢得多。', 3000);
  });

  els.alpha.addEventListener('input', () => {
    state.alpha = Number(els.alpha.value);
    els.alphaOut.textContent = state.alpha.toFixed(2);
    if (isTerminal()) resetRun();
    updateArrows(state.pos.x, state.pos.y);
  });
  els.speed.addEventListener('input', () => {
    state.speed = Number(els.speed.value);
    els.speedOut.textContent = `${state.speed.toFixed(1)}×`;
  });

  els.toggles.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.tg) return;
    state.toggles[t.dataset.tg] = t.checked;
    if (t.dataset.tg === 'contour') surfaceGroup.visible = t.checked;
    if (t.dataset.tg === 'trail') { trailLine.visible = t.checked; if (histGroup) histGroup.visible = t.checked; }
    if (t.dataset.tg === 'quad') { quadMesh.visible = t.checked; quadWire.visible = t.checked; }
    if (t.dataset.tg === 'hess') ellipseLine.visible = t.checked;
    updateArrows(state.pos.x, state.pos.y);
    if (t.checked) {
      if (t.dataset.tg === 'contour') showToast('曲面等高线：线越密，坡越陡。', 2400);
      if (t.dataset.tg === 'hess') showToast('Hessian 椭圆：长轴方向弯得轻，短轴方向弯得重。', 3200);
      if (t.dataset.tg === 'trail') showToast('轨迹：小人走过的路。', 2000);
    }
  });

  els.startX.addEventListener('change', () => {
    const v = Number(els.startX.value);
    if (Number.isFinite(v)) setStartPoint(v, state.start.y, false);
  });
  els.startY.addEventListener('change', () => {
    const v = Number(els.startY.value);
    if (Number.isFinite(v)) setStartPoint(state.start.x, v, false);
  });
  els.resetStartBtn.addEventListener('click', () => {
    state.start = { ...state.preset.start };
    els.startX.value = state.start.x.toFixed(2);
    els.startY.value = state.start.y.toFixed(2);
    stopAuto();
    resetRun();
  });
  els.swapStartBtn.addEventListener('click', swapStart);
  els.userModeBtn.addEventListener('click', toggleUserMode);
  els.settleBtn.addEventListener('click', () => settleUser(false));

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (state.userMode && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      if (k === 'ArrowLeft') moveUser(-1, 0);
      else if (k === 'ArrowRight') moveUser(1, 0);
      else if (k === 'ArrowUp') moveUser(0, 1);
      else moveUser(0, -1);
      return;
    }
    if (k === ' ') { e.preventDefault(); toggleAuto(); }
    else if (k === 'Enter') { e.preventDefault(); stopAuto(); doStep(); }
    else if (k === 'r' || k === 'R') { stopAuto(); resetRun(); }
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === '?' || k === '/') openIntro();
    else if (/^[1-6]$/.test(k)) selectPreset(Number(k) - 1);
  });

  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onScheme = () => {
    if (params.get('theme') === 'light' || params.get('theme') === 'dark') return;
    document.documentElement.dataset.theme = mq.matches ? 'light' : 'dark';
    applyTheme();
  };
  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  else if (mq.addListener) mq.addListener(onScheme);
}

// ------------------------------------------------------------------ 主循环
let lastFrame = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateWalk(dt, now);
  if (!state.walk) {
    const effort = effortAt(state.pos.x, state.pos.y);
    charLean = lerp(charLean, 0.06 + effort * 0.1, 1 - Math.exp(-8 * dt));
    setCharacterPose(state.pos.x, state.pos.y, charForward, charLean);
    animateLimbs(dt, false, effort);
  }
  updateCamera(dt);
  if (now - state.lastHud > 110) {
    state.lastHud = now;
    updateArrows(state.pos.x, state.pos.y);
    updateEllipse(state.pos.x, state.pos.y);
    updateQuad(state.pos.x, state.pos.y);
    updateSceneHud();
  }
  if (pulseMarker && pulseMarker.visible) {
    pulseT += dt;
    const s = 1 + Math.sin(pulseT * 3.4) * 0.16;
    pulseMarker.scale.setScalar(s);
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// 页面上所有数学符号统一走 KaTeX（轴名、图例、图上名签、HUD）。
function renderMathLabels() {
  if (!window.katex) return;
  document.querySelectorAll('[data-tex]').forEach((el) => {
    if (el.dataset.texDone === '1') return;
    window.katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: false, strict: 'ignore' });
    el.dataset.texDone = '1';
  });
}

function init() {
  initThree();
  buildCards();
  bindUi();
  renderMathLabels();
  applySceneTheme();
  state.start = { ...PRESETS[0].start };
  selectPreset(0);
  updatePlayIcon();
  if (!params.get('nointro')) openIntro();
  requestAnimationFrame(frame);
}

init();


