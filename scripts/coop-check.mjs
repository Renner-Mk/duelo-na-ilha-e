import assert from 'node:assert/strict';
import {
  createCoopRun, resolveRound, pickUpgrade, previewRound, offerUpgrades, stageSpec, UPGRADES,
  HUMAN_IDS, COOP_SIZE, MAX_ENEMIES,
} from '../shared/coop.js';
import { planBot } from '../shared/bots.js';
import { rng, clone, legalMoves, legalDirs, inBounds, isHole, rockAt, MAX_HOLES } from '../shared/rules.js';

const T = (name, fn) => { fn(); console.log('ok  -', name); };
const WAIT = { movement: null, action: { type: 'WAIT', direction: null } };
const enemies = (s) => Object.values(s.units).filter((u) => u.team === 'bots');
const humans = (s) => HUMAN_IDS.map((id) => s.units[id]);

// estado limpo para cenários: tabuleiro 7x7 sem terreno, humanos e bots posicionados à mão
function arena(extra = {}) {
  const { state } = createCoopRun(1);
  const s = clone(state);
  s.holes = []; s.cracks = []; s.springs = []; s.rocks = [];
  s.units = { h1: s.units.h1, h2: s.units.h2 };
  s.pending = [];
  s.units.h1.pos = [2, 5]; s.units.h2.pos = [4, 5];
  Object.assign(s, extra);
  return s;
}
const bot = (s, id, kind, pos, hp = 2) => {
  s.units[id] = { id, team: 'bots', kind, pos, hp, maxHp: hp, alive: true, mods: {} };
};

T('nova partida: 7x7, 2 humanos, inimigos da fase 1 e telegrafes dos bots', () => {
  const { state: s } = createCoopRun(42);
  assert.equal(s.size, COOP_SIZE);
  assert.equal(s.stage, 1);
  assert.equal(s.phase, 'PLAN');
  assert.equal(humans(s).length, 2);
  assert.equal(enemies(s).length, 2);
  assert.ok(enemies(s).every((e) => e.kind === 'brute'));
  assert.equal(s.pending.length, enemies(s).length);
});

T('terreno de todas as fases: limite de buracos, sem sobreposição e jogável', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const stage of [1, 2, 3, 5, 8, 12]) {
      const r = createCoopRun(seed).state;
      let s = r;
      // avança artificialmente até a fase desejada
      while (s.stage < stage) {
        s = clone(s);
        for (const e of enemies(s)) e.alive = false;
        s.phase = 'UPGRADE';
        s.offers = Object.fromEntries(HUMAN_IDS.map((id) => [id, offerUpgrades(s, id)]));
        s.picks = {};
        for (const id of HUMAN_IDS) s = pickUpgrade(s, id, s.offers[id][0]).state;
      }
      assert.ok(s.holes.length + s.cracks.length <= MAX_HOLES, `fase ${stage}: buracos demais`);
      const all = [...s.holes, ...s.cracks, ...s.springs, ...s.rocks.map((x) => x.pos)].map((p) => p.join(','));
      assert.equal(new Set(all).size, all.length, 'terreno sobreposto');
      for (const u of Object.values(s.units)) {
        assert.ok(inBounds(u.pos, s.size) && !isHole(s, u.pos) && !rockAt(s, u.pos), `unidade em lugar inválido ${u.id}`);
      }
      const pos = Object.values(s.units).map((u) => u.pos.join(','));
      assert.equal(new Set(pos).size, pos.length, 'duas unidades na mesma casa');
    }
  }
});

T('escala por fase: mais inimigos, mais vida e novos tipos', () => {
  let prev = stageSpec(1);
  for (let st = 2; st <= 15; st++) {
    const sp = stageSpec(st);
    assert.ok(sp.count >= prev.count && sp.count <= MAX_ENEMIES, `contagem fase ${st}`);
    assert.ok(sp.hpBonus >= prev.hpBonus && sp.tier >= prev.tier);
    prev = sp;
  }
  assert.deepEqual(stageSpec(1).kinds, ['brute']);
  assert.ok(stageSpec(3).kinds.includes('hooker'));
  assert.ok(stageSpec(4).kinds.includes('dasher'));
  assert.equal(stageSpec(5).boss, true);
  assert.equal(stageSpec(10).boss, true);
  assert.equal(stageSpec(6).boss, false);
  assert.equal(stageSpec(1).count, 2);
  assert.equal(stageSpec(20).count, MAX_ENEMIES);
});

T('determinismo: mesma semente e mesmos planos dão o mesmo resultado', () => {
  const a = createCoopRun(7).state;
  const b = createCoopRun(7).state;
  assert.deepEqual(a, b);
  assert.deepEqual(resolveRound(a, {}).state, resolveRound(b, {}).state);
});

T('rodada: bots andam e telegrafam de novo; humanos esperando não saem do lugar', () => {
  const { state: s } = createCoopRun(3);
  const r = resolveRound(s, {});
  assert.equal(r.state.round, 2);
  assert.equal(r.state.phase, 'PLAN');
  assert.deepEqual(r.state.units.h1.pos, s.units.h1.pos);
  assert.ok(r.events.some((e) => e.t === 'order'));
});

T('empate de golpes: o bot (que telegrafou) resolve antes do humano', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 3], 3);
  s.units.h1.pos = [2, 4];
  s.pending = [{ pid: 'e1', type: 'PUSH', dir: 'DOWN' }];
  const r = resolveRound(s, { h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } } });
  const order = r.events.find((e) => e.t === 'order').order.filter((o) => o.type === 'PUSH').map((o) => o.pid);
  assert.deepEqual(order, ['e1', 'h1']);
});

T('prioridade: a investida do humano vem antes do empurrão do bot', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 2], 3);
  s.pending = [{ pid: 'e1', type: 'PUSH', dir: 'DOWN' }];
  const r = resolveRound(s, { h1: { movement: null, action: { type: 'DASH', direction: 'UP' } } });
  assert.equal(r.events.find((e) => e.t === 'order').order[0].pid, 'h1');
});

T('dois humanos indo para a mesma casa: o segundo fica parado', () => {
  const s = arena();
  s.units.h1.pos = [2, 5]; s.units.h2.pos = [4, 5];
  const r = resolveRound(s, {
    h1: { movement: { to: [3, 5] }, action: { type: 'WAIT' } },
    h2: { movement: { to: [3, 5] }, action: { type: 'WAIT' } },
  });
  assert.deepEqual(r.state.units.h1.pos, [3, 5]);
  assert.deepEqual(r.state.units.h2.pos, [4, 5]);
});

T('fase limpa: 3 melhorias distintas por jogador e nenhuma esgotada', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 4], 1);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  const r = resolveRound(s, { h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } } });
  assert.equal(r.state.phase, 'UPGRADE');
  for (const id of HUMAN_IDS) {
    const o = r.state.offers[id];
    assert.equal(o.length, 3);
    assert.equal(new Set(o).size, 3);
    assert.ok(o.every((x) => UPGRADES.some((u) => u.id === x)));
  }
  // melhoria esgotada não é mais oferecida
  const t = clone(r.state);
  t.units.h1.ups = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  t.units.h1.ups.forca = 0;
  assert.deepEqual(offerUpgrades(t, 'h1'), ['forca', 'cura']); // faltando melhorias, entra a maçã
  t.units.h1.ups.forca = 3;
  assert.deepEqual(offerUpgrades(t, 'h1'), ['cura']); // nunca fica sem escolha
});

T('escolher melhorias: aplica no personagem e, com os dois, começa a fase 2', () => {
  let s = arena();
  bot(s, 'e1', 'brute', [2, 4], 1);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  s = resolveRound(s, { h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } } }).state;
  assert.throws(() => pickUpgrade(s, 'h1', 'inexistente'));
  let r = pickUpgrade(s, 'h1', s.offers.h1[0]);
  assert.equal(r.state.phase, 'UPGRADE'); // falta o parceiro
  assert.throws(() => pickUpgrade(r.state, 'h1', s.offers.h1[1])); // já escolheu
  r = pickUpgrade(r.state, 'h2', s.offers.h2[0]);
  assert.equal(r.state.stage, 2);
  assert.equal(r.state.phase, 'PLAN');
  assert.equal(enemies(r.state).length, stageSpec(2).count);
  assert.ok(r.events.some((e) => e.t === 'stageStart'));
  assert.ok(Object.keys(r.state.units.h1.ups).length === 1);
});

T('quem caiu volta na fase seguinte com 1 de vida; escudos voltam', () => {
  let s = arena();
  s.units.h2.alive = false; s.units.h2.hp = 0;
  s.units.h1.hp = 1;
  s.units.h1.mods = { shieldMax: 1, shield: 0 };
  bot(s, 'e1', 'brute', [2, 4], 1);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  s = resolveRound(s, { h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } } }).state;
  assert.equal(s.phase, 'UPGRADE');
  for (const id of HUMAN_IDS) s = pickUpgrade(s, id, s.offers[id][0]).state;
  assert.equal(s.units.h2.alive, true);
  assert.equal(s.units.h2.hp, 1);
  assert.ok(s.units.h1.hp >= 2); // curou 1 por fase
  assert.equal(s.units.h1.mods.shield, 1);
});

T('derrota: os dois humanos caídos na mesma fase', () => {
  const s = arena();
  s.units.h1.pos = [0, 5]; s.units.h2.pos = [0, 4];
  bot(s, 'e1', 'brute', [3, 3], 3);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  // um empurra o outro para fora e o outro empurra o primeiro: os dois caem
  const r = resolveRound(s, {
    h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } },
    h2: { movement: null, action: { type: 'PUSH', direction: 'DOWN' } },
  });
  assert.equal(r.state.phase === 'OVER' || r.state.phase === 'PLAN', true);
  const t = clone(s);
  t.units.h1.hp = 1; t.units.h2.hp = 1;
  t.units.h1.pos = [0, 0]; t.units.h2.pos = [6, 0];
  bot(t, 'e2', 'brute', [1, 0], 3); bot(t, 'e3', 'brute', [5, 0], 3);
  t.pending = [{ pid: 'e2', type: 'PUSH', dir: 'LEFT' }, { pid: 'e3', type: 'PUSH', dir: 'RIGHT' }];
  const d = resolveRound(t, {});
  assert.equal(d.state.phase, 'OVER');
  assert.equal(d.state.result.reason, 'defeat');
  assert.ok(d.events.some((e) => e.t === 'defeat'));
});

T('melhorias valem de verdade: soco forte aumenta o dano no coop', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 4], 5);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  s.units.h1.mods = { pushDmg: 2 };
  const r = resolveRound(s, { h1: { movement: null, action: { type: 'PUSH', direction: 'UP' } } });
  assert.equal(r.state.units.e1.hp, 2); // 5 - (1 + 2)
});

T('prévia: simula a rodada sem avançar nem sortear melhorias', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 4], 1);
  s.pending = [{ pid: 'e1', type: 'WAIT', dir: null }];
  const p = previewRound(s, 'h1', { movement: null, action: { type: 'PUSH', direction: 'UP' } });
  assert.equal(p.state.units.e1.alive, false);
  assert.equal(p.state.phase, 'PLAN'); // não virou fase de melhorias
  assert.equal(previewRound(s, 'h1', { movement: { to: [9, 9] }, action: { type: 'WAIT' } }).events.some((e) => e.t === 'blocked' || e.t === 'order'), true);
});

// ---------- IA dos bots ----------
T('IA: bruto colado num humano empurra na direção dele', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [2, 4], 2);
  s.units.h1.pos = [2, 5];
  s.units.h2.pos = [6, 6];
  const p = planBot(s, 'e1', rng(1));
  assert.equal(p.action.type, 'PUSH');
  assert.equal(p.action.direction, 'DOWN');
});

T('IA: o bot não escolhe um golpe que o derruba sozinho', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = arena();
    bot(s, 'e1', 'dasher', [3, 2], 2);
    s.holes = [[3, 1], [3, 0], [2, 2], [4, 2]]; // buracos em volta: investida em qualquer direção cai
    s.units.h1.pos = [3, 5];
    const p = planBot(s, 'e1', rng(seed));
    if (p.action.type === 'DASH') {
      const dirs = legalDirs(s, 'DASH', p.movement ? p.movement.to : s.units.e1.pos);
      assert.ok(dirs.includes(p.action.direction));
    }
    const after = resolveRound({ ...s, pending: [{ pid: 'e1', ...{ type: p.action.type, dir: p.action.direction } }] }, {}, { preview: true }).state;
    assert.equal(after.units.e1.alive, true, `bot se derrubou (semente ${seed})`);
  }
});

T('IA: bots se aproximam dos humanos quando estão longe', () => {
  const s = arena();
  bot(s, 'e1', 'brute', [3, 0], 2);
  s.units.h1.pos = [3, 6]; s.units.h2.pos = [4, 6];
  const moves = legalMoves(s, 'e1');
  assert.ok(moves.length > 0);
  const p = planBot(s, 'e1', rng(5));
  assert.ok(p.movement && p.movement.to[1] > 0, 'deveria descer em direção aos humanos');
});

// ---------- estresse: partidas inteiras com jogadores aleatórios ----------
T('estresse: 150 partidas com jogadores aleatórios, sem estado inválido até a derrota', () => {
  let maxStage = 0;
  let totalRounds = 0;
  const pick = (a, r) => a[Math.floor(r() * a.length)];
  for (let run = 1; run <= 150; run++) {
    const r = rng(run * 977);
    let s = createCoopRun(run).state;
    for (let guard = 0; guard < 400 && s.phase !== 'OVER'; guard++) {
      if (s.phase === 'UPGRADE') {
        for (const id of HUMAN_IDS) s = pickUpgrade(s, id, pick(s.offers[id], r)).state;
        continue;
      }
      const plans = {};
      for (const id of HUMAN_IDS) {
        const u = s.units[id];
        if (!u.alive) continue;
        const mv = [null, ...legalMoves(s, id)];
        const m = pick(mv, r);
        const type = pick(['PUSH', 'HOOK', 'DASH', 'WAIT'], r);
        const from = m || u.pos;
        const dirs = legalDirs(s, type, from);
        plans[id] = { movement: m ? { to: m } : null, action: { type: dirs.length ? type : 'WAIT', direction: dirs.length && type !== 'WAIT' ? pick(dirs, r) : null } };
      }
      // para testar fases altas, os humanos "dão sorte": os vivos se curam e, às vezes, derrubam um ou todos os inimigos
      s = clone(s);
      for (const id of HUMAN_IDS) if (s.units[id].alive && r() < 0.6) s.units[id].hp = s.units[id].maxHp;
      const alive = enemies(s).filter((e) => e.alive);
      if (alive.length && r() < 0.45) {
        const kills = r() < 0.5 ? alive : [pick(alive, r)];
        for (const e of kills) e.alive = false;
        s.pending = s.pending.filter((p) => s.units[p.pid].alive);
      }
      s = resolveRound(s, plans).state;
      totalRounds++;
      for (const u of Object.values(s.units)) {
        assert.ok(u.hp >= 0 && u.hp <= u.maxHp, `hp inválido ${u.id}: ${u.hp}/${u.maxHp}`);
        if (u.alive) {
          assert.ok(inBounds(u.pos, s.size), `${u.id} vivo fora do mapa`);
          assert.ok(!isHole(s, u.pos), `${u.id} vivo em buraco`);
        }
      }
      if (s.phase === 'PLAN') assert.ok(s.pending.length <= enemies(s).filter((e) => e.alive).length);
    }
    maxStage = Math.max(maxStage, s.stage);
  }
  console.log(`      (fase máxima alcançada: ${maxStage}; rodadas simuladas: ${totalRounds})`);
  assert.ok(maxStage >= 8, 'o estresse deveria chegar a fases altas (inclui chefes)');
});

console.log('\nTodos os cenários do coop passaram.');
