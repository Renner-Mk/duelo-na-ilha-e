// IA dos bots do modo coop. Pura e determinística (usa o gerador de números aleatórios que receber).
// Cada bot testa todas as jogadas (andar × golpe × direção) numa cópia do estado, pontua o que acontece
// e escolhe a melhor. Os bots andam e telegrafam primeiro; os golpes só resolvem depois que os humanos agem.
import { DIRS, clone, legalMoves, legalDirs, validateUnitPlay, applyMove, runAction } from './rules.js';

// Golpes que cada tipo de bot sabe usar (esperar é sempre possível).
export const KIND_ACTIONS = {
  brute: ['PUSH'],
  hooker: ['HOOK', 'PUSH'],
  dasher: ['DASH', 'PUSH'],
  boss: ['PUSH', 'HOOK', 'DASH'],
};

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const alive = (s, team) => Object.values(s.units).filter((u) => u.alive && u.team === team);

// Pontua o que um golpe causou: bom ferir/derrubar humanos, ruim ferir/derrubar bot (ou a si mesmo).
function scoreEvents(events, state, uid) {
  let score = 0;
  for (const e of events) {
    const target = state.units[e.id];
    if (!target) continue;
    if (e.t === 'hit') {
      score += target.team === 'humans' ? 4 * e.dmg : -3 * e.dmg;
    } else if (e.t === 'ko') {
      score += target.team === 'humans' ? 10 : e.id === uid ? -30 : -10;
    } else if (e.t === 'fall') {
      score += target.team === 'humans' ? 14 : e.id === uid ? -200 : -14;
    }
  }
  return score;
}

// Escolhe a jogada de um bot: { movement, action }.
export function planBot(state, uid, rand) {
  const u = state.units[uid];
  const humans = alive(state, 'humans');
  const wait = { movement: null, action: { type: 'WAIT', direction: null } };
  if (!u || !u.alive || !humans.length) return wait;

  const types = KIND_ACTIONS[u.kind] || ['PUSH'];
  const nearest = (pos) => humans.reduce((best, h) => (dist(pos, h.pos) < dist(pos, best.pos) ? h : best), humans[0]);
  const d0 = dist(u.pos, nearest(u.pos).pos);

  let best = { score: -Infinity, play: wait };
  const moves = [null, ...legalMoves(state, uid)];
  for (const m of moves) {
    const pos = m || u.pos;
    const target = nearest(pos);
    const d1 = dist(pos, target.pos);
    const approach = (d0 - d1) * 0.7 + (d1 === 1 ? 0.5 : 0);
    const consider = (type, dir) => {
      const play = { movement: m ? { to: m } : null, action: { type, direction: dir } };
      if (validateUnitPlay(state, uid, play)) return;
      let score = approach + rand() * 1.2;
      if (type !== 'WAIT') {
        const sim = clone(state);
        const ev = [];
        applyMove(sim, uid, play.movement, ev);
        runAction(sim, uid, type, dir, ev);
        score += scoreEvents(ev, state, uid);
        // mirar na direção do humano mais próximo vale um pouco, mesmo sem acertar agora (ele vai ter que se mexer)
        const v = DIRS[dir];
        const dx = target.pos[0] - pos[0];
        const dy = target.pos[1] - pos[1];
        if (v[0] * dx + v[1] * dy > 0 && (v[0] === 0 ? Math.abs(dx) <= 1 : Math.abs(dy) <= 1)) score += 0.8;
      } else {
        score -= 0.5;
      }
      if (score > best.score) best = { score, play };
    };
    consider('WAIT', null);
    for (const type of types) for (const dir of legalDirs(state, type, pos)) consider(type, dir);
  }
  return best.play;
}

// Todos os bots vivos, em ordem de id: cada um anda na hora e telegrafa o golpe (que resolve depois).
// Muda `state` (posições dos bots e `pending`) e devolve os eventos.
export function planBots(state, rand) {
  const events = [];
  const pending = [];
  const ids = Object.keys(state.units).filter((id) => state.units[id].team === 'bots' && state.units[id].alive).sort();
  for (const uid of ids) {
    const p = planBot(state, uid, rand);
    applyMove(state, uid, p.movement, events);
    pending.push({ pid: uid, type: p.action.type, dir: p.action.direction || null });
    events.push({ t: 'telegraph', by: uid, type: p.action.type, dir: p.action.direction || null });
  }
  state.pending = pending;
  return events;
}
