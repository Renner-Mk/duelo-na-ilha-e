import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createMatch, play, activePlayer, validatePlay, toPayload } from '../shared/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/health', (_req, res) => res.type('text').send('ok')); // verificação de saúde (Render)
app.use('/shared', express.static(path.join(root, 'shared')));
app.use(express.static(path.join(root, 'public')));

const rooms = new Map(); // code -> { code, players:{p1,p2} (socket ids / tokens), state, matchId }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

function startMatch(room) {
  room.matchId = `room_${room.code}_${Date.now()}`;
  room.firstAttacker = room.firstAttacker === 'p1' ? 'p2' : 'p1'; // alterna quem começa a cada revanche
  room.state = createMatch(Date.now() & 0xffff, room.firstAttacker);
  io.to(room.code).emit('match:start', { matchId: room.matchId, state: room.state });
}

io.on('connection', (socket) => {
  let current = null; // { code, pid }

  socket.on('room:create', (_, ack) => {
    const code = newCode();
    const room = { code, players: { p1: socket.id, p2: null }, state: null, matchId: null, firstAttacker: 'p2' };
    rooms.set(code, room);
    socket.join(code);
    current = { code, pid: 'p1' };
    ack?.({ ok: true, code, playerId: 'p1' });
  });

  socket.on('room:join', ({ code } = {}, ack) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: 'Sala não encontrada' });
    if (room.players.p2 && room.players.p2 !== socket.id) return ack?.({ ok: false, error: 'Sala cheia' });
    room.players.p2 = socket.id;
    socket.join(code);
    current = { code, pid: 'p2' };
    ack?.({ ok: true, code, playerId: 'p2' });
    startMatch(room);
  });

  socket.on('turn:submit', (msg = {}, ack) => {
    const room = current && rooms.get(current.code);
    if (!room || !room.state) return ack?.({ ok: false, error: 'Sem partida' });
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

  socket.on('match:rematch', () => {
    const room = current && rooms.get(current.code);
    if (!room || !room.state || room.state.phase !== 'OVER') return;
    room.rematch = room.rematch || new Set();
    room.rematch.add(current.pid);
    if (room.rematch.size === 2) {
      room.rematch = null;
      startMatch(room);
    } else {
      socket.to(room.code).emit('match:rematchRequested');
    }
  });

  socket.on('disconnect', () => {
    if (!current) return;
    const room = rooms.get(current.code);
    if (!room) return;
    socket.to(room.code).emit('opponent:left');
    rooms.delete(room.code);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Duelo 5x5 em http://localhost:${PORT}`));
