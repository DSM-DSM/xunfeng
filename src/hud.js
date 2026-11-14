// hud.js —— 右侧实时仪表盘：所有统计量 + 中文悬停解释 + 数值平滑过渡。
import { texify } from './tex.js';

// 右侧数值统一格式：最多 3 位有效数字；极端量级用科学计数法并给中文量级提示。
function fmt(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a < 1e-4 || a >= 1e5) {
    const exp = Math.floor(Math.log10(a));
    const mant = v / Math.pow(10, exp);
    const tag = a < 1e-20 ? '极小' : a >= 1e8 ? '极大' : '';
    return `${mant.toPrecision(3)}e${exp}${tag ? `（${tag}）` : ''}`;
  }
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return Number(v.toPrecision(3)).toFixed(1);
  return String(Number(v.toPrecision(3)));
}

// 速度行按参赛者要求固定三位小数（四舍五入），不走上面的有效数字缩写
function fixed3(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toFixed(3);
}

// 每行定义：nums 取原始数值数组，join 拼显示，digits 精度（标量行 digits 为数组也行）
const ROW_DEFS = [
  {
    id: 'lik', label: '似然 <span class="tex" data-tex="L(\\mu)"></span>', digits: 4,
    tip: '似然：在这组参数下，观测到手头这批数据的概率密度。山顶处就是最大似然估计，也就是样本均值。这是单个观测的形状，样本量不改变它；样本量改变的是下方那颗椭圆。此处为真实归一化值；图上的高度是开 n 次根后的可视刻度，山顶位置不变。',
    nums: (d) => [d.lik], join: (a) => fmt(a[0], 4),
  },
  {
    id: 'loglik', label: '对数似然 <span class="tex" data-tex="\\log L(\\mu)"></span>',
    tip: '对数似然：把似然取对数，乘法变加法；曲面从钟形变成抛物碗，曲率（弯曲程度）从此可读。',
    nums: (d) => [d.loglik], join: (a) => fmt(a[0], 2),
  },
  {
    id: 'grad_norm', label: '<span class="tex" data-tex="\\|\\nabla\\log L\\|"></span> 得分长度',
    tip: '得分函数（梯度）的长度：越长说明离山顶越远、坡越陡；走到山顶时恰好为 0。',
    nums: (d) => [d.grad_norm], join: (a) => fmt(a[0], 3),
  },
  {
    id: 'grad', label: '梯度分量 <span class="tex" data-tex="(\\partial_1, \\partial_2)"></span>',
    tip: '得分向量的两个分量：分别是似然曲面沿两个参数方向的坡度，合力方向就是最陡上山路。',
    nums: (d) => [d.grad[0], d.grad[1]], join: (a) => `(${fmt(a[0], 2)}, ${fmt(a[1], 2)})`,
  },
  {
    id: 'speed', label: '速度 参数 / 曲面',
    tip: '左侧：参数在平面上移动的速度；右侧：沿曲面三维空间的实际爬坡速度。单位都是 1/秒。',
    nums: (d) => [d.speed_param, d.speed_surface], join: (a) => `${fixed3(a[0])} / ${fixed3(a[1])}`,
  },
  {
    id: 'mu', label: '当前位置 <span class="tex" data-tex="\\mu"></span>',
    tip: '小人的坐标就是待估参数的两个分量；WASD / 方向键走动即改变参数取值。',
    nums: (d) => [d.mu[0], d.mu[1]], join: (a) => `(${fmt(a[0], 2)}, ${fmt(a[1], 2)})`,
  },
  {
    id: 'newton', label: '牛顿法剩余步数',
    tip: '牛顿法还要几步登顶：本模型的对数似然是二次曲面，一步就精确命中样本均值；0 表示已站在顶上。',
    nums: (d) => [d.newton_remaining_steps], join: (a) => String(Math.round(a[0])), int: true,
  },
  {
    id: 'eig', label: '<span class="tex" data-tex="I"></span> 的特征值 <span class="tex" data-tex="\\lambda_{\\min}, \\lambda_{\\max}"></span>',
    tip: 'Fisher 信息的两个特征值（升序）：分别是椭圆长、短轴方向的曲率。较小的那个方向最“平”，最难估准。',
    nums: (d) => [d.fisher_eigvals[0], d.fisher_eigvals[1]], join: (a) => `${fmt(a[0], 1)} / ${fmt(a[1], 1)}`,
  },
  {
    id: 'semi', label: '椭圆半轴 长 / 短',
    tip: '1σ 置信椭圆的半轴等于 Fisher 信息逆矩阵特征值的平方根：椭圆越小，估计越准；拉长样本量或减小噪声都会让它收缩。',
    nums: (d) => [d.crlb_ellipse.semi_major, d.crlb_ellipse.semi_minor],
    join: (a) => `${fmt(a[0], 3)} / ${fmt(a[1], 3)}`,
  },
];

const MATRIX_DEFS = [
  {
    id: 'hessian', label: 'Hessian 矩阵 <span class="tex" data-tex="\\nabla^2\\log L"></span>',
    tip: '对数似然的二阶导数矩阵（处处相同，等于负的 Fisher 信息）：描述抛物碗每个方向的弯曲程度，碗口朝下。',
  },
  {
    id: 'fisher', label: 'Fisher 信息 <span class="tex" data-tex="I = nS"></span>',
    tip: 'Fisher 信息矩阵等于负的 Hessian：曲率即信息量——某方向越陡，该方向参数估得越准。Fisher 信息与所在位置无关，只随模型与数据量变化。',
  },
];

export class HUD {
  constructor(panelEl) {
    this.root = panelEl;
    this.rows = {};      // id → { def, val, target:[num], shown:[num] }
    this.matrices = {};  // id → { def, cells, target:[num×4], shown:[num×4] }
    this.lastText = {};
    this.#build();
  }

  #section(title) {
    const s = document.createElement('section');
    s.className = 'panel-section';
    const h = document.createElement('h3');
    h.textContent = title;
    s.append(h);
    return s;
  }

  #build() {
    // 标题由 index.html 的 .panel-head 提供，这里不再重复渲染
    const sec = document.createElement('section');
    sec.className = 'panel-section';
    const mkRow = (label, tip) => {
      const row = document.createElement('div');
      row.className = 'stat';
      row.dataset.tip = tip;
      const lab = document.createElement('span');
      lab.className = 'stat-label';
      lab.innerHTML = label;
      const val = document.createElement('span');
      val.className = 'stat-value';
      val.textContent = '—';
      row.append(lab, val);
      return { row, val };
    };

    for (const def of ROW_DEFS) {
      const { row, val } = mkRow(def.label, def.tip);
      sec.append(row);
      this.rows[def.id] = { def, val, el: row, target: null, shown: null };
    }
    for (const def of MATRIX_DEFS) {
      const { row, val } = mkRow(def.label, def.tip);
      // 矩阵行用 2×2 网格展示，不需要右上角那个单值占位符（否则会常驻一个「—」）
      val.remove();
      const grid = document.createElement('div');
      grid.className = 'matrix';
      const cells = [];
      for (let i = 0; i < 4; i++) {
        const c = document.createElement('span');
        c.textContent = '—';
        grid.append(c);
        cells.push(c);
      }
      row.classList.add('stat-matrix');
      row.append(grid);
      sec.append(row);
      this.matrices[def.id] = { def, cells, target: null, shown: null };
    }
    this.root.append(sec);

    // 常驻一行结论：Fisher 信息与小人站在哪里无关
    const note = document.createElement('p');
    note.className = 'panel-note';
    note.textContent = 'Fisher 信息与所在位置无关，只随模型与数据量变化。';
    this.root.append(note);

    // 标签里的数学符号统一走 KaTeX，避免裸文本混进仪表盘
    texify(this.root);
  }

  // 更新目标值（来自 /api/eval 或本地模型）
  setEval(d) {
    if (!d) return;
    for (const id in this.rows) {
      const r = this.rows[id];
      try {
        const t = r.def.nums(d);
        if (t.every((v) => typeof v === 'number' && !Number.isNaN(v))) r.target = t;
      } catch (_) { /* 保持上一个目标 */ }
    }
    for (const id in this.matrices) {
      const m = this.matrices[id];
      const src = d[id];
      if (Array.isArray(src) && Array.isArray(src[0])) {
        m.target = [src[0][0], src[0][1], src[1][0], src[1][1]];
      }
    }
  }

  // 每帧调用：显示值向目标指数逼近，实现平滑过渡
  update(dt) {
    const k = Math.min(1, dt * 8);
    for (const id in this.rows) {
      const r = this.rows[id];
      if (!r.target) continue;
      if (!r.shown) r.shown = r.target.slice();
      let changed = false;
      for (let i = 0; i < r.target.length; i++) {
        const before = r.shown[i];
        r.shown[i] = r.def.int
          ? r.target[i]
          : before + (r.target[i] - before) * k;
        if (r.shown[i] !== before) changed = true;
      }
      const text = r.def.join(r.shown);
      if (changed || this.lastText[id] !== text) {
        r.val.textContent = text;
        this.lastText[id] = text;
      }
    }
    for (const id in this.matrices) {
      const m = this.matrices[id];
      if (!m.target) continue;
      if (!m.shown) m.shown = m.target.slice();
      for (let i = 0; i < 4; i++) {
        m.shown[i] += (m.target[i] - m.shown[i]) * k;
        const text = fmt(m.shown[i], 1);
        if (m.cells[i].textContent !== text) m.cells[i].textContent = text;
      }
    }
  }
}

export { fmt };
