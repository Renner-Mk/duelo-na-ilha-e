// Simulação de equilíbrio do coop: uma dupla "esperta" (testa todas as jogadas com a prévia da rodada)
// joga partidas inteiras contra os bots. Mostra até que fase ela chega e onde ela perde.
//   node scripts/balance.mjs [partidas=40] [semente-inicial=1] [limite-de-rodadas=250] [distração=0]
// distração = chance (0 a 1) de cada humano jogar uma jogada qualquer numa rodada, como uma pessoa que se confunde.
import { createCoopRun, resolveRound, pickUpgrade, previewRound, HUMAN_IDS } from '../shared/coop.js';
import { rng, legalMoves, legalDirs } from '../shared/rules.js';

const RUNS = Number(process.argv[2]) || 40;
const START = Number(process.argv[3]) || 1;
const MAX_ROUNDS = Number(process.argv[4]) || 250;
const SLOPPY = Number(process.argv[5]) || 0;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function plansFor(state, uid) {
  const u = state.units[uid];
  const out = [];
  for (const m of [null, ...legalMoves(state, uid)]) {
    const from = m || u.pos;
    out.push({ movement: m ? { to: m } : null, action: { type: 'WAIT', direction: null } });
    for (const type of ['PUSH', 'HOOK', 'DASH']) {
      for (const dir of legalDirs(state, type, from)) out.push({ movement: m ? { to: m } : null, action: { type, direction: dir } });
    }
  }
  return out;
}

// pontua o resultado da rodada do ponto de vista da dupla
function score(state, events, uid) {
  let s = 0;
  for (const e of events) {
    const t = state.units[e.id];
    if (!t) continue;
    const bot = t.team === 'bots';
    if (e.t === 'hit') s += bot ? 3 * e.dmg : -5 * e.dmg;
    else if (e.t === 'ko') s += bot ? 8 : -40;
    else if (e.t === 'fall') s += bot ? 14 : -60;
  }
  return s;
}

function chooseHuman(state, uid, partnerPlan, rand) {
  if (SLOPPY && rand() < SLOPPY) { // distraído: joga qualquer jogada válida
    const all = plansFor(state, uid);
    return all[Math.floor(rand() * all.length)];
  }
  let best = null;
  const enemies = Object.values(state.units).filter((x) => x.team === 'bots' && x.alive);
  for (const plan of plansFor(state, uid)) {
    const r = previewRound(state, uid, plan, partnerPlan);
    if (!r) continue;
    let sc = score(state, r.events, uid) + rand() * 0.6;
    const me = r.state.units[uid];
    if (me.alive && enemies.length) sc -= 0.35 * Math.min(...enemies.map((e) => dist(me.pos, (r.state.units[e.id] || e).pos)));
    if (!best || sc > best.sc) best = { sc, plan };
  }
  return best ? best.plan : { movement: null, action: { type: 'WAIT', direction: null } };
}

function playRun(seed) {
  const rand = rng(seed * 7919);
  let s = createCoopRun(seed).state;
  let rounds = 0;
  const stageRounds = {};
  while (s.phase !== 'OVER' && rounds < MAX_ROUNDS) {
    if (s.phase === 'UPGRADE') {
      for (const id of HUMAN_IDS) s = pickUpgrade(s, id, s.offers[id][Math.floor(rand() * s.offers[id].length)]).state;
      continue;
    }
    const plans = {};
    const alive = HUMAN_IDS.filter((id) => s.units[id].alive);
    for (const id of alive) plans[id] = chooseHuman(s, id, alive.length > 1 && id === 'h2' ? plans.h1 || null : null, rand);
    s = resolveRound(s, plans).state;
    rounds++;
    stageRounds[s.stage] = (stageRounds[s.stage] || 0) + 1;
  }
  return { stage: s.stage, rounds, over: s.phase === 'OVER', stageRounds };
}

const t0 = Date.now();
const res = [];
for (let i = 0; i < RUNS; i++) res.push(playRun(START + i));
const stages = res.map((r) => r.stage).sort((a, b) => a - b);
const pct = (p) => stages[Math.min(stages.length - 1, Math.floor(p * stages.length))];
const hist = {};
for (const st of stages) hist[st] = (hist[st] || 0) + 1;
const avgRounds = {};
for (const r of res) for (const [st, n] of Object.entries(r.stageRounds)) (avgRounds[st] = avgRounds[st] || []).push(n);
console.log(`Partidas: ${RUNS} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`Fase alcançada — mínimo ${stages[0]}, p25 ${pct(0.25)}, mediana ${pct(0.5)}, p75 ${pct(0.75)}, máximo ${stages[stages.length - 1]}`);
console.log('Distribuição:', Object.entries(hist).map(([k, v]) => `F${k}:${v}`).join(' '));
console.log('Rodadas médias por fase:', Object.entries(avgRounds).slice(0, 12).map(([k, v]) => `F${k}=${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' '));
console.log(`Não terminaram (limite de ${MAX_ROUNDS} rodadas): ${res.filter((r) => !r.over).length}`);
