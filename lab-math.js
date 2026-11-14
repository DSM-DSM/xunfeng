// lab-math.js —— 「二元函数求极值实验室」的纯数学层：曲面定义、梯度、Hessian、牛顿步。
// 不依赖 DOM / Three.js，便于单独做数值验收（步数、NaN、是否越界）。

export const DEGENERATE_EPS = 1e-9;

function finite(x) {
  return Number.isFinite(x);
}

export function gaussPeaks(x, y, peaks) {
  let f = 0;
  let gx = 0;
  let gy = 0;
  let hxx = 0;
  let hxy = 0;
  let hyy = 0;
  for (const p of peaks) {
    const dx = x - p.a;
    const dy = y - p.b;
    const r2 = dx * dx + dy * dy;
    const e = p.A * Math.exp(-r2 / p.s2);
    f += e;
    gx += e * (-2 * dx / p.s2);
    gy += e * (-2 * dy / p.s2);
    hxx += e * (4 * dx * dx / (p.s2 * p.s2) - 2 / p.s2);
    hxy += e * (4 * dx * dy / (p.s2 * p.s2));
    hyy += e * (4 * dy * dy / (p.s2 * p.s2) - 2 / p.s2);
  }
  return { f, gx, gy, hxx, hxy, hyy };
}

const MULTI_PEAKS = [
  { A: 2.00, a: 1.15, b: 0.85, s2: 0.55 }, // A：最高的峰
  { A: 1.35, a: -1.35, b: -0.55, s2: 0.85 }, // B：第二座
  { A: 1.05, a: -0.25, b: 1.55, s2: 0.32 }, // C：尖而小的峰
  { A: 0.70, a: 0.95, b: -1.45, s2: 0.50 }, // D：低矮的峰
];

// 默认起点故意放在「次高峰 B」的坡上：牛顿法两步就停住，可它并不是全图最高点。
export const MULTI_STARTS = [
  { label: '次高峰 B · 坡上', x: -1.78, y: -0.72, near: 'B' },
  { label: '最高峰 A · 东边', x: 2.00, y: 1.50, near: 'A' },
  { label: '尖峰 C · 北边', x: -0.35, y: 1.75, near: 'C' },
];

export const PRESETS = [
  {
    id: 'bowl',
    name: '正定二次碗',
    short: '正定碗',
    glyph: 'bowl',
    tag: '唯一极小',
    tone: 'min',
    domain: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6 },
    start: { x: -2.05, y: 1.90 },
    quadratic: true,
    damped: false,
    gTol: 1e-9,
    maxIter: 3,
    f: (x, y) => 0.42 * x * x + 0.18 * x * y + 0.26 * y * y + 0.15 * x - 0.10 * y,
    grad: (x, y) => [0.84 * x + 0.18 * y + 0.15, 0.18 * x + 0.52 * y - 0.10],
    hess: () => [0.84, 0.18, 0.52],
    plain: '四面八方都往上翘，所以碗底就是最低点。',
    plainLong: '这只碗朝所有方向都向上弯。牛顿法在二次型上一步就落到碗底，而且一步不差。',
    behavior: '二次型上牛顿法一步收敛',
    formula: {
      f: String.raw`f(x,y)=0.42x^2+0.18xy+0.26y^2+0.15x-0.10y`,
      grad: String.raw`\nabla f=\begin{pmatrix}0.84x+0.18y+0.15\\0.18x+0.52y-0.10\end{pmatrix}`,
      hess: String.raw`H=\begin{pmatrix}0.84&0.18\\0.18&0.52\end{pmatrix}`,
      iter: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-H^{-1}\nabla f(\mathbf{x}_k)`,
    },
  },
  {
    id: 'dome',
    name: '负定倒扣碗',
    short: '倒扣碗',
    glyph: 'dome',
    tag: '唯一极大',
    tone: 'max',
    domain: { x0: -2.6, x1: 2.6, y0: -2.6, y1: 2.6 },
    start: { x: -2.10, y: 1.80 },
    quadratic: true,
    damped: false,
    maximize: true,
    gTol: 1e-9,
    maxIter: 3,
    f: (x, y) => -0.40 * x * x - 0.14 * x * y - 0.32 * y * y + 0.22 * x - 0.12 * y + 1.8,
    grad: (x, y) => [-0.80 * x - 0.14 * y + 0.22, -0.14 * x - 0.64 * y - 0.12],
    hess: () => [-0.80, -0.14, -0.64],
    plain: '四面八方都往下弯，所以碗顶就是最高点。',
    plainLong: '把它想成一只倒扣的碗：所有方向都向下弯。把梯度取反（改成往上爬），牛顿法同样一步就到碗顶。',
    behavior: '把梯度取反即可求极大',
    formula: {
      f: String.raw`f(x,y)=-0.40x^2-0.14xy-0.32y^2+0.22x-0.12y+1.8`,
      grad: String.raw`\nabla f=\begin{pmatrix}-0.80x-0.14y+0.22\\-0.14x-0.64y-0.12\end{pmatrix}`,
      hess: String.raw`H=\begin{pmatrix}-0.80&-0.14\\-0.14&-0.64\end{pmatrix}`,
      iter: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-H^{-1}\nabla f(\mathbf{x}_k)`,
    },
  },
  {
    id: 'saddle',
    name: '不定鞍点',
    short: '鞍点',
    glyph: 'saddle',
    tag: '无极值',
    tone: 'saddle',
    domain: { x0: -2.3, x1: 2.3, y0: -2.3, y1: 2.3 },
    start: { x: 1.80, y: 1.50 },
    quadratic: true,
    damped: false,
    gTol: 1e-9,
    maxIter: 3,
    f: (x, y) => 0.20 * x * x - 0.20 * y * y + 0.8,
    grad: (x, y) => [0.40 * x, -0.40 * y],
    hess: () => [0.40, 0, -0.40],
    plain: '一个方向向上翘、另一个方向向下弯，所以这里不是最低点，也不是最高点。',
    plainLong: '像马鞍：前后往上翘，左右往下弯。牛顿法照样会把梯度归零、停在鞍点，但停住不等于到达极值。',
    behavior: '驻点不等于极值——牛顿法只找梯度为零处',
    formula: {
      f: String.raw`f(x,y)=0.20x^2-0.20y^2+0.8`,
      grad: String.raw`\nabla f=\begin{pmatrix}0.40x\\-0.40y\end{pmatrix}`,
      hess: String.raw`H=\begin{pmatrix}0.40&0\\0&-0.40\end{pmatrix}`,
      iter: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-H^{-1}\nabla f(\mathbf{x}_k)`,
    },
  },
  {
    id: 'rosenbrock',
    name: 'Rosenbrock 香蕉谷',
    short: '香蕉谷',
    glyph: 'banana',
    tag: '非凸 · 长迭代',
    tone: 'valley',
    domain: { x0: -1.8, x1: 1.8, y0: -0.8, y1: 2.4 },
    start: { x: -1.60, y: -0.65 },
    quadratic: false,
    damped: true,
    gTol: 1e-4,
    maxIter: 60,
    maxStep: 0.85,
    displayWarp: 9,
    f: (x, y) => {
      const a = 1 - x;
      const b = y - x * x;
      return 0.06 * (a * a + 30 * b * b);
    },
    grad: (x, y) => {
      const b = y - x * x;
      return [0.06 * (-2 * (1 - x) - 120 * x * b), 0.06 * (60 * b)];
    },
    hess: (x, y) => {
      const b = y - x * x;
      return [0.06 * (2 - 120 * b + 240 * x * x), 0.06 * (-120 * x), 0.06 * 60];
    },
    plain: '像一条弯弯的香蕉谷，谷底又窄又长；离谷底远时，牛顿法会一脚踩空。',
    plainLong: '谷底是一条弯曲线，不是一只规整的碗。裸牛顿法第一步就能飞出定义域，所以这里必须加阻尼线搜索，把步子收小。',
    behavior: '非二次时牛顿法不再一步到位',
    formula: {
      f: String.raw`f(x,y)=0.06\left[(1-x)^2+30(y-x^2)^2\right]`,
      grad: String.raw`\nabla f=0.06\begin{pmatrix}-2(1-x)-120x(y-x^2)\\60(y-x^2)\end{pmatrix}`,
      hess: String.raw`H=0.06\begin{pmatrix}2-120(y-x^2)+240x^2&-120x\\-120x&60\end{pmatrix}`,
      iter: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-\alpha_k H_k^{-1}\nabla f(\mathbf{x}_k),\quad \alpha_k\ \text{由回溯线搜索给出}`,
    },
  },
  {
    id: 'multipeak',
    name: '多峰山谷',
    short: '多峰',
    glyph: 'peaks',
    tag: '局部方法',
    tone: 'peaks',
    domain: { x0: -2.4, x1: 2.4, y0: -2.4, y1: 2.4 },
    start: { x: MULTI_STARTS[0].x, y: MULTI_STARTS[0].y },
    starts: MULTI_STARTS,
    quadratic: false,
    damped: true,
    maximize: true,
    gTol: 1e-4,
    maxIter: 40,
    maxStep: 0.7,
    f: (x, y) => gaussPeaks(x, y, MULTI_PEAKS).f,
    grad: (x, y) => {
      const s = gaussPeaks(x, y, MULTI_PEAKS);
      return [s.gx, s.gy];
    },
    hess: (x, y) => {
      const s = gaussPeaks(x, y, MULTI_PEAKS);
      return [s.hxx, s.hxy, s.hyy];
    },
    plain: '山上不止一个山头，牛顿法只会走到离起点最近的那一个。',
    plainLong: '四座高度不同的峰。默认从次高峰 B 的坡上出发，两步就停住——可它不是全图最高的那座。',
    behavior: '结果依赖起点，这是局部方法',
    globalNote: '这里是局部极大，不是全局最高——牛顿法只保证找到停下的地方。',
    formula: {
      f: String.raw`f(x,y)=\sum_{i=1}^{4}A_i e^{-\frac{(x-a_i)^2+(y-b_i)^2}{s_i^2}}`,
      grad: String.raw`\nabla f=\sum_{i=1}^{4}A_i e^{-\frac{r_i^2}{s_i^2}}\left(-\frac{2}{s_i^2}\right)\begin{pmatrix}x-a_i\\y-b_i\end{pmatrix}`,
      hess: String.raw`H=\sum_{i=1}^{4}A_i e^{-\frac{r_i^2}{s_i^2}}\left[\frac{4}{s_i^4}\mathbf{u}_i\mathbf{u}_i^\top-\frac{2}{s_i^2}I\right]`,
      iter: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-\alpha_k H_k^{-1}\nabla f(\mathbf{x}_k)`,
    },
  },
];

export function inDomain(p, x, y, margin = 1e-6) {
  return finite(x) && finite(y)
    && x >= p.domain.x0 + margin && x <= p.domain.x1 - margin
    && y >= p.domain.y0 + margin && y <= p.domain.y1 - margin;
}

export function classifyHessian(hxx, hxy, hyy) {
  if (!finite(hxx) || !finite(hxy) || !finite(hyy)) return { kind: 'bad', l1: NaN, l2: NaN };
  const tr = hxx + hyy;
  const det = hxx * hyy - hxy * hxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const root = Math.sqrt(disc);
  const l1 = tr / 2 - root;
  const l2 = tr / 2 + root;
  const scale = Math.max(1, Math.abs(hxx) + Math.abs(hxy) + Math.abs(hyy));
  const eps = DEGENERATE_EPS * scale;
  let kind;
  if (Math.abs(l1) < eps && Math.abs(l2) < eps) kind = 'flat';
  else if (det > eps) kind = l1 > 0 ? 'pd' : 'nd';
  else if (det < -eps) kind = 'indef';
  else kind = 'degenerate';
  return { kind, l1, l2 };
}

const KIND_TEXT = {
  pd: { label: '正定 · 碗', plain: '四面八方都向上翘：附近像碗底。' },
  nd: { label: '负定 · 倒扣', plain: '四面八方都向下弯：附近像倒扣的碗顶。' },
  indef: { label: '不定 · 鞍点', plain: '有的方向向上、有的向下：这里是鞍点。' },
  degenerate: { label: '退化 · 半平', plain: '至少一个方向接近平直，二阶信息不够用。' },
  flat: { label: '全平', plain: '两个方向都接近平直，看不出弯曲。' },
  bad: { label: '无法判断', plain: '数值异常，Hessian 无法判断。' },
};

export function hessianText(kind) {
  return KIND_TEXT[kind] || KIND_TEXT.bad;
}

// 裸牛顿步：不截断、不线搜索，用来对照「会飞出去」。
export function rawNewtonStep(p, x, y) {
  const [hxx, hxy, hyy] = p.hess(x, y);
  const [gx, gy] = p.grad(x, y);
  const det = hxx * hyy - hxy * hxy;
  const scale = Math.max(1, Math.abs(hxx) + Math.abs(hxy) + Math.abs(hyy));
  let dx;
  let dy;
  let fallback = false;
  if (Math.abs(det) < 1e-7 * scale * scale) {
    fallback = true;
    const gn = Math.hypot(gx, gy) || 1;
    dx = -gx / gn * 0.01;
    dy = -gy / gn * 0.01;
  } else {
    dx = -(hyy * gx - hxy * gy) / det;
    dy = -(-hxy * gx + hxx * gy) / det;
  }
  return {
    dx, dy, det, hxx, hxy, hyy, gx, gy,
    length: Math.hypot(dx, dy),
    rawNext: { x: x + dx, y: y + dy },
    fallback,
  };
}

function gradNorm(p, x, y) {
  const [gx, gy] = p.grad(x, y);
  return Math.hypot(gx, gy);
}

function clampToDomain(p, x, y, margin = 1e-5) {
  return {
    x: Math.min(p.domain.x1 - margin, Math.max(p.domain.x0 + margin, x)),
    y: Math.min(p.domain.y1 - margin, Math.max(p.domain.y0 + margin, y)),
  };
}

// 带回溯线搜索与全局步长截断的牛顿步。
// - 二次曲面 (damped=false)：原汁原味的牛顿步，保证「一步到位」。
// - 非二次 (damped=true)：沿 f（或 -f，求极大）做回溯，接受让目标变好的步；
//   走不动时退化为小步最速方向，并把落点夹回定义域，避免 NaN / 飞出视野。
export function newtonStep(p, x, y) {
  const raw = rawNewtonStep(p, x, y);
  let { dx, dy } = raw;
  let alpha = 1;
  let damped = false;
  let reason = '';
  let stuck = false;
  const maximize = !!p.maximize;

  if (!finite(dx) || !finite(dy)) {
    return { next: { x, y }, alpha: 0, diverged: true, raw, gNorm: gradNorm(p, x, y), damped, reason: '步长非有限值', stuck: true };
  }

  const maxStep = p.maxStep ?? Infinity;
  const len = Math.hypot(dx, dy);
  if (len > maxStep) {
    dx *= maxStep / len;
    dy *= maxStep / len;
    damped = true;
    reason = '步长截断';
  }

  if (p.damped) {
    const merit = (xx, yy) => (maximize ? -p.f(xx, yy) : p.f(xx, yy));
    const m0 = merit(x, y);
    let accepted = false;
    for (let k = 0; k < 22; k += 1) {
      const cand = clampToDomain(p, x + alpha * dx, y + alpha * dy);
      if (inDomain(p, cand.x, cand.y)) {
        const m = merit(cand.x, cand.y);
        const g = gradNorm(p, cand.x, cand.y);
        if (finite(m) && (m < m0 - 1e-12 || g < p.gTol * 0.5)) {
          accepted = true;
          break;
        }
      }
      alpha *= 0.5;
    }
    if (!accepted) {
      // 兜底：沿目标变好的方向走一小步（求极大时沿梯度，求极小时逆梯度）。
      const [gx, gy] = p.grad(x, y);
      const gn = Math.hypot(gx, gy) || 1;
      const stepLen = Math.min(0.05, maxStep === Infinity ? 0.05 : maxStep * 0.2);
      const sign = maximize ? 1 : -1;
      const cand = clampToDomain(p, x + sign * gx / gn * stepLen, y + sign * gy / gn * stepLen);
      const m = merit(cand.x, cand.y);
      if (finite(m) && m < m0 - 1e-14) {
        dx = cand.x - x;
        dy = cand.y - y;
        alpha = 1;
        damped = true;
        reason = '线搜索未接受，改为小步最速方向';
      } else {
        stuck = true;
        dx = 0;
        dy = 0;
        alpha = 0;
        reason = '线搜索与兜底都没有下降，停住';
      }
    } else if (alpha < 1) {
      damped = true;
      if (!reason) reason = '回溯线搜索缩小步长';
    }
  }

  const next = clampToDomain(p, x + alpha * dx, y + alpha * dy);
  if (!finite(next.x) || !finite(next.y)) {
    return { next: { x, y }, alpha: 0, diverged: true, raw, gNorm: gradNorm(p, x, y), damped, reason: '结果非有限值', stuck: true };
  }
  return { next, alpha, diverged: false, raw, gNorm: gradNorm(p, x, y), damped, reason, stuck };
}

// ------------------------------------------------------------------ logistic 回归（第 6 个 preset）
// 24 条内置数据，不随机、不可替换；两类在 2.1–4.4 小时重叠，保证 MLE 存在。
export const LOGISTIC_DATA = [
  ...[[0.4, 0], [0.8, 0], [1.1, 0], [1.5, 0], [1.9, 0], [2.2, 0], [2.6, 0], [3.0, 0], [3.2, 0], [3.6, 0], [4.0, 0], [4.4, 0]]
    .map(([x, y]) => ({ x, y })),
  ...[[2.1, 1], [2.6, 1], [3.1, 1], [3.5, 1], [4.0, 1], [4.4, 1], [4.9, 1], [5.3, 1], [5.6, 1], [6.0, 1], [6.4, 1], [6.8, 1]]
    .map(([x, y]) => ({ x, y })),
];

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function logisticSums(b0, b1) {
  let ll = 0;
  let g0 = 0;
  let g1 = 0;
  let h00 = 0;
  let h01 = 0;
  let h11 = 0;
  for (const d of LOGISTIC_DATA) {
    const z = b0 + b1 * d.x;
    // log(1+e^z) 的稳定写法
    const soft = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
    ll += d.y * z - soft;
    const p = sigmoid(z);
    const w = p * (1 - p);
    g0 += d.y - p;
    g1 += (d.y - p) * d.x;
    h00 -= w;
    h01 -= w * d.x;
    h11 -= w * d.x * d.x;
  }
  return { ll, g0, g1, h00, h01, h11 };
}

export function logisticLogL(b0, b1) {
  return logisticSums(b0, b1).ll;
}

PRESETS.push({
  id: 'logistic',
  name: 'logistic 回归',
  short: 'logistic',
  glyph: 'sigmoid',
  tag: '无公式解 · 必收敛',
  tone: 'max',
  domain: { x0: -7, x1: 0.5, y0: -1, y1: 3 },
  start: { x: 0, y: 0 },
  quadratic: false,
  damped: true,
  maximize: true,
  gTol: 1e-6,
  maxIter: 30,
  maxStep: 8,
  peak: -10.9819,
  displayTruncate: 15,
  hessText: {
    nd: { label: '负定 · 唯一山顶', plain: '所有方向都向下弯：整座山只有一座山头。' },
  },
  f: (b0, b1) => logisticSums(b0, b1).ll,
  grad: (b0, b1) => {
    const s = logisticSums(b0, b1);
    return [s.g0, s.g1];
  },
  hess: (b0, b1) => {
    const s = logisticSums(b0, b1);
    return [s.h00, s.h01, s.h11];
  },
  plain: '每多学一小时，天平往「通过」偏一点；山只有一座，所以牛顿法一定收敛，但要走几步。',
  plainLong: '24 个学生的通过/未通过数据。曲面是 logL(β0,β1)，凹函数只有一座山头；牛顿法每一步重新套一只碗，所以要走 5 步左右，不是一步到位。',
  behavior: '凹函数只有一座山头：牛顿法必收敛，但不是一步到位',
  formula: {
    chip: String.raw`\ell(\beta_0,\beta_1)=\sum_{i=1}^{24}\left[y_i z_i-\log(1+e^{z_i})\right]`,
    f: String.raw`\ell(\beta_0,\beta_1)=\sum_{i=1}^{24}\left[y_i(\beta_0+\beta_1x_i)-\log(1+e^{\beta_0+\beta_1x_i})\right]`,
    grad: String.raw`\nabla\ell=\sum_{i=1}^{24}(y_i-p_i)\begin{pmatrix}1\\x_i\end{pmatrix},\quad p_i=\sigma(\beta_0+\beta_1x_i)`,
    hess: String.raw`\nabla^2\ell=-\sum_{i=1}^{24}p_i(1-p_i)\begin{pmatrix}1&x_i\\x_i&x_i^2\end{pmatrix}\prec0`,
    iter: String.raw`\boldsymbol{\beta}_{k+1}=\boldsymbol{\beta}_k-\alpha_k[\nabla^2\ell(\boldsymbol{\beta}_k)]^{-1}\nabla\ell(\boldsymbol{\beta}_k)`,
  },
});

// 显示用的高度范围。logistic 的山脚深达 -190，只画山顶往下 15 个单位，
// 否则山顶附近会被压成平地（显示约定，不是数学变换）。
export function heightInfo(p) {
  const r = heightRange(p, 130);
  let mapLo = r.lo;
  let mapHi = p.peak != null && p.maximize ? Math.max(r.hi, p.peak) : r.hi;
  if (p.displayTruncate) {
    if (p.maximize) mapLo = Math.max(r.lo, mapHi - p.displayTruncate);
    else mapHi = Math.min(r.hi, r.lo + p.displayTruncate);
  }
  return { lo: r.lo, hi: r.hi, mapLo, mapHi, truncated: !!p.displayTruncate };
}

// 统一的一步：算法 = newton（纯） / damped（带回溯） / gradient（梯度上升或下降）。
// 返回方向、按曲率允许的步长、实际步长、α、落点与越界标记，供底栏三行旁白直接使用。
export function solveStep(p, x, y, algorithm = 'newton', alphaCap = 1) {
  const maximize = !!p.maximize;
  const [gx, gy] = p.grad(x, y);
  const gNorm = Math.hypot(gx, gy);
  const [hxx, hxy, hyy] = p.hess(x, y);
  const cls = classifyHessian(hxx, hxy, hyy);
  const det = hxx * hyy - hxy * hxy;
  const scale = Math.max(1, Math.abs(hxx) + Math.abs(hxy) + Math.abs(hyy));
  const singular = Math.abs(det) < 1e-7 * scale * scale;

  let ndx;
  let ndy;
  if (singular) {
    const sgn = maximize ? 1 : -1;
    const n = gNorm || 1;
    ndx = sgn * gx / n * 0.02;
    ndy = sgn * gy / n * 0.02;
  } else {
    ndx = -(hyy * gx - hxy * gy) / det;
    ndy = -(-hxy * gx + hxx * gy) / det;
  }
  const newtonLen = Math.hypot(ndx, ndy);
  const lamMax = Math.max(Math.abs(cls.l1), Math.abs(cls.l2), 1e-9);
  const curvSafeLen = gNorm / lamMax;

  let dx = 0;
  let dy = 0;
  let alphaUsed = 1;
  let allowedLen = newtonLen;
  let note = '';
  let diverted = false;

  if (algorithm === 'gradient') {
    const sgn = maximize ? 1 : -1;
    const k = sgn * alphaCap / lamMax;
    dx = gx * k;
    dy = gy * k;
    allowedLen = curvSafeLen;
    alphaUsed = alphaCap;
    note = maximize ? '沿最陡上坡方向' : '沿最陡下坡方向';
  } else if (algorithm === 'damped' && !p.quadratic) {
    let a = alphaCap;
    const merit = (xx, yy) => (maximize ? -p.f(xx, yy) : p.f(xx, yy));
    const m0 = merit(x, y);
    let accepted = false;
    for (let i = 0; i < 28; i += 1) {
      const nx = x + a * ndx;
      const ny = y + a * ndy;
      if (inDomain(p, nx, ny)) {
        const m = merit(nx, ny);
        const gn = Math.hypot(...p.grad(nx, ny));
        if (finite(m) && (m < m0 - 1e-14 || gn < p.gTol * 0.5)) {
          accepted = true;
          alphaUsed = a;
          break;
        }
      }
      a *= 0.5;
    }
    if (accepted) {
      dx = alphaUsed * ndx;
      dy = alphaUsed * ndy;
      if (alphaUsed < 1) note = '回溯线搜索缩小了步长';
    } else {
      const sgn = maximize ? 1 : -1;
      const gg = gNorm || 1;
      const stepLen = Math.min(0.04, (p.maxStep ?? 1) * 0.05);
      const cand = { x: x + sgn * gx / gg * stepLen, y: y + sgn * gy / gg * stepLen };
      const mc = merit(cand.x, cand.y);
      if (inDomain(p, cand.x, cand.y) && finite(mc) && mc < m0 - 1e-15) {
        dx = cand.x - x;
        dy = cand.y - y;
        alphaUsed = 1;
        diverted = true;
        note = '线搜索没接受，改走小步最速方向';
      } else {
        alphaUsed = 0;
        note = '走不动了：这一步没有让目标变好';
      }
    }
  } else {
    const a = algorithm === 'damped' ? alphaCap : 1;
    alphaUsed = a;
    allowedLen = newtonLen * a;
    dx = a * ndx;
    dy = a * ndy;
  }

  // 只防显示飞出视野；纯牛顿不加截断，好让「裸牛顿会飞出边界」如实发生（落点再夹回显示）。
  let actualLen = Math.hypot(dx, dy);
  if (algorithm !== 'newton') {
    const maxStep = p.maxStep ?? Infinity;
    if (actualLen > maxStep) {
      dx *= maxStep / actualLen;
      dy *= maxStep / actualLen;
      actualLen = maxStep;
      note = note || '步长截断';
    }
  }

  const rawNext = { x: x + dx, y: y + dy };
  let next = rawNext;
  let outOfDomain = false;
  if (!inDomain(p, rawNext.x, rawNext.y, 1e-9)) {
    outOfDomain = true;
    next = clampToDomain(p, rawNext.x, rawNext.y);
  }
  if (!finite(next.x) || !finite(next.y)) {
    next = { x, y };
    outOfDomain = true;
    dx = 0;
    dy = 0;
    actualLen = 0;
  }

  const diverged = algorithm === 'newton' && outOfDomain;
  const fFrom = p.f(x, y);
  const fTo = p.f(next.x, next.y);
  const improvement = maximize ? fTo - fFrom : fFrom - fTo;

  const wantX = maximize ? gx : -gx;
  const wantY = maximize ? gy : -gy;
  const wn = Math.hypot(wantX, wantY);
  let angle = 0;
  if (actualLen > 1e-12 && wn > 1e-12) {
    angle = Math.acos(Math.max(-1, Math.min(1, (dx * wantX + dy * wantY) / (actualLen * wn))));
  }

  return {
    algorithm,
    g: [gx, gy],
    gNorm,
    cls,
    singular,
    newtonDir: [ndx, ndy],
    newtonLen,
    curvSafeLen,
    allowedLen,
    actualLen,
    alphaUsed,
    dx,
    dy,
    next,
    outOfDomain,
    diverged,
    diverted,
    note,
    fFrom,
    fTo,
    improvement,
    angle,
    stuck: alphaUsed === 0,
  };
}

export function domainScale(p) {
  const w = p.domain.x1 - p.domain.x0;
  const h = p.domain.y1 - p.domain.y0;
  return { w, h, diag: Math.hypot(w, h) };
}

export function heightRange(p, n = 120) {
  const { x0, x1, y0, y1 } = p.domain;
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j <= n; j += 1) {
    const y = y0 + (y1 - y0) * j / n;
    for (let i = 0; i <= n; i += 1) {
      const x = x0 + (x1 - x0) * i / n;
      const v = p.f(x, y);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return { lo, hi };
}
