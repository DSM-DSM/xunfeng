// input.js —— 键盘控制：WASD / 方向键移动参数 μ。
// 基础速度 1.2 参数单位/秒，按住加速（最高 2 倍），松开阻尼衰减；方向跟随镜头朝向，保证“跟手”。
// 鼠标旋转 / 滚轮缩放由 OrbitControls 负责，不在此处处理。

import * as THREE from 'three';

export const BASE_SPEED = 1.2;

export class InputController {
  constructor(target = window) {
    this.keys = new Set();
    this.enabled = true;
    this.velocity = [0, 0];   // 参数空间速度 (vμ1, vμ2)
    this.holdTime = 0;        // 按住时长 → 加速因子
    this.bounds = { x0: -4.2, x1: 4.2, y0: -4.2, y1: 4.2 };
    this.moving = false;
    this.onFirstMove = null;  // 首次产生位移时的回调（用于清除旧路径）

    this._down = (e) => {
      const k = e.code;
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Space') {
        e.preventDefault();
      }
      if (this.#isMoveKey(k)) this.keys.add(k);
    };
    this._up = (e) => { this.keys.delete(e.code); };
    this._blur = () => { this.keys.clear(); };

    target.addEventListener('keydown', this._down, { passive: false });
    target.addEventListener('keyup', this._up);
    target.addEventListener('blur', this._blur);
  }

  #isMoveKey(code) {
    return code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
      code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight';
  }

  setBounds(x0, x1, y0, y1) {
    this.bounds = { x0, x1, y0, y1 };
  }

  #intent() {
    let f = 0, s = 0; // f=前后, s=左右
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
    return [f, s];
  }

  // camera: THREE.Camera —— 用于把“前后左右”换算到参数坐标（μ1→x, μ2→z）
  update(dt, camera, mu) {
    if (!this.enabled) {
      this.velocity[0] *= Math.exp(-dt * 8);
      this.velocity[1] *= Math.exp(-dt * 8);
      this.moving = Math.hypot(this.velocity[0], this.velocity[1]) > 0.01;
      return [mu[0], mu[1]];
    }
    const [f, s] = this.#intent();
    let nmu0 = mu[0], nmu1 = mu[1];
    if (f !== 0 || s !== 0) {
      // 镜头朝向投影到水平面
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
      fwd.normalize();
      const right = { x: -fwd.z, z: fwd.x }; // 水平面右方向
      let dx = fwd.x * f + right.x * s;
      let dz = fwd.z * f + right.z * s;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      // 加速：按住 1.5s 内速度因子从 1 升到 2
      this.holdTime = Math.min(1.5, this.holdTime + dt);
      const speedFactor = 1 + Math.min(1, this.holdTime / 1.5);
      const targetV0 = dx * BASE_SPEED * speedFactor;
      const targetV1 = dz * BASE_SPEED * speedFactor;
      // 跟手：快速向目标速度靠拢
      const k = Math.min(1, dt * 10);
      this.velocity[0] += (targetV0 - this.velocity[0]) * k;
      this.velocity[1] += (targetV1 - this.velocity[1]) * k;
    } else {
      this.holdTime = 0;
      // 阻尼衰减
      const damp = Math.exp(-dt * 7);
      this.velocity[0] *= damp;
      this.velocity[1] *= damp;
      if (Math.hypot(this.velocity[0], this.velocity[1]) < 0.002) {
        this.velocity[0] = 0; this.velocity[1] = 0;
      }
    }
    const b = this.bounds;
    if (this.velocity[0] !== 0 || this.velocity[1] !== 0) {
      nmu0 = Math.min(b.x1, Math.max(b.x0, mu[0] + this.velocity[0] * dt));
      nmu1 = Math.min(b.y1, Math.max(b.y0, mu[1] + this.velocity[1] * dt));
      if (!this.moving && this.onFirstMove) this.onFirstMove();
    }
    this.moving = this.velocity[0] !== 0 || this.velocity[1] !== 0;
    return [nmu0, nmu1];
  }

  dispose(target = window) {
    target.removeEventListener('keydown', this._down);
    target.removeEventListener('keyup', this._up);
    target.removeEventListener('blur', this._blur);
  }
}

