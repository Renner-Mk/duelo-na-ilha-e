import { createMatch, play, activePlayer, telegraph, toPayload, other, summarize, MAX_TURNS } from '/shared/rules.js';
import { createCoopRun, resolveRound, pickUpgrade, previewRound, telegraphs, UPGRADES, KINDS, HUMAN_IDS, COOP_SIZE } from '/shared/coop.js';
import { Board, confetti } from './render.js';
import { Input } from './input.js';
import { playEvents } from './anim.js';
import { sfx, unlock, toggleMute, isMuted } from './sfx.js';

const $ = (s) => document.querySelector(s);
const NAME = { p1: 'Azul', p2: 'Vermelho' };
const ACT_NAME = { PUSH: 'Empurrão', HOOK: 'Gancho', DASH: 'Investida', WAIT: 'Esperar' };
const ACT_ICON = { PUSH: '🥊', HOOK: '🪝', DASH: '💨', WAIT: '💤' };

// Faixa que explica a ordem de resolução: quem age, com qual golpe e por quê.
const sideClass = (id) => (id === 'p1' || id === 'h1' ? 'p1' : id === 'p2' || id === 'h2' ? 'p2' : 'bot');
function makeOrderUi(el, nameOf = (id) => NAME[id], coop = false, shortOf = nameOf) {
  // no coop a faixa fica logo abaixo do tabuleiro, por cima dos botões (desativados durante a resolução)
  const place = () => {
    if (!coop) return;
    const wrap = document.querySelector('#board');
    el.style.top = `${wrap.offsetTop + wrap.offsetHeight + 8}px`;
  };
  return {
    show(order) {
      // no coop são muitos golpes: chips compactos (número, ícone e sigla de quem age)
      const chips = order.map((o, i) => (coop
        ? `<span class="chip ${sideClass(o.pid)}"><b>${i + 1}</b>${ACT_ICON[o.type]}<small>${shortOf(o.pid)}</small></span>`
        : `<span class="chip ${sideClass(o.pid)}"><b>${i + 1}</b>${ACT_ICON[o.type]} ${ACT_NAME[o.type]} <small>${nameOf(o.pid)}</small></span>`)).join(coop ? '' : '<i class="arr">→</i>');
      let why = '';
      const [a, b] = order;
      if (coop) {
        why = 'Investida → Gancho → Empurrão. Empate: os bots vão primeiro';
      } else if (a && b && a.type !== 'WAIT' && b.type !== 'WAIT') {
        why = a.type === b.type ? 'Mesmo golpe: quem atacou vai primeiro' : `${ACT_NAME[a.type]} vem antes de ${ACT_NAME[b.type]}`;
      } else if (a && b) {
        why = 'Esperar fica por último';
      }
      el.innerHTML = `<div class="chips">${chips}</div><div class="why">${why}</div>`;
      place();
      el.classList.add('on');
    },
    step(n) {
      place(); el.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('now', i === n - 1)); },
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

  sync(state, matchId) { // volta de uma queda de conexão: mostra o estado atual sem animar
    this.start(state, matchId);
  }

  partnerAway(seconds) {
    this.input.end();
    this.banner(`Rival desconectado… esperando ${seconds}s para ele voltar`, true);
  }

  partnerBack() {
    if (this.state && this.state.phase !== 'OVER') this.refresh();
  }

  start(state, matchId) {
    this.state = state;
    this.matchId = matchId;
    this.lastPid = null;
    document.querySelector('.rule').textContent = 'Ordem dos golpes: Investida → Gancho → Empurrão. Empate: quem atacou vai primeiro.';
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

const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Modo coop: dois jogadores (h1 Azul, h2 Vermelho) contra bots, por fases.
// Local: um aparelho controla os dois (um planeja, depois o outro). Online: cada um controla o seu (me = 'h1' | 'h2').
class CoopGame {
  constructor(mode, me) {
    this.mode = mode;
    this.me = me;
    this.state = null;
    this.matchId = null;
    this.plans = {}; // local: planos já feitos; online: só o do parceiro não é conhecido
    this.planned = []; // online: quem já enviou o plano (vem do servidor)
    this.sent = false; // online: eu já enviei o meu
    this.busy = false;
    this.board = new Board($('#board'), (p) => this.input.tap(p), COOP_SIZE);
    applyView();
    this.orderEl = document.createElement('div');
    document.querySelectorAll('#game > .order').forEach((o) => o.remove());
    this.orderEl.className = 'order coop';
    $('#game').appendChild(this.orderEl);
    this.orderUi = makeOrderUi(this.orderEl, (id) => this.nameOf(id), true, (id) => this.shortOf(id));
    this.input = new Input(
      this.board,
      { bar: $('#bar'), acts: [...document.querySelectorAll('.act')], moveBtn: $('#btn-move'), confirm: $('#btn-confirm'), hint: $('#hint'), preview: $('#preview'), clear: $('#btn-clear'), steps: $('#steps') },
      (p) => this.submit(p),
      () => this.draw(),
      { preview: (s, pid, p) => this.preview(s, pid, p), describe: (o) => this.describe(o) },
    );
  }

  nameOf(id) {
    if (id === 'h1') return 'Azul';
    if (id === 'h2') return 'Vermelho';
    const u = this.state && this.state.units[id];
    return `${(u && KINDS[u.kind] ? KINDS[u.kind].nome : 'Bot')} ${id.slice(1)}`;
  }

  // Sigla curta para os chips de ordem: Az/Ve (humanos) e B1, F2, I3, C1 (bots).
  shortOf(id) {
    if (id === 'h1') return 'Az';
    if (id === 'h2') return 'Ve';
    const u = this.state && this.state.units[id];
    return `${({ brute: 'B', hooker: 'F', dasher: 'I', boss: 'C' })[u && u.kind] || '?'}${id.slice(1)}`;
  }

  // Prévia da rodada com o plano que o jogador está montando (e o do parceiro, se já planejou).
  preview(state, pid, plan) {
    const partner = HUMAN_IDS.find((id) => id !== pid);
    const r = previewRound(state, pid, plan, this.plans[partner] || null);
    return r ? { ...r, assumed: !this.plans[partner] } : null;
  }

  describe(out) {
    const s = summarize(out.events);
    const parts = [];
    for (const id of Object.keys(out.state.units)) {
      const bits = [];
      if (s.dmg[id]) bits.push(`−${s.dmg[id]} ❤️`);
      if (s.fell.includes(id)) bits.push('cai da ilha');
      else if (s.ko.includes(id)) bits.push(id.startsWith('h') ? 'fica sem vidas' : 'é derrotado');
      else if (s.moved.includes(id)) bits.push('é deslocado');
      if (bits.length) parts.push(`${this.nameOf(id)} ${bits.join(', ')}`);
    }
    const head = out.assumed ? 'Se o parceiro ficar parado' : 'Resultado';
    return `${head}: ${parts.length ? parts.join(' · ') : 'nenhum efeito'}`;
  }

  draw() {
    if (!this.state) return;
    const s = this.state;
    const view = this.input.view();
    view.extra = s.phase === 'PLAN' ? telegraphs(s) : [];
    this.board.draw(s, view);
    const planner = this.input.active ? this.input.pid : null;
    document.querySelector('.pl.p1').classList.toggle('active', planner === 'h1');
    document.querySelector('.pl.p2').classList.toggle('active', planner === 'h2');
    const bots = Object.values(s.units).filter((u) => u.team === 'bots' && u.alive).length;
    $('#turn').textContent = `Fase ${s.stage} · Rodada ${s.round} · ${bots} inimigo${bots === 1 ? '' : 's'}`;
  }

  banner(text, alert = false) {
    const b = $('#banner');
    b.textContent = text;
    b.classList.toggle('alert', alert);
  }

  showUps(uid) {
    const el = $('#ups');
    const u = uid && this.state.units[uid];
    const list = u ? Object.entries(u.ups || {}).filter(([, n]) => n > 0).map(([id, n]) => `${UPGRADE_BY_ID[id].icon}${n > 1 ? '×' + n : ''}`).join(' ') : '';
    el.hidden = !u;
    fitBoard();
    el.textContent = u ? `${this.nameOf(uid)} · melhorias: ${list || 'nenhuma ainda'}` : '';
  }

  addLog(text) {
    const li = document.createElement('li');
    li.textContent = text;
    const ol = $('#log');
    ol.prepend(li);
    while (ol.children.length > 10) ol.lastChild.remove();
  }

  logLine(prev, events) {
    const parts = [];
    for (const e of events) {
      if (e.t === 'hit') parts.push(`${this.nameOf(e.id)} −${e.dmg}❤️`);
      else if (e.t === 'ko' && String(e.id).startsWith('e')) parts.push(`${this.nameOf(e.id)} derrotado`);
      else if (e.t === 'fall') parts.push(`${this.nameOf(e.id)} caiu`);
      else if (e.t === 'crackBreak') parts.push('a casa quebrou');
      else if (e.t === 'shield') parts.push(`${this.nameOf(e.id)} se protegeu`);
      else if (e.t === 'stageClear') parts.push('fase limpa!');
    }
    return `F${prev.stage} R${prev.round} · ${parts.length ? parts.join(' · ') : 'sem acertos'}`;
  }

  // Volta de uma queda de conexão (ou de recarregar a página): mostra o estado atual sem abertura nem animação.
  sync(state, matchId, planned) {
    this.state = state;
    this.matchId = matchId;
    this.planned = planned || [];
    this.sent = this.planned.includes(this.me);
    this.plans = {};
    this.refresh();
  }

  setPlanned(list) {
    this.planned = list;
    if (this.state && this.state.phase === 'PLAN' && this.input.active) this.banner(this.planBanner());
  }

  planBanner() {
    const partner = HUMAN_IDS.find((id) => id !== this.me);
    return this.planned.includes(partner) ? 'Seu parceiro já planejou. Sua vez!' : 'Planeje sua jogada: ande e escolha um golpe';
  }

  partnerAway(seconds) {
    this.banner(`Parceiro desconectado… esperando ${seconds}s para ele voltar`, true);
  }

  partnerBack() {
    if (this.state) this.refresh();
  }

  start(state, matchId) {
    this.state = state;
    this.matchId = matchId || null;
    this.planned = [];
    this.sent = false;
    this.plans = {};
    document.querySelector('.rule').textContent = 'Ordem dos golpes: Investida → Gancho → Empurrão. Empate: os bots vão primeiro.';
    $('#log').innerHTML = '';
    $('#end').hidden = true;
    $('#wait').hidden = true;
    this.splash(state.stage);
    this.refresh();
  }

  splash(stage) {
    const boss = stage % 5 === 0;
    const el = $('#splash');
    el.textContent = boss ? `FASE ${stage}\nCHEFÃO!` : `FASE ${stage}`;
    el.style.whiteSpace = 'pre-line';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  refresh() {
    const s = this.state;
    this.draw();
    $('#upgrade').hidden = true;
    if (s.phase === 'OVER') return this.finish();
    if (s.phase === 'UPGRADE') { this.input.end(); this.showUps(null); return this.showUpgrades(); }
    if (this.mode === 'online') {
      this.showUps(this.me);
      if (!s.units[this.me].alive) { this.input.end(); this.banner('Você caiu! Volta na próxima fase, torça pelo parceiro'); return this.draw(); }
      if (this.sent || this.planned.includes(this.me)) { this.input.end(); this.banner('Plano enviado. Aguardando o parceiro…'); return this.draw(); }
      this.input.begin(s, this.me);
      this.banner(this.planBanner());
      return this.draw();
    }
    const need = HUMAN_IDS.filter((id) => s.units[id].alive && !this.plans[id]);
    if (!need.length) return this.resolve();
    const who = need[0];
    this.banner(`${this.nameOf(who)}: ande e escolha um golpe`, false);
    this.input.begin(s, who);
    this.showUps(who);
    this.draw();
  }

  submit(play) {
    if (this.mode === 'online') {
      const s = this.state;
      this.input.end();
      this.banner('Enviando plano…');
      socket.emit('plan:submit', { matchId: this.matchId, stage: s.stage, round: s.round, movement: play.movement, action: play.action }, (r) => {
        if (r && r.ok) { this.sent = true; this.banner('Plano enviado. Aguardando o parceiro…'); this.draw(); }
        else { this.banner((r && r.error) || 'Falha ao enviar', true); this.refresh(); }
      });
      return;
    }
    this.plans[this.input.pid] = play;
    this.refresh();
  }

  resolve() {
    const r = resolveRound(this.state, this.plans);
    this.plans = {};
    this.apply(r);
  }

  apply(msg) {
    this.queue = (this.queue || Promise.resolve()).then(() => this.run(msg)).catch((e) => console.error(e));
    return this.queue;
  }

  async run({ state, events }) {
    this.busy = true;
    this.input.end();
    this.banner('Resolvendo…');
    const prev = this.state;
    // a abertura de uma fase nova não se anima (os inimigos ainda não existem na tela): só mostra a abertura
    const cut = events.findIndex((e) => e.t === 'stageStart');
    await playEvents(this.board, prev, cut < 0 ? events : events.slice(0, cut), this.orderUi);
    if (events.some((e) => e.t === 'order')) this.addLog(this.logLine(prev, events));
    this.state = state;
    this.planned = [];
    this.sent = false;
    this.busy = false;
    if (cut >= 0) { this.splash(state.stage); await sleep(900); }
    this.refresh();
  }

  // Tela de melhorias: no local, um jogador por vez; no online, só o meu.
  showUpgrades() {
    const s = this.state;
    const pending = HUMAN_IDS.filter((id) => !s.picks[id]);
    if (!pending.length) return;
    const uid = this.mode === 'local' ? pending[0] : this.me;
    if (this.mode === 'online' && s.picks[uid]) { this.banner('Melhoria escolhida. Aguardando o parceiro…'); return; }
    this.banner(`Fase ${s.stage} limpa! ${this.nameOf(uid)}, escolha sua melhoria`);
    sfx.win();
    const u = s.units[uid];
    $('#upgrade-title').textContent = `${this.nameOf(uid)}: escolha uma melhoria`;
    const box = $('#upgrade-cards');
    box.innerHTML = '';
    for (const id of s.offers[uid]) {
      const up = UPGRADE_BY_ID[id];
      const n = (u.ups || {})[id] || 0;
      const b = document.createElement('button');
      b.className = 'ucard';
      b.innerHTML = `<i>${up.icon}</i><span><b>${up.nome}</b><small>${up.desc}</small>${up.fallback ? '' : `<em>nível ${n} → ${n + 1} (máx. ${up.max})</em>`}</span>`;
      b.onclick = () => this.pick(uid, id);
      box.appendChild(b);
    }
    $('#upgrade').hidden = false;
  }

  pick(uid, id) {
    sfx.confirm();
    $('#upgrade').hidden = true;
    if (this.mode === 'local') { this.apply(pickUpgrade(this.state, uid, id)); return; }
    this.banner('Melhoria escolhida. Aguardando o parceiro…');
    socket.emit('upgrade:pick', { matchId: this.matchId, upgrade: id }, (r) => {
      if (!r || !r.ok) { this.banner((r && r.error) || 'Falha ao escolher', true); this.showUpgrades(); }
    });
  }

  finish() {
    const s = this.state;
    sfx.draw();
    $('#end-title').textContent = 'Derrota!';
    $('#end-sub').textContent = `Vocês chegaram até a fase ${s.result ? s.result.stage : s.stage}.`;
    this.banner('');
    this.showUps(null);
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
  ['.hud', '#banner', '#bar', '.log', '#ups'].forEach((q) => { const el = document.querySelector(q); if (el) ro.observe(el); });
}

function show(id) {
  $('#menu').hidden = id !== 'menu';
  $('#game').hidden = id !== 'game';
  if (id === 'game') requestAnimationFrame(() => { fitBoard(); fitBoard(); });
}

function startCoopLocal() {
  game = new CoopGame('local', null);
  show('game');
  game.start(createCoopRun(Date.now() & 0xffffff).state);
}

function startLocal() {
  game = new Game('local', null);
  show('game');
  game.start(createMatch(Date.now() & 0xffff, 'p1'), 'local');
}

// Sessão da sala (para voltar à mesma vaga depois de uma queda de conexão ou de recarregar a página).
let session = null; // { code, token, pid, mode }
let resuming = false;
function saveSession(v) {
  session = v;
  try { sessionStorage.setItem('duelo:sessao', JSON.stringify(v)); } catch { /* sem armazenamento */ }
}
function clearSession() {
  session = null;
  try { sessionStorage.removeItem('duelo:sessao'); } catch { /* sem armazenamento */ }
}

// Cria o controlador certo para o modo da sala (duelo ou coop) se ainda não existir.
function makeGame(mode) {
  if (mode === 'coop') { if (!(game instanceof CoopGame)) game = new CoopGame('online', session.pid); }
  else if (!(game instanceof Game)) game = new Game('online', session.pid);
  return game;
}

function rejoin() {
  if (!session || !socket) return;
  socket.emit('room:rejoin', { code: session.code, token: session.token }, (r) => {
    resuming = false;
    if (r && r.ok) { session.pid = r.playerId; return; }
    clearSession();
    if (game && game.input) {
      game.input.end();
      $('#end-title').textContent = 'Sala encerrada';
      $('#end-sub').textContent = 'A sala não existe mais.';
      $('#end-again').disabled = true;
      $('#end').hidden = false;
    }
  });
}

function ensureSocket() {
  if (socket) return socket;
  socket = window.io();
  let connectedOnce = false;
  socket.on('connect', () => {
    if ((connectedOnce || resuming) && session) rejoin(); // caiu e voltou (ou página recarregada)
    connectedOnce = true;
  });
  socket.on('match:start', ({ matchId, state, mode }) => {
    show('game');
    makeGame(mode).start(state, matchId);
  });
  socket.on('match:sync', ({ matchId, state, mode, planned }) => {
    show('game');
    $('#wait').hidden = true;
    makeGame(mode).sync(state, matchId, planned);
  });
  socket.on('match:update', (msg) => game && game.apply && game.apply(msg));
  socket.on('plan:status', ({ planned }) => game instanceof CoopGame && game.setPlanned(planned));
  socket.on('partner:away', ({ seconds }) => game && game.partnerAway && game.partnerAway(seconds));
  socket.on('partner:back', () => game && game.partnerBack && game.partnerBack());
  socket.on('match:rematchRequested', () => { $('#end-sub').textContent = 'O outro jogador quer revanche!'; });
  socket.on('opponent:left', () => {
    clearSession();
    if (!game || !game.input) { menuMsg('O outro jogador saiu antes de começar.'); return; }
    game.input.end();
    $('#end-title').textContent = 'Jogador saiu';
    $('#end-sub').textContent = 'A sala foi fechada.';
    $('#end-again').disabled = true;
    $('#end').hidden = false;
  });
  return socket;
}

function menuMsg(t) { $('#menu-msg').textContent = t; }

$('#btn-local').onclick = () => { unlock(); startLocal(); };
$('#btn-coop-local').onclick = () => { unlock(); startCoopLocal(); };

function createRoom(mode) {
  unlock();
  const sk = ensureSocket();
  sk.emit('room:create', { mode }, (r) => {
    saveSession({ code: r.code, token: r.token, pid: r.playerId, mode: r.mode });
    game = null;
    $('#wait-code').textContent = r.code;
    $('#wait-msg').textContent = mode === 'coop' ? 'Aguardando o seu amigo entrar…' : 'Aguardando o rival entrar…';
    $('#wait').hidden = false;
  });
}
$('#btn-create').onclick = () => createRoom('duel');
$('#btn-coop-create').onclick = () => createRoom('coop');

$('#wait-copy').onclick = async () => {
  const link = `${location.origin}/?sala=${$('#wait-code').textContent}`;
  try { await navigator.clipboard.writeText(link); $('#wait-msg').textContent = 'Link copiado! Envie ao seu amigo.'; }
  catch { $('#wait-msg').textContent = `Copie o link: ${link}`; }
};
$('#wait-cancel').onclick = () => {
  $('#wait').hidden = true;
  clearSession();
  if (socket) { socket.disconnect(); socket = null; }
  game = null;
  menuMsg('');
};

$('#btn-join').onclick = () => {
  unlock();
  const code = $('#code').value.trim();
  if (code.length !== 4) return menuMsg('Digite o código de 4 letras.');
  const sk = ensureSocket();
  sk.emit('room:join', { code }, (r) => {
    if (!r.ok) return menuMsg(r.error);
    saveSession({ code: r.code, token: r.token, pid: r.playerId, mode: r.mode });
    game = null;
  });
};

$('#end-again').onclick = () => {
  if (game instanceof CoopGame && game.mode === 'local') { $('#end').hidden = true; startCoopLocal(); }
  else if (game.mode === 'local') { $('#end').hidden = true; startLocal(); }
  else { socket.emit('match:rematch'); $('#end-sub').textContent = 'Aguardando o rival aceitar…'; }
};
$('#end-menu').onclick = () => {
  $('#end').hidden = true;
  if (game && game.input) game.input.end();
  clearSession();
  $('#ups').hidden = true;
  $('#upgrade').hidden = true;
  if (socket) { socket.disconnect(); socket = null; }
  game = null;
  menuMsg('');
  show('menu');
};
$('#btn-mute').onclick = (e) => { e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊'; };
$('#btn-mute').textContent = isMuted() ? '🔇' : '🔊';
document.addEventListener('keydown', (e) => {
  if (!(game && game.input) || (e.target && e.target.tagName === 'INPUT')) return;
  if (game.input.key(e)) e.preventDefault();
});
// Link de convite: /?sala=ABCD preenche o código.
const invite = new URLSearchParams(location.search).get('sala');
if (invite) { $('#code').value = invite.toUpperCase().slice(0, 4); menuMsg('Convite recebido: toque em Entrar.'); }
document.addEventListener('pointerdown', unlock, { once: true });
// Página recarregada no meio de uma partida online: volta à mesma vaga.
try {
  const saved = JSON.parse(sessionStorage.getItem('duelo:sessao') || 'null');
  if (saved && saved.code && saved.token) { session = saved; resuming = true; ensureSocket(); menuMsg('Voltando para a sua sala…'); }
} catch { /* sessão inválida */ }
