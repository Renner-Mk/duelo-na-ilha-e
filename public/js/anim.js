import { sleep } from './render.js';
import { sfx } from './sfx.js';
import { actionPreview } from '/shared/rules.js';

const slow = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reproduz o log de eventos passo a passo, partindo do modelo anterior.
export async function playEvents(board, prev, events, ui = {}) {
  const m = JSON.parse(JSON.stringify({ units: prev.units, rocks: prev.rocks, holes: prev.holes, cracks: prev.cracks, springs: prev.springs, seed: prev.seed }));
  const wait = (ms) => sleep(slow() ? ms : 10);
  let angry = null;
  let bumped = false; // evita 'BONK!' + 'TOC!' para o mesmo choque
  let pulled = false; // um só som de puxão por gancho
  let rope = null; // corda do gancho enquanto o alvo é puxado
  const hasOrder = events.some((e) => e.t === 'order');
  const draw = () => board.draw(m, { angry });
  const stopRope = () => { if (rope) { rope.remove(); rope = null; } };
  board.clearPoses();

  for (const ev of events) {
    if (rope && ev.t !== 'hook' && ev.t !== 'pull') stopRope();
    switch (ev.t) {
      case 'move':
        board.burst(ev.from, 'dust', 5);
        board.hop(ev.id);
        m.units[ev.id].pos = ev.to; sfx.move(); draw(); await wait(340);
        board.burst(ev.to, 'dust', 4);
        break;
      case 'telegraph':
        if (!hasOrder) sfx.telegraph(); // na reação, o aviso sai uma vez só, no 'order'
        break;
      case 'order': {
        // mostra as duas ações telegrafadas com a ordem de resolução antes de executar
        const extra = ev.order
          .map((o, i) => (o.type === 'WAIT' ? null : { ...actionPreview(m, o.pid, o.type, o.dir), n: i + 1, pid: o.pid }))
          .filter((v) => v && v.from);
        board.draw(m, { extra });
        ui.show?.(ev.order);
        sfx.telegraph();
        await wait(1100);
        break;
      }
      case 'resolve':
        angry = ev.by; bumped = false; pulled = false; ui.step?.(ev.n); draw(); await wait(350); break;
      case 'push':
        angry = ev.by;
        board.lunge(ev.by, ev.dir);
        board.pose(ev.by, 'punch', 380);
        board.fly(m.units[ev.by].pos, ev.tile, 230);
        sfx.punch(); draw(); await wait(300); break;
      case 'hit':
        m.units[ev.id].hp = ev.hp; board.hurt(ev.id);
        board.burst(m.units[ev.id].pos, 'star', 6);
        board.pop(m.units[ev.id].pos, `-${ev.dmg}`); navigator.vibrate?.(40); draw(); await wait(300); break;
      case 'knock':
        board.burst(ev.from, 'dust', 6);
        m.units[ev.id].pos = ev.to; draw(); await wait(320); break;
      case 'bump':
        bumped = true; board.burst(ev.into, 'chip', 6);
        board.pop(ev.into, 'BONK!'); sfx.bonk(); board.shake(); await wait(300); break;
      case 'rockHit': {
        const rk = m.rocks.find((r) => r.pos[0] === ev.at[0] && r.pos[1] === ev.at[1]);
        if (rk) rk.hp = ev.hp;
        board.burst(ev.at, 'chip', 4);
        if (!bumped) board.pop(ev.at, 'TOC!');
        draw(); await wait(250); break;
      }
      case 'spring':
        board.boing(ev.at); board.burst(ev.at, 'star', 8);
        board.pop(ev.at, 'BOING!'); sfx.spring(); await wait(250); break;
      case 'launch':
        board.burst(ev.from, 'dust', 5);
        m.units[ev.id].pos = ev.to; draw(); await wait(260); break;
      case 'crackBreak':
        m.cracks = m.cracks.filter((c) => c[0] !== ev.at[0] || c[1] !== ev.at[1]);
        m.holes.push([...ev.at]); board.burst(ev.at, 'chip', 8); board.burst(ev.at, 'dust', 6);
        board.pop(ev.at, 'CRACK!'); sfx.rockBreak(); draw(); await wait(300); break;
      case 'rockBreak':
        m.rocks = m.rocks.filter((r) => r.pos[0] !== ev.at[0] || r.pos[1] !== ev.at[1]);
        board.burst(ev.at, 'chip', 10); board.burst(ev.at, 'dust', 6);
        sfx.rockBreak(); board.pop(ev.at, 'CRASH'); draw(); await wait(300); break;
      case 'hook':
        angry = ev.by;
        board.pose(ev.by, 'throw', 560);
        rope = board.rope(m.units[ev.by].pos);
        if (ev.tiles.length) rope.to(ev.tiles[ev.tiles.length - 1]);
        sfx.hook(); draw(); await wait(340); break;
      case 'pull':
        m.units[ev.id].pos = ev.to; rope?.to(ev.to);
        if (!pulled) sfx.pull();
        pulled = true; draw(); await wait(280); break;
      case 'place':
        board.pose(ev.by, 'lift', 480);
        m.rocks.push({ pos: ev.at, hp: 1 }); board.burst(ev.at, 'dust', 6); sfx.place(); draw(); await wait(300); break;
      case 'fizzle':
        await wait(150); break;
      case 'whiff':
        board.pop(ev.at, 'Errou!'); sfx.whiff(); await wait(300); break;
      case 'fall':
        board.burst(ev.at, 'dust', 8);
        m.units[ev.id].pos = ev.at; m.units[ev.id].alive = false; sfx.fall(); navigator.vibrate?.([60, 40, 120]); draw(); await wait(700); break;
      case 'ko':
        m.units[ev.id].alive = false; draw(); await wait(500); break;
      default: break;
    }
  }
  stopRope();
  ui.clear?.();
}
