import { SIZE, isHole, DIRS } from '/shared/rules.js';
import { fighterSVG, GLOVE_SVG } from './fighters.js';

const GLYPH = { PUSH: '🥊', HOOK: '🪝', DASH: '💨' };
const NS = 'http://www.w3.org/2000/svg';
const pct = (n) => `${n * 20}%`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export class Board {
  constructor(wrap, onTile) {
    this.wrap = wrap;
    this.onTile = onTile;
    wrap.innerHTML = '';
    this.gshadow = document.createElement('div');
    this.gshadow.className = 'gshadow';
    wrap.appendChild(this.gshadow);
    this.grid = document.createElement('div');
    this.grid.className = 'board';
    this.tiles = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const b = document.createElement('button');
        b.className = 'tile' + ((x + y) % 2 ? ' dark' : '');
        b.setAttribute('aria-label', `Casa ${String.fromCharCode(65 + x)}${y + 1}`);
        b.innerHTML = '<i class="fs"></i><i class="fe"></i>'; // laterais do bloco (visíveis na visão 3D)
        b.addEventListener('click', () => this.onTile([x, y]));
        this.grid.appendChild(b);
        this.tiles.push(b);
      }
    }
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    this.rockLayer = document.createElement('div');
    this.rockLayer.className = 'layer';
    this.units = {};
    this.rockEls = new Map();
    for (const id of ['p1', 'p2']) {
      const u = document.createElement('div');
      u.className = `unit ${id}`;
      u.innerHTML = `<div class="stand"><div class="hearts-mini"></div>${fighterSVG(id)}</div>`;
      this.layer.appendChild(u);
      this.units[id] = u;
    }
    this.decorLayer = document.createElement('div');
    this.decorLayer.className = 'layer decor';
    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 'layer fxl';
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'layer pins';
    this.svg = svgEl('svg', { class: 'fx', viewBox: `0 0 ${SIZE} ${SIZE}` });
    // laje da ilha: faces da frente e da direita (aparecem na visão 3D)
    this.slab = document.createElement('div');
    this.slab.className = 'slab';
    this.slab.innerHTML = '<i class="sf"></i><i class="se"></i>';
    this.grid.append(this.slab, this.decorLayer, this.rockLayer, this.layer, this.svg, this.pinLayer, this.fxLayer);
    wrap.appendChild(this.grid);
  }

  tile(p) { return this.tiles[p[1] * SIZE + p[0]]; }

  // model: { units, rocks, holes }; view: { moveTiles, aimTiles, selMove, ghost, telegraph, preview, scared, angry }
  draw(model, view = {}) {
    const key = (p) => p.join(',');
    const mv = new Set((view.moveTiles || []).map(key));
    const aim = new Set((view.aimTiles || []).map(key));
    const sel = view.selMove ? key(view.selMove) : null;
    this.tiles.forEach((t, i) => {
      const p = [i % SIZE, Math.floor(i / SIZE)];
      const k = key(p);
      t.classList.toggle('hole', model.holes.some((h) => h[0] === p[0] && h[1] === p[1]));
      t.classList.toggle('crack', (model.cracks || []).some((h) => h[0] === p[0] && h[1] === p[1]));
      t.classList.toggle('spring', (model.springs || []).some((h) => h[0] === p[0] && h[1] === p[1]));
      t.classList.toggle('can-move', mv.has(k));
      t.classList.toggle('can-aim', aim.has(k));
      t.classList.toggle('sel', sel === k);
    });

    this.drawDecor(model);

    // Pedras e montanhas são reaproveitadas entre redesenhos: só a que acabou de surgir "cai" (animação).
    const seenRocks = new Set();
    for (const r of model.rocks) {
      const k = key(r.pos);
      seenRocks.add(k);
      let d = this.rockEls.get(k);
      if (!d) {
        d = document.createElement('div');
        d.className = 'rock new';
        d.innerHTML = '<i class="stand"></i>';
        d.style.left = pct(r.pos[0]);
        d.style.top = pct(r.pos[1]);
        setTimeout(() => d.classList.remove('new'), 450);
        this.rockLayer.appendChild(d);
        this.rockEls.set(k, d);
      }
      d.classList.toggle('mtn', r.kind === 'mtn');
      d.classList.toggle('hurt', r.kind === 'mtn' && r.hp < 2);
    }
    for (const [k, d] of this.rockEls) {
      if (!seenRocks.has(k)) { d.remove(); this.rockEls.delete(k); }
    }

    for (const id of ['p1', 'p2']) {
      const u = model.units[id];
      const el = this.units[id];
      el.style.left = pct(u.pos[0]);
      el.style.top = pct(u.pos[1]);
      el.classList.toggle('down', !u.alive);
      el.classList.toggle('scared', view.scared === id && u.alive);
      el.classList.toggle('angry', view.angry === id && u.alive);
      el.querySelector('.hearts-mini').innerHTML = Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < u.hp ? '' : 'lost'}">❤️</span>`).join('');
    }

    this.layer.querySelectorAll('.ghost').forEach((g) => g.remove());
    if (view.ghost) {
      const g = document.createElement('div');
      g.className = `ghost ${view.ghost.pid}`;
      g.style.setProperty('--col', view.ghost.pid === 'p1' ? 'var(--blue)' : 'var(--red)');
      g.style.left = pct(view.ghost.pos[0]);
      g.style.top = pct(view.ghost.pos[1]);
      g.innerHTML = `<div class="stand">${fighterSVG(view.ghost.pid)}</div>`;
      this.layer.appendChild(g);
    }

    this.svg.innerHTML = '';
    this.pinLayer.innerHTML = '';
    if (view.outcome) this.drawOutcome(view.outcome);
    if (view.preview) this.drawVector(view.preview, false);
    if (view.telegraph) this.drawVector(view.telegraph, true);
    for (const v of view.extra || []) this.drawVector(v, true);
  }

  // Prévia do resultado: onde cada boneco vai parar, dano e quedas.
  drawOutcome({ final, base, rocksBefore }) {
    const clamp = (n) => Math.min(SIZE - 1, Math.max(0, n));
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    for (const id of ['p1', 'p2']) {
      const b = base[id];
      const f = final.units[id];
      const lostHp = b.hp - f.hp;
      const moved = !same(b.pos, f.pos);
      if (!moved && lostHp === 0 && f.alive) continue;
      const fx = clamp(f.pos[0]) + 0.5, fy = clamp(f.pos[1]) + 0.5;
      const col = id === 'p1' ? '#3d8bff' : '#ff5a6e';
      if (moved) {
        this.svg.appendChild(svgEl('circle', { cx: fx, cy: fy, r: 0.34, fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 0.07, 'stroke-dasharray': '0.12 0.1' }));
        const bx = b.pos[0] + 0.5, by = b.pos[1] + 0.5;
        this.svg.appendChild(svgEl('line', { x1: bx, y1: by, x2: fx, y2: fy, stroke: col, 'stroke-width': 0.08, 'stroke-dasharray': '0.1 0.1', 'stroke-linecap': 'round', opacity: 0.7 }));
      }
      let label = '';
      if (!f.alive) label = final.units[id].pos[0] < 0 || final.units[id].pos[1] < 0 || final.units[id].pos[0] >= SIZE || final.units[id].pos[1] >= SIZE || isHole(final, f.pos) ? '💦' : '💀';
      else if (lostHp) label = `−${lostHp}`;
      if (label) this.pin([clamp(f.pos[0]), clamp(f.pos[1])], label, 'tag');
    }
    // pedras: nova (fantasma) ou destruída (✖)
    for (const r of final.rocks) {
      if (!rocksBefore.some((o) => same(o.pos, r.pos))) {
        this.pin(r.pos, '🪨', 'ghostrock');
      }
    }
    for (const o of rocksBefore) {
      if (!final.rocks.some((r) => same(o.pos, r.pos))) {
        this.pin(o.pos, '✖', 'xmark');
      }
    }
  }

  // Florzinhas e tufos de grama: posição fixa por partida (seed), fora de buracos, molas e rachaduras.
  drawDecor(model) {
    const has = (list, p) => (list || []).some((h) => h[0] === p[0] && h[1] === p[1]);
    const key = `${model.seed}|${model.holes.map((h) => h.join()).join(';')}|${(model.cracks || []).length}|${(model.springs || []).length}`;
    if (this.decorKey === key) return;
    this.decorKey = key;
    this.decorLayer.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = [i % SIZE, Math.floor(i / SIZE)];
      if (has(model.holes, p) || has(model.cracks, p) || has(model.springs, p) || model.rocks.some((r) => r.kind === 'mtn' && r.pos[0] === p[0] && r.pos[1] === p[1])) continue;
      let h = (Math.imul(i + 7, 2654435761) ^ Math.imul((model.seed || 1) + 13, 40503)) >>> 0;
      if (h % 100 > 22) continue; // poucos enfeites: casas limpas para tocar
      h = Math.imul(h, 1103515245) >>> 0;
      const d = document.createElement('i');
      d.className = `deco d${1 + (h % 4)}`;
      d.style.left = `${p[0] * 20 + 3 + ((h >> 4) % 9)}%`;
      d.style.top = `${p[1] * 20 + 8 + ((h >> 9) % 8)}%`;
      this.decorLayer.appendChild(d);
    }
    // bordas do fundo: montanhas, pinheiros e pedras, como as bordas do mapa dos jogos táticos
    const rim = [];
    for (let i = 0; i < SIZE; i++) { rim.push([i + 0.5, -0.2]); rim.push([-0.2, i + 0.5]); }
    rim.push([-0.2, -0.2]);
    const kinds = [['r-peak', 28, 26], ['r-pine', 16, 24], ['r-rock', 22, 18], ['r-pine', 15, 22], ['r-peak', 25, 24]];
    rim.forEach((p, n) => {
      const hh = (Math.imul(n + 3, 2654435761) ^ Math.imul((model.seed || 1) + 5, 40503)) >>> 0;
      const [cls, w, h] = kinds[hh % kinds.length];
      const e = document.createElement('i');
      e.className = `rim ${cls}`;
      e.style.width = `${w}%`;
      e.style.height = `${h}%`;
      e.style.left = `${p[0] * 20 - w / 2 + ((hh >> 5) % 5) - 2}%`;
      e.style.top = `${p[1] * 20 - h + 6}%`;
      this.decorLayer.appendChild(e);
    });
  }

  cell() { return this.grid.clientWidth / SIZE; }

  center(p) {
    const c = this.cell();
    return [(p[0] + 0.5) * c, (p[1] + 0.5) * c];
  }

  // Explosão de partículas ('dust' poeira, 'star' estrelinhas, 'chip' pedaços de pedra).
  burst(p, kind = 'dust', n = 7) {
    const [cx, cy] = this.center([Math.min(SIZE - 0.5, Math.max(-0.5, p[0])), Math.min(SIZE - 0.5, Math.max(-0.5, p[1]))]);
    const c = this.cell();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      const size = c * (kind === 'star' ? 0.2 : 0.13) * (0.7 + Math.random() * 0.6);
      el.className = `pt ${kind}`;
      el.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px`;
      const a = Math.random() * Math.PI * 2;
      const d = c * (0.3 + Math.random() * 0.45);
      el.animate(
        [
          { transform: 'translate(-50%,-50%) scale(.4) rotate(0)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d - c * 0.15}px)) scale(1) rotate(${Math.random() * 240 - 120}deg)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 240, easing: 'cubic-bezier(.2,.8,.3,1)' },
      ).onfinish = () => el.remove();
      this.fxLayer.appendChild(el);
    }
  }

  // Pulo curto ao andar (squash and stretch) no desenho do personagem.
  hop(id) {
    const f = this.units[id].querySelector('.fighter');
    f.animate(
      [
        { transform: 'translateY(0) scale(1,1)' },
        { transform: 'translateY(6%) scale(1.12,.86)', offset: 0.15 },
        { transform: 'translateY(-24%) scale(.92,1.1)', offset: 0.5 },
        { transform: 'translateY(0) scale(1.1,.9)', offset: 0.85 },
        { transform: 'translateY(0) scale(1,1)' },
      ],
      { duration: 340, easing: 'ease-out' },
    );
  }

  // Investida do corpo todo na direção do golpe.
  lunge(id, dir) {
    const [dx, dy] = DIRS[dir];
    this.units[id].animate(
      [
        { transform: 'translate(0,0) scale(1,1)' },
        { transform: `translate(${-dx * 8}%,${-dy * 8}%) scale(.94,1.06)`, offset: 0.25 },
        { transform: `translate(${dx * 30}%,${dy * 30}%) scale(1.12,.92)`, offset: 0.55 },
        { transform: 'translate(0,0) scale(1,1)' },
      ],
      { duration: 360, easing: 'ease-out' },
    );
  }

  // Liga uma pose (classe CSS) por um tempo: punch, throw, lift, cheer.
  pose(id, cls, ms = 450) {
    const el = this.units[id];
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    if (ms) setTimeout(() => el.classList.remove(cls), ms);
  }

  clearPoses() {
    for (const el of Object.values(this.units)) el.classList.remove('punch', 'throw', 'lift', 'cheer');
  }

  // Luva que voa da casa de origem até o alvo.
  fly(from, to, ms = 240) {
    const [fx, fy] = this.center(from);
    const [tx, ty] = this.center(to);
    const el = document.createElement('div');
    el.className = 'fly';
    el.innerHTML = GLOVE_SVG;
    el.style.cssText = `left:${fx}px;top:${fy}px;width:${this.cell() * 0.5}px;height:${this.cell() * 0.5}px`;
    const rot = Math.atan2(ty - fy, tx - fx) * (180 / Math.PI) + 90;
    this.fxLayer.appendChild(el);
    const a = el.animate(
      [
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.6)`, opacity: 0.2 },
        { transform: `translate(calc(-50% + ${(tx - fx) * 0.5}px),calc(-50% + ${(ty - fy) * 0.5}px)) rotate(${rot}deg) scale(1.15)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${tx - fx}px),calc(-50% + ${ty - fy}px)) rotate(${rot}deg) scale(1.3)`, opacity: 0.9 },
      ],
      { duration: ms, easing: 'ease-out' },
    );
    a.onfinish = () => el.remove();
  }

  // Corda do gancho: nasce no personagem e acompanha o alvo enquanto ele é puxado.
  rope(from) {
    const el = document.createElement('div');
    el.className = 'rope';
    el.innerHTML = '<i class="hook"></i>';
    this.fxLayer.appendChild(el);
    const [fx, fy] = this.center(from);
    el.style.left = `${fx}px`;
    el.style.top = `${fy}px`;
    el.style.width = '0px';
    return {
      to: (p) => {
        const [tx, ty] = this.center(p);
        const len = Math.hypot(tx - fx, ty - fy) - this.cell() * 0.3;
        el.style.transform = `translateY(-50%) rotate(${Math.atan2(ty - fy, tx - fx)}rad)`;
        requestAnimationFrame(() => { el.style.width = `${Math.max(0, len)}px`; });
      },
      remove: () => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 220);
      },
    };
  }

  boing(p) {
    const t = this.tile(p);
    t.classList.remove('boing');
    void t.offsetWidth;
    t.classList.add('boing');
  }

  drawVector(v, hot) {
    const c = (p) => [p[0] + 0.5, p[1] + 0.5];
    const [fx, fy] = c(v.from);
    const target = v.target || v.tiles[v.tiles.length - 1];
    if (!target) return;
    const [tx, ty] = c(target);
    const dx = Math.sign(tx - fx);
    const dy = Math.sign(ty - fy);
    const sx = fx + dx * 0.42, sy = fy + dy * 0.42;
    const ex = tx - dx * 0.3, ey = ty - dy * 0.3;
    const color = hot ? '#ff2d3d' : '#ffd23f';
    const line = (w, col) => this.svg.appendChild(svgEl('line', {
      x1: sx, y1: sy, x2: ex, y2: ey, stroke: col, 'stroke-width': w, 'stroke-linecap': 'round',
      ...(hot ? {} : { 'stroke-dasharray': '0.18 0.16' }),
    }));
    if (Math.abs(ex - sx) + Math.abs(ey - sy) > 0.05) { line(0.26, '#fff'); line(0.15, color); }
    // ponta da seta
    const px = -dy, py = dx;
    const head = [[ex + dx * 0.22, ey + dy * 0.22], [ex + px * 0.2, ey + py * 0.2], [ex - px * 0.2, ey - py * 0.2]]
      .map((p) => p.join(',')).join(' ');
    this.svg.appendChild(svgEl('polygon', { points: head, fill: color, stroke: '#fff', 'stroke-width': 0.07, 'stroke-linejoin': 'round' }));
    // mira na casa-alvo
    if (hot) {
      this.svg.appendChild(svgEl('circle', { class: 'tg-ring', cx: tx, cy: ty, r: 0.36 }));
      const cross = svgEl('path', { d: `M${tx - 0.46} ${ty}H${tx - 0.2}M${tx + 0.2} ${ty}H${tx + 0.46}M${tx} ${ty - 0.46}V${ty - 0.2}M${tx} ${ty + 0.2}V${ty + 0.46}`, stroke: '#ff2d3d', 'stroke-width': 0.08, 'stroke-linecap': 'round', fill: 'none' });
      this.svg.appendChild(cross);
    }
    if (GLYPH[v.type]) this.pin(target, GLYPH[v.type], 'glyph');
    if (v.n) this.pin(v.from, String(v.n), `num ${v.pid || ''}`); // selo de ordem na casa de quem ataca
  }

  // Ícone ou número "em pé" sobre uma casa (sempre de frente para a câmera, em qualquer visão).
  pin(pos, text, cls = '') {
    const d = document.createElement('div');
    d.className = 'pin';
    d.style.left = `${(pos[0] + 0.5) * 20}%`;
    d.style.top = `${(pos[1] + 0.5) * 20}%`;
    const s = document.createElement('span');
    s.className = `pin-in ${cls}`;
    s.textContent = text;
    d.appendChild(s);
    this.pinLayer.appendChild(d);
  }

  pop(pos, text, ms = 800) {
    const d = document.createElement('div');
    d.className = 'pop';
    d.innerHTML = '<span></span>';
    d.firstChild.textContent = text;
    d.style.left = `${(pos[0] + 0.5) * 20}%`;
    d.style.top = `${(pos[1] + 0.5) * 20}%`;
    this.fxLayer.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }

  hurt(id) {
    const el = this.units[id];
    el.classList.remove('hurt');
    void el.offsetWidth;
    el.classList.add('hurt');
    setTimeout(() => el.classList.remove('hurt'), 450);
  }

  shake() {
    this.grid.classList.remove('shake');
    void this.grid.offsetWidth;
    this.grid.classList.add('shake');
  }
}

export function confetti() {
  const box = document.getElementById('confetti');
  const cols = ['#ff5a6e', '#3d8bff', '#ffd23f', '#4fcf5d', '#fff'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = cols[i % cols.length];
    p.style.animationDuration = `${2 + Math.random() * 2}s`;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    box.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}
