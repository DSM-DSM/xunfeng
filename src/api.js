// api.js —— 所有网络请求封装（SPEC 4.1–4.7）+ 后端不可达时的本地降级模型。
// 任何请求都不会抛出异常：超时 1500ms，失败自动切换到本地数学模型，页面保持可用。

// 后端地址跟随当前页面 origin：换端口 / 局域网 IP 打开时不会静默掉到本地计算。
// 也可用 ?api=http://host:port 显式指定；file:// 打开时回退到本地 8000。
const BASE = (() => {
  const override = new URLSearchParams(location.search).get('api');
  if (override) return override.replace(/\/+$/, '');
  if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
  return 'http://127.0.0.1:8000';
})();
const TIMEOUT_MS = 1500;

// ----------------------------------------------------------------------------
// 2×2 对称矩阵小工具（严格按 SPEC 第 2 节的数学内核）
// ----------------------------------------------------------------------------

function mat2(a, b, c, d) { return [[a, b], [c, d]]; }

function det2(m) { return m[0][0] * m[1][1] - m[0][1] * m[1][0]; }

function inv2(m) {
  const D = det2(m);
  const s = 1 / D;
  return mat2(m[1][1] * s, -m[0][1] * s, -m[1][0] * s, m[0][0] * s);
}

// 对称 2×2 特征值（升序）与 λmax 对应单位特征向量
function eigSym2(m) {
  const a = m[0][0], b = m[0][1], c = m[1][1];
  const mean = (a + c) / 2;
  const diff = Math.sqrt(Math.max(0, (a - c) * (a - c) + 4 * b * b)) / 2;
  const l1 = mean - diff; // λmin
  const l2 = mean + diff; // λmax
  let vx = 1, vy = 0;
  if (Math.abs(b) > 1e-14) {
    vx = b; vy = l2 - a;
  } else {
    vx = c >= a ? 0 : 1; vy = c >= a ? 1 : 0;
  }
  const len = Math.hypot(vx, vy) || 1;
  return { eigvals: [l1, l2], vecMax: [vx / len, vy / len] };
}

function linspace(a, b, n) {
  const out = new Array(n);
  if (n === 1) { out[0] = a; return out; }
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = a + step * i;
  return out;
}

function nearestIndex(arr, v) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - v);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// 种子随机数（LCG）——同 seed 必得同样数据（对齐 SPEC 4.3 副作用约定）
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// 本地降级模型：与 SPEC 第 2 节完全一致的纯前端实现
// ----------------------------------------------------------------------------

export class LocalModel {
  constructor(cfg) {
    this.setConfig(cfg);
  }

  setConfig(cfg) {
    this.sigma1 = cfg.sigma1;
    this.sigma2 = cfg.sigma2;
    this.rho = cfg.rho;
    this.n = cfg.n;
    this.seed = cfg.seed;
    const { sigma1: s1, sigma2: s2, rho: r } = this;
    this.Sigma = mat2(s1 * s1, r * s1 * s2, r * s1 * s2, s2 * s2); // Σ
    this.S = inv2(this.Sigma);                                       // S = Σ⁻¹
    this.nS = mat2(this.n * this.S[0][0], this.n * this.S[0][1],
                   this.n * this.S[1][0], this.n * this.S[1][1]);    // I = nS
    this.crlb = mat2(this.Sigma[0][0] / this.n, this.Sigma[0][1] / this.n,
                     this.Sigma[1][0] / this.n, this.Sigma[1][1] / this.n); // Σ/n
    // 按 seed 重新生成样本
    const rng = makeRng(this.seed);
    const { eigvals, vecMax } = eigSym2(this.Sigma);
    const lam1 = Math.sqrt(Math.max(0, eigvals[0])), lam2 = Math.sqrt(Math.max(0, eigvals[1]));
    // 特征向量正交基：v2 = λmax 方向，v1 为其垂直方向
    const v2 = vecMax;
    const v1 = [-v2[1], v2[0]];
    const pts = [];
    for (let i = 0; i < this.n; i++) {
      const [a, b] = gauss2(rng); // 两个独立标准正态
      const e1 = a * lam1, e2 = b * lam2; // 主轴独立正态
      pts.push([e1 * v1[0] + e2 * v2[0], e1 * v1[1] + e2 * v2[1]]);
    }
    this.points = pts;
    this.logLconst = -this.n * Math.log(2 * Math.PI) - 0.5 * this.n * Math.log(det2(this.Sigma));
    this.refreshStats();
  }

  // 数据变化后重算 x̄ 与峰值对数似然（lik 模式以 logLpeak 为归一化基准）
  refreshStats() {
    let mx = 0, my = 0;
    for (const p of this.points) { mx += p[0]; my += p[1]; }
    this.mean = [mx / this.n, my / this.n];
    this.logLpeak = this.loglikAt(this.mean);
  }

  loglikAt(mu) {
    let acc = 0;
    const S = this.S;
    for (const p of this.points) {
      const d1 = p[0] - mu[0], d2 = p[1] - mu[1];
      const q1 = S[0][0] * d1 + S[0][1] * d2;
      const q2 = S[1][0] * d1 + S[1][1] * d2;
      acc += d1 * q1 + d2 * q2;
    }
    return -0.5 * acc + this.logLconst;
  }

  likAt(mu) { return Math.exp(this.loglikAt(mu) - this.logLpeak); }

  gradAt(mu) {
    const S = this.S;
    const g1 = this.n * (S[0][0] * (this.mean[0] - mu[0]) + S[0][1] * (this.mean[1] - mu[1]));
    const g2 = this.n * (S[1][0] * (this.mean[0] - mu[0]) + S[1][1] * (this.mean[1] - mu[1]));
    return [g1, g2];
  }

  config() {
    return { sigma1: this.sigma1, sigma2: this.sigma2, rho: this.rho, n: this.n, seed: this.seed, mode: 'log' };
  }

  data() {
    return { points: this.points.map((p) => [p[0], p[1]]), mean: [this.mean[0], this.mean[1]], n: this.n };
  }

  surface(mode, nx = 72, ny = 52, half = 4.5) {
    const xs = linspace(this.mean[0] - half, this.mean[0] + half, nx);
    const ys = linspace(this.mean[1] - half, this.mean[1] + half, ny);
    const zs = [];
    let zmin = Infinity, zmax = -Infinity;
    for (let j = 0; j < ny; j++) {
      const row = new Array(nx);
      for (let i = 0; i < nx; i++) {
        const z = mode === 'lik' ? this.likAt([xs[i], ys[j]]) : this.loglikAt([xs[i], ys[j]]);
        row[i] = z;
        if (z < zmin) zmin = z;
        if (z > zmax) zmax = z;
      }
      zs.push(row);
    }
    const peakZ = mode === 'lik' ? 1 : this.logLpeak;
    return {
      mode,
      xs, ys, zs,
      zmin: Math.min(zmin, 0),
      zmax,
      peak: { mu: [this.mean[0], this.mean[1]], z: peakZ },
      mu_range: [
        [this.mean[0] - half, this.mean[0] + half],
        [this.mean[1] - half, this.mean[1] + half],
      ],
    };
  }

  evalReq(payload) {
    const mu = payload.mu || [0, 0];
    const prev = payload.prev || null;
    const dt = Math.min(0.5, Math.max(1e-4, payload.dt || 0.016));
    const mode = payload.mode || 'log';
    const loglik = this.loglikAt(mu);
    const lik = Math.exp(loglik - this.logLpeak);
    const grad = this.gradAt(mu);
    const gn = Math.hypot(grad[0], grad[1]);
    const fisher = this.nS.map((r) => r.slice());
    const hessian = fisher.map((r) => r.map((v) => -v));
    const { eigvals, vecMax } = eigSym2(this.crlb);
    const angleRaw = Math.atan2(vecMax[1], vecMax[0]) * 180 / Math.PI;
    let angle = angleRaw;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const zFun = (m) => (mode === 'lik' ? Math.exp(this.loglikAt(m) - this.logLpeak) : this.loglikAt(m));
    let speedParam = 0, speedSurface = 0, dfDt = 0;
    if (prev) {
      const dPar = Math.hypot(mu[0] - prev[0], mu[1] - prev[1]);
      const dz = zFun(mu) - zFun(prev);
      speedParam = dPar / dt;
      speedSurface = Math.sqrt(dPar * dPar + dz * dz) / dt;
      dfDt = dz / dt;
    }
    return {
      mu: [mu[0], mu[1]],
      loglik, lik,
      grad,
      grad_norm: gn,
      hessian,
      fisher,
      fisher_eigvals: eigSym2(fisher).eigvals,
      crlb: this.crlb.map((r) => r.slice()),
      crlb_ellipse: {
        cx: this.mean[0], cy: this.mean[1], angle_deg: angle,
        semi_major: Math.sqrt(eigvals[1]), semi_minor: Math.sqrt(eigvals[0]),
      },
      uphill_dir: gn < 1e-12 ? [0, 0] : [grad[0] / gn, grad[1] / gn],
      speed_param: speedParam,
      speed_surface: speedSurface,
      df_dt: dfDt,
      newton_next: [this.mean[0], this.mean[1]],
      // 契约用「与峰值点的距离」判定，不是梯度范数
      newton_remaining_steps:
        Math.hypot(mu[0] - this.mean[0], mu[1] - this.mean[1]) < 1e-9 ? 0 : 1,
    };
  }

  paths(from, maxIter = 40) {
    // 牛顿法：二次曲面一步精确收敛
    let start = [from[0], from[1]];
    let g0 = this.gradAt(start);
    let gn0 = Math.hypot(g0[0], g0[1]);
    let newtonPts, newtonIters;
    if (gn0 < 1e-8) {
      newtonPts = [[start[0], start[1], this.loglikAt(start)]];
      newtonIters = 0;
    } else {
      newtonPts = [
        [start[0], start[1], this.loglikAt(start)],
        [this.mean[0], this.mean[1], this.logLpeak],
      ];
      newtonIters = 1;
    }
    // 梯度上升：μ ← μ + η∇logL，η = 0.9 / (n·λmax(S))
    const lamMaxS = eigSym2(this.S).eigvals[1];
    const eta = 0.9 / (this.n * lamMaxS);
    const gradPts = [];
    let m = [start[0], start[1]];
    let iterations = 0;
    let converged = false;
    gradPts.push([m[0], m[1], this.loglikAt(m)]);
    for (let k = 0; k < maxIter; k++) {
      const g = this.gradAt(m);
      if (Math.hypot(g[0], g[1]) < 1e-8) { converged = true; break; }
      m = [m[0] + eta * g[0], m[1] + eta * g[1]];
      iterations++;
      gradPts.push([m[0], m[1], this.loglikAt(m)]);
      if (Math.hypot(this.gradAt(m)[0], this.gradAt(m)[1]) < 1e-8) { converged = true; break; }
    }
    return {
      newton: { points: newtonPts, iterations: newtonIters, converged: true },
      gradient: { points: gradPts, iterations, converged },
    };
  }
}

// Box-Muller：一次生成两个独立标准正态
function gauss2(rng) {
  let u1 = rng(), u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  const r = Math.sqrt(-2 * Math.log(u1));
  const t = 2 * Math.PI * u2;
  return [r * Math.cos(t), r * Math.sin(t)];
}

export const DEFAULT_CONFIG = { sigma1: 1.5, sigma2: 0.6, rho: 0.35, n: 30, seed: 42, mode: 'log' };

// ----------------------------------------------------------------------------
// Api：统一入口。每次请求带 1500ms 超时；失败 → 置 offline 并用本地模型兜底。
// ----------------------------------------------------------------------------

class Api {
  constructor() {
    this.online = null;           // null = 尚未探测，true/false = 探测结果
    this.version = '';
    this.local = new LocalModel(DEFAULT_CONFIG);
    this.statusListeners = [];
    this._inFlight = false;
  }

  onStatus(fn) { this.statusListeners.push(fn); }

  #emitStatus() {
    for (const fn of this.statusListeners) {
      try { fn(this.online, this.version); } catch (_) { /* 忽略 UI 回调错误 */ }
    }
  }

  async #request(path, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, {
        ...init,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  #setOnline(ok, version) {
    const changed = this.online !== ok;
    this.online = ok;
    if (ok && version) this.version = version;
    if (changed) this.#emitStatus();
  }

  // 4.1 GET /api/health
  async getHealth() {
    const d = await this.#request('/api/health', { method: 'GET' });
    const ok = !!(d && d.ok);
    this.#setOnline(ok, d && d.version);
    return ok;
  }

  // 4.2 GET /api/config
  async getConfig() {
    const d = await this.#request('/api/config', { method: 'GET' });
    if (d && typeof d.sigma1 === 'number') {
      this.#setOnline(true, this.version);
      this.local.setConfig(d);
      return { online: true, config: d };
    }
    this.#setOnline(false);
    return { online: false, config: this.local.config() };
  }

  // 4.3 POST /api/config
  async postConfig(partial) {
    const merged = {
      sigma1: partial.sigma1 !== undefined ? partial.sigma1 : this.local.sigma1,
      sigma2: partial.sigma2 !== undefined ? partial.sigma2 : this.local.sigma2,
      rho: partial.rho !== undefined ? partial.rho : this.local.rho,
      n: partial.n !== undefined ? partial.n : this.local.n,
      seed: partial.seed !== undefined ? partial.seed : this.local.seed,
    };
    const d = await this.#request('/api/config', {
      method: 'POST',
      body: JSON.stringify(partial),
    });
    if (d && d.config && Array.isArray(d.mean)) {
      this.#setOnline(true, this.version);
      this.local.setConfig(d.config);
      return { online: true, config: d.config, mean: d.mean, n: d.n };
    }
    this.#setOnline(false);
    this.local.setConfig(merged);
    return { online: false, config: this.local.config(), mean: this.local.mean, n: this.local.n };
  }

  // 4.4 GET /api/data
  async getData() {
    const d = await this.#request('/api/data', { method: 'GET' });
    if (d && Array.isArray(d.points) && Array.isArray(d.mean)) {
      this.#setOnline(true, this.version);
      this.local.points = d.points.slice();
      this.local.n = d.n;
      this.local.refreshStats(); // 换了数据必须重算 x̄ 与 logLpeak，否则 lik 会 >1
      return { online: true, data: d };
    }
    this.#setOnline(false);
    return { online: false, data: this.local.data() };
  }

  // 4.5 GET /api/surface
  async getSurface(mode, nx = 72, ny = 52, half = 4.5) {
    const q = `?mode=${encodeURIComponent(mode)}&nx=${nx}&ny=${ny}&half=${half}`;
    const d = await this.#request('/api/surface' + q, { method: 'GET' });
    if (d && Array.isArray(d.zs) && Array.isArray(d.mu_range)) {
      this.#setOnline(true, this.version);
      return { online: true, surface: this.#likZAxis(d, mode) };
    }
    this.#setOnline(false);
    return { online: false, surface: this.#likZAxis(this.local.surface(mode, nx, ny, half), mode) };
  }

  // F-01：lik 模式换纵轴刻度 z_plot = exp((logL - logL_peak)/n) = (L/L_peak)^(1/n)。
  // 针尖状的似然被摊成看得见的钟形山；山顶位置不变，HUD 里的 L(μ) 仍是真实归一化值。
  #likZAxis(s, mode) {
    if (mode !== 'lik' || !Array.isArray(s.zs)) return s;
    const n = Math.max(1, s.n || this.local.n || 1);
    let zmin = Infinity;
    for (let j = 0; j < s.zs.length; j++) {
      const row = s.zs[j];
      for (let i = 0; i < row.length; i++) {
        const v = Math.pow(Math.max(0, row[i]), 1 / n);
        row[i] = v;
        if (v < zmin) zmin = v;
      }
    }
    // 离峰最近的网格节点按定义置 1，保证峰值精确为 1
    if (s.peak && Array.isArray(s.peak.mu) && Array.isArray(s.xs) && Array.isArray(s.ys)) {
      const i = nearestIndex(s.xs, s.peak.mu[0]);
      const j = nearestIndex(s.ys, s.peak.mu[1]);
      if (s.zs[j] && i >= 0) s.zs[j][i] = 1;
    }
    s.zmin = Math.min(zmin, 1);
    s.zmax = 1;
    return s;
  }

  // 4.6 POST /api/eval —— 主循环 20fps 调用；离线时直接本地同步计算
  async postEval(payload) {
    if (!this.online) {
      return { online: false, eval: this.local.evalReq(payload) };
    }
    const d = await this.#request('/api/eval', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (d && typeof d.loglik === 'number' && Array.isArray(d.grad)) {
      this.#setOnline(true, this.version);
      return { online: true, eval: d };
    }
    this.#setOnline(false);
    return { online: false, eval: this.local.evalReq(payload) };
  }

  // 4.7 GET /api/paths
  async getPaths(from, maxIter = 40) {
    const q = `?from=${from[0]},${from[1]}&max_iter=${maxIter}`;
    const d = await this.#request('/api/paths' + q, { method: 'GET' });
    if (d && d.newton && d.gradient && Array.isArray(d.newton.points) && Array.isArray(d.gradient.points)) {
      this.#setOnline(true, this.version);
      return { online: true, paths: d };
    }
    this.#setOnline(false);
    return { online: false, paths: this.local.paths(from, maxIter) };
  }
}

export const api = new Api();
