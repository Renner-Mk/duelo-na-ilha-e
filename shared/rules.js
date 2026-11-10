// Regras puras do Duelo na Ilha. Sem DOM, sem rede: usado pelo servidor e pelo navegador.
// Coordenadas: [x, y], x = coluna, y = linha (0 = topo). O tamanho do tabuleiro vem de `state.size` (5 no duelo).
// Unidades: { id, team, kind, pos, hp, maxHp, alive, mods }. `mods` guarda as melhorias do modo coop
// (bônus aditivos: pushDmg, pushKnock, hookRange, hookPull, dashRange, dashDmg, moveRange, shield, heavy).

export const SIZE = 5; // tamanho padrão (duelo)
export const MAX_HP = 3;
export const HOOK_RANGE = 3;
export const HOOK_PULL = 2;
export const MAX_TURNS = 16;

export const DIRS = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};
export const DIR_NAMES = Object.keys(DIRS);
export const ACTIONS = ['PUSH', 'HOOK', 'DASH', 'WAIT'];
export const DASH_RANGE = 2;
// Iniciativa: quanto menor, mais cedo resolve. Investida e gancho reposicionam; o empurrão fecha.
export const PRIORITY = { DASH: 1, HOOK: 2, PUSH: 3, WAIT: 4 };

// Mapas: cada um descreve metade; o resto é espelhado por rotação de 180° (justo para os dois lados).
// holes = buracos; mtn = montanhas (2 HP); cracks = casas rachadas; springs = molas.
// Limite: buracos + casas rachadas somam no máximo MAX_HOLES, então o tabuleiro nunca passa de 3 buracos
// (uma casa rachada vira buraco quando quebra).
export const MAX_HOLES = 3;
export const LAYOUTS = [
  { name: 'Clássico', holes: [[1, 2]], cracks: [[2, 2]] },
  { name: 'Montanhas', holes: [[2, 2]], mtn: [[1, 1], [3, 1]] },
  { name: 'Molas', holes: [[0, 1]], springs: [[1, 2], [1, 1]] },
  { name: 'Rachado', holes: [[2, 2]], cracks: [[1, 1]], springs: [[0, 2]] },
  { name: 'Cruzamento', holes: [[0, 2]], mtn: [[2, 2]], springs: [[1, 1]] },
];

function expand(list = [], size = SIZE) {
  const mirror = (p) => [size - 1 - p[0], size - 1 - p[1]];
  const seen = new Set();
  const out = [];
  for (const p of list.flatMap((q) => [q, mirror(q)])) {
    const k = p.join(',');
    if (!seen.has(k)) { seen.add(k); out.push([...p]); }
  }
  return out;
}

// ---------- utilidades ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const eq = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const inBounds = (p, size = SIZE) => p[0] >= 0 && p[1] >= 0 && p[0] < size && p[1] < size;
// Bônus de melhoria de uma unidade (0 se não tiver).
export const mod = (u, key) => (u && u.mods && u.mods[key]) || 0;
export const other = (pid) => (pid === 'p1' ? 'p2' : 'p1');
export const clone = (s) => JSON.parse(JSON.stringify(s));

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isHole(s, p) {
  return s.holes.some((h) => eq(h, p));
}
export function rockAt(s, p) {
  return s.rocks.find((r) => eq(r.pos, p)) || null;
}
export function unitAt(s, p) {
  return Object.values(s.units).find((u) => u.alive && eq(u.pos, p)) || null;
}
export function isCrack(s, p) {
  return (s.cracks || []).some((c) => eq(c, p));
}
export function isSpring(s, p) {
  return (s.springs || []).some((c) => eq(c, p));
}
export function isFree(s, p) {
  return inBounds(p, s.size) && !isHole(s, p) && !rockAt(s, p) && !unitAt(s, p);
}
// Andar por conta própria: não vale pisar em casa rachada (ela só quebra quando alguém é jogado nela).
export function canStand(s, p) {
  return isFree(s, p) && !isCrack(s, p);
}

// Quem deve jogar agora.
export function activePlayer(s) {
  if (s.phase === 'OVER') return null;
  return s.phase === 'DECLARE' ? s.attacker : other(s.attacker);
}

// ---------- criação ----------
export function createMatch(seed = Date.now(), firstAttacker = 'p1', layoutIndex = null) {
  const r = rng(seed);
  const L = LAYOUTS[layoutIndex ?? Math.floor(r() * LAYOUTS.length)];
  const holes = expand(L.holes);
  return {
    mapName: L.name,
    cracks: expand(L.cracks),
    springs: expand(L.springs),
    size: SIZE,
    seed,
    turn: 1,
    attacker: firstAttacker,
    phase: 'DECLARE',
    units: {
      p1: { id: 'p1', team: 'p1', kind: 'fox', pos: [2, 4], hp: MAX_HP, maxHp: MAX_HP, alive: true, mods: {} },
      p2: { id: 'p2', team: 'p2', kind: 'cat', pos: [2, 0], hp: MAX_HP, maxHp: MAX_HP, alive: true, mods: {} },
    },
    rocks: expand(L.mtn).map((pos) => ({ pos, hp: 2, kind: 'mtn' })),
    holes,
    pending: null, // { pid, type, dir }
    winner: null, // 'p1' | 'p2' | 'draw'
    endReason: null,
  };
}

// ---------- jogadas legais ----------
export function legalMoves(s, pid) {
  const u = s.units[pid];
  const range = 1 + mod(u, 'moveRange'); // "passo longo" amplia o alcance, sempre por casas livres
  const res = [];
  const seen = new Set([u.pos.join(',')]);
  let frontier = [u.pos];
  for (let step = 0; step < range; step++) {
    const next = [];
    for (const from of frontier) {
      for (const d of DIR_NAMES) {
        const to = add(from, DIRS[d]);
        const k = to.join(',');
        if (seen.has(k) || !canStand(s, to)) continue;
        seen.add(k);
        res.push(to);
        next.push(to);
      }
    }
    frontier = next;
  }
  return res;
}

// Direções válidas para uma ação a partir de `from`.
export function legalDirs(s, type, from) {
  if (type === 'WAIT') return [];
  return DIR_NAMES.filter((d) => {
    const t = add(from, DIRS[d]);
    return inBounds(t, s.size);
  });
}

// Valida a jogada inteira; retorna mensagem de erro ou null.
export function validatePlay(s, pid, play) {
  if (s.phase === 'OVER') return 'Partida encerrada';
  if (activePlayer(s) !== pid) return 'Não é sua vez';
  return validateUnitPlay(s, pid, play);
}

// Valida só a jogada da unidade (movimento + golpe), sem olhar fase ou vez. Serve ao duelo e ao coop.
export function validateUnitPlay(s, pid, play) {
  const u = s.units[pid];
  if (!u || !u.alive) return 'Unidade fora de combate';
  let from = u.pos;
  const mv = play && play.movement;
  if (mv && mv.to) {
    if (!legalMoves(s, pid).some((p) => eq(p, mv.to))) return 'Movimento inválido';
    from = mv.to;
  }
  const a = play && play.action;
  if (!a || !ACTIONS.includes(a.type)) return 'Ação inválida';
  if (a.type === 'WAIT') return null;
  if (!DIR_NAMES.includes(a.direction)) return 'Direção inválida';
  // Simula o movimento para checar a direção (a pedra exige casa livre depois de mover).
  const sim = clone(s);
  sim.units[pid].pos = from;
  if (!legalDirs(sim, a.type, from).includes(a.direction)) return 'Direção inválida';
  return null;
}

// ---------- resolução ----------
function damageUnit(s, u, n, ev, cause) {
  if (!u.alive) return;
  if (n > 0 && mod(u, 'shield') > 0) { // escudo anula o próximo dano
    u.mods.shield -= 1;
    ev.push({ t: 'shield', id: u.id });
    return;
  }
  u.hp = Math.max(0, u.hp - n);
  ev.push({ t: 'hit', id: u.id, dmg: n, hp: u.hp, cause });
  if (u.hp === 0) {
    u.alive = false;
    ev.push({ t: 'ko', id: u.id, at: [...u.pos] });
  }
}

function damageRock(s, rock, ev) {
  rock.hp -= 1;
  if (rock.hp <= 0) {
    s.rocks = s.rocks.filter((r) => r !== rock);
    ev.push({ t: 'rockBreak', at: [...rock.pos] });
  } else {
    ev.push({ t: 'rockHit', at: [...rock.pos], hp: rock.hp });
  }
}

function fall(s, u, at, ev) {
  u.pos = [...at];
  u.alive = false;
  ev.push({ t: 'fall', id: u.id, at: [...at], off: !inBounds(at, s.size) });
}

// Unidade acabou de parar numa casa: buraco derruba; casa rachada quebra e derruba. Retorna true se caiu.
function land(s, u, ev) {
  if (isHole(s, u.pos)) {
    fall(s, u, u.pos, ev);
    return true;
  }
  if (isCrack(s, u.pos)) {
    s.cracks = s.cracks.filter((c) => !eq(c, u.pos));
    s.holes.push([...u.pos]);
    ev.push({ t: 'crackBreak', at: [...u.pos] });
    fall(s, u, u.pos, ev);
    return true;
  }
  return false;
}

// Um passo forçado (empurrão/lançamento) na direção d. Retorna 'moved' | 'blocked' | 'dead'.
function forcedStep(s, u, d, ev, evType) {
  const dest = add(u.pos, DIRS[d]);
  if (!inBounds(dest, s.size)) {
    ev.push({ t: evType, id: u.id, from: [...u.pos], to: dest });
    fall(s, u, dest, ev);
    return 'dead';
  }
  const rock = rockAt(s, dest);
  if (rock) {
    ev.push({ t: 'bump', id: u.id, into: dest, what: 'rock' });
    damageRock(s, rock, ev);
    damageUnit(s, u, 1, ev, 'bump');
    return u.alive ? 'blocked' : 'dead';
  }
  const blocker = unitAt(s, dest);
  if (blocker) {
    ev.push({ t: 'bump', id: u.id, into: dest, what: 'unit' });
    damageUnit(s, u, 1, ev, 'bump');
    damageUnit(s, blocker, 1, ev, 'bump');
    return u.alive ? 'blocked' : 'dead';
  }
  ev.push({ t: evType, id: u.id, from: [...u.pos], to: dest });
  u.pos = dest;
  return land(s, u, ev) ? 'dead' : 'moved';
}

// Quantas casas o alvo recua: 1 + melhoria de quem bate - "casca grossa" de quem apanha (mínimo 0).
function knockDist(actor, target) {
  return Math.max(0, 1 + mod(actor, 'pushKnock') - mod(target, 'heavy'));
}

// Empurra a unidade `dist` casas na direção d. Mola: arremessa mais 2 casas na mesma direção.
function knockback(s, u, d, ev, dist = 1) {
  for (let i = 0; i < dist; i++) {
    if (!u.alive) return;
    if (forcedStep(s, u, d, ev, 'knock') !== 'moved') return;
    if (isSpring(s, u.pos)) {
      ev.push({ t: 'spring', id: u.id, at: [...u.pos] });
      for (let j = 0; j < 2; j++) {
        if (forcedStep(s, u, d, ev, 'launch') !== 'moved') return;
      }
      return;
    }
  }
}

function doPush(s, actor, d, ev) {
  const tile = add(actor.pos, DIRS[d]);
  ev.push({ t: 'push', by: actor.id, dir: d, tile });
  if (!inBounds(tile, s.size)) return ev.push({ t: 'whiff', by: actor.id, at: tile });
  const target = unitAt(s, tile);
  if (target) {
    damageUnit(s, target, 1 + mod(actor, 'pushDmg'), ev, 'push');
    return knockback(s, target, d, ev, knockDist(actor, target));
  }
  const rock = rockAt(s, tile);
  if (rock) return damageRock(s, rock, ev);
  ev.push({ t: 'whiff', by: actor.id, at: tile });
}

// Casas cobertas pelo gancho a partir de `from` (para até borda ou pedra).
export function hookLine(s, from, d, range = HOOK_RANGE) {
  const tiles = [];
  let p = from;
  for (let i = 0; i < range; i++) {
    p = add(p, DIRS[d]);
    if (!inBounds(p, s.size)) break;
    tiles.push(p);
    if (rockAt(s, p) || unitAt(s, p)) break;
  }
  return tiles;
}

function doHook(s, actor, d, ev) {
  const tiles = hookLine(s, actor.pos, d, HOOK_RANGE + mod(actor, 'hookRange'));
  const last = tiles[tiles.length - 1];
  const target = last ? unitAt(s, last) : null;
  ev.push({ t: 'hook', by: actor.id, dir: d, tiles, hit: target ? target.id : last && rockAt(s, last) ? 'rock' : null });
  if (!target) return ev.push({ t: 'whiff', by: actor.id, at: last || add(actor.pos, DIRS[d]) });
  const back = [-DIRS[d][0], -DIRS[d][1]];
  const steps = Math.min(HOOK_PULL + mod(actor, 'hookPull'), tiles.length - 1);
  for (let i = 0; i < steps && target.alive; i++) {
    const dest = add(target.pos, back);
    ev.push({ t: 'pull', id: target.id, from: [...target.pos], to: dest });
    target.pos = dest;
    land(s, target, ev);
  }
}

// Caminho da investida: até DASH_RANGE casas; para antes de borda ou pedra, e se encontrar um rival
// no caminho para colado nele e o atinge. Buraco e casa rachada NÃO bloqueiam: quem entra neles cai.
export function dashPath(s, from, d, range = DASH_RANGE) {
  const tiles = [];
  let hit = null;
  let falls = false;
  let p = from;
  for (let i = 0; i < range; i++) {
    const next = add(p, DIRS[d]);
    if (!inBounds(next, s.size) || rockAt(s, next)) break;
    const u = unitAt(s, next);
    if (u) { hit = u; break; }
    tiles.push(next);
    p = next;
    if (isHole(s, next) || isCrack(s, next)) { falls = true; break; } // cai ali e a investida termina
  }
  return { tiles, hit, falls };
}

function doDash(s, actor, d, ev) {
  const { tiles, hit } = dashPath(s, actor.pos, d, DASH_RANGE + mod(actor, 'dashRange'));
  if (tiles.length) {
    const from = [...actor.pos];
    actor.pos = [...tiles[tiles.length - 1]];
    ev.push({ t: 'dash', id: actor.id, from, to: [...actor.pos], dir: d });
    if (land(s, actor, ev)) return; // buraco ou casa rachada: cai e perde
  }
  if (hit) {
    ev.push({ t: 'charge', by: actor.id, dir: d, tile: [...hit.pos] });
    damageUnit(s, hit, 1 + mod(actor, 'dashDmg'), ev, 'dash');
    return knockback(s, hit, d, ev, knockDist(actor, hit));
  }
  if (!tiles.length) ev.push({ t: 'whiff', by: actor.id, at: add(actor.pos, DIRS[d]) });
}

export function runAction(s, pid, type, d, ev) {
  const actor = s.units[pid];
  if (!actor.alive) return;
  if (type === 'PUSH') doPush(s, actor, d, ev);
  else if (type === 'HOOK') doHook(s, actor, d, ev);
  else if (type === 'DASH') doDash(s, actor, d, ev);
  else ev.push({ t: 'wait', by: pid });
}

export function applyMove(s, pid, mv, ev) {
  if (!mv || !mv.to) return;
  const u = s.units[pid];
  ev.push({ t: 'move', id: pid, from: [...u.pos], to: [...mv.to] });
  u.pos = [...mv.to];
}

function checkEnd(s, ev) {
  const a = s.units.p1.alive;
  const b = s.units.p2.alive;
  if (a && b) return false;
  s.phase = 'OVER';
  s.pending = null;
  s.winner = !a && !b ? 'draw' : a ? 'p1' : 'p2';
  s.endReason = 'ko';
  ev.push({ t: 'end', winner: s.winner, reason: s.endReason });
  return true;
}

// Fase 1: o Atacante move e agenda a ação (telegrafada).
export function declare(state, pid, play) {
  const err = validatePlay(state, pid, play);
  if (err) throw new Error(err);
  if (state.phase !== 'DECLARE') throw new Error('Fase errada');
  const s = clone(state);
  const ev = [];
  applyMove(s, pid, play.movement, ev);
  const a = play.action;
  s.pending = a.type === 'WAIT' ? { pid, type: 'WAIT', dir: null } : { pid, type: a.type, dir: a.direction };
  ev.push({ t: 'telegraph', by: pid, type: a.type, dir: a.direction || null });
  s.phase = 'REACT';
  return { state: s, events: ev };
}

// Fase 2 + 3: o Reator move e age na hora; depois o ataque agendado resolve.
export function react(state, pid, play) {
  const err = validatePlay(state, pid, play);
  if (err) throw new Error(err);
  if (state.phase !== 'REACT') throw new Error('Fase errada');
  const s = clone(state);
  const ev = [];
  applyMove(s, pid, play.movement, ev);
  // As duas ações ficam telegrafadas e resolvem por prioridade (empate: quem atacou vai primeiro).
  // Assim o reator não ganha só por entrar colado e bater antes: ele precisa sair da casa mirada.
  const mine = { pid, type: play.action.type, dir: play.action.direction || null };
  ev.push({ t: 'telegraph', by: pid, type: mine.type, dir: mine.dir });
  const queue = [];
  if (s.pending) queue.push({ ...s.pending }); // o atacante entra primeiro: vence os empates (sort estável)
  queue.push(mine);
  queue.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  ev.push({ t: 'order', order: queue.map((q) => ({ pid: q.pid, type: q.type, dir: q.dir })) });
  s.pending = null;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    ev.push({ t: 'resolve', by: q.pid, n: i + 1 });
    runAction(s, q.pid, q.type, q.dir, ev);
    if (checkEnd(s, ev)) return { state: s, events: ev };
  }

  if (s.turn >= MAX_TURNS) {
    s.phase = 'OVER';
    const h1 = s.units.p1.hp;
    const h2 = s.units.p2.hp;
    s.winner = h1 === h2 ? 'draw' : h1 > h2 ? 'p1' : 'p2';
    s.endReason = 'time';
    ev.push({ t: 'end', winner: s.winner, reason: 'time' });
    return { state: s, events: ev };
  }
  s.turn += 1;
  s.attacker = other(s.attacker);
  s.phase = 'DECLARE';
  ev.push({ t: 'swap', attacker: s.attacker, turn: s.turn });
  return { state: s, events: ev };
}

// Aplica uma jogada na fase atual.
export function play(state, pid, p) {
  return state.phase === 'DECLARE' ? declare(state, pid, p) : react(state, pid, p);
}

// Casas que uma ação vai afetar, a partir da posição atual (para desenhar mira/seta).
export function actionPreview(s, pid, type, d) {
  const u = s.units[pid];
  if (!u || !u.alive || !type || type === 'WAIT' || !d) return null;
  if (type === 'HOOK') {
    const tiles = hookLine(s, u.pos, d, HOOK_RANGE + mod(u, 'hookRange'));
    return { type, dir: d, from: [...u.pos], tiles, target: tiles[tiles.length - 1] || null };
  }
  if (type === 'DASH') {
    const { tiles, hit } = dashPath(s, u.pos, d, DASH_RANGE + mod(u, 'dashRange'));
    const all = hit ? [...tiles, hit.pos] : tiles;
    return { type, dir: d, from: [...u.pos], tiles: all, target: all[all.length - 1] || add(u.pos, DIRS[d]) };
  }
  const tile = add(u.pos, DIRS[d]);
  return { type, dir: d, from: [...u.pos], tiles: [tile], target: tile };
}

export function telegraph(s) {
  if (!s.pending || s.pending.type === 'WAIT') return null;
  return actionPreview(s, s.pending.pid, s.pending.type, s.pending.dir);
}

// Prévia determinística (estilo Into the Breach): mostra o que a jogada causa.
// Na fase DECLARE, assume que o rival não faz nada (`assumed: true`); na REACT, é o resultado real.
export function previewOutcome(state, pid, p) {
  try {
    if (validatePlay(state, pid, p)) return null;
    if (state.phase === 'DECLARE') {
      const d = declare(state, pid, p);
      const r = react(d.state, other(pid), { movement: null, action: { type: 'WAIT' } });
      return { state: r.state, events: r.events, assumed: true };
    }
    const r = react(state, pid, p);
    return { state: r.state, events: r.events, assumed: false };
  } catch {
    return null;
  }
}

// Resume eventos: dano por unidade, quem caiu, quem morreu, quem foi deslocado.
export function summarize(events) {
  const out = { dmg: { p1: 0, p2: 0 }, fell: [], ko: [], moved: [] };
  for (const e of events) {
    if (e.t === 'hit') out.dmg[e.id] = (out.dmg[e.id] || 0) + e.dmg;
    else if (e.t === 'fall') out.fell.push(e.id);
    else if (e.t === 'ko') out.ko.push(e.id);
    else if (e.t === 'knock' || e.t === 'pull') out.moved.push(e.id);
  }
  return out;
}

// Converte jogada da UI para o payload de rede do GDD.
export function toPayload(s, matchId, pid, movement, action) {
  const u = s.units[pid];
  const from = movement && movement.to ? movement.to : u.pos;
  return {
    matchId,
    playerId: pid,
    turn: s.turn,
    movement: movement && movement.to ? { from: [...u.pos], to: [...movement.to] } : null,
    action: {
      type: action.type,
      direction: action.direction || null,
      targetTile: action.direction ? add(from, DIRS[action.direction]) : null,
    },
  };
}
