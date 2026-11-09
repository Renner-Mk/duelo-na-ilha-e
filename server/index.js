import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createMatch, play, validatePlay, validateUnitPlay } from '../shared/rules.js';
import { createCoopRun, resolveRound, pickUpgrade, HUMAN_IDS } from '../shared/coop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/health', (_req, res) => res.type('text').send('ok')); // verificação de saúde (Render)
app.use('/shared', express.static(path.join(root, 'shared')));
app.use(express.static(path.join(root, 'public')));

// Salas ficam em memória. Cada sala: { code, mode: 'duel' | 'coop', seats, players, state, matchId, plans, ... }
// players[seat] = { sid, token, connected }. O token permite voltar à mesma vaga depois de uma queda de conexão.
const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const GRACE_MS = Number(process.env.GRACE_MS) || 60000; // tempo para o jogador reconectar antes da sala fechar

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

const token = () => crypto.randomBytes(12).toString('hex');
const seatsOf = (mode) => (mode === 'coop' ? ['h1', 'h2'] : ['p1', 'p2']);

function startMatch(room) {
  room.matchId = `room_${room.code}_${Date.now()}`;
  room.plans = {};
  room.rematch = null;
  if (room.mode === 'coop') {
    room.state = createCoopRun(Date.now() & 0xffffff).state;
  } else {
    room.firstAttacker = room.firstAttacker === 'p1' ? 'p2' : 'p1'; // alterna quem começa a cada revanche
    room.state = createMatch(Date.now() & 0xffff, room.firstAttacker);
  }
  io.to(room.code).emit('match:start', { matchId: room.matchId, state: room.state, mode: room.mode });
}

function closeRoom(room, reason = 'opponent:left') {
  for (const p of Object.values(room.players)) if (p.timer) clearTimeout(p.timer);
  io.to(room.code).emit(reason);
  rooms.delete(room.code);
}

// Quem precisa planejar nesta rodada do coop (humanos vivos).
const planners = (room) => HUMAN_IDS.filter((id) => room.state.units[id] && room.state.units[id].alive);

io.on('connection', (socket) => {
  let current = null; // { code, pid }

  const attach = (room, pid) => {
    socket.join(room.code);
    current = { code: room.code, pid };
  };

  socket.on('room:create', (opts = {}, ack) => {
    const mode = opts && opts.mode === 'coop' ? 'coop' : 'duel';
    const code = newCode();
    const seats = seatsOf(mode);
    const room = { code, mode, seats, players: {}, state: null, matchId: null, plans: {}, firstAttacker: 'p2', rematch: null };
    room.players[seats[0]] = { sid: socket.id, token: token(), connected: true };
    rooms.set(code, room);
    attach(room, seats[0]);
    ack?.({ ok: true, code, mode, playerId: seats[0], token: room.players[seats[0]].token });
  });

  socket.on('room:join', ({ code } = {}, ack) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: 'Sala não encontrada' });
    const seat = room.seats.find((s) => !room.players[s]);
    if (!seat) return ack?.({ ok: false, error: 'Sala cheia' });
    room.players[seat] = { sid: socket.id, token: token(), connected: true };
    attach(room, seat);
    ack?.({ ok: true, code, mode: room.mode, playerId: seat, token: room.players[seat].token });
    startMatch(room);
  });

  // Volta à mesma vaga depois de queda de conexão ou de recarregar a página.
  socket.on('room:rejoin', ({ code, token: tk } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    const seat = room && room.seats.find((s) => room.players[s] && room.players[s].token === tk);
    if (!room || !seat) return ack?.({ ok: false, error: 'Sala não existe mais' });
    const p = room.players[seat];
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    p.sid = socket.id;
    p.connected = true;
    attach(room, seat);
    ack?.({ ok: true, code: room.code, mode: room.mode, playerId: seat, token: tk });
    socket.to(room.code).emit('partner:back');
    if (room.state) {
      socket.emit('match:sync', { matchId: room.matchId, state: room.state, mode: room.mode, planned: Object.keys(room.plans) });
    }
  });

  // ----- duelo -----
  socket.on('turn:submit', (msg = {}, ack) => {
    const room = current && rooms.get(current.code);
    if (!room || room.mode !== 'duel' || !room.state) return ack?.({ ok: false, error: 'Sem partida' });
    const pid = current.pid; // nunca confiar no playerId do cliente
    if (msg.matchId !== room.matchId) return ack?.({ ok: false, error: 'Partida antiga' });
    if (msg.turn !== room.state.turn) return ack?.({ ok: false, error: 'Turno desatualizado' });
    const p = { movement: msg.movement && msg.movement.to ? { to: msg.movement.to } : null, action: msg.action };
    const err = validatePlay(room.state, pid, p);
    if (err) return ack?.({ ok: false, error: err });
    try {
      const prevPhase = room.state.phase;
      const { state, events } = play(room.state, pid, p);
      room.state = state;
      io.to(room.code).emit('match:update', { state, events, prevPhase });
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // ----- coop: planos simultâneos -----
  socket.on('plan:submit', (msg = {}, ack) => {
    const room = current && rooms.get(current.code);
    if (!room || room.mode !== 'coop' || !room.state) return ack?.({ ok: false, error: 'Sem partida' });
    const pid = current.pid;
    const s = room.state;
    if (msg.matchId !== room.matchId || msg.stage !== s.stage || msg.round !== s.round) return ack?.({ ok: false, error: 'Rodada desatualizada' });
    if (s.phase !== 'PLAN') return ack?.({ ok: false, error: 'Fase errada' });
    if (room.plans[pid]) return ack?.({ ok: false, error: 'Você já enviou seu plano' });
    const plan = { movement: msg.movement && msg.movement.to ? { to: msg.movement.to } : null, action: msg.action };
    const err = validateUnitPlay(s, pid, plan);
    if (err) return ack?.({ ok: false, error: err });
    room.plans[pid] = plan;
    ack?.({ ok: true });
    if (planners(room).every((id) => room.plans[id])) {
      try {
        const { state, events } = resolveRound(s, room.plans);
        room.state = state;
        room.plans = {};
        io.to(room.code).emit('match:update', { state, events });
      } catch (e) {
        room.plans = {};
        io.to(room.code).emit('match:sync', { matchId: room.matchId, state: room.state, mode: room.mode, planned: [] });
      }
    } else {
      io.to(room.code).emit('plan:status', { planned: Object.keys(room.plans) });
    }
  });

  socket.on('upgrade:pick', (msg = {}, ack) => {
    const room = current && rooms.get(current.code);
    if (!room || room.mode !== 'coop' || !room.state) return ack?.({ ok: false, error: 'Sem partida' });
    if (msg.matchId !== room.matchId) return ack?.({ ok: false, error: 'Partida antiga' });
    try {
      const { state, events } = pickUpgrade(room.state, current.pid, msg.upgrade);
      room.state = state;
      room.plans = {};
      io.to(room.code).emit('match:update', { state, events });
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('match:rematch', () => {
    const room = current && rooms.get(current.code);
    if (!room || !room.state || room.state.phase !== 'OVER') return;
    room.rematch = room.rematch || new Set();
    room.rematch.add(current.pid);
    if (room.rematch.size === room.seats.length) {
      startMatch(room);
    } else {
      socket.to(room.code).emit('match:rematchRequested');
    }
  });

  socket.on('disconnect', () => {
    if (!current) return;
    const room = rooms.get(current.code);
    if (!room) return;
    const p = room.players[current.pid];
    if (!p || p.sid !== socket.id) return; // essa vaga já foi retomada por outra conexão
    // sala ainda sem partida: não há o que retomar
    if (!room.state) return closeRoom(room);
    p.connected = false;
    socket.to(room.code).emit('partner:away', { seconds: Math.round(GRACE_MS / 1000) });
    p.timer = setTimeout(() => closeRoom(room), GRACE_MS);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Duelo 5x5 em http://localhost:${PORT}`));
