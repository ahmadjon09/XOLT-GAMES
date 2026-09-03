/**
 * MINIMAP — oddiy 2D canvas (Three.js kerak emas, ~0.05 ms/kadr).
 * Yo'l chizig'i bir marta chiziladi (offscreen canvas), har kadrda faqat
 * mashina nuqtalari yangilanadi.
 */

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{x:number,z:number}[]} path yo'l nuqtalari
   */
  constructor(canvas, path) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.path = path;
    this.pad = 8;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of path) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.base = null;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth || 120;
    const h = c.clientHeight || 120;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this._renderBase();
  }

  /** Loyihalash: dunyo → minimap piksel. */
  project(x, z) {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const pad = this.pad;
    const sx = (this.w - pad * 2) / Math.max(1, maxX - minX);
    const sz = (this.h - pad * 2) / Math.max(1, maxZ - minZ);
    const s = Math.min(sx, sz);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    return {
      x: this.w / 2 + (x - cx) * s,
      y: this.h / 2 + (z - cz) * s,
    };
  }

  /** Yo'l chizig'ini offscreen canvas'ga chizish (bir marta). */
  _renderBase() {
    const off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const g = off.getContext('2d');
    g.scale(this.dpr, this.dpr);
    g.clearRect(0, 0, this.w, this.h);

    g.beginPath();
    let first = true;
    for (const p of this.path) {
      const q = this.project(p.x, p.z);
      if (first) { g.moveTo(q.x, q.y); first = false; }
      else g.lineTo(q.x, q.y);
    }
    g.closePath();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    g.stroke();

    // Start chizig'i
    if (this.path.length) {
      const s = this.project(this.path[0].x, this.path[0].z);
      g.fillStyle = '#ffd54a';
      g.beginPath();
      g.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    this.base = off;
  }

  /**
   * Har kadr: fon (tayyor) + mashinalar.
   * @param {Array<{x,z,color,local}>} cars
   */
  draw(cars) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.base) g.drawImage(this.base, 0, 0);
    g.scale(this.dpr, this.dpr);

    for (const c of cars) {
      if (!c) continue;
      const q = this.project(c.x, c.z);
      g.beginPath();
      g.arc(q.x, q.y, c.local ? 4.2 : 3, 0, Math.PI * 2);
      g.fillStyle = c.color || '#fff';
      g.fill();
      if (c.local) {
        g.lineWidth = 1.8;
        g.strokeStyle = '#fff';
        g.stroke();
      }
    }
  }
}
