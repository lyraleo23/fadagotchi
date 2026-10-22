/* ---------- 2c. BEHAVIOR (gera a Pose de cada frame) ----------
   Fica entre o Core e os renderers. O Core diz COMO ela está (fome, sono...),
   o Behavior decide O QUE ela está fazendo agora (passear, acenar, ir dormir
   na casinha...) e entrega uma Pose. Qualquer renderer — LCD, pixel art,
   sprites ou um futuro visual realista — só precisa saber desenhar uma Pose.

   Pose = {
     x: 0..1          posição no palco (mesmas coordenadas do World)
     facing: -1..1    -1 olhando p/ esquerda · 0 de frente · 1 p/ direita
     lift: px         quanto sobe (+) ou desce (−) em relação à altura normal
     sleepP: 0..1     0 acordada · 1 dormindo (transição suave)
     hidden: bool     está dentro da casinha
     door: 0..1       porta da casinha aberta
     wing: rad        fase da batida de asas
     face: string|null  happy · neutral · sad · sleep · yawn · tired · bored
     armL: down · wave · up · belly · mouth      (braço livre)
     armR: wand · up                              (braço da varinha)
     focus: {kind, x, i}  o que ela está olhando (flor, borboleta, vaga-lumes)
     nod, kick, shake, trail: detalhes (cabeceada, chutinho, tremida, rastro)
     action, p: gesto atual e progresso 0..1
   }
*/
const Behavior = (() => {
  const b = { x: 0.5, target: 0.5, nextWander: 0, facing: 0, act: null, nextIdle: 0, wasAsleep: null, sleepP: 0, wing: 0, routine: null };
  const DUR = { wave: 2200, spin: 1500, yawn: 2400, doze: 4200, hungry: 2600, bored: 5200, stretch: 2400, giggle: 1400, sniff: 3200, chase: 6000, fireflies: 6500 };
  const KEEP = ['stretch'];
  const SPEED = 0.00022, RUSH = 0.0004;

  function play(type, now = performance.now(), extra = {}) { b.act = Object.assign({ type, t0: now, dur: DUR[type] }, extra); }
  function reset(s) {
    Object.assign(b, { x: 0.5, target: 0.5, facing: 0, act: null, nextIdle: 0, wasAsleep: s ? s.asleep : null, sleepP: s && s.asleep ? 1 : 0, routine: null });
    if (s && s.asleep && s.stage !== 'bud') { b.routine = { type: 'home', phase: 'inside', t0: 0 }; b.x = World.house.door; }
  }

  function pickIdle(s, now) {
    const r = Math.random(), h = Core.hour(s), ph = World.phase(h);
    if (s.energy < 25) return r < .7 ? 'doze' : 'yawn';
    if (s.hunger < 25) return 'hungry';
    if (s.fun < 25) return 'bored';
    if (s.energy < 45 || h >= 20.5) return r < .4 ? 'yawn' : (ph === 'dusk' && r < .7 ? 'fireflies' : null);
    const m = Core.mood(s);
    const outdoors = ph === 'dusk' ? 'fireflies' : (ph === 'day' || ph === 'dawn') ? 'chase' : null;
    if (m === 'happy') return r < .2 ? 'wave' : r < .4 ? 'spin' : r < .65 ? 'visit' : r < .9 ? outdoors : null;
    return r < .25 ? 'wave' : r < .55 ? 'visit' : null;
  }

  // anda até tx; devolve true quando chegou
  function travel(tx, dt, speed) {
    const d = tx - b.x;
    b.x += Math.sign(d) * Math.min(Math.abs(d), dt * speed);
    return Math.abs(tx - b.x) < 0.004;
  }

  function update(s, ui, now, dt) {
    if (b.wasAsleep === null) reset(s);
    // começou a dormir: vai para a casinha · acordou: sai pela porta
    if (s.asleep !== b.wasAsleep) {
      b.wasAsleep = s.asleep;
      if (s.stage !== 'bud' && !s.gone) {
        b.act = null;
        if (s.asleep) b.routine = { type: 'home', phase: 'travel', t0: now };
        else b.routine = { type: 'home', phase: 'exit', t0: now };
      }
    }
    if (s.stage === 'bud' || s.gone) b.routine = null;

    let act = b.act && now - b.act.t0 < b.act.dur ? b.act : (b.act = null);
    const busy = !!(ui.anim && now - ui.anim.t0 < ui.anim.dur);
    if (busy && act && !KEEP.includes(act.type)) act = b.act = null;
    if (busy && b.routine && b.routine.type === 'visit') b.routine = null;
    const free = ui.view === 'main' && !s.gone && s.stage !== 'bud';
    const prevX = b.x;
    const pose = { x: 0, facing: 0, lift: 0, sleepP: 0, hidden: false, door: 0, face: null, armL: 'down', armR: 'wand', nod: 0, kick: false, shake: 0, trail: false, focus: null, action: null, p: 0 };
    let rate = 1, tf = null;

    // ---- rotinas (deslocamentos com objetivo) ----
    const R = b.routine;
    if (R && R.type === 'home') {
      const door = World.house.door + 0.03;
      if (R.phase === 'travel') {
        pose.face = 'tired'; rate = 0.8;
        if (travel(door, dt, RUSH)) { R.phase = 'enter'; R.t0 = now; }
        b.sleepP = 0;
      } else if (R.phase === 'enter') {
        const p = Math.min(1, (now - R.t0) / 1400);
        pose.face = p < 0.5 ? 'yawn' : 'sleep'; pose.armL = p < 0.5 ? 'mouth' : 'down';
        pose.door = 1; tf = -0.9; rate = 1 - p;
        pose.lift = -8 * p; b.x += (World.house.door - b.x) * Math.min(1, dt * 0.004);
        b.sleepP = p;
        if (p >= 1) { R.phase = 'inside'; R.t0 = now; }
      } else if (R.phase === 'inside') {
        pose.hidden = true; b.sleepP = 1; b.x = World.house.door;
      } else if (R.phase === 'exit') {
        const p = Math.min(1, (now - R.t0) / 900);
        pose.door = 1; pose.face = 'sleep'; pose.lift = -8 * (1 - p); b.sleepP = 1 - p; tf = 0.9;
        b.x += (door - b.x) * Math.min(1, dt * 0.004);
        if (p >= 1) { b.routine = null; play('stretch', now); act = b.act; }
      }
    } else if (R && R.type === 'visit') {
      tf = Math.sign(R.tx - b.x) * 0.9;
      if (travel(R.tx, dt, SPEED * 1.3)) { b.routine = null; play('sniff', now, { flower: R.flower, side: R.side }); act = b.act; }
    }
    if (!b.routine || b.routine.type !== 'home') {
      if (!(act && act.type === 'stretch')) b.sleepP = s.asleep ? 1 : 0;
      else b.sleepP = Math.max(0, 1 - (now - act.t0) / (act.dur * 0.35));
    }

    // ---- gestos espontâneos ----
    if (free && !s.asleep && !act && !busy && !b.routine) {
      if (!b.nextIdle) b.nextIdle = now + 4000;
      if (now > b.nextIdle) {
        const k = pickIdle(s, now);
        if (k === 'visit') {
          const w = World.walk(s);
          const opts = World.flowers.map((x, i) => ({ x, i })).filter(f => f.x > w.min - 0.06 && f.x < w.max + 0.04);
          if (opts.length) {
            const f = opts[Math.floor(Math.random() * opts.length)], side = f.x > b.x ? -1 : 1;
            b.routine = { type: 'visit', tx: f.x + side * 0.07, flower: f.i, side };
          }
        } else if (k) { play(k, now, k === 'chase' ? { bf: Math.random() < .5 ? 0 : 1 } : {}); act = b.act; }
        b.nextIdle = now + 5000 + Math.random() * 5000;
      }
    }

    // ---- passeio livre ----
    if (free && !s.asleep && !busy && !act && !b.routine) {
      const w = World.walk(s);
      if (now > b.nextWander || b.target > w.max) { b.target = w.min + Math.random() * Math.max(0, w.max - w.min); b.nextWander = now + 1800 + Math.random() * 2800; }
      travel(b.target, dt, SPEED);
    }

    // ---- gestos ----
    const p = act ? (now - act.t0) / act.dur : 0;
    if (act) switch (act.type) {
      case 'wave': pose.face = 'happy'; pose.armL = 'wave'; break;
      case 'giggle': pose.face = 'happy'; pose.lift = Math.abs(Math.sin(p * Math.PI * 3)) * 3; rate = 1.6; break;
      case 'spin': pose.face = 'happy'; pose.lift = Math.sin(p * Math.PI) * 7; rate = 2.2; pose.trail = true; break;
      case 'yawn': { const mid = p > 0.2 && p < 0.8; pose.face = mid ? 'yawn' : 'tired'; pose.armL = mid ? 'mouth' : 'down'; rate = .6; break; }
      case 'doze': { const k = Math.floor(p * 6) % 2; pose.face = k ? 'sleep' : 'tired'; pose.nod = k; pose.lift = -3 * Math.sin(p * Math.PI); rate = .4; break; }
      case 'hungry': pose.face = 'sad'; pose.armL = 'belly'; tf = -0.7; pose.shake = p > 0.3 && p < 0.6 && Math.floor(now / 80) % 2 ? 1 : 0; break;
      case 'bored': pose.face = 'bored'; pose.lift = -6 * Math.min(1, p * 4) * (p < 0.85 ? 1 : (1 - p) / 0.15); pose.kick = true; rate = .5; break;
      case 'stretch': pose.face = p < 0.45 ? 'sleep' : 'happy'; pose.armL = 'up'; pose.armR = 'up'; pose.lift = Math.sin(p * Math.PI) * 3; break;
      case 'sniff': {
        const down = Math.min(1, p * 4) * (p < 0.85 ? 1 : (1 - p) / 0.15);
        pose.face = p > 0.25 && p < 0.55 ? 'sleep' : 'happy'; pose.lift = -9 * down; pose.nod = down > 0.5 ? 1 : 0;
        tf = -act.side * 0.8; rate = 0.6; pose.focus = { kind: 'flower', i: act.flower, x: World.flowers[act.flower] };
        break;
      }
      case 'chase': {
        const bf = World.butterfly(act.bf, now), w = World.walk(s);
        const tx = Math.max(w.min, Math.min(w.max, bf.x - 0.03));
        tf = Math.sign(bf.x - b.x) * 0.9;
        b.x += (tx - b.x) * Math.min(1, dt * 0.0025);
        const ramp = Math.min(1, p * 5) * Math.min(1, (1 - p) * 5);
        pose.lift = Math.max(0, Math.min(30, 70 - bf.y * 120)) * ramp;
        pose.face = 'happy'; pose.armL = p > 0.3 && p < 0.8 ? 'wave' : 'down'; rate = 1.6;
        pose.focus = { kind: 'butterfly', i: act.bf };
        break;
      }
      case 'fireflies': pose.face = 'happy'; pose.lift = Math.sin(p * Math.PI) * 6; rate = 0.9; pose.armL = p > 0.4 && p < 0.7 ? 'up' : 'down'; pose.focus = { kind: 'fireflies', p }; break;
    }

    // ---- direção do olhar ----
    const vx = (b.x - prevX) / Math.max(1, dt);
    if (tf === null) tf = Math.abs(vx) > 0.00005 ? Math.sign(vx) * 0.9 : 0;
    b.facing += (tf - b.facing) * Math.min(1, dt * 0.005);
    pose.facing = act && act.type === 'spin' ? Math.sin(p * Math.PI * 4) : b.facing;

    if (s.asleep && b.sleepP >= 1) rate = 0;
    b.wing += dt * 0.014 * rate;
    Object.assign(pose, { x: b.x, sleepP: b.sleepP, wing: b.wing, action: act ? act.type : (b.routine ? b.routine.type + ':' + (b.routine.phase || 'go') : null), p });
    return pose;
  }
  return { update, play, reset, state: b };
})();

