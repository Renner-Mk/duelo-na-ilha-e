// Modo coop por fases: dois jogadores (h1 e h2) contra bots, em um tabuleiro 7x7.
// Lógica pura e determinística (tudo deriva de `state.seed`): usada pelo servidor e pelo navegador.
//
// Rodada: os bots andam e telegrafam → os dois humanos planejam juntos (andar ≤1 casa + 1 golpe cada)
// → tudo resolve por prioridade (Investida → Gancho → Empurrão; empate: bots primeiro).
// Fase limpa → cada humano escolhe 1 de 3 melhorias → próxima fase, mais difícil.
// Derrota: os dois humanos caídos. Quem cai volta na fase seguinte com 1 de vida.
import {
  rng, clone, canStand, validateUnitPlay, applyMove, runAction, actionPreview, PRIORITY, MAX_HOLES, mod,
} from './rules.js';
import { planBots } from './bots.js';

export const COOP_SIZE = 7;
export const HUMAN_IDS = ['h1', 'h2'];
export const MAX_ENEMIES = 10;
export const HEAL_PER_STAGE = 1;
export const HUMAN_MAX_HP = 3;
const HUMAN_SPAWN = { h1: [2, 6], h2: [4, 6] };

export const KINDS = {
  brute: { nome: 'Brutamontes', hp: 2 },
  hooker: { nome: 'Fisgador', hp: 2 },
  dasher: { nome: 'Investidor', hp: 2 },
  boss: { nome: 'Chefão', hp: 5 },
};

// Melhorias (empilháveis até `max`). `mods` é somado aos bônus da unidade (ver rules.js).
export const UPGRADES = [
  { id: 'vida', icon: '❤️', nome: 'Coração extra', desc: '+1 de vida máxima e cura 1', max: 5 },
  { id: 'forca', icon: '💪', nome: 'Soco forte', desc: 'Empurrão causa +1 de dano', max: 3, mods: { pushDmg: 1 } },
  { id: 'arremesso', icon: '🚀', nome: 'Arremesso', desc: 'Empurrão joga 1 casa a mais', max: 2, mods: { pushKnock: 1 } },
  { id: 'fisga', icon: '🎣', nome: 'Fisga longa', desc: 'Gancho alcança 1 casa a mais', max: 3, mods: { hookRange: 1 } },
  { id: 'puxao', icon: '🧲', nome: 'Puxão forte', desc: 'Gancho puxa 1 casa a mais', max: 2, mods: { hookPull: 1 } },
  { id: 'impulso', icon: '💨', nome: 'Impulso', desc: 'Investida avança 1 casa a mais', max: 2, mods: { dashRange: 1 } },
  { id: 'choque', icon: '💥', nome: 'Choque', desc: 'Investida causa +1 de dano', max: 3, mods: { dashDmg: 1 } },
  { id: 'passo', icon: '👟', nome: 'Passo longo', desc: 'Anda até 2 casas por rodada', max: 1, mods: { moveRange: 1 } },
  { id: 'escudo', icon: '🛡️', nome: 'Escudo', desc: 'Anula o próximo dano (volta a cada fase)', max: 2, mods: { shieldMax: 1, shield: 1 } },
  { id: 'casca', icon: '🪨', nome: 'Casca grossa', desc: 'Recua 1 casa a menos ao ser empurrado', max: 2, mods: { heavy: 1 } },
  // reserva: aparece quando as outras acabam, para a partida nunca ficar sem escolha
  { id: 'cura', icon: '🍎', nome: 'Maçã', desc: 'Cura toda a vida', max: Infinity, fallback: true },
];
const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

const hash = (...nums) => {
  let h = 2166136261;
  for (const n of nums) { h = Math.imul(h ^ (n | 0), 16777619); h ^= h >>> 13; }
  return h >>> 0;
};
const strHash = (s) => [...s].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const key = (p) => p.join(',');

// ---------- fases ----------
// Quanto cada fase pede: quantidade, tipos liberados, vida extra e bônus de "elite".
export function stageSpec(stage) {
  const kinds = ['brute'];
  if (stage >= 3) kinds.push('hooker');
  if (stage >= 4) kinds.push('dasher');
  return {
    // 2 na fase 1, até 6 na fase 8; depois mais 1 a cada 4 fases (máximo 10)
    count: Math.min(Math.min(2 + Math.floor(stage / 2), 6) + Math.floor(Math.max(0, stage - 8) / 4), MAX_ENEMIES),
    boss: stage % 5 === 0,
    kinds,
    hpBonus: Math.floor((stage - 1) / 3),
    tier: Math.floor((stage - 1) / 4),
  };
}

function enemyMods(kind, tier) {
  const t = Math.min(tier, 4);
  if (!t) return {};
  if (kind === 'brute') return { pushDmg: t };
  if (kind === 'hooker') return { hookRange: t };
  if (kind === 'dasher') return { dashRange: Math.min(t, 2), dashDmg: Math.min(t, 2), pushDmg: Math.floor(t / 2) };
  return { pushDmg: t, pushKnock: Math.min(t, 1), dashRange: Math.min(t, 2), hookRange: Math.min(t, 2) }; // chefão
}

function shuffle(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Sorteia o terreno da fase. Retorna null se o resultado não for jogável (tenta de novo com outra semente).
function tryTerrain(r, count) {
  const size = COOP_SIZE;
  const reserved = new Set();
  for (const sp of Object.values(HUMAN_SPAWN)) {
    reserved.add(key(sp));
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) reserved.add(key([sp[0] + d[0], sp[1] + d[1]]));
  }
  const tiles = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push([x, y]);
  const interior = shuffle(tiles.filter((p) => p[1] >= 1 && p[1] <= 5 && !reserved.has(key(p))), r);
  const take = () => interior.pop();

  const nHoles = 1 + (r() < 0.5 ? 1 : 0);
  const nCracks = nHoles + 1 <= MAX_HOLES && r() < 0.4 ? 1 : 0;
  const nMtn = 2 + Math.floor(r() * 3);
  const nSprings = Math.floor(r() * 3);
  const holes = Array.from({ length: nHoles }, take);
  const cracks = Array.from({ length: nCracks }, take);
  const rocks = Array.from({ length: nMtn }, () => ({ pos: take(), hp: 2, kind: 'mtn' }));
  const springs = Array.from({ length: nSprings }, take);
  if ([...holes, ...cracks, ...springs, ...rocks.map((x) => x.pos)].some((p) => !p)) return null;

  const blocked = new Set([...holes, ...cracks, ...rocks.map((x) => x.pos)].map(key));
  const spawnPool = shuffle(
    tiles.filter((p) => p[1] <= 2 && !blocked.has(key(p)) && !springs.some((q) => key(q) === key(p))), r,
  );
  if (spawnPool.length < count) return null;
  const enemySpawns = spawnPool.slice(0, count);

  // conectividade: os humanos e todos os inimigos precisam alcançar uns aos outros andando
  const seen = new Set([key(HUMAN_SPAWN.h1)]);
  const queue = [HUMAN_SPAWN.h1];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [x + d[0], y + d[1]];
      if (n[0] < 0 || n[1] < 0 || n[0] >= size || n[1] >= size || blocked.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  if (![HUMAN_SPAWN.h2, ...enemySpawns].every((p) => seen.has(key(p)))) return null;
  return { holes, cracks, springs, rocks, enemySpawns };
}

function buildEnemies(stage, spawns, r) {
  const spec = stageSpec(stage);
  const kinds = [];
  for (let i = 0; i < spawns.length; i++) {
    if (i === 0 && spec.boss) kinds.push('boss');
    else if (i === 0 || spec.kinds.length === 1) kinds.push(spec.kinds[0]);
    else kinds.push(spec.kinds[Math.floor(r() * spec.kinds.length)]);
  }
  return kinds.map((kind, i) => {
    const hp = KINDS[kind].hp + spec.hpBonus;
    const id = `e${i + 1}`;
    return { id, team: 'bots', kind, pos: [...spawns[i]], hp, maxHp: hp, alive: true, mods: enemyMods(kind, spec.tier) };
  });
}

function newHuman(id, kind) {
  return { id, team: 'humans', kind, pos: [...HUMAN_SPAWN[id]], hp: HUMAN_MAX_HP, maxHp: HUMAN_MAX_HP, alive: true, mods: {}, ups: {} };
}

// ---------- ciclo da partida ----------
// Monta a fase `stage` no estado (terreno, inimigos, humanos de volta ao início) e já faz os bots telegrafarem.
function setupStage(s, stage, ev) {
  const spec = stageSpec(stage);
  let terrain = null;
  for (let attempt = 0; !terrain; attempt++) {
    if (attempt > 500) throw new Error('Não consegui montar o mapa da fase');
    terrain = tryTerrain(rng(hash(s.seed, stage, 101 + attempt)), spec.count);
  }
  const enemies = buildEnemies(stage, terrain.enemySpawns, rng(hash(s.seed, stage, 7)));

  s.stage = stage;
  s.round = 1;
  s.holes = terrain.holes;
  s.cracks = terrain.cracks;
  s.springs = terrain.springs;
  s.rocks = terrain.rocks;
  s.offers = null;
  s.picks = {};
  const units = {};
  for (const id of HUMAN_IDS) {
    const prev = s.units[id];
    const h = prev ? { ...prev, mods: { ...prev.mods }, ups: { ...prev.ups } } : newHuman(id, id === 'h1' ? 'fox' : 'cat');
    if (!h.alive) { h.alive = true; h.hp = 1; ev.push({ t: 'revive', id }); } // quem caiu volta com 1 de vida
    else h.hp = Math.min(h.maxHp, h.hp + HEAL_PER_STAGE);
    h.pos = [...HUMAN_SPAWN[id]];
    h.mods.shield = h.mods.shieldMax || 0; // escudos voltam a cada fase
    units[id] = h;
  }
  for (const e of enemies) units[e.id] = e;
  s.units = units;
  ev.push({ t: 'stageStart', stage, enemies: enemies.map((e) => ({ id: e.id, kind: e.kind, pos: [...e.pos], hp: e.hp })) });
  botTurn(s, ev);
}

// Os bots andam e telegrafam; a partida espera os planos dos humanos.
function botTurn(s, ev) {
  const rand = rng(hash(s.seed, s.stage, s.round, 13));
  ev.push(...planBots(s, rand));
  s.phase = 'PLAN';
}

export function createCoopRun(seed = Date.now()) {
  const s = {
    mode: 'coop',
    size: COOP_SIZE,
    seed,
    stage: 0,
    round: 0,
    phase: 'PLAN',
    units: {},
    rocks: [],
    holes: [],
    cracks: [],
    springs: [],
    pending: [],
    offers: null,
    picks: {},
    result: null,
  };
  const events = [];
  setupStage(s, 1, events);
  return { state: s, events };
}

const aliveOf = (s, team) => Object.values(s.units).filter((u) => u.alive && u.team === team);

// Sorteia 3 melhorias distintas (não esgotadas) para um humano.
export function offerUpgrades(s, uid) {
  const u = s.units[uid];
  const pool = UPGRADES.filter((up) => !up.fallback && ((u.ups || {})[up.id] || 0) < up.max);
  const ids = shuffle(pool, rng(hash(s.seed, s.stage, strHash(uid), 29))).slice(0, 3).map((up) => up.id);
  if (ids.length < 3) ids.push('cura'); // faltam melhorias: oferece a maçã
  return ids;
}

function applyUpgrade(u, up) {
  u.ups = u.ups || {};
  u.mods = u.mods || {};
  u.ups[up.id] = (u.ups[up.id] || 0) + 1;
  if (up.id === 'vida') { u.maxHp += 1; u.hp += 1; }
  if (up.id === 'cura') u.hp = u.maxHp;
  for (const [k, v] of Object.entries(up.mods || {})) u.mods[k] = (u.mods[k] || 0) + v;
}

// Resolve a rodada com os planos dos humanos ({ h1: {movement, action}, h2: ... }; ausente = esperar).
// `opts.preview`: só simula esta rodada (sem sortear melhorias nem trocar de fase) — usado na prévia da interface.
export function resolveRound(state, plans = {}, opts = {}) {
  if (state.phase !== 'PLAN') throw new Error('Fase errada');
  const s = clone(state);
  const ev = [];
  const acts = [];
  for (const id of HUMAN_IDS) {
    if (!s.units[id].alive) continue;
    let p = plans[id] || { movement: null, action: { type: 'WAIT', direction: null } };
    if (validateUnitPlay(s, id, p)) p = { movement: null, action: { type: 'WAIT', direction: null } }; // inválida = esperar
    if (p.movement && p.movement.to) {
      if (canStand(s, p.movement.to)) applyMove(s, id, p.movement, ev);
      else ev.push({ t: 'blocked', id }); // outra unidade chegou antes
    }
    const type = p.action.type;
    const dir = p.action.direction || null;
    acts.push({ pid: id, type, dir });
    ev.push({ t: 'telegraph', by: id, type, dir });
  }

  // bots primeiro: no empate, quem telegrafou antes resolve antes (sort estável)
  const queue = [...(s.pending || []).map((q) => ({ ...q })), ...acts];
  queue.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type]);
  ev.push({ t: 'order', order: queue.map((q) => ({ pid: q.pid, type: q.type, dir: q.dir })) });
  s.pending = [];
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    ev.push({ t: 'resolve', by: q.pid, n: i + 1 });
    runAction(s, q.pid, q.type, q.dir, ev);
    if (!aliveOf(s, 'humans').length || !aliveOf(s, 'bots').length) break;
  }
  if (opts.preview) return { state: s, events: ev };

  if (!aliveOf(s, 'humans').length) { // os dois caíram na mesma fase: fim de jogo
    s.phase = 'OVER';
    s.result = { reason: 'defeat', stage: s.stage };
    ev.push({ t: 'defeat', stage: s.stage });
    return { state: s, events: ev };
  }
  if (!aliveOf(s, 'bots').length) { // fase limpa: cada humano recebe 3 melhorias para escolher
    s.phase = 'UPGRADE';
    s.offers = Object.fromEntries(HUMAN_IDS.map((id) => [id, offerUpgrades(s, id)]));
    s.picks = {};
    ev.push({ t: 'stageClear', stage: s.stage });
    return { state: s, events: ev };
  }
  s.round += 1;
  botTurn(s, ev);
  return { state: s, events: ev };
}

// Telegrafes dos bots para desenhar a mira: cada um com seu número na ordem em que vai resolver.
export function telegraphs(state) {
  return (state.pending || [])
    .filter((p) => p.type !== 'WAIT' && state.units[p.pid] && state.units[p.pid].alive)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => PRIORITY[a.p.type] - PRIORITY[b.p.type] || a.i - b.i)
    .map(({ p }, n) => {
      const v = actionPreview(state, p.pid, p.type, p.dir);
      return v ? { ...v, n: n + 1, pid: p.pid } : null;
    })
    .filter(Boolean);
}

// Um humano escolhe sua melhoria. Quando os dois escolhem, a próxima fase começa.
export function pickUpgrade(state, uid, upId) {
  if (state.phase !== 'UPGRADE') throw new Error('Fase errada');
  if (!HUMAN_IDS.includes(uid)) throw new Error('Jogador inválido');
  if (state.picks[uid]) throw new Error('Você já escolheu');
  if (!(state.offers[uid] || []).includes(upId)) throw new Error('Melhoria não oferecida');
  const s = clone(state);
  const ev = [];
  applyUpgrade(s.units[uid], UPGRADE_BY_ID[upId]);
  s.picks[uid] = upId;
  ev.push({ t: 'upgrade', id: uid, up: upId });
  if (HUMAN_IDS.every((id) => s.picks[id])) setupStage(s, s.stage + 1, ev);
  return { state: s, events: ev };
}

// Prévia: o que acontece nesta rodada se `uid` fizer `play` e o parceiro fizer `partnerPlay` (padrão: esperar).
export function previewRound(state, uid, play, partnerPlay = null) {
  try {
    const other = HUMAN_IDS.find((id) => id !== uid);
    const plans = { [uid]: play };
    if (partnerPlay) plans[other] = partnerPlay;
    return resolveRound(state, plans, { preview: true });
  } catch {
    return null;
  }
}

export { mod };
