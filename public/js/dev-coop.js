// Página de teste visual do coop: mostra a fase atual, os telegrafes dos bots e roda rodadas com animação.
// (Será substituída pelo controlador do modo coop na Etapa 4.)
import { createCoopRun, resolveRound, pickUpgrade, telegraphs, stageSpec, KINDS, HUMAN_IDS } from '/shared/coop.js';
import { legalMoves, DIRS, DIR_NAMES, clone, add } from '/shared/rules.js';
import { Board } from './render.js';
import { playEvents } from './anim.js';

const $ = (q) => document.querySelector(q);
let seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
let state = null;
let board = null;
let busy = false;

function fit() {
  const wrap = $('#board');
  const s = Math.floor(Math.min(document.documentElement.clientWidth * 0.96, innerHeight - 280, 560));
  wrap.style.setProperty('--s', `${Math.max(220, s)}px`);
  for (const [k, v] of Object.entries({ '--wf': 1, '--hf': 1, '--tx': '0deg', '--rz': '0deg', '--by': '50%' })) wrap.style.setProperty(k, v);
}
window.addEventListener('resize', fit);

function info() {
  const bots = Object.values(state.units).filter((u) => u.team === 'bots' && u.alive);
  const kinds = [...new Set(bots.map((b) => KINDS[b.kind].nome))].join(', ');
  const hs = HUMAN_IDS.map((id) => `${id}: ${state.units[id].hp}/${state.units[id].maxHp}`).join('  ');
  $('#info').textContent = `Fase ${state.stage} · rodada ${state.round} · ${bots.length} inimigos (${kinds}) · ${hs} · ${state.phase}`;
}

function draw() {
  board.draw(state, { extra: state.phase === 'PLAN' ? telegraphs(state) : [] });
  info();
}

function log(text) {
  const li = document.createElement('div');
  li.textContent = text;
  $('#log').prepend(li);
}

// monta a fase `stage` partindo de uma partida nova (limpa as fases anteriores automaticamente)
function build(stage) {
  let s = createCoopRun(seed).state;
  while (s.stage < stage) {
    s = clone(s);
    for (const u of Object.values(s.units)) if (u.team === 'bots') u.alive = false;
    s.pending = [];
    s = resolveRound(Object.assign(s, { phase: 'PLAN' }), {}).state;
    for (const id of HUMAN_IDS) s = pickUpgrade(s, id, s.offers[id][0]).state;
  }
  state = s;
  board = new Board($('#board'), () => {}, state.size);
  fit();
  draw();
  const sp = stageSpec(stage);
  log(`Fase ${stage}: ${sp.count} inimigos${sp.boss ? ' (com chefão)' : ''}, vida extra +${sp.hpBonus}`);
}

// humanos "atacam": cada um anda 1 casa em direção ao inimigo mais próximo e empurra para lá
function attackPlans() {
  const bots = Object.values(state.units).filter((u) => u.team === 'bots' && u.alive);
  const plans = {};
  for (const id of HUMAN_IDS) {
    const u = state.units[id];
    if (!u.alive || !bots.length) continue;
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const target = bots.reduce((b, x) => (dist(u.pos, x.pos) < dist(u.pos, b.pos) ? x : b), bots[0]);
    const mv = legalMoves(state, id).sort((a, b) => dist(a, target.pos) - dist(b, target.pos))[0];
    const from = mv && dist(mv, target.pos) < dist(u.pos, target.pos) ? mv : u.pos;
    const dir = DIR_NAMES.reduce((best, d) => (dist(add(from, DIRS[d]), target.pos) < dist(add(from, DIRS[best]), target.pos) ? d : best), 'UP');
    plans[id] = { movement: mv && from === mv ? { to: mv } : null, action: { type: 'PUSH', direction: dir } };
  }
  return plans;
}

async function round(plans) {
  if (busy || state.phase === 'OVER') return;
  busy = true;
  if (state.phase === 'UPGRADE') {
    for (const id of HUMAN_IDS) state = pickUpgrade(state, id, state.offers[id][0]).state;
    log(`Melhorias escolhidas → fase ${state.stage}`);
    board = new Board($('#board'), () => {}, state.size);
    fit();
    draw();
    busy = false;
    return;
  }
  const r = resolveRound(state, plans);
  await playEvents(board, state, r.events, {});
  state = r.state;
  const hits = r.events.filter((e) => e.t === 'hit').length;
  log(`Rodada resolvida: ${hits} golpes acertaram${state.phase === 'UPGRADE' ? ' — fase limpa!' : ''}${state.phase === 'OVER' ? ' — derrota' : ''}`);
  draw();
  busy = false;
}

$('#b-seed').onclick = () => { seed += 1; build(state.stage); };
$('#b-prev').onclick = () => build(Math.max(1, state.stage - 1));
$('#b-next').onclick = () => build(state.stage + 1);
$('#b-round').onclick = () => round({});
$('#b-attack').onclick = () => round(attackPlans());

build(Number(new URLSearchParams(location.search).get('stage')) || 1);
