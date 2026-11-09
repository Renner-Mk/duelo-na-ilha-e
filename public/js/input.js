import { legalMoves, legalDirs, add, eq, DIRS, DIR_NAMES, actionPreview, previewOutcome, summarize, other } from '/shared/rules.js';

const NAME = { p1: 'Azul', p2: 'Vermelho' };
const ACT = { PUSH: 'Empurrão', HOOK: 'Gancho', ROCK: 'Pedra', WAIT: 'Esperar' };

function describe(out) {
  const s = summarize(out.events);
  const parts = [];
  for (const id of ['p1', 'p2']) {
    const bits = [];
    if (s.dmg[id]) bits.push(`−${s.dmg[id]} ❤️`);
    if (s.fell.includes(id)) bits.push('cai da ilha');
    else if (s.ko.includes(id)) bits.push('fica sem vidas');
    else if (s.moved.includes(id)) bits.push('é deslocado');
    if (bits.length) parts.push(`${NAME[id]} ${bits.join(', ')}`);
  }
  let body = parts.length ? parts.join(' · ') : 'nenhum efeito';
  const ord = out.events.find((e) => e.t === 'order');
  if (ord && ord.order.filter((o) => o.type !== 'WAIT').length === 2) {
    body += ` [ordem: ${ord.order.map((o) => `${ACT[o.type]} ${NAME[o.pid]}`).join(' → ')}]`;
  }
  const st = out.state;
  const end = st.phase === 'OVER' ? (st.winner === 'draw' ? ' → Empate' : ` → ${NAME[st.winner]} vence`) : '';
  return `${out.assumed ? `Se ${NAME[other(out.by)]} ficar parado` : 'Resultado'}: ${body}${end}`;
}
import { sfx } from './sfx.js';

const HINTS = {
  move: 'Toque numa casa marcada para andar, ou na sua unidade para ficar. Depois escolha um golpe.',
  PUSH: 'Empurrão: 1 de dano e empurra 1 casa. Toque na casa ao lado para escolher a direção.',
  HOOK: 'Gancho: sem dano; puxa o primeiro alvo da linha (até 3 casas) até 2 casas para perto. Toque na direção.',
  ROCK: 'Pedra: bloqueia uma casa vazia ao lado. Toque na casa.',
  WAIT: 'Esperar: você só se move. Toque em Confirmar.',
};
const DIR_KEYS = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT' };
const ACT_KEYS = { 1: 'PUSH', 2: 'HOOK', 3: 'ROCK', 4: 'WAIT' };

export class Input {
  constructor(board, els, onSubmit, onChange) {
    this.board = board;
    this.els = els;
    this.onSubmit = onSubmit;
    this.onChange = onChange;
    this.active = false;
    // onclick (e não addEventListener): uma partida nova substitui os handlers da anterior, sem acumular.
    els.acts.forEach((b) => { b.onclick = () => this.setAct(b.dataset.act); });
    els.moveBtn.onclick = () => { if (this.active) { this.mode = 'move'; this.update(); } };
    els.confirm.onclick = () => this.confirm();
    if (els.clear) els.clear.onclick = () => this.reset();
  }

  // Limpa a escolha atual e volta ao passo de mover.
  reset() {
    if (!this.active) return;
    this.mode = 'move';
    this.move = null;
    this.act = null;
    this.dir = null;
    sfx.tap();
    this.update();
  }

  // Atalhos de teclado (desktop). Retorna true se a tecla foi usada.
  key(e) {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ACT_KEYS[k]) { this.setAct(ACT_KEYS[k]); return true; }
    if (k === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON') return false; // o botão focado já trata o Enter
      this.confirm();
      return true;
    }
    if (k === 'Escape') { this.reset(); return true; }
    if (k === 'm') { this.mode = 'move'; this.update(); return true; }
    const d = DIR_KEYS[k];
    if (!d) return false;
    if (this.mode === 'aim' && this.act) this.tap(add(this.from, DIRS[d]));
    else this.tap(add(this.state.units[this.pid].pos, DIRS[d]));
    return true;
  }

  begin(state, pid) {
    this.state = state;
    this.pid = pid;
    this.active = true;
    this.mode = 'move';
    this.move = null;
    this.act = null;
    this.dir = null;
    this.update();
  }

  end() {
    this.active = false;
    this.update();
  }

  get from() { return this.move || this.state.units[this.pid].pos; }

  sim() {
    const s = JSON.parse(JSON.stringify(this.state));
    s.units[this.pid].pos = [...this.from];
    return s;
  }

  setAct(type) {
    if (!this.active) return;
    sfx.select();
    this.act = type;
    this.dir = null;
    this.mode = type === 'WAIT' ? 'move' : 'aim';
    this.update();
  }

  tap(p) {
    if (!this.active) return;
    const u = this.state.units[this.pid];
    if (this.mode === 'move') {
      if (eq(p, u.pos)) this.move = null;
      else if (legalMoves(this.state, this.pid).some((m) => eq(m, p))) this.move = p;
      else return;
      sfx.tap();
      // revalida a direção a partir da nova posição
      if (this.dir && !legalDirs(this.sim(), this.act, this.from).includes(this.dir)) this.dir = null;
    } else if (this.mode === 'aim' && this.act) {
      const d = DIR_NAMES.find((n) => eq(add(this.from, DIRS[n]), p));
      if (!d || !legalDirs(this.sim(), this.act, this.from).includes(d)) return;
      this.dir = d;
      sfx.tap();
    }
    this.update();
  }

  ready() {
    return this.active && this.act && (this.act === 'WAIT' || this.dir);
  }

  confirm() {
    if (!this.ready()) return;
    sfx.confirm();
    const play = {
      movement: this.move ? { to: this.move } : null,
      action: { type: this.act, direction: this.act === 'WAIT' ? null : this.dir },
    };
    this.active = false;
    this.update();
    this.onSubmit(play);
  }

  view() {
    if (!this.active) return {};
    const v = { moveTiles: [], aimTiles: [], selMove: this.move };
    if (this.mode === 'move') {
      v.moveTiles = [this.state.units[this.pid].pos, ...legalMoves(this.state, this.pid)];
    } else if (this.act) {
      v.aimTiles = legalDirs(this.sim(), this.act, this.from).map((d) => add(this.from, DIRS[d]));
    }
    if (this.move) v.ghost = { pid: this.pid, pos: this.move };
    if (this.act && this.dir) v.preview = actionPreview(this.sim(), this.pid, this.act, this.dir);
    if (this.outcome) {
      const base = this.sim().units; // posições após o seu próprio movimento
      v.outcome = { final: this.outcome.state, base, rocksBefore: this.state.rocks };
    }
    return v;
  }

  computeOutcome() {
    this.outcome = null;
    if (!this.ready()) return;
    const o = previewOutcome(this.state, this.pid, {
      movement: this.move ? { to: this.move } : null,
      action: { type: this.act, direction: this.act === 'WAIT' ? null : this.dir },
    });
    if (o) this.outcome = { ...o, by: this.pid };
  }

  update() {
    const { els } = this;
    els.bar.classList.toggle('off', !this.active);
    els.acts.forEach((b) => b.classList.toggle('on', this.active && b.dataset.act === this.act));
    els.moveBtn.classList.toggle('on', this.active && this.mode === 'move');
    els.confirm.disabled = !this.ready();
    els.hint.textContent = this.active ? HINTS[this.act || 'move'] : '';
    if (els.clear) els.clear.disabled = !this.active || (!this.move && !this.act);
    if (els.steps) {
      // 1 Mover (opcional) · 2 Golpe · 3 Direção · 4 Confirmar
      const cur = !this.act ? 2 : this.ready() ? 4 : 3;
      els.steps.querySelectorAll('li').forEach((li, i) => {
        const n = i + 1;
        li.classList.toggle('current', this.active && n === cur);
        li.classList.toggle('done', this.active && ((n === 1 && !!this.move) || (n > 1 && n < cur)));
        li.classList.toggle('skip', this.active && n === 3 && this.act === 'WAIT');
      });
    }
    this.computeOutcome();
    if (els.preview) {
      els.preview.textContent = this.active && this.outcome ? describe(this.outcome) : '';
      els.preview.classList.toggle('empty', !(this.active && this.outcome));
      els.bar.classList.toggle('has-preview', !!(this.active && this.outcome));
    }
    this.onChange();
  }
}
