// Teste de integração do servidor: sobe o servidor numa porta livre e joga com conexões reais.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 4300 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), GRACE_MS: '1500' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => { if (String(d).includes('em http')) res(); });
  setTimeout(() => rej(new Error('servidor não subiu')), 8000);
});

const T = async (name, fn) => { await fn(); console.log('ok  -', name); };
const em = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const once = (s, ev, ms = 3000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout esperando ${ev}`)), ms);
  s.once(ev, (v) => { clearTimeout(t); res(v); });
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sockets = [];
const conn = () => { const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(s); return s; };

// ---------- coop ----------
async function coopRoom() {
  const a = conn(), b = conn();
  const starts = { a: once(a, 'match:start'), b: once(b, 'match:start') };
  const c = await em(a, 'room:create', { mode: 'coop' });
  const j = await em(b, 'room:join', { code: c.code });
  const [sa, sb] = [await starts.a, await starts.b];
  return { a, b, c, j, sa, sb };
}
const WAIT_PLAN = { movement: null, action: { type: 'WAIT', direction: null } };

try {
  await T('coop: criar e entrar começa a partida 7x7 com os dois jogadores', async () => {
    const { c, j, sa, sb } = await coopRoom();
    assert.equal(c.mode, 'coop'); assert.equal(c.playerId, 'h1'); assert.equal(j.playerId, 'h2'); assert.ok(c.token && j.token);
    assert.equal(sa.mode, 'coop'); assert.equal(sa.state.size, 7);
    assert.deepEqual(sa.state, sb.state);
    assert.equal(sa.state.phase, 'PLAN');
  });

  await T('coop: planos simultâneos — o status avisa o parceiro e a rodada resolve quando os dois enviam', async () => {
    const { a, b, sa } = await coopRoom();
    const base = { matchId: sa.matchId, stage: sa.state.stage, round: sa.state.round };
    const status = once(b, 'plan:status');
    assert.deepEqual(await em(a, 'plan:submit', { ...base, ...WAIT_PLAN }), { ok: true });
    assert.deepEqual((await status).planned, ['h1']);
    assert.equal((await em(a, 'plan:submit', { ...base, ...WAIT_PLAN })).ok, false); // já enviou
    const upA = once(a, 'match:update'), upB = once(b, 'match:update');
    assert.equal((await em(b, 'plan:submit', { ...base, ...WAIT_PLAN })).ok, true);
    const [ua, ub] = [await upA, await upB];
    assert.deepEqual(ua.state, ub.state);
    assert.equal(ua.state.round, 2);
    assert.ok(ua.events.some((e) => e.t === 'order'));
  });

  await T('coop: o servidor recusa plano inválido, de rodada velha e melhoria fora da hora', async () => {
    const { a, sa } = await coopRoom();
    const base = { matchId: sa.matchId, stage: sa.state.stage, round: sa.state.round };
    assert.equal((await em(a, 'plan:submit', { ...base, movement: { to: [0, 0] }, action: { type: 'WAIT' } })).ok, false); // longe
    assert.equal((await em(a, 'plan:submit', { ...base, movement: null, action: { type: 'HACK' } })).ok, false);
    assert.equal((await em(a, 'plan:submit', { ...base, round: 99, ...WAIT_PLAN })).ok, false);
    assert.equal((await em(a, 'plan:submit', { ...base, matchId: 'x', ...WAIT_PLAN })).ok, false);
    assert.equal((await em(a, 'upgrade:pick', { matchId: sa.matchId, upgrade: 'forca' })).ok, false); // não é fase de melhorias
  });

  await T('coop: queda de conexão — o parceiro é avisado e quem volta com o token retoma o jogo', async () => {
    const { a, b, c, j, sa } = await coopRoom();
    const away = once(a, 'partner:away');
    b.disconnect();
    assert.equal((await away).seconds, 2); // GRACE_MS de teste = 1500 ms (arredonda)
    const b2 = conn();
    const back = once(a, 'partner:back');
    const sync = once(b2, 'match:sync');
    const r = await em(b2, 'room:rejoin', { code: c.code, token: j.token });
    assert.equal(r.ok, true); assert.equal(r.playerId, 'h2'); assert.equal(r.mode, 'coop');
    await back;
    assert.equal((await sync).state.stage, sa.state.stage);
    // o plano de quem voltou continua valendo na mesma vaga
    const base = { matchId: sa.matchId, stage: 1, round: 1 };
    assert.equal((await em(b2, 'plan:submit', { ...base, ...WAIT_PLAN })).ok, true);
    assert.equal((await em(b2, 'room:rejoin', { code: c.code, token: 'errado' })).ok, false);
  });

  await T('coop: quem não volta a tempo fecha a sala e o parceiro é avisado', async () => {
    const { a, b } = await coopRoom();
    const left = once(a, 'opponent:left', 4000);
    b.disconnect();
    await left;
  });

  await T('duelo continua funcionando (criar, entrar, jogar um turno, reconectar)', async () => {
    const a = conn(), b = conn();
    const sa = once(a, 'match:start'); const sb = once(b, 'match:start');
    const c = await em(a, 'room:create', {});
    const j = await em(b, 'room:join', { code: c.code });
    assert.equal(c.mode, 'duel'); assert.equal(c.playerId, 'p1'); assert.equal(j.playerId, 'p2');
    const [{ matchId, state }] = [await sa, await sb];
    const att = state.attacker === 'p1' ? a : b;
    const upd = once(a, 'match:update');
    const r = await em(att, 'turn:submit', { matchId, turn: 1, movement: null, action: { type: 'WAIT' } });
    assert.equal(r.ok, true);
    assert.ok((await upd).events.length > 0);
    const away = once(a, 'partner:away');
    b.disconnect(); await away;
    const b2 = conn();
    const rr = await em(b2, 'room:rejoin', { code: c.code, token: j.token });
    assert.equal(rr.ok, true); assert.equal(rr.mode, 'duel');
  });

  await T('sala inexistente, cheia e criador que sai antes de começar', async () => {
    const a = conn(), b = conn(), x = conn(), y = conn();
    assert.equal((await em(y, 'room:join', { code: 'ZZZZ' })).ok, false);
    const c = await em(a, 'room:create', { mode: 'coop' });
    await em(b, 'room:join', { code: c.code });
    assert.equal((await em(x, 'room:join', { code: c.code })).error, 'Sala cheia');
    const c2 = await em(y, 'room:create', {});
    y.disconnect(); await wait(200);
    const z = conn();
    assert.equal((await em(z, 'room:join', { code: c2.code })).ok, false); // sala sem partida fecha na hora
  });

  await T('payloads inválidos (null, texto, ack ausente) não derrubam o servidor', async () => {
    const a = conn(), b = conn();
    const starts = once(a, 'match:start');
    const c = await em(a, 'room:create', { mode: 'coop' });
    await em(b, 'room:join', { code: c.code });
    const { matchId } = await starts;
    const z = conn(); // eventos de sala vão por outra conexão (room:create trocaria a sala de quem o envia)
    for (const ev of ['room:create', 'room:join', 'room:rejoin']) {
      z.emit(ev, null); z.emit(ev, 'lixo'); z.emit(ev, 42, 'não é função'); z.emit(ev, { code: {}, token: [] });
    }
    for (const ev of ['turn:submit', 'plan:submit', 'upgrade:pick', 'match:rematch']) {
      a.emit(ev, null); a.emit(ev, 'lixo'); a.emit(ev, 42, 'não é função'); a.emit(ev, { matchId, action: null, movement: 7 });
    }
    await wait(300);
    const x = conn(); // o servidor continua de pé e atendendo
    assert.equal((await em(x, 'room:join', { code: 'ZZZZ' })).ok, false);
    const ok = await em(a, 'plan:submit', { matchId, stage: 1, round: 1, movement: null, action: { type: 'WAIT', direction: null } });
    assert.equal(ok.ok, true);
  });

  console.log('\nTodos os cenários online passaram.');
} finally {
  sockets.forEach((s) => s.disconnect());
  server.kill();
}
process.exit(0);
