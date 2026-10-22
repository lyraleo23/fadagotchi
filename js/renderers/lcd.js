/* ---------- 3a. LCD RENDERER (48×32, clássico) ---------- */
const LcdRenderer = (() => {
  const W = 48, H = 32, C = 10;
  const grid = new Uint8Array(W * H);
  let ctx;
  const pal = {
    on: { bg: '#a9b897', on: '#26301f', ghost: 'rgba(38,48,31,.07)' },
    off: { bg: '#27301f', on: '#7f9070', ghost: 'rgba(127,144,112,.05)' },
  };
  const px = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = 1; };
  function blit(sp, x, y, crop = sp.w, scale = 1) {
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < Math.min(sp.w, crop); i++)
      if (sp.d[j * sp.w + i]) for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) px(x + i * scale + a, y + j * scale + b);
  }
  function flush(dark) {
    const p = dark ? pal.off : pal.on;
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W * C, H * C);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      ctx.fillStyle = grid[y * W + x] ? p.on : p.ghost;
      ctx.fillRect(x * C + 1, y * C + 1, C - 1, C - 1);
    }
  }
  const spriteW = s => SPR[s.stage].base[0].length;
  function drawPixie(s, x, tick, face, dy = 0) {
    const def = SPR[s.stage];
    const flying = !s.asleep;
    const up = flying ? (tick % 2 === 0) : false;
    const bob = flying ? ((tick >> 1) % 2) : 1;
    const sp = pixieSprite(s.stage, face, up);
    const y = Math.max(0, def.y + bob + dy);
    blit(sp, x, y);
    return { x, y, w: sp.w, h: sp.h };
  }
  function sparkles(cx, cy, r, tick, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = (tick * 0.9 + i * 2.1);
      blit(ITEM.spark, Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r * 0.7) - 1);
    }
  }

  function draw(s, ui, now, pose) {
    grid.fill(0);
    const tick = Math.floor(now / 260);
    const dark = s.lightsOff;
    const anim = ui.anim && now - ui.anim.t0 < ui.anim.dur ? ui.anim : null;
    const prog = anim ? (now - anim.t0) / anim.dur : 0;

    if (s.gone) {
      for (let i = 0; i < 6; i++) if ((tick + i * 3) % 7 < 3) blit(ITEM.spark, (i * 17 + 5) % 44, (i * 11 + 3) % 28);
      return flush(false);
    }
    if (ui.view === 'status') {
      const p = STATUS_PAGES[ui.page];
      blit(ICON[p.icon], 3, 8, 8, 2);
      const full = Math.round(pageValue(s, p) / 25);
      for (let i = 0; i < 4; i++) blit(i < full ? ITEM.heart : ITEM.heartEmpty, 22 + i * 6, 13);
      for (let i = 0; i < STATUS_PAGES.length; i++) { px(17 + i * 2, 29); if (i === ui.page) px(17 + i * 2, 28); }
      return flush(false);
    }
    if (ui.view === 'food') {
      blit(ITEM.meal, 12, 9); blit(ITEM.candy, 28, 9);
      blit(ITEM.arrowUp, ui.foodIdx === 0 ? 13 : 29, 20);
      return flush(false);
    }
    if (ui.view === 'games') {
      blit(ITEM.guess, 4, 10); blit(ITEM.rock, 26, 6); blit(ITEM.scissors, 34, 12);
      blit(ITEM.arrowUp, ui.gameIdx === 0 ? 9 : 31, 24);
      return flush(false);
    }
    if (ui.view === 'rps') {
      const g = ui.game, R3 = [ITEM.rock, ITEM.paper, ITEM.scissors];
      for (let i = 0; i < 2; i++) { if (i < g.you) { px(2 + i * 3, 1); px(3 + i * 3, 1); } else px(2 + i * 3, 1); if (i < g.fairy) { px(44 - i * 3, 1); px(45 - i * 3, 1); } else px(45 - i * 3, 1); }
      if (g.phase === 'ask') {
        R3.forEach((sp, i) => blit(sp, 5 + i * 15, 10));
        blit(ITEM.arrowUp, 7 + g.pick * 15, 22);
      } else {
        blit(R3[g.mine], 8, 11); blit(R3[g.hers], 32, 11);
        if (g.last === 0) { px(23, 13); px(24, 13); px(23, 16); px(24, 16); }
        else if (tick % 2 === 0) blit(ITEM.spark, g.last === 1 ? 10 : 34, 4);
        blit(ITEM.heart, 34, 24); px(11, 25); px(12, 24); px(13, 25); px(12, 26);
      }
      return flush(false);
    }
    if (ui.view === 'game') {
      const g = ui.game, w = spriteW(s);
      for (let i = 0; i < g.results.length; i++) {
        const x = 17 + i * 3;
        px(x, 1); if (g.results[i]) { px(x + 1, 1); px(x, 2); px(x + 1, 2); }
      }
      if (g.phase === 'ask') {
        drawPixie(s, Math.round((W - w) / 2), tick, 'neutral');
        if (tick % 2 === 0) { blit(ITEM.arrowL, 1, 14); blit(ITEM.arrowR, 42, 14); }
      } else {
        drawPixie(s, g.dir === 'L' ? 2 : 46 - w, tick, g.guess === g.dir ? 'happy' : 'sad');
      }
      return flush(false);
    }

    if (s.stage === 'bud') {
      const wob = s.ageMin > 0.35 ? (tick % 2 ? 1 : -1) : ((tick >> 2) % 2 ? 1 : 0);
      blit(bud, 18 + wob, 13);
      if (anim && anim.type === 'hatch') sparkles(24, 18, 12, tick, 4);
      return flush(dark);
    }

    for (let i = 0; i < s.poops; i++) {
      const x = 39 - i * 9;
      blit(ITEM.poop, x, 24);
      if (tick % 2 === i % 2) { px(x + 2, 21); px(x + 5, 20); } else { px(x + 3, 20); px(x + 6, 21); }
    }

    blit(lcdHouse, 0, 22);
    if (pose.hidden) {
      if (tick % 4 < 2) blit(ITEM.z, 11, 14); else blit(ITEM.z, 14, 10);
      return flush(dark);
    }
    const w = spriteW(s);
    const maxX = Math.max(11, 47 - w - 9 * s.poops);
    let x = Math.max(Math.min(maxX, Math.round(pose.x * W - w / 2)), pose.door ? 4 : 11);
    if (anim && anim.type === 'refuse') x += tick % 2 ? 1 : -1;
    const lf = faceFor(s, anim, pose);
    const b = drawPixie(s, x, tick, { yawn: 'sleep', tired: 'neutral', bored: 'neutral' }[lf] || lf, -Math.round((pose.lift || 0) / 4));
    const side = b.x + b.w + 1 <= 40 ? b.x + b.w + 1 : b.x - 9;

    if (s.sick && !s.asleep) blit(ITEM.cloud, b.x + Math.floor(b.w / 2) - 4, Math.max(0, b.y - 8));
    if (s.asleep) { blit(ITEM.z, 37, 3 + (tick % 2)); if (tick % 4 < 2) blit(ITEM.z, 42, 0); }

    if (anim) {
      const t = anim.type;
      if (t === 'eat') {
        const sp = anim.item === 'candy' ? ITEM.candy : ITEM.meal;
        const bites = Math.min(4, Math.floor(prog * 5));
        blit(sp, side, b.y + 6, 8 - bites * 2);
      } else if (t === 'pet') {
        [-3, Math.floor(b.w / 2) - 2, b.w - 2].forEach((o, i) => {
          const rise = Math.floor(((prog * 14) + i * 5) % 14);
          blit(ITEM.heart, b.x + o, b.y + 6 - rise);
        });
      } else if (t === 'bath') {
        const wx = Math.floor(prog * 52) - 2;
        for (let y = 0; y < 32; y += 3) { px(wx, y + (tick % 3)); px(wx - 2, y + 1 + (tick % 2)); px(wx + 1, y + 2); }
      } else if (t === 'toilet') {
        blit(ICON.toilet, side, b.y + 7);
        if (prog > .5) for (let i = 0; i < 3; i++) px(side + 2 + i * 2, b.y + 16 + ((tick + i) % 2));
      } else if (t === 'med') {
        blit(ICON.med, side, b.y + 6);
        sparkles(b.x + b.w / 2, b.y + b.h / 2, 10, tick, 3);
      } else if (t === 'hatch' || t === 'grow' || t === 'win' || t === 'gift') {
        sparkles(b.x + b.w / 2, b.y + b.h / 2, 12, tick, 4);
      }
    }
    flush(dark);
  }

  return {
    init(canvas) { canvas.width = W * C; canvas.height = H * C; ctx = canvas.getContext('2d'); },
    draw,
  };
})();

