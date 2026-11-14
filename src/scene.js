// scene.js —— Three.js 场景：似然曲面、样本点云、x̄ 标记、简笔小人、
// 梯度箭头、1σ 置信椭圆、牛顿/梯度上升演示路径。y 轴向上，参数 μ₁→x、μ₂→z。

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

export const PEAK_H = 3.0; // 曲面峰值视觉高度（两个模式共用，便于平滑过渡）
// 世界横向缩放：把参数域铺得更开，山不再挤在中间；纵轴保持 1，峰值高度单独补偿
const WORLD_SCALE = 1.35;

// 主题调色板：深色沿用原设计；浅色按 lab.css 的色相重调，保证浅底上曲面、椭圆、标注都能分辨
const PALETTES = {
  dark: {
    bg: 0x05070d, floor: 0x070b16,
    gridMajor: 0x2c4870, gridMinor: 0x1b2e4a,
    ramp: ['#123a9e', '#19c8d8', '#f6c453'],
    wire: 0x9ad8ff, wireOpacity: 0.13,
    sample: 0xaee9ff,
    ellipse: 0xf472b6, ellipseFill: 0.28,
    mean: 0xffd166, meanCss: '#ffd166', sigmaCss: '#f9a8d4',
    plate: 'rgba(5, 7, 13, 0.66)', labelShadow: 'rgba(0,0,0,0.8)',
    peak: 0xffe08a,
    arrowGround: 0x67e8f9, arrowSurface: 0xfbbf24,
    hemiSky: 0xbdd7ff, hemiGround: 0x0b1020, hemiIntensity: 0.75,
    dir1Intensity: 1.15,
    dir2: 0x88aaff, dir2Intensity: 0.35,
    newton: 0xfb923c, gradient: 0xe879f9,
    surfaceOpacity: 0.86,
  },
  light: {
    // 浅色：仍用「低=冷蓝、中=青、高=暖琥珀」的语义，但压明度、提饱和；
    // 否则在浅底上会被环境光洗成一片米白，色带分不出高低
    bg: 0xf2f6fa, floor: 0xe7eef7,
    gridMajor: 0x7891ad, gridMinor: 0xaec2d6,
    ramp: ['#4f9fd6', '#127f96', '#b06a0d'],
    wire: 0x2b6f9e, wireOpacity: 0.18,
    sample: 0x1b4f8a,
    ellipse: 0xb0185a, ellipseFill: 0.22,
    mean: 0x7a4f00, meanCss: '#7a4f00', sigmaCss: '#a1124f',
    plate: 'rgba(255, 255, 255, 0.86)', labelShadow: 'rgba(255,255,255,0.95)',
    peak: 0x8a5c00,
    arrowGround: 0x0b7f9e, arrowSurface: 0x8a5200,
    // 浅底不需要高亮度：过曝会把色带压成白色，环境光和主光一起降下来
    hemiSky: 0xffffff, hemiGround: 0xdfeaf6, hemiIntensity: 0.8,
    dir1Intensity: 0.5,
    dir2: 0xffffff, dir2Intensity: 0.18,
    newton: 0xc8500f, gradient: 0x6d28d9,
    surfaceOpacity: 1,
  },
};

// 高度着色：深蓝 → 青 → 暖黄（色带由当前主题提供）
function rampColor(t, out, ramp) {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.5) return out.copy(ramp[0]).lerp(ramp[1], x * 2);
  return out.copy(ramp[1]).lerp(ramp[2], (x - 0.5) * 2);
}

// 文字精灵：默认沿用 160×80 画布；autoWidth 时长文案按实际字宽撑开画布，避免被裁掉
function makeLabelSprite(text, cssColor, opts = {}) {
  const { fontSize = 44, autoWidth = false, worldWidth = 0.72, plate = false } = opts;
  const font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  let w = 160, h = 80;
  if (autoWidth) {
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    w = Math.ceil(probe.measureText(text).width) + 24;
    h = Math.ceil(fontSize * 1.8);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 2;

  // 重绘入口：换主题只改颜色与背板，不重建精灵、不丢位置
  const paint = ({
    color = cssColor,
    plateBg = 'rgba(5, 7, 13, 0.66)',
    shadow = 'rgba(0,0,0,0.8)',
  } = {}) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (plate) {
      const padX = 8, padY = Math.round(fontSize * 0.22);
      const r = Math.round(h * 0.28);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(padX, padY, w - padX * 2, h - padY * 2, r);
      else ctx.rect(padX, padY, w - padX * 2, h - padY * 2);
      ctx.fillStyle = plateBg;
      ctx.fill();
    }
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  };
  paint();

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(worldWidth, (worldWidth * h) / w, 1);
  spr.renderOrder = 5;
  spr.userData.paint = paint;
  return spr;
}

export class LikelihoodScene {
  constructor(container) {
    this.container = container;
    this.blend = 0;          // 0 = logL 抛物碗，1 = L 钟形山
    this.blendTarget = 0;
    this.blendSpeed = 1 / 1.15; // 约 1.15s 完成切换
    this.clock = 0;
    this.follow = false;
    this.userMoved = false;    // 用户一旦自己转动镜头，就不再自动重新居中
    this.theme = 'dark';
    this.pal = PALETTES.dark;
    this.ramp = this.pal.ramp.map((c) => new THREE.Color(c));

    this.scene = new THREE.Scene();
    // 除文字精灵外，所有三维物件都挂在这个横向放大的组里
    this.world = new THREE.Group();
    this.world.scale.set(WORLD_SCALE, 1, WORLD_SCALE);
    this.scene.add(this.world);
    this.scene.fog = new THREE.Fog(this.pal.bg, 24, 52);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(this.pal.bg, 1);
    container.appendChild(this.renderer.domElement);

    // 标注层：所有数学标注都走 KaTeX 渲染成 HTML，再由每帧投影贴到三维锚点上。
    // 直接画在 canvas 里时 x̄ / μ₁ / 1σ 只能靠字体回退，常常缺字或错位。
    this.labelsEl = document.createElement('div');
    this.labelsEl.className = 'scene-labels';
    container.appendChild(this.labelsEl);
    this.htmlLabels = [];
    this.axisLabels = [];

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.46;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 45;
    this.controls.addEventListener('start', () => { this.userMoved = true; });

    this.#buildLights();
    this.#buildStatic();
    this.#buildActors();

    this.ro = new ResizeObserver(() => this.#resize());
    this.ro.observe(container);
    this.#resize();
  }

  // ---------------------------------------------------------------- 基础场景

  // 生成一个 KaTeX 标注并绑定到三维锚点；每帧由 #updateLabels 投影到屏幕坐标
  #addHtmlLabel(tex, { cls = '', plate = false, color = '', anchor }) {
    const el = document.createElement('div');
    el.className = `scene-label ${cls}${plate ? ' scene-label-plate' : ''}`;
    if (color) el.style.color = color;
    const katex = window.katex;
    if (katex) {
      katex.render(tex, el, { throwOnError: false, strict: 'ignore', displayMode: false });
    } else {
      el.textContent = tex;
    }
    this.labelsEl.appendChild(el);
    const rec = { el, anchor, hidden: false };
    this.htmlLabels.push(rec);
    return rec;
  }

  // 把每个标注锚点投影到画布坐标；HTML 始终朝向镜头，旋转后也保持可读
  #updateLabels() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || this.container.clientWidth;
    const h = canvas.clientHeight || this.container.clientHeight;
    if (!w || !h) return;
    const v = new THREE.Vector3();
    for (const rec of this.htmlLabels) {
      if (rec.hidden) { rec.el.style.display = 'none'; continue; }
      rec.anchor.getWorldPosition(v);
      v.project(this.camera);
      if (v.z > 1) { rec.el.style.display = 'none'; continue; }
      rec.el.style.display = '';
      rec.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      rec.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    }
  }

  #buildLights() {
    this.hemi = new THREE.HemisphereLight(this.pal.hemiSky, this.pal.hemiGround, this.pal.hemiIntensity);
    this.scene.add(this.hemi);
    this.dir1 = new THREE.DirectionalLight(0xffffff, this.pal.dir1Intensity ?? 1.15);
    this.dir1.position.set(6, 11, 4);
    this.scene.add(this.dir1);
    this.dir2 = new THREE.DirectionalLight(this.pal.dir2, this.pal.dir2Intensity);
    this.dir2.position.set(-7, 5, -6);
    this.scene.add(this.dir2);
  }

  #buildStatic() {
    // 远景地板
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ color: this.pal.floor })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.03;
    this.scene.add(this.floor);

    this.gridHelper = null;
    this.samples = null;
    this.meanMark = new THREE.Group(); // x̄ 十字 + 峰顶连线 + 标签
    this.world.add(this.meanMark);
    this.meanAnchor = new THREE.Object3D();
    this.scene.add(this.meanAnchor);
    this.labelMean = this.#addHtmlLabel('\\bar{x}', {
      cls: 'scene-label-mean', plate: true, color: this.pal.meanCss, anchor: this.meanAnchor,
    });
    this.labelMean.hidden = true;

    this.ellipse = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      // depthTest:false + 高 renderOrder：椭圆是画在底面的标注，必须能透过曲面看到
      new THREE.LineBasicMaterial({ color: this.pal.ellipse, transparent: true, opacity: 1, depthTest: false })
    );
    this.ellipse.renderOrder = 3;
    this.world.add(this.ellipse);

    // 椭圆内部的半透明填充：深色背景上单靠 1px 线框看不清
    this.ellipseFill = new THREE.Group();
    this.ellipseFill.renderOrder = 3;
    this.ellipseDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({
        color: this.pal.ellipse, transparent: true, opacity: this.pal.ellipseFill, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      })
    );
    this.ellipseDisc.rotation.x = -Math.PI / 2;
    this.ellipseFill.add(this.ellipseDisc);
    this.world.add(this.ellipseFill);
    this.sigmaAnchor = new THREE.Object3D();
    this.scene.add(this.sigmaAnchor);
    this.labelSigma = this.#addHtmlLabel('1\\sigma', {
      cls: 'scene-label-sigma', plate: true, color: this.pal.sigmaCss, anchor: this.sigmaAnchor,
    });
    this.labelSigma.hidden = true;

    this.peakDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({ color: this.pal.peak })
    );
    this.world.add(this.peakDot);
  }

  #buildActors() {
    // 简笔小人：球头 + 胶囊身体
    this.person = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xfb7185 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffe4e8 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.17, 6, 14), bodyMat);
    this.body.position.y = 0.17;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 14), headMat);
    this.head.position.y = 0.44;
    this.person.add(this.body, this.head);
    this.personMu = [0, 0];
    this.world.add(this.person);

    // 梯度箭头：底面投影 + 曲面切向
    this.arrowGround = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 0.8, this.pal.arrowGround, 0.18, 0.1);
    this.arrowSurface = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.8, this.pal.arrowSurface, 0.2, 0.11);
    this.arrowGround.cone.material.transparent = true;
    this.arrowGround.cone.material.opacity = 0.9;
    this.world.add(this.arrowGround, this.arrowSurface);

    // 演示路径容器
    this.paths = { newton: null, gradient: null };
    this.pathDefs = {
      newton: { color: this.pal.newton },
      gradient: { color: this.pal.gradient },
    };
  }

  // ---------------------------------------------------------------- 世界重建

  setWorld({ samples, mean, surfLog, surfLik, n }) {
    this.mean = [mean[0], mean[1]];
    this.surfN = n || 1;
    this.surf = { log: this.#normalizeSurface(surfLog, 'log'), lik: this.#normalizeSurface(surfLik, 'lik') };
    this.peakLog = surfLog.peak ? surfLog.peak.z : 0;

    this.#buildSurfaceMesh();
    this.#buildSamples(samples);
    this.#buildMeanMark();
    this.#buildAxes();
    this.updateHeights();

    // 相机取景：以曲面包围盒为准重新构图，保证曲面落在可视区正中
    if (!this.userMoved) this.fitView();
  }

  // ---------------------------------------------------------------- 主题

  // 切换调色板：只改材质色、灯光、雾与画布底色，不重建几何、不移动精灵
  setTheme(theme) {
    const key = theme === 'light' ? 'light' : 'dark';
    if (key === this.theme) return;
    this.theme = key;
    this.#applyPalette();
  }

  #applyPalette() {
    const p = PALETTES[this.theme];
    this.pal = p;
    this.ramp = p.ramp.map((c) => new THREE.Color(c));

    this.renderer.setClearColor(p.bg, 1);
    if (this.scene.fog) this.scene.fog.color.setHex(p.bg);

    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.dir1.intensity = p.dir1Intensity ?? 1.15;
    this.dir2.color.setHex(p.dir2);
    this.dir2.intensity = p.dir2Intensity;

    this.floor.material.color.setHex(p.floor);

    if (this.surfaceMesh) {
      this.surfaceMesh.material.opacity = p.surfaceOpacity;
      this.wireMesh.material.color.setHex(p.wire);
      this.wireMesh.material.opacity = p.wireOpacity;
    }
    if (this.samples) this.samples.material.color.setHex(p.sample);

    this.ellipse.material.color.setHex(p.ellipse);
    this.ellipseDisc.material.color.setHex(p.ellipse);
    this.ellipseDisc.material.opacity = p.ellipseFill;

    if (this.meanMark.children.length) {
      for (const c of this.meanMark.children) {
        if (c.material) c.material.color.setHex(p.mean);
        if (c.material && c.material.opacity !== undefined && c.material.opacity < 0.5) c.material.opacity = 0.28;
      }
    }

    this.peakDot.material.color.setHex(p.peak);
    this.arrowGround.setColor(new THREE.Color(p.arrowGround));
    this.arrowSurface.setColor(new THREE.Color(p.arrowSurface));
    this.pathDefs.newton.color = p.newton;
    this.pathDefs.gradient.color = p.gradient;
    // 已经画出来的路径也要跟着换色（切主题时路径可能还在场上）
    for (const kind of ['newton', 'gradient']) {
      const path = this.paths[kind];
      if (!path) continue;
      path.line.material.color.setHex(this.pathDefs[kind].color);
      path.sphereMat.color.setHex(this.pathDefs[kind].color);
      path.head.material.color.setHex(this.pathDefs[kind].color);
    }

    this.labelMean.el.style.color = p.meanCss;
    this.labelSigma.el.style.color = p.sigmaCss;
    for (const rec of [this.labelMean, this.labelSigma]) {
      rec.el.style.background = p.plate;
      rec.el.style.textShadow = `0 1px 6px ${p.labelShadow}`;
    }

    this.#buildGrid();
    this.#buildAxes();
    if (this.surf) this.updateHeights();
  }

  #normalizeSurface(surf, mode) {
    const nx = surf.xs.length, ny = surf.ys.length;
    const grid = new Float32Array(nx * ny);
    const nSamp = Math.max(1, this.surfN);
    if (mode === 'log') {
      // 固定参考深度，不按网格 min/max 归一化（否则 n 变化时曲面高度恒等）：
      //   quad = -2(logL - logL_peak)/n     ← 与 n 无关
      //   D    = 0.5 · 30 · quad_max        ← 30 是固定基准样本量，不随滑块变
      //   h    = clamp((logL - logL_peak)/D, -1, 0)
      // 于是 n=30 时碗底正好落到 0；n 越大碗越深，n 越小碗越浅。
      const peak = surf.peak ? surf.peak.z : surf.zmax;
      let quadMax = 0;
      for (let j = 0; j < ny; j++) {
        const row = surf.zs[j];
        for (let i = 0; i < nx; i++) {
          const q = (-2 * (row[i] - peak)) / nSamp;
          if (q > quadMax) quadMax = q;
        }
      }
      const D = Math.max(1e-12, 0.5 * 30 * quadMax);
      this.logDepth = D;
      for (let j = 0; j < ny; j++) {
        const row = surf.zs[j];
        for (let i = 0; i < nx; i++) {
          const h = Math.min(0, Math.max(-1, (row[i] - peak) / D));
          grid[j * nx + i] = 1 + h; // h∈[-1,0] → 峰顶 1、碗底 0
        }
      }
    } else {
      // 接口给的是 L(μ)/L(x̄) ∈ (0,1]；画到屏幕上是它的 n 次根，
      // 与演示路径的高度换算、右上角「似然 L^(1/n)」标注保持一致：
      //   h = (L/L_peak)^(1/n) = exp(-½ (μ-x̄)ᵀ Σ⁻¹ (μ-x̄))，与 n 无关
      for (let j = 0; j < ny; j++) {
        const row = surf.zs[j];
        for (let i = 0; i < nx; i++) {
          grid[j * nx + i] = Math.pow(Math.min(1, Math.max(0, row[i])), 1 / nSamp);
        }
      }
    }
    return { nx, ny, grid, mu_range: surf.mu_range, xs: surf.xs, ys: surf.ys };
  }

  #buildSurfaceMesh() {
    if (this.surfaceMesh) {
      this.world.remove(this.surfaceMesh, this.wireMesh);
      this.surfaceMesh.geometry.dispose();
      this.wireMesh.geometry.dispose();
    }
    const { nx, ny } = this.surf.log;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nx * ny * 3);
    const col = new Float32Array(nx * ny * 3);
    const idx = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      // 半透明：让底面的样本点云、x̄ 十字、1σ 椭圆透出来（否则全被山体挡住）
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      side: THREE.DoubleSide,
    });
    this.surfaceMesh = new THREE.Mesh(geo, mat);
    this.surfaceMesh.renderOrder = 1;
    const wireMat = new THREE.MeshBasicMaterial({
      wireframe: true, color: 0x9ad8ff, transparent: true, opacity: 0.13, depthWrite: false,
    });
    this.wireMesh = new THREE.Mesh(geo, wireMat);
    this.wireMesh.renderOrder = 2;
    this.world.add(this.surfaceMesh, this.wireMesh);
  }

  #buildSamples(samples) {
    if (this.samples) {
      this.world.remove(this.samples);
      this.samples.geometry.dispose();
    }
    const n = samples.length;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos[k * 3] = samples[k][0];
      pos[k * 3 + 1] = 0.045;
      pos[k * 3 + 2] = samples[k][1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.samples = new THREE.Points(geo, new THREE.PointsMaterial({
      color: this.pal.sample, size: 0.09, transparent: true, opacity: 1, depthTest: false,
    }));
    this.samples.renderOrder = 3;
    this.world.add(this.samples);

    this.#buildGrid();
  }

  // 底面参考网格：随数据范围重建，颜色随主题（浅色下需要更深的线才看得见）
  #buildGrid() {
    if (this.gridHelper) {
      this.world.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      this.gridHelper.material.dispose();
      this.gridHelper = null;
    }
    if (!this.surf || !this.mean) return;
    const { xs, ys, nx, ny } = this.surf.log;
    // 网格与曲面同宽：以前比曲面每边多出 0.3，斜视时网格会先撞到画布边缘，
    // 看上去像「曲面贴着一边」。对齐后整块地形与网格的边界重合。
    const size = Math.max(
      Math.abs(xs[nx - 1] - xs[0]),
      Math.abs(ys[ny - 1] - ys[0])
    );
    const cx = (xs[0] + xs[nx - 1]) / 2;
    const cz = (ys[0] + ys[ny - 1]) / 2;
    this.gridHelper = new THREE.GridHelper(size, Math.round(size * 2), this.pal.gridMajor, this.pal.gridMinor);
    this.gridHelper.position.set(cx, 0.001, cz);
    this.world.add(this.gridHelper);
  }

  #buildMeanMark() {
    while (this.meanMark.children.length) {
      const c = this.meanMark.children.pop();
      if (c.geometry) c.geometry.dispose();
    }
    const [mx, mz] = this.mean;
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 });
    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mx - 0.22, 0.03, mz), new THREE.Vector3(mx + 0.22, 0.03, mz),
        new THREE.Vector3(mx, 0.03, mz - 0.22), new THREE.Vector3(mx, 0.03, mz + 0.22),
      ]), mat
    );
    const stemMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28 });
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mx, 0.05, mz), new THREE.Vector3(mx, PEAK_H, mz),
      ]), stemMat
    );
    this.meanMark.add(cross, stem);
    // x̄ 贴在峰顶左上方（fitView 会按当前相机再校正一次方向）：
    // 峰顶是最高的点，label 放在包围盒上沿附近，既不被山体挡住也不会顶出画面
    this.meanAnchor.position.set(mx * WORLD_SCALE - 0.58, PEAK_H + 0.08, mz * WORLD_SCALE);
    this.labelMean.hidden = false;
    this.peakDot.position.set(mx, PEAK_H, mz);
    // 峰顶高度按当前 blend 微调（updateHeights 内维护）
  }

  // ---------------------------------------------------------------- 坐标轴

  // x = μ₁（参数）、y = logL（函数值）、z = μ₂（参数）
  // 轴名与刻度都走 KaTeX 标注层：始终朝向镜头，转动视角后仍然可读
  #buildAxes() {
    // 重建前先清掉上一轮的 HTML 标注（KaTeX 文本）
    if (this.axisLabels && this.axisLabels.length) {
      const drop = new Set(this.axisLabels);
      for (const rec of this.axisLabels) rec.el.remove();
      this.htmlLabels = this.htmlLabels.filter((rec) => !drop.has(rec));
      this.axisLabels = [];
    }
    if (this.axesGroup) {
      this.scene.remove(this.axesGroup);
      this.axesGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      this.axesGroup = null;
    }
    if (!this.surf || !this.mean) return;
    const { xs, ys, nx, ny } = this.surf.log;
    const S = WORLD_SCALE;
    const x0 = Math.min(xs[0], xs[nx - 1]) * S, x1 = Math.max(xs[0], xs[nx - 1]) * S;
    const z0 = Math.min(ys[0], ys[ny - 1]) * S, z1 = Math.max(ys[0], ys[ny - 1]) * S;
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: this.pal.wire, transparent: true, opacity: 0.6 });
    const top = PEAK_H * 1.05;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, 0, z1, x1, 0, z1,
      x1, 0, z0, x1, 0, z1,
      x1, 0, z1, x1, top, z1,
    ], 3));
    g.add(new THREE.LineSegments(geo, mat));

    const tk = 0.07;
    const ticks = [];
    for (let k = 0; k <= 4; k++) {
      const x = x0 + ((x1 - x0) * k) / 4;
      ticks.push(x, 0, z1 - tk, x, 0, z1 + tk);
      const z = z0 + ((z1 - z0) * k) / 4;
      ticks.push(x1 - tk, 0, z, x1 + tk, 0, z);
      const y = (top * k) / 4;
      ticks.push(x1 - tk, y, z1, x1 + tk, y, z1);
    }
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
    g.add(new THREE.LineSegments(tgeo, mat));

    const css = `#${this.pal.sample.toString(16).padStart(6, '0')}`;
    const label = (tex, px, py, pz, cls = 'scene-label-axis') => {
      const anchor = new THREE.Object3D();
      anchor.position.set(px, py, pz);
      g.add(anchor);
      // 刻度用 CSS 的弱化色；轴名用当前调色板的采样点色，深浅主题都能分辨
      const color = cls === 'scene-label-tick' ? '' : css;
      this.axisLabels.push(this.#addHtmlLabel(tex, { cls, color, anchor }));
    };
    const tickText = (v) => String(Math.round(v) === 0 ? 0 : Math.round(v));
    label('\\mu_1', x1 + 0.72, 0.1, z1);
    label('\\mu_2', x1, 0.1, z0 - 0.78);
    label('\\log L', x1 + 0.08, top + 0.52, z1);
    for (let k = 0; k <= 4; k += 2) {
      const dx = xs[0] + ((xs[nx - 1] - xs[0]) * k) / 4;
      label(tickText(dx), dx * S, 0.14, z1 + 0.34, 'scene-label-tick');
      const dz = ys[0] + ((ys[ny - 1] - ys[0]) * k) / 4;
      label(tickText(dz), x1 + 0.34, 0.14, dz * S, 'scene-label-tick');
    }
    this.scene.add(g);
    this.axesGroup = g;
  }

  // ---------------------------------------------------------------- 高度场

  #bilinear(s, m1, m2) {
    const [x0, x1] = s.mu_range[0];
    const [y0, y1] = s.mu_range[1];
    const fx = ((m1 - x0) / (x1 - x0)) * (s.nx - 1);
    const fy = ((m2 - y0) / (y1 - y0)) * (s.ny - 1);
    const cx = Math.min(s.nx - 1.001, Math.max(0, fx));
    const cy = Math.min(s.ny - 1.001, Math.max(0, fy));
    const i = Math.floor(cx), j = Math.floor(cy);
    const tx = cx - i, ty = cy - j;
    const g = s.grid, nx = s.nx;
    const z00 = g[j * nx + i], z10 = g[j * nx + i + 1];
    const z01 = g[(j + 1) * nx + i], z11 = g[(j + 1) * nx + i + 1];
    return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
  }

  // 任意 μ 处的曲面视觉高度（含当前模式混合）
  heightAt(mu, blend = this.blend) {
    const hl = this.#bilinear(this.surf.log, mu[0], mu[1]);
    const hk = this.#bilinear(this.surf.lik, mu[0], mu[1]);
    return (hl * (1 - blend) + hk * blend) * PEAK_H;
  }

  // 由 logL 值换算视觉高度（用于演示路径点），与 updateHeights 的固定参考深度一致
  heightFromLog(loglik, blend = this.blend) {
    const hl = Math.min(1, Math.max(0, 1 + (loglik - this.peakLog) / Math.max(1e-12, this.logDepth)));
    const hk = Math.min(1, Math.max(0, Math.pow(Math.max(0, Math.exp(loglik - this.peakLog)), 1 / this.surfN)));
    return (hl * (1 - blend) + hk * blend) * PEAK_H;
  }

  updateHeights() {
    const { nx, ny } = this.surf.log;
    const gl = this.surf.log.grid, gk = this.surf.lik.grid;
    const posAttr = this.surfaceMesh.geometry.getAttribute('position');
    const colAttr = this.surfaceMesh.geometry.getAttribute('color');
    const xs = this.surf.log.xs, ys = this.surf.log.ys;
    const b = this.blend;
    const c = new THREE.Color();
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const t = gl[k] * (1 - b) + gk[k] * b;
        posAttr.setXYZ(k, xs[i], t * PEAK_H, ys[j]);
        rampColor(t, c, this.ramp);
        colAttr.setXYZ(k, c.r, c.g, c.b);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.surfaceMesh.geometry.computeVertexNormals();
    this.surfaceMesh.geometry.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- 演员更新

  setPerson(mu) {
    this.personMu = [mu[0], mu[1]];
  }

  setGradient(evalData) {
    if (!evalData) return;
    const gn = evalData.grad_norm || 0;
    const u = evalData.uphill_dir || [0, 0];
    const len = Math.min(1.6, Math.max(0.3, 0.45 * Math.log10(1 + Math.max(0, gn))));
    const show = gn > 1e-6 && (Math.abs(u[0]) + Math.abs(u[1])) > 1e-8;
    this.arrowGround.visible = show;
    this.arrowSurface.visible = show;
    if (!show) return;
    const [m1, m2] = this.personMu;
    // 底面投影箭头
    this.arrowGround.position.set(m1, 0.07, m2);
    this.arrowGround.setDirection(new THREE.Vector3(u[0], 0, u[1]).normalize());
    this.arrowGround.setLength(len, 0.16 + len * 0.1, 0.09);
    // 曲面切向箭头：沿上山方向在曲面上前进一小段
    const eps = 0.05;
    const p0 = new THREE.Vector3(m1, this.heightAt([m1, m2]) + 0.1, m2);
    const p1 = new THREE.Vector3(
      m1 + u[0] * eps, this.heightAt([m1 + u[0] * eps, m2 + u[1] * eps]) + 0.1, m2 + u[1] * eps);
    const dir = p1.clone().sub(p0);
    if (dir.lengthSq() > 1e-10) {
      this.arrowSurface.position.copy(p0);
      this.arrowSurface.setDirection(dir.normalize());
      this.arrowSurface.setLength(len, 0.18 + len * 0.1, 0.1);
    }
  }

  setEllipse(e) {
    if (!e) return;
    const seg = 96;
    const pos = new Float32Array((seg + 1) * 3);
    const th = (e.angle_deg || 0) * Math.PI / 180;
    const ct = Math.cos(th), st = Math.sin(th);
    const a = Math.max(1e-4, e.semi_major || 0.01);
    const b = Math.max(1e-4, e.semi_minor || 0.01);
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const dx = a * Math.cos(t), dy = b * Math.sin(t);
      pos[i * 3] = e.cx + dx * ct - dy * st;
      pos[i * 3 + 1] = 0.05;
      pos[i * 3 + 2] = e.cy + dx * st + dy * ct;
    }
    const attr = this.ellipse.geometry.getAttribute('position');
    if (attr && attr.count === seg + 1) {
      attr.array.set(pos);
      attr.needsUpdate = true;
    } else {
      this.ellipse.geometry.dispose();
      this.ellipse.geometry = new THREE.BufferGeometry();
      this.ellipse.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    }
    this.ellipse.geometry.computeBoundingSphere();
    // 椭圆填充：局部半径 1 的圆盘按半轴缩放，再绕 y 轴转到长轴方向
    this.ellipseFill.position.set(e.cx, 0.042, e.cy);
    this.ellipseFill.rotation.y = -th;
    this.ellipseDisc.scale.set(a, b, 1);
    // 两处标注都摆到椭圆的「屏幕右侧」：左下角常驻参数面板，右侧始终是空的。
    // 相机转动时跟着重算方向，标注不会转到底面被面板压住。
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
    const reach = Math.max(a, b) * WORLD_SCALE;
    this.sigmaAnchor.position.set(
      e.cx * WORLD_SCALE + right.x * (reach + 0.5), 0.42, e.cy * WORLD_SCALE + right.z * (reach + 0.5));
    this.labelSigma.hidden = false;
  }

  // ---------------------------------------------------------------- 演示路径

  buildPath(kind, pts) {
    this.clearPath(kind);
    if (!pts || pts.length === 0) return null;
    const color = this.pathDefs[kind].color;
    const pts3 = pts.map((p) => new THREE.Vector3(p[0], this.heightFromLog(p[2]) + 0.05, p[1]));
    const geo = new THREE.BufferGeometry().setFromPoints(pts3);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    line.renderOrder = 4;
    geo.setDrawRange(0, 1);
    const sphereGeo = new THREE.SphereGeometry(0.045, 12, 10);
    const sphereMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
    // 球体抽稀：一次梯度上升可能走两千多步，逐点建球会拖慢渲染；
    // 折线仍是全部点，球只做节奏标记（起点、终点必留），上限 120 颗。
    const MAX_SPHERES = 120;
    let stride = Math.max(1, Math.ceil(pts3.length / MAX_SPHERES));
    let sphereIdx = [];
    for (;;) {
      sphereIdx = [];
      for (let i = 0; i < pts3.length; i += stride) sphereIdx.push(i);
      if (sphereIdx[sphereIdx.length - 1] !== pts3.length - 1) sphereIdx.push(pts3.length - 1);
      if (sphereIdx.length <= MAX_SPHERES) break;
      stride++;
    }
    const spheres = sphereIdx.map(() => {
      const s = new THREE.Mesh(sphereGeo, sphereMat);
      s.visible = false;
      return s;
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), new THREE.MeshBasicMaterial({ color }));
    head.visible = false;
    const grp = new THREE.Group();
    grp.add(line, head, ...spheres);
    this.world.add(grp);
    // 弧长参数化
    const cum = [0];
    for (let i = 1; i < pts3.length; i++) cum.push(cum[i - 1] + pts3[i].distanceTo(pts3[i - 1]));
    const total = cum[cum.length - 1] || 1;
    this.paths[kind] = { pts, pts3, cum, total, line, spheres, sphereIdx, stride, sphereGeo, sphereMat, head, grp };
    return this.paths[kind];
  }

  // t∈[0,1] → 头部位置与已到达的迭代点
  pathPoseAt(kind, t) {
    const p = this.paths[kind];
    if (!p) return null;
    const d = Math.min(1, Math.max(0, t)) * p.total;
    let i = 0;
    while (i < p.cum.length - 2 && p.cum[i + 1] < d) i++;
    const segLen = Math.max(1e-9, p.cum[i + 1] - p.cum[i]);
    const f = Math.min(1, Math.max(0, (d - p.cum[i]) / segLen));
    const a = p.pts3[i], b = p.pts3[i + 1];
    const pos = a.clone().lerp(b, f);
    const mu = [
      p.pts[i][0] + (p.pts[i + 1][0] - p.pts[i][0]) * f,
      p.pts[i][1] + (p.pts[i + 1][1] - p.pts[i][1]) * f,
    ];
    return { pos, mu, reached: i + (f >= 0.999 ? 1 : 0), count: p.pts.length };
  }

  setPathProgress(kind, pose) {
    const p = this.paths[kind];
    if (!p || !pose) return;
    p.head.visible = true;
    p.head.position.copy(pose.pos);
    const upto = Math.min(p.pts3.length, Math.max(1, pose.reached + 1));
    p.line.geometry.setDrawRange(0, upto);
    for (let i = 0; i < p.spheres.length; i++) {
      p.spheres[i].visible = p.sphereIdx[i] <= pose.reached;
    }
  }

  pathFinished(kind) {
    const p = this.paths[kind];
    if (!p) return;
    p.line.geometry.setDrawRange(0, p.pts3.length);
    for (const s of p.spheres) s.visible = true;
    p.head.visible = false;
  }

  clearPath(kind) {
    const p = this.paths[kind];
    if (!p) return;
    this.world.remove(p.grp);
    p.line.geometry.dispose();
    p.line.material.dispose();
    p.sphereGeo.dispose();
    p.sphereMat.dispose();
    p.head.geometry.dispose();
    p.head.material.dispose();
    this.paths[kind] = null;
  }

  clearAllPaths() {
    this.clearPath('newton');
    this.clearPath('gradient');
  }

  // ---------------------------------------------------------------- 主更新

  update(dt) {
    this.clock += dt;
    // 模式混合过渡（指数逼近，约 1.2s 收敛）
    if (Math.abs(this.blendTarget - this.blend) > 1e-4) {
      this.blend += (this.blendTarget - this.blend) * Math.min(1, dt * 2.6);
      if (Math.abs(this.blendTarget - this.blend) <= 1e-4) this.blend = this.blendTarget;
      this.updateHeights();
    }
    // 小人：位置 + 呼吸浮动
    const [m1, m2] = this.personMu;
    const breathe = Math.sin(this.clock * 2.3) * 0.018;
    this.person.position.set(m1, this.heightAt([m1, m2]) + breathe, m2);
    this.body.scale.y = 1 + Math.sin(this.clock * 2.3) * 0.03;
    this.head.position.y = 0.44 + Math.sin(this.clock * 2.3 + 0.5) * 0.008;
    // 峰顶标记随模式移动（钟形山与抛物碗峰高一致，位置不变）
    this.peakDot.position.y = this.heightAt(this.mean) + 0.02;
    // 跟随镜头
    if (this.follow) {
      const desired = new THREE.Vector3(m1, this.heightAt([m1, m2]) + 0.5, m2);
      const delta = desired.clone().sub(this.controls.target).multiplyScalar(Math.min(1, dt * 3.2));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.#updateLabels();
  }

  setBlendTarget(t, immediate = false) {
    this.blendTarget = t;
    if (immediate) this.blend = t;
  }

  // 把曲面放进可视区正中：按曲面包围盒的 8 个角投影迭代定距，再把投影中心平移到视口中心。
  // 定距与居中交替两轮：平移会改变透视，居中后再定距才会同时满足「填满」与「居中」。
  // 只要用户没自己转过镜头，改窗口尺寸 / 展开演示区都会重新构图。
  fitView() {
    if (!this.surf) return;
    const { xs, ys, nx, ny } = this.surf.log;
    const min = new THREE.Vector3(Math.min(xs[0], xs[nx - 1]) * WORLD_SCALE, 0, Math.min(ys[0], ys[ny - 1]) * WORLD_SCALE);
    const max = new THREE.Vector3(Math.max(xs[0], xs[nx - 1]) * WORLD_SCALE, PEAK_H, Math.max(ys[0], ys[ny - 1]) * WORLD_SCALE);
    const center = min.clone().add(max).multiplyScalar(0.5);
    const corners = [];
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }

    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const dir = new THREE.Vector3(0.55, 0.78, 0.66).normalize(); // 略俯视的左前上方
    const place = (d) => {
      this.controls.target.copy(center);
      this.camera.position.copy(center).addScaledVector(dir, d);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld(true);
    };
    const ndcBox = () => {
      const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      const p = new THREE.Vector3();
      for (const c of corners) {
        p.copy(c).project(this.camera);
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
      }
      return b;
    };
    const halfTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));

    const FIT = 1.26; // 包围盒占短边约 79%，四周留白够 x̄ / 1σ 标注露头
    let dist = max.distanceTo(min) * 1.5;
    place(dist);

    for (let pass = 0; pass < 2; pass++) {
      // 1) 定距：把投影半幅缩到 1/FIT
      for (let k = 0; k < 6; k++) {
        const b = ndcBox();
        const ext = Math.max((b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2);
        if (!isFinite(ext) || ext <= 1e-6) break;
        const next = dist * ext * FIT;
        const settled = Math.abs(next - dist) < 1e-3;
        dist = next;
        place(dist);
        if (settled) break;
      }
      // 2) 居中：把包围盒投影中心推到 (0,0)，按包围盒中心的真实深度换算像素尺度
      for (let k = 0; k < 5; k++) {
        const b = ndcBox();
        const ox = (b.minX + b.maxX) / 2;
        const oy = (b.minY + b.maxY) / 2;
        if (Math.abs(ox) < 2e-4 && Math.abs(oy) < 2e-4) break;
        const view = this.camera.getWorldDirection(new THREE.Vector3());
        const depth = Math.max(1e-3, center.clone().sub(this.camera.position).dot(view));
        const halfH = halfTan * depth;
        const halfW = halfH * this.camera.aspect;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        const shift = right.multiplyScalar(ox * halfW).add(up.multiplyScalar(oy * halfH));
        this.camera.position.add(shift);
        this.controls.target.add(shift);
        this.camera.lookAt(this.controls.target);
        this.camera.updateMatrixWorld(true);
      }
    }

    // x̄ 挂在峰顶左上方：贴着包围盒上沿放，既有引线感又不会顶出画面
    if (!this.labelMean.hidden) {
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
      this.meanAnchor.position.set(
        this.mean[0] * WORLD_SCALE - right.x * 0.62, PEAK_H + 0.08, this.mean[1] * WORLD_SCALE - right.z * 0.62);
    }
    this.controls.update();
  }

  // 对外暴露：演示区展开 / 窗口尺寸变化后由外部触发重新构图
  resize() { this.#resize(); }

  #resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // updateStyle 必须为 true：只在 drawingBuffer 上乘 devicePixelRatio 而不写回 CSS 尺寸，
    // 高 DPI 屏上画布会撑成容器的 dpr 倍并被 overflow 裁掉，看起来就像曲面偏到一角。
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (w > 2 && h > 2 && !this.userMoved) this.fitView();
  }

  dispose() {
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
