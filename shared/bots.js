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

// Efeito de um golpe sobre os bots (fogo amigável e queda do próprio bot): sempre ruim para o bot.
function scoreBotSide(events, state, uid) {
  let score = 0;
  for (const e of events) {
    const t = state.units[e.id];
    if (!t || t.team !== 'bots') continue;
    if (e.t === 'hit') score -= 3 * e.dmg;
    else if (e.t === 'ko') score -= e.id === uid ? 30 : 10;
    else if (e.t === 'fall') score -= e.id === uid ? 200 : 14;
  }
  return score;
}

// Efeito de um golpe sobre um humano específico: dano, queda e morte valem pontos.
function scoreHumanSide(events, hid) {
  let score = 0;
  for (const e of events) {
    if (e.id !== hid) continue;
    if (e.t === 'hit') score += 4 * e.dmg;
    else if (e.t === 'ko') score += 10;
    else if (e.t === 'fall') score += 14;
  }
  return score;
}

// Escolhe a jogada de um bot: { movement, action }.
// A IA é "preditiva": os humanos veem a mira e fogem, então o golpe é avaliado contra TODAS as casas para onde
// cada humano poderia ir (andar 1 casa ou ficar), em média. Golpes que cobrem as rotas de fuga valem mais.
export function planBot(state, uid, rand, covered = null) {
  const u = state.units[uid];
  const humans = alive(state, 'humans');
  const wait = { movement: null, action: { type: 'WAIT', direction: null } };
  if (!u || !u.alive || !humans.length) return wait;

  const types = KIND_ACTIONS[u.kind] || ['PUSH'];
  const nearest = (pos) => humans.reduce((best, h) => (dist(pos, h.pos) < dist(pos, best.pos) ? h : best), humans[0]);
  const d0 = dist(u.pos, nearest(u.pos).pos);
  // para onde cada humano pode ir (vê a mira, então pode fugir)
  const reach = humans.map((h) => ({ h, tiles: [h.pos, ...legalMoves(state, h.id)] }));
  const tk = (p) => p.join(',');

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
      if (type === 'WAIT') {
        score -= 0.5;
      } else {
        // efeito sobre os bots, com os humanos onde estão
        const sim0 = clone(state);
        const ev0 = [];
        applyMove(sim0, uid, play.movement, ev0);
        runAction(sim0, uid, type, dir, ev0);
        score += scoreBotSide(ev0, state, uid);
        // efeito esperado sobre cada humano, médio entre as casas para onde ele poderia ir
        for (const { h, tiles } of reach) {
          let acc = 0;
          for (const p of tiles) {
            const sim = clone(state);
            const ev = [];
            sim.units[h.id].pos = [...p];
            applyMove(sim, uid, play.movement, ev);
            runAction(sim, uid, type, dir, ev);
            const v = scoreHumanSide(ev, h.id);
            // casa de fuga que outro bot já cobre vale pouco: os bots se espalham para fechar as rotas de fuga
            acc += covered && v > 0 && covered[h.id] && covered[h.id].has(tk(p)) ? v * 0.25 : v;
          }
          score += acc / tiles.length;
        }
        // mirar na direção do humano mais próximo vale um pouco, mesmo sem acertar agora
        const v = DIRS[dir];
        const dx = target.pos[0] - pos[0];
        const dy = target.pos[1] - pos[1];
        if (v[0] * dx + v[1] * dy > 0 && (v[0] === 0 ? Math.abs(dx) <= 1 : Math.abs(dy) <= 1)) score += 0.8;
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
// Marca as casas de fuga de cada humano que o golpe escolhido cobre (para os próximos bots não repetirem).
function markCovered(state, uid, play, covered) {
  if (play.action.type === 'WAIT') return;
  for (const h of alive(state, 'humans')) {
    for (const p of [h.pos, ...legalMoves(state, h.id)]) {
      const sim = clone(state);
      const ev = [];
      sim.units[h.id].pos = [...p];
      applyMove(sim, uid, play.movement, ev);
      runAction(sim, uid, play.action.type, play.action.direction, ev);
      if (scoreHumanSide(ev, h.id) > 0) (covered[h.id] = covered[h.id] || new Set()).add(p.join(','));
    }
  }
}

export function planBots(state, rand) {
  const events = [];
  const pending = [];
  const covered = {};
  const ids = Object.keys(state.units).filter((id) => state.units[id].team === 'bots' && state.units[id].alive).sort();
  for (const uid of ids) {
    const p = planBot(state, uid, rand, covered);
    markCovered(state, uid, p, covered); // antes de andar: as casas de fuga são as de agora
    applyMove(state, uid, p.movement, events);
    pending.push({ pid: uid, type: p.action.type, dir: p.action.direction || null });
    events.push({ t: 'telegraph', by: uid, type: p.action.type, dir: p.action.direction || null });
  }
  state.pending = pending;
  return events;
}
