import { createMatch, play, activePlayer, telegraph, toPayload, other, MAX_TURNS } from '/shared/rules.js';
import { Board, confetti } from './render.js';
import { Input } from './input.js';
import { playEvents } from './anim.js';
import { sfx, unlock, toggleMute, isMuted } from './sfx.js';

const $ = (s) => document.querySelector(s);
const NAME = { p1: 'Azul', p2: 'Vermelho' };
const ACT_NAME = { PUSH: 'Empurrão', HOOK: 'Gancho', DASH: 'Investida', WAIT: 'Esperar' };
const ACT_ICON = { PUSH: '🥊', HOOK: '🪝', DASH: '💨', WAIT: '💤' };

// Faixa que explica a ordem de resolução: quem age, com qual golpe e por quê.
function makeOrderUi(el) {
  return {
    show(order) {
      const chips = order.map((o, i) => `<span class="chip ${o.pid}"><b>${i + 1}</b>${ACT_ICON[o.type]} ${ACT_NAME[o.type]} <small>${NAME[o.pid]}</small></span>`).join('<i class="arr">→</i>');
      let why = '';
      const [a, b] = order;
      if (a && b && a.type !== 'WAIT' && b.type !== 'WAIT') {
        why = a.type === b.type ? 'Mesmo golpe: quem atacou vai primeiro' : `${ACT_NAME[a.type]} vem antes de ${ACT_NAME[b.type]}`;
      } else if (a && b) {
        why = 'Esperar fica por último';
      }
      el.innerHTML = `<div class="chips">${chips}</div><div class="why">${why}</div>`;
      el.classList.add('on');
    },
    step(n) { el.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('now', i === n - 1)); },
    clear() { el.classList.remove('on'); },
  };
}
// Uma linha de histórico por atualização, no estilo "Azul andou · Azul marcou Gancho".
function logLine(turn, events) {
  const parts = [];
  const hasOrder = events.some((e) => e.t === 'order');
  for (const e of events) {
    if (e.t === 'move') parts.push(`${NAME[e.id]} andou`);
    else if (e.t === 'dash') parts.push(`${NAME[e.id]} avançou`);
    else if (e.t === 'telegraph' && !hasOrder) parts.push(`${NAME[e.by]} marcou ${ACT_NAME[e.type]}`);
    else if (e.t === 'telegraph') parts.push(`${NAME[e.by]} reagiu com ${ACT_NAME[e.type]}`);
    else if (e.t === 'hit') parts.push(`${NAME[e.id]} −${e.dmg}❤️`);
    else if (e.t === 'whiff') parts.push('errou o golpe');
    else if (e.t === 'spring') parts.push('mola!');
    else if (e.t === 'crackBreak') parts.push('a casa quebrou');
    else if (e.t === 'rockBreak') parts.push('pedra quebrou');
    else if (e.t === 'fall') parts.push(`${NAME[e.id]} caiu`);
  }
  return `T${turn} · ${parts.join(' · ')}`;
}

let game = null;
let socket = null;

class Game {
  // mode: 'local' | 'online'; me: 'p1' | 'p2' | null
  constructor(mode, me) {
    this.mode = mode;
    this.me = me;
    this.state = null;
    this.matchId = null;
    this.busy = false;
    this.lastPid = null;
    this.board = new Board($('#board'), (p) => this.input.tap(p));
    applyView();
    this.orderEl = document.createElement('div');
    this.orderEl.className = 'order';
    $('#board').appendChild(this.orderEl);
    this.orderUi = makeOrderUi(this.orderEl);
    this.input = new Input(
      this.board,
      { bar: $('#bar'), acts: [...document.querySelectorAll('.act')], moveBtn: $('#btn-move'), confirm: $('#btn-confirm'), hint: $('#hint'), preview: $('#preview'), clear: $('#btn-clear'), steps: $('#steps') },
      (p) => this.submit(p),
      () => this.draw(),
    );
  }

  draw() {
    if (!this.state) return;
    const s = this.state;
    const pid = activePlayer(s);
    const view = this.input.view();
    view.telegraph = telegraph(s);
    if (s.pending && s.phase === 'REACT') {
      view.angry = s.pending.pid;
      view.scared = other(s.pending.pid);
    }
    this.board.draw(s, view);
    for (const id of ['p1', 'p2']) {
      document.querySelector(`.pl.${id}`).classList.toggle('active', pid === id);
    }
    $('#turn').textContent = `Turno ${s.turn}/${MAX_TURNS} · ${s.mapName}`;
  }

  addLog(text) {
    const li = document.createElement('li');
    li.textContent = text;
    const ol = $('#log');
    ol.prepend(li);
    while (ol.children.length > 8) ol.lastChild.remove();
  }

  banner(text, alert = false) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.toggle('alert', alert);
  }

  start(state, matchId) {
    this.state = state;
    this.matchId = matchId;
    this.lastPid = null;
    $('#log').innerHTML = '';
    $('#wait').hidden = true;
    $('#end').hidden = true;
    this.refresh();
  }

  refresh() {
    const s = this.state;
    this.draw();
    if (s.phase === 'OVER') return;
    const pid = activePlayer(s);
    const attacking = s.phase === 'DECLARE';
    const who = NAME[pid];
    if (this.mode === 'local') {
      this.banner(attacking ? `${who}: mova e mire seu ataque` : `${who}: reaja ao ataque!`, !attacking);
      this.input.end();
      this.askPass(pid, () => this.input.begin(s, pid));
    } else if (pid === this.me) {
      this.banner(attacking ? 'Sua vez de atacar: mova e mire' : 'Veja a mira vermelha e reaja!', !attacking);
      this.input.begin(s, pid);
    } else {
      this.banner(attacking ? 'Rival está planejando o ataque…' : 'Rival está reagindo…');
      this.input.end();
    }
  }

  askPass(pid, done) {
    if (this.lastPid === pid) return done(); // mesmo jogador seguiu: não precisa passar o aparelho
    this.lastPid = pid;
    $('#pass-text').textContent = `Passe o aparelho para o ${NAME[pid]}`;
    $('#pass').hidden = false;
    $('#pass-ok').onclick = () => { $('#pass').hidden = true; sfx.tap(); done(); };
    $('#pass-ok').focus();
  }

  submit(p) {
    if (this.mode === 'local') {
      const pid = activePlayer(this.state);
      this.apply(play(this.state, pid, p));
    } else {
      const payload = toPayload(this.state, this.matchId, this.me, p.movement, p.action);
      socket.emit('turn:submit', payload, (r) => {
        if (!r.ok) { this.banner(r.error, true); this.refresh(); }
      });
    }
  }

  // Atualizações entram numa fila: duas mensagens seguidas nunca animam a partir do mesmo estado.
  apply(msg) {
    this.queue = (this.queue || Promise.resolve()).then(() => this.run(msg)).catch((e) => console.error(e));
    return this.queue;
  }

  async run({ state, events }) {
    this.busy = true;
    this.input.end();
    const prev = this.state;
    await playEvents(this.board, prev, events, this.orderUi);
    this.addLog(logLine(prev.turn, events));
    this.state = state;
    this.busy = false;
    if (state.phase === 'OVER') this.finish(events);
    else this.refresh();
  }

  finish(events) {
    this.draw();
    const w = this.state.winner;
    const fell = events.some((e) => e.t === 'fall');
    let title;
    if (w === 'draw') { title = 'Empate!'; sfx.draw(); }
    else { title = this.mode === 'online' ? (w === this.me ? 'Você venceu!' : 'Você perdeu!') : `${NAME[w]} venceu!`; sfx.win(); if (this.mode === 'local' || w === this.me) confetti(); this.board.pose(w, 'cheer', 0); }
    $('#end-title').textContent = title;
    $('#end-sub').textContent = this.state.endReason === 'time' ? 'Fim do tempo: ganha quem tem mais vidas.' : fell ? 'Caiu da ilha!' : 'Sem vidas restantes.';
    $('#banner').textContent = '';
    $('#end-again').disabled = false;
    $('#end').hidden = false;
  }
}

// Tabuleiro na visão de cima (blocos 2D).
const VIEWS = { flat: { tx: 0, rz: 0, wf: 1, hf: 1, by: 0.5 } };
const viewKey = 'flat';

function applyView() {
  const v = VIEWS.flat;
  const wrap = $('#board');
  wrap.classList.remove('v3d');
  const vars = { '--tx': '0deg', '--rz': '0deg', '--wf': v.wf, '--hf': v.hf, '--by': '50%' };
  for (const [k, val] of Object.entries(vars)) wrap.style.setProperty(k, val);
  fitBoard();
}

// Ajusta o tamanho do tabuleiro para caber na tela do celular (sem rolagem) em retrato e paisagem.
function fitBoard() {
  const g = $('#game');
  if (!g || g.hidden) return;
  const wrap = $('#board');
  const app = getComputedStyle($('#app'));
  const pad = parseFloat(app.paddingTop) + parseFloat(app.paddingBottom);
  const landscape = matchMedia('(orientation: landscape) and (max-height: 560px)').matches;
  const V = VIEWS[viewKey];
  const cw = document.documentElement.clientWidth;
  let s;
  if (landscape) {
    const top = $('.hud').offsetHeight + $('#banner').offsetHeight + 12;
    s = Math.min((innerHeight - pad - top - 16) / V.hf, (cw * 0.55) / V.wf);
  } else {
    s = (innerHeight - pad - (g.offsetHeight - wrap.offsetHeight)) / V.hf;
  }
  s = Math.floor(Math.max(150, Math.min(s, (cw * 0.96) / V.wf, 520)));
  wrap.style.setProperty('--s', `${s}px`);
}
window.addEventListener('resize', fitBoard);
window.addEventListener('orientationchange', () => setTimeout(fitBoard, 150));
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(() => fitBoard());
  ['.hud', '#banner', '#bar', '.log'].forEach((q) => { const el = document.querySelector(q); if (el) ro.observe(el); });
}

function show(id) {
  $('#menu').hidden = id !== 'menu';
  $('#game').hidden = id !== 'game';
  if (id === 'game') requestAnimationFrame(() => { fitBoard(); fitBoard(); });
}

function startLocal() {
  game = new Game('local', null);
  show('game');
  game.start(createMatch(Date.now() & 0xffff, 'p1'), 'local');
}

function ensureSocket() {
  if (socket) return socket;
  socket = window.io();
  socket.on('match:start', ({ matchId, state }) => {
    show('game');
    if (!(game instanceof Game)) game = new Game('online', game?.pendingMe || null);
    game.start(state, matchId);
  });
  socket.on('match:update', (msg) => game instanceof Game && game.apply(msg));
  socket.on('match:rematchRequested', () => { $('#end-sub').textContent = 'O rival quer revanche!'; });
  socket.on('opponent:left', () => {
    if (!(game instanceof Game)) { menuMsg('O rival saiu antes de começar.'); return; }
    game.input.end();
    $('#end-title').textContent = 'Rival saiu';
    $('#end-sub').textContent = 'A sala foi fechada.';
    $('#end-again').disabled = true;
    $('#end').hidden = false;
  });
  return socket;
}

function menuMsg(t) { $('#menu-msg').textContent = t; }

$('#btn-local').onclick = () => { unlock(); startLocal(); };

$('#btn-create').onclick = () => {
  unlock();
  const s = ensureSocket();
  s.emit('room:create', null, (r) => {
    game = { mode: 'online', pendingMe: r.playerId };
    $('#wait-code').textContent = r.code;
    $('#wait-msg').textContent = 'Aguardando o rival entrar…';
    $('#wait').hidden = false;
  });
};

$('#wait-copy').onclick = async () => {
  const link = `${location.origin}/?sala=${$('#wait-code').textContent}`;
  try { await navigator.clipboard.writeText(link); $('#wait-msg').textContent = 'Link copiado! Envie ao rival.'; }
  catch { $('#wait-msg').textContent = `Copie o link: ${link}`; }
};
$('#wait-cancel').onclick = () => {
  $('#wait').hidden = true;
  if (socket) { socket.disconnect(); socket = null; }
  game = null;
  menuMsg('');
};

$('#btn-join').onclick = () => {
  unlock();
  const code = $('#code').value.trim();
  if (code.length !== 4) return menuMsg('Digite o código de 4 letras.');
  const s = ensureSocket();
  s.emit('room:join', { code }, (r) => {
    if (!r.ok) return menuMsg(r.error);
    game = { mode: 'online', pendingMe: r.playerId };
  });
};

$('#end-again').onclick = () => {
  if (game.mode === 'local') { $('#end').hidden = true; startLocal(); }
  else { socket.emit('match:rematch'); $('#end-sub').textContent = 'Aguardando o rival aceitar…'; }
};
$('#end-menu').onclick = () => {
  $('#end').hidden = true;
  if (game instanceof Game) game.input.end();
  if (socket) { socket.disconnect(); socket = null; }
  game = null;
  menuMsg('');
  show('menu');
};
$('#btn-mute').onclick = (e) => { e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊'; };
$('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
document.addEventListener('keydown', (e) => {
  if (!(game instanceof Game) || (e.target && e.target.tagName === 'INPUT')) return;
  if (game.input.key(e)) e.preventDefault();
});
// Link de convite: /?sala=ABCD preenche o código.
const invite = new URLSearchParams(location.search).get('sala');
if (invite) { $('#code').value = invite.toUpperCase().slice(0, 4); menuMsg('Convite recebido: toque em Entrar.'); }
document.addEventListener('pointerdown', unlock, { once: true });
