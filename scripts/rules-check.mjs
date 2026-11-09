import assert from 'node:assert/strict';
import { createMatch, declare, react, validatePlay, legalMoves, LAYOUTS, SIZE, MAX_HP, MAX_HOLES } from '../shared/rules.js';

function fresh() {
  const s = createMatch(1);
  s.holes = [[0, 0], [4, 4]];
  s.cracks = [];
  s.springs = [];
  s.rocks = [];
  return s;
}
const T = (name, fn) => { fn(); console.log('ok  -', name); };

T('empurrão para fora da borda elimina', () => {
  const s = fresh();
  s.units.p1.pos = [2, 0];
  s.units.p2.pos = [2, 1];
  // p1 declara empurrar para cima? alvo está embaixo: p1 vira "DOWN" apontando p2? p2 é adjacente (2,1)
  // p2 (reator) empurra p1 para UP: p1 sai da grade.
  let r = declare(s, 'p1', { movement: null, action: { type: 'WAIT' } });
  r = react(r.state, 'p2', { movement: null, action: { type: 'PUSH', direction: 'UP' } });
  assert.equal(r.state.winner, 'p2');
  assert.equal(r.state.units.p1.alive, false);
});

T('empurrão contra pedra: dano extra e pedra quebra', () => {
  const s = fresh();
  s.units.p1.pos = [2, 2];
  s.units.p2.pos = [2, 3];
  s.rocks = [{ pos: [2, 4], hp: 1 }];
  let r = declare(s, 'p1', { movement: null, action: { type: 'PUSH', direction: 'DOWN' } });
  r = react(r.state, 'p2', { movement: null, action: { type: 'WAIT' } });
  assert.equal(r.state.units.p2.hp, MAX_HP - 2);
  assert.equal(r.state.rocks.length, 0);
});

T('gancho do reator puxa o atacante: o soco sai da nova posição', () => {
  const s = fresh();
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [2, 1];
  // p1 declara soco para cima a partir de (2,3) após mover; p2 estará a 2 casas.
  let r = declare(s, 'p1', { movement: { to: [2, 3] }, action: { type: 'PUSH', direction: 'UP' } });
  // p2 usa gancho para baixo: puxa p1 para perto (até 2 casas), p1 fica adjacente e levaria o soco...
  r = react(r.state, 'p2', { movement: null, action: { type: 'HOOK', direction: 'DOWN' } });
  // p1 em (2,3) é alvo, puxado 1 casa (limite = tiles-1) => (2,2). Soco de p1 para UP atinge (2,1) = p2.
  assert.deepEqual(r.state.units.p1.pos, [2, 2]);
  assert.equal(r.state.units.p2.hp, MAX_HP - 1);
});

T('gancho puxa por cima de buraco e derruba', () => {
  const s = fresh();
  s.holes = [[2, 2], [4, 4]];
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [2, 1];
  let r = declare(s, 'p1', { movement: null, action: { type: 'WAIT' } });
  r = react(r.state, 'p2', { movement: null, action: { type: 'HOOK', direction: 'DOWN' } });
  // tiles (2,2),(2,3),(2,4): alvo em (2,4), puxa 2 -> (2,3),(2,2)=buraco
  assert.equal(r.state.units.p1.alive, false);
  assert.equal(r.state.winner, 'p2');
});

T('empate de golpes: o atacante bate primeiro e o golpe do reator pode falhar', () => {
  const s = fresh();
  s.units.p1.hp = 1;
  s.units.p2.hp = 1;
  s.units.p1.pos = [2, 2];
  s.units.p2.pos = [2, 3];
  s.rocks = [];
  let r = declare(s, 'p1', { movement: null, action: { type: 'PUSH', direction: 'DOWN' } });
  r = react(r.state, 'p2', { movement: null, action: { type: 'PUSH', direction: 'UP' } });
  assert.equal(r.state.winner, 'p1'); // atacante resolve primeiro e derruba p2 antes do soco do reator
});

T('ação inválida é rejeitada (inclui investida para fora da grade)', () => {
  const s = fresh();
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [2, 0];
  assert.ok(validatePlay(s, 'p2', { action: { type: 'WAIT' } })); // não é a vez
  assert.ok(validatePlay(s, 'p1', { movement: { to: [0, 0] }, action: { type: 'WAIT' } })); // longe
  assert.ok(validatePlay(s, 'p1', { action: { type: 'DASH', direction: 'DOWN' } })); // fora da grade
  assert.equal(validatePlay(s, 'p1', { action: { type: 'DASH', direction: 'UP' } }), null);
});

T('iniciativa: gancho resolve antes do empurrão, nos dois sentidos', () => {
  const order = (aType, rType, rDir = 'UP') => {
    const s = fresh();
    s.units.p1.pos = [2, 2];
    s.units.p2.pos = [2, 3];
    let r = declare(s, 'p1', { action: { type: aType, direction: 'DOWN' } });
    r = react(r.state, 'p2', { action: { type: rType, direction: rDir } });
    return r.events.filter((e) => e.t === 'resolve').map((e) => e.by);
  };
  assert.deepEqual(order('PUSH', 'HOOK'), ['p2', 'p1']); // gancho do reator primeiro (prioridade)
  assert.deepEqual(order('HOOK', 'PUSH'), ['p1', 'p2']); // gancho do atacante primeiro
  assert.deepEqual(order('PUSH', 'PUSH'), ['p1', 'p2']); // empate: atacante primeiro
  assert.deepEqual(order('PUSH', 'DASH', 'LEFT'), ['p2', 'p1']); // investida antes do empurrão
});

T('papéis se invertem', () => {
  const s = fresh();
  let r = declare(s, 'p1', { action: { type: 'WAIT' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.attacker, 'p2');
  assert.equal(r.state.turn, 2);
});

T('mola arremessa 2 casas extras', () => {
  const s = fresh();
  s.units.p1.pos = [0, 2];
  s.units.p2.pos = [1, 2];
  s.springs = [[2, 2]];
  let r = declare(s, 'p1', { action: { type: 'PUSH', direction: 'RIGHT' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  // p2 empurrado (1,2)->(2,2) mola ->(3,2)->(4,2)
  assert.deepEqual(r.state.units.p2.pos, [4, 2]);
  assert.equal(r.state.units.p2.hp, MAX_HP - 1);
});

T('mola lança para fora da ilha', () => {
  const s = fresh();
  s.units.p1.pos = [1, 2];
  s.units.p2.pos = [2, 2];
  s.springs = [[3, 2]];
  let r = declare(s, 'p1', { action: { type: 'PUSH', direction: 'RIGHT' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.winner, 'p1'); // (2,2)->(3,2) mola ->(4,2)->(5,2) fora
});

T('casa rachada: não dá para andar, mas quebra e derruba quem é empurrado', () => {
  const s = fresh();
  s.units.p1.pos = [1, 2];
  s.units.p2.pos = [2, 2];
  s.cracks = [[3, 2]];
  assert.equal(legalMoves(s, 'p2').some((p) => p[0] === 3 && p[1] === 2), false);
  let r = declare(s, 'p1', { action: { type: 'PUSH', direction: 'RIGHT' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.winner, 'p1');
  assert.equal(r.state.holes.some((h) => h[0] === 3 && h[1] === 2), true);
  assert.equal(r.state.cracks.length, 0);
});

T('montanha aguenta 2 golpes', () => {
  const s = fresh();
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [2, 0];
  s.rocks = [{ pos: [2, 3], hp: 2, kind: 'mtn' }];
  let r = declare(s, 'p1', { action: { type: 'PUSH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.rocks.length, 1);
  assert.equal(r.state.rocks[0].hp, 1);
  r = declare(r.state, 'p2', { action: { type: 'WAIT' } });
  r = react(r.state, 'p1', { action: { type: 'PUSH', direction: 'UP' } });
  assert.equal(r.state.rocks.length, 0);
});

T('todos os mapas: espelhados e inícios livres', () => {
  LAYOUTS.forEach((_, i) => {
    const s = createMatch(1, 'p1', i);
    const keys = (l) => new Set(l.map((p) => p.join(',')));
    const feats = { holes: s.holes, cracks: s.cracks, springs: s.springs, rocks: s.rocks.map((r) => r.pos) };
    for (const [name, list] of Object.entries(feats)) {
      const k = keys(list);
      for (const p of list) assert.ok(k.has([SIZE - 1 - p[0], SIZE - 1 - p[1]].join(',')), `${s.mapName}:${name} não simétrico`);
    }
    const all = [...s.holes, ...s.cracks, ...s.springs, ...s.rocks.map((r) => r.pos)];
    const around = [[2, 4], [2, 0], [1, 4], [3, 4], [2, 3], [1, 0], [3, 0], [2, 1]];
    for (const a of around) assert.ok(!all.some((p) => p[0] === a[0] && p[1] === a[1]), `${s.mapName}: terreno perto do início ${a}`);
    assert.equal(new Set(all.map((p) => p.join(','))).size, all.length, `${s.mapName}: casas repetidas`);
    assert.ok(s.holes.length + s.cracks.length <= MAX_HOLES, `${s.mapName}: buracos + rachaduras passam de ${MAX_HOLES}`);
  });
});

T('investida avança 2 casas', () => {
  const s = fresh();
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [0, 1];
  let r = declare(s, 'p1', { action: { type: 'DASH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.deepEqual(r.state.units.p1.pos, [2, 2]);
});

T('investida: pedra barra, mas buraco derruba quem passa', () => {
  const a = fresh();
  a.units.p1.pos = [2, 4];
  a.units.p2.pos = [0, 1];
  a.rocks = [{ pos: [2, 3], hp: 2, kind: 'mtn' }];
  let r = declare(a, 'p1', { action: { type: 'DASH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.deepEqual(r.state.units.p1.pos, [2, 4]); // pedra logo à frente: não sai do lugar
  const b = fresh();
  b.units.p1.pos = [2, 4];
  b.units.p2.pos = [0, 1];
  b.holes = [[2, 2]];
  r = declare(b, 'p1', { action: { type: 'DASH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.units.p1.alive, false); // atravessar o buraco = cair
  assert.equal(r.state.winner, 'p2');
  const c = fresh();
  c.units.p1.pos = [2, 4];
  c.units.p2.pos = [0, 1];
  c.holes = [[2, 3]];
  r = declare(c, 'p1', { action: { type: 'DASH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.equal(r.state.winner, 'p2'); // buraco colado também derruba
});

T('investida que esbarra num rival causa 1 de dano e o empurra', () => {
  const s = fresh();
  s.units.p1.pos = [2, 4];
  s.units.p2.pos = [2, 2];
  let r = declare(s, 'p1', { action: { type: 'DASH', direction: 'UP' } });
  r = react(r.state, 'p2', { action: { type: 'WAIT' } });
  assert.deepEqual(r.state.units.p1.pos, [2, 3]);
  assert.deepEqual(r.state.units.p2.pos, [2, 1]);
  assert.equal(r.state.units.p2.hp, MAX_HP - 1);
});

console.log('\nTodos os cenários passaram.');
