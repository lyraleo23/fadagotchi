/* ---------- 3c. SMOOTH RENDERER (vetorial, curvas e gradientes) ----------
   Desenha o mesmo mundo de 192×120 unidades com Canvas 2D em alta
   resolução: contornos arredondados, gradientes e brilhos suaves.
   Mesmo contrato dos outros: init(canvas) + draw(state, ui, now, pose).  */
const SmoothRenderer = (() => {
  const W = 192, H = 120, GROUND = 100;
  let S = 8;
  let ctx, LW = 0.45;
  const DARK = 0x24142f;
  const T = {
    skin: LOOKS.skin.clara.tones, hair: LOOKS.hair.rosa.tones, dress: LOOKS.dress.folha.tones, dress2: LOOKS.dress.folha.back, shoe: LOOKS.dress.folha.shoe,
    gold: [0xfff6c2, 0xffd95a, 0xf0a53c, 0xc07a28], stem: [0xfffaf0, 0xf6e7cf, 0xdcc8ab, 0xb8a283], cap: [0xff9a9a, 0xe8505b, 0xbf3a4c, 0x8f2a3e],
    wood: [0xc9905f, 0x9a6440, 0x774a2e, 0x55331e], leaf: [0xb4ec9c, 0x6fc274, 0x4f9e5c, 0x3a7a4a], bowl: [0xc4e6ff, 0x5aa9e6, 0x3d7fc0, 0x2d5f99],
    rice: [0xffffff, 0xfff4e0, 0xeedfc4, 0xd6c3a2], berry: [0xffa3ad, 0xe8505b, 0xb03348, 0x7f2234], candy: [0xffd6ea, 0xff8fbf, 0xd8569a, 0xa83a75],
    heart: [0xffd3e3, 0xff6f9e, 0xd8457c, 0xa8305e], heartE: [0xf4f1f8, 0xdcd6e6, 0xc2bad2, 0xa79dbb], poop: [0xc69468, 0x9a6440, 0x744a2e, 0x52331f],
    potion: [0xe6d2ff, 0xa983ea, 0x7d5ac7, 0x5a3e99], glass: [0xffffff, 0xeaf5ff, 0xc9def2, 0xa3bdd8], porc: [0xffffff, 0xf1f3f8, 0xd5dae6, 0xb3bacb],
    cloud: [0xffffff, 0xf8f6ff, 0xe4def6, 0xcbc3e8], gray: [0xd6dbe4, 0x9aa3b5, 0x737c90, 0x565d6e], water: [0xd9f3ff, 0x7fd3ff, 0x4aa8e0, 0x2f7fb8],
    red: [0xffa0a0, 0xef5f6a, 0xc43e4f, 0x8f2a3e], moon: [0xfffaf0, 0xfff1d6, 0xe6d6b8, 0xc9b896], sun: [0xffffff, 0xfff6b0, 0xffe27a, 0xffd04a],
    ribbon: [0xffb8c0, 0xf05868, 0xc83a4c, 0x96283a], cape: [0xffd6e0, 0xf590ac, 0xd26482, 0xa04460],
  };
  let EYE = LOOKS.eyes.ametista, WING = LOOKS.wings.cristal, WEAR = {}, lookKey = '';
  function applyLook(look) {
    const k = JSON.stringify(look);
    if (k === lookKey) return;
    lookKey = k;
    T.hair = LOOKS.hair[look.hair].tones; T.skin = LOOKS.skin[look.skin].tones;
    const d = LOOKS.dress[look.dress]; T.dress = d.tones; T.dress2 = d.back; T.shoe = d.shoe;
    EYE = LOOKS.eyes[look.eyes]; WING = LOOKS.wings[look.wings];
  }

  // ---- cores e primitivas ----
  function mix(a, b, t) {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }
  const css = (n, a = 1) => a >= 1 ? '#' + (n >>> 0).toString(16).padStart(6, '0') : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  const dk = (n, k = .55) => mix(n, DARK, k);
  let TINT = 0, TK = 0;
  const G = n => TK ? mix(n, TINT, TK) : n;              // cor do cenário com a luz da hora
  const Gt = tones => tones.map(G);
  function rg(x, y, r, tones) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.08, x, y, r * 1.05);
    g.addColorStop(0, css(tones[0])); g.addColorStop(0.42, css(tones[1])); g.addColorStop(0.85, css(tones[2])); g.addColorStop(1, css(tones[3]));
    return g;
  }
  function lg(x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, typeof c === 'number' ? css(c) : c)); return g; }
  function fs(fill, stroke, lw = LW) { ctx.fillStyle = fill; ctx.fill(); if (stroke != null) { ctx.strokeStyle = typeof stroke === 'number' ? css(stroke) : stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rot, 0, Math.PI * 2); }
  function ellS(x, y, rx, ry, rot, tones, outline = true) { ell(x, y, rx, ry, rot); fs(rg(x, y, Math.max(rx, ry), tones), outline ? dk(tones[2]) : null); }
  const ball = (x, y, r, tones, outline = true) => ellS(x, y, r, r, 0, tones, outline);
  function seg(pts, color, w) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = typeof color === 'number' ? css(color) : color; ctx.lineWidth = w; ctx.stroke();
  }
  function limb(pts, tones, w) { seg(pts, dk(tones[2]), w + LW * 2); seg(pts, tones[1], w); }
  function glow(x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(c, a)); g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function sparkle(x, y, r, c = 0xffffff, a = 1) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = css(c); ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill(); ctx.restore();
  }
  function at(x, y, k, fn) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); const old = LW; LW = old / k; fn(); LW = old; ctx.restore(); }

  // ---- itens (desenhados na origem, escala 1) ----
  function heart(tones = T.heart) {
    const s = 4; ctx.beginPath(); ctx.moveTo(0, s * 0.95);
    ctx.bezierCurveTo(-s * 1.45, s * 0.05, -s * 1.05, -s * 1.1, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 1.05, -s * 1.1, s * 1.45, s * 0.05, 0, s * 0.95);
    fs(rg(-s * 0.1, -s * 0.1, s * 1.3, tones), dk(tones[2]));
    ell(-s * 0.55, -s * 0.42, s * 0.24, s * 0.15, -0.6); fs('rgba(255,255,255,.85)');
  }
  function star(r, tones = T.gold, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.lineJoin = 'round';
    ctx.strokeStyle = css(dk(tones[2], .35)); ctx.lineWidth = r * 0.3 + LW; ctx.stroke();
    ctx.strokeStyle = css(tones[1]); ctx.lineWidth = r * 0.3; ctx.stroke();
    ctx.fillStyle = rg(0, 0, r, tones); ctx.fill();
  }
  function bowl() {
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 4.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); fs(rg(-1, -2, 6, T.rice), dk(T.rice[3], .4));
    [[-2.6, -2.3, 1.35], [0.8, -3.4, 1.35], [3.4, -1.6, 1.25]].forEach(([x, y, r]) => { ball(x, y, r, T.berry); ell(x - r * .35, y - r * .35, r * .3, r * .22); fs('rgba(255,255,255,.8)'); });
    ell(0.9, -5, 0.9, 0.45, -0.5); fs(css(T.leaf[1]), dk(T.leaf[2]));
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 5.6, 0, 0, Math.PI); ctx.closePath(); fs(lg(-7.5, 0, 7.5, 0, [[0, T.bowl[0]], [0.35, T.bowl[1]], [1, T.bowl[3]]]), dk(T.bowl[2]));
    ell(0, 0, 7.5, 1.1); fs(css(T.bowl[0]), dk(T.bowl[2]));
    for (let i = -2; i <= 2; i++) { ell(i * 2.4, 2.8 - Math.abs(i) * 0.25, 0.55, 0.55); fs('#ffffff'); }
  }
  function candy() {
    const wr = side => { ctx.beginPath(); ctx.moveTo(side * 3.4, 0); ctx.quadraticCurveTo(side * 6, -1, side * 8, -3.6); ctx.quadraticCurveTo(side * 7, 0, side * 8, 3.6); ctx.quadraticCurveTo(side * 6, 1, side * 3.4, 0); fs(lg(0, -4, 0, 4, [[0, T.candy[1]], [1, T.candy[3]]]), dk(T.candy[2])); };
    wr(-1); wr(1);
    ell(0, 0, 4.1, 4.1); fs(rg(0, 0, 4.1, T.candy), dk(T.candy[2]));
    ctx.save(); ell(0, 0, 4.1, 4.1); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.9;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 2.2 - 5, -5); ctx.lineTo(i * 2.2 + 5, 5); ctx.stroke(); }
    ctx.restore();
    ell(-1.4, -1.6, 1, .6, -0.6); fs('rgba(255,255,255,.8)');
  }
  function poop() {
    ellS(0, -2.6, 6, 2.9, 0, T.poop); ellS(0.4, -5.6, 4.5, 2.4, 0, T.poop); ellS(0.9, -8.2, 2.9, 1.9, 0, T.poop);
    ctx.beginPath(); ctx.moveTo(0.6, -9.6); ctx.quadraticCurveTo(2.6, -10.6, 2.2, -12); fs('transparent', dk(T.poop[1], .2), 1.1);
  }
  function potion() {
    rrect(-1.6, -9, 3.2, 5, 0.6); fs(lg(-1.6, 0, 1.6, 0, [[0, T.glass[0]], [1, T.glass[2]]]), dk(T.glass[3], .4));
    rrect(-2.1, -11, 4.2, 2.4, 0.8); fs(rg(-.5, -10.4, 2.5, T.wood), dk(T.wood[2]));
    ell(0, 0, 5, 5); fs(rg(0, 0, 5, T.glass), dk(T.glass[3], .4));
    ctx.save(); ell(0, 0, 5, 5); ctx.clip(); ctx.beginPath(); ctx.rect(-6, -0.8, 12, 7); fs(rg(0, 1, 5, T.potion));
    ell(0, -0.8, 5, 0.9); fs(css(T.potion[0]));
    [[-1.6, 2, .6], [1.2, 3, .45], [2.2, 0.8, .35]].forEach(([x, y, r]) => { ell(x, y, r, r); fs('rgba(255,255,255,.7)'); });
    ctx.restore();
    ell(-2.4, -2.2, 0.9, 1.5, 0.4); fs('rgba(255,255,255,.85)');
  }
  function potty() {
    rrect(-8.5, -9.5, 4.6, 9.5, 1.4); fs(lg(-8.5, 0, -4, 0, [[0, T.porc[0]], [1, T.porc[2]]]), dk(T.porc[3], .4));
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 6, 0, 0, Math.PI); ctx.closePath(); fs(rg(-2, 1, 7, T.porc), dk(T.porc[3], .4));
    rrect(-3, 4.6, 6, 2.6, 0.8); fs(css(T.porc[2]), dk(T.porc[3], .4));
    ell(0, 0, 7, 1.6); fs(css(T.porc[0]), dk(T.porc[3], .4)); ell(0, 0.1, 5.4, 0.9); fs(css(T.water[1]));
  }
  function drop() {
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.bezierCurveTo(1.5, -5, 5.2, -2.5, 5, 1.6); ctx.arc(0, 1.6, 5, 0, Math.PI); ctx.bezierCurveTo(-5.2, -2.5, -1.5, -5, 0, -9);
    fs(rg(-1, 0, 6.5, T.water), dk(T.water[2])); ell(-2, -0.5, .8, 1.6, 0.3); fs('rgba(255,255,255,.85)');
  }
  function moonIcon() {
    ctx.beginPath(); ctx.arc(0, 0, 6, 0.75, Math.PI * 2 - 1.45); ctx.arc(3.2, -2.1, 4.6, Math.PI * 2 - 0.9, 1.75, true); ctx.closePath();
    fs(rg(-1.5, 0, 6.5, T.gold), dk(T.gold[2]));
  }
  function cross() {
    ctx.beginPath(); const a = 2, b = 6;
    ctx.moveTo(-a, -b); ctx.lineTo(a, -b); ctx.lineTo(a, -a); ctx.lineTo(b, -a); ctx.lineTo(b, a); ctx.lineTo(a, a); ctx.lineTo(a, b); ctx.lineTo(-a, b); ctx.lineTo(-a, a); ctx.lineTo(-b, a); ctx.lineTo(-b, -a); ctx.lineTo(-a, -a); ctx.closePath();
    ctx.lineJoin = 'round'; fs(rg(-1, -1, 7, T.red), dk(T.red[2]));
  }
  function cloud(tones = T.cloud, a = 1) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = lg(0, -8, 0, 4, [[0, tones[0]], [0.7, tones[1]], [1, tones[2]]]);
    ctx.beginPath(); [[-7, 1, 4.6], [7, 1, 5], [0, -2, 6.5], [-3, 2, 4], [3.5, 2, 4]].forEach(([x, y, r]) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); });
    ctx.fill(); ctx.restore();
  }
  const ICONF = { hunger: () => { ctx.translate(0, 2); bowl(); }, affection: () => { ctx.scale(1.5, 1.5); heart(); }, fun: () => star(8), bladder: () => { ctx.translate(1, 1); potty(); }, hygiene: drop, energy: moonIcon, health: cross };

  // ---- fada ----
  function fairy(stage, cx, F, face, t, blink, pose = {}) {
    const baby = stage === 'baby', R = baby ? 10 : 9;
    const legH = baby ? 3 : 7, skirtH = baby ? 7 : 12, bodiceH = baby ? 0 : 5;
    const skirtBot = F - legH, skirtTop = skirtBot - skirtH, ty = skirtTop - bodiceH;
    const bx = cx, fc = Math.max(-1, Math.min(1, pose.facing || 0)), fo = fc * 2, hx = bx + fc, hy = ty - R + 1 + (pose.nod || 0);
    const folded = (pose.sleepP || 0) > 0.6, armL = pose.armL || 'down', armR = baby ? 'none' : (pose.armR || 'wand');
    const SK = T.skin, HR = T.hair, DR = T.dress, DR2 = T.dress2;

    // asas
    const flap = folded ? 0 : Math.sin(pose.wing ?? t * 0.014), ws = baby ? 0.78 : 1, sx = bx, sy = ty + 2;
    const sL = 1 + (fc > 0 ? 0.12 : 0.3) * fc, sR = 1 - (fc < 0 ? 0.12 : 0.3) * fc, sh = (Math.sin(t * 0.002) + 1) / 2;
    const wing = (phi, rx, ry, side) => {
      const k = side < 0 ? sL : sR; rx *= k * ws; ry *= k * ws;
      const dx = side < 0 ? Math.cos(phi) : -Math.cos(phi), dy = Math.sin(phi), ang = Math.atan2(dy, dx);
      const cx_ = sx + dx * rx * 0.95, cy_ = sy + dy * rx * 0.95;
      ctx.save(); ctx.globalAlpha = 0.8;
      ell(cx_, cy_, rx, ry, ang);
      ctx.fillStyle = lg(sx, sy, sx + dx * rx * 1.95, sy + dy * rx * 1.95, [[0, WING.root], [0.45, mix(WING.a, WING.b, sh)], [1, mix(WING.b, WING.a, sh)]]); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = css(WING.rim); ctx.lineWidth = LW; ctx.stroke();
      ctx.globalAlpha = 0.55; seg([[sx, sy], [sx + dx * rx * 1.25, sy + dy * rx * 1.25]], WING.vein, 0.35);
      seg([[sx + dx * rx * 0.6, sy + dy * rx * 0.6], [cx_ + dx * rx * 0.55 - dy * ry * 0.6, cy_ + dy * rx * 0.55 + dx * ry * 0.6]], WING.vein, 0.25);
      ctx.globalAlpha = 0.9; ell(cx_ + dx * rx * 0.42, cy_ + dy * rx * 0.42, ry * 0.18, ry * 0.18); fs('#ffffff');
      ctx.restore();
    };
    const pair = (phi, rx, ry) => { wing(phi, rx, ry, -1); wing(phi, rx, ry, 1); };
    if (folded) { pair(Math.PI + 0.95, 9, 3); pair(Math.PI + 1.3, 14, 4); }
    else { pair(Math.PI - 0.62 + 0.2 * flap, 10, 4.6); pair(Math.PI + 0.6 + 0.42 * flap, 17, 7 + 1.6 * flap); }

    // capa
    if (WEAR.back === 'capa') { const c0 = ty - 1, h = F - 2 - c0; for (let k = -2; k <= 2; k++) ellS(bx + k * 4.6 - fo * 0.5, c0 + h * 0.55, 4.4, h * 0.6, -k * 0.24, T.cape); }

    // cabelo de trás
    const hb = hx - fo * 0.8 + Math.sin(t * 0.003) * 0.5;
    if (!baby) {
      ctx.beginPath(); ctx.moveTo(hb - R - 2, hy);
      ctx.bezierCurveTo(hb - R - 3.6, hy + R + 2, hb - R + 1, hy + R + 5.5, hb - R * 0.4, hy + R + 3.6);
      ctx.quadraticCurveTo(hb, hy + R + 5.8, hb + R * 0.4, hy + R + 3.6);
      ctx.bezierCurveTo(hb + R - 1, hy + R + 5.5, hb + R + 3.6, hy + R + 2, hb + R + 2, hy);
      ctx.closePath(); fs(lg(0, hy, 0, hy + R + 6, [[0, HR[1]], [1, HR[2]]]), dk(HR[2]));
      ctx.save(); ctx.globalAlpha = 0.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(hb + i * 3.6, hy + 2); ctx.quadraticCurveTo(hb + i * 4.2 + 1, hy + R, hb + i * 3.8, hy + R + 3.5); fs('transparent', HR[3], 0.35); } ctx.restore();
      ball(hx + 1 - fo * 0.5, hy - R - 2, 3.9, HR);
    }
    ellS(hx - fo * 0.5, hy, R + 1.8, R + 1.4, 0, HR);
    if (baby) { const tx = hx + 1 - fo * 0.5; ellS(tx - 1.2, hy - R - 1.2, 1.4, 2.6, -0.5, HR); ellS(tx + 1.4, hy - R - 1.6, 1.2, 2.4, 0.6, HR); }

    // pernas
    const kick = pose.kick ? Math.sin(t * 0.01) * 1.5 : 0;
    [[bx - 1.6, kick], [bx + 1.6, -kick]].forEach(([x, kk], i) => {
      limb([[x, skirtBot - 2], [x + kk, F - 1.4]], SK, 1.6);
      ellS(x + kk + (i ? 0.5 : -0.5), F - 0.6, 1.9, 1.25, 0, T.shoe);
      if (!baby) ball(x + kk + (i ? 2 : -2), F - 1, 0.6, T.porc, false);
    });

    // saia de pétalas
    const pw = baby ? 2.6 : 3;
    (baby ? [-1, 0, 1] : [-2, -1, 0, 1, 2]).forEach(k => ellS(bx + k * pw, skirtTop + skirtH * 0.55, pw * 0.98, skirtH * 0.56, -k * 0.3, DR2));
    (baby ? [-0.5, 0.5] : [-1.5, -0.5, 0.5, 1.5]).forEach(k => ellS(bx + k * pw * 1.05, skirtTop + skirtH * 0.42, pw * 0.92, skirtH * 0.5, -k * 0.28, DR));
    if (!baby) {
      ellS(bx, ty + 2.6, 4.3, 3.7, 0, DR);
      ball(bx - 4.5, ty + 1.5, 2.1, DR); ball(bx + 4.5, ty + 1.5, 2.1, DR);
      ellS(bx - 2.4, ty + 0.2, 2.1, 1.2, -0.4, [0xffffff, DR[0], DR[1], DR[2]]); ellS(bx + 2.4, ty + 0.2, 2.1, 1.2, 0.4, [0xffffff, DR[0], DR[1], DR[2]]);
    }
    seg([[bx - (baby ? 3.2 : 4), skirtTop - 0.6], [bx + (baby ? 3.2 : 4), skirtTop - 0.6]], dk(T.gold[2], .3), 1.2 + LW);
    seg([[bx - (baby ? 3.2 : 4), skirtTop - 0.6], [bx + (baby ? 3.2 : 4), skirtTop - 0.6]], T.gold[1], 1.1);
    ball(bx, skirtTop - 0.6, 1.05, T.gold);

    // braços
    const shY = baby ? skirtTop + 1 : ty + 2, shL = bx - (baby ? 4 : 5), shR = bx + (baby ? 4 : 5);
    const arm = pts => { limb(pts, SK, baby ? 1.5 : 1.6); ball(pts[pts.length - 1][0], pts[pts.length - 1][1], baby ? 1.05 : 1.2, SK); };
    const front = [], later = (raised, fn) => raised ? front.push(fn) : fn();
    let starPos = null;
    const wand = (x0, y0, x1, y1) => {
      seg([[x0, y0], [x1, y1]], dk(T.stem[2], .4), 0.9 + LW * 2); seg([[x0, y0], [x1, y1]], T.stem[1], 0.9);
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      starPos = [x1 + dx / l * 3, y1 + dy / l * 3];
      glow(starPos[0], starPos[1], 8, 0xfff3b0, 0.55 + Math.sin(t * 0.006) * 0.15);
      at(starPos[0], starPos[1], 1, () => star(3.6, T.gold, Math.sin(t * 0.004) * 0.3));
    };
    if (armR === 'wand') later(false, () => { wand(bx + 8.5, ty + 9.5, bx + 13, ty - 2.5); arm([[shR, shY], [bx + 9, ty + 7.5]]); });
    else if (armR === 'up') later(true, () => { wand(bx + 12, hy - 4, bx + 14, hy - 12); arm([[shR, shY], [bx + 9, hy + 4], [bx + 12, hy - 4]]); });
    else if (baby) { if (armL === 'up') later(true, () => arm([[shR, shY], [bx + 10, skirtTop - 9]])); else arm([[shR, shY], [bx + 6.5, skirtTop + 4]]); }
    const wv = Math.sin(t * 0.018) * 2.5;
    if (baby) {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 9, skirtTop - 2], [bx - 11 + wv, skirtTop - 9]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 10, skirtTop - 9]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 1, skirtTop + 2]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 6.5, skirtTop + 4]]);
    } else {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 11, ty - 1], [bx - 13 + wv, ty - 9]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 9, hy + 4], [bx - 12, hy - 4]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 6, ty + 5], [bx - 2, ty + 4.5]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 8, ty + 8], [bx - 7.5, ty + 9.5]]);
    }

    // orelhas
    const ear = side => {
      const ex = hx + side * (R - 1);
      ctx.beginPath(); ctx.moveTo(ex, hy - 1.8);
      ctx.quadraticCurveTo(ex + side * 3, hy - 3.2, ex + side * 5.8, hy - 6.4);
      ctx.quadraticCurveTo(ex + side * 3, hy + 1.2, ex, hy + 3);
      ctx.closePath(); fs(rg(ex + side * 2, hy - 1.5, 4, SK), dk(SK[2]));
      ctx.beginPath(); ctx.moveTo(ex + side * 0.6, hy - 0.8); ctx.quadraticCurveTo(ex + side * 2.6, hy - 2.4, ex + side * 4.2, hy - 4.6); fs('transparent', mix(SK[2], 0xff9db5, .3), 0.5);
    };
    if (fc < 0.55) ear(-1);
    if (fc > -0.55) ear(1);
    if (!baby) { ell(bx, hy + R - 0.2, 1.5, 1.7); fs(css(SK[2])); }

    // cabeça
    ellS(hx, hy, R + 0.3, R, 0, SK);
    [[hx - 5.4 + fo, -1], [hx + 5.4 + fo, 1]].forEach(([x]) => { const g = ctx.createRadialGradient(x, hy + (baby ? 5 : 3.8), 0, x, hy + (baby ? 5 : 3.8), 2.4); g.addColorStop(0, 'rgba(255,140,170,.55)'); g.addColorStop(1, 'rgba(255,140,170,0)'); ctx.fillStyle = g; ctx.fillRect(x - 3, hy, 6, 9); });

    // franja
    ctx.beginPath();
    ctx.moveTo(hx - R * 0.72, hy - R * 0.2);
    ctx.lineTo(hx - R - 0.7, hy + R * 0.5);
    ctx.ellipse(hx, hy, R + 0.8, R + 0.9, 0, Math.PI * 0.97, Math.PI * 2.03);
    ctx.lineTo(hx + R + 0.7, hy + R * 0.5);
    ctx.lineTo(hx + R * 0.72, hy - R * 0.2);
    const n = 7;
    for (let i = 1; i <= n; i++) {
      const x = hx + R * 0.72 - i * (R * 1.44 / n) + fo * 0.5 * (i % 2);
      ctx.lineTo(x, i % 2 ? hy - R * 0.05 + (i === 3 ? 0.8 : 0) : hy - R * 0.5);
    }
    ctx.closePath(); fs(rg(hx, hy - R * 0.3, R * 1.25, HR), dk(HR[2]));
    ctx.beginPath(); ctx.arc(hx - 0.8 + fo * 0.3, hy - 0.5, R * 0.78, Math.PI * 1.12, Math.PI * 1.42); fs('transparent', css(HR[0], 0.9), 0.9);
    ctx.beginPath(); ctx.arc(hx - 0.8 + fo * 0.3, hy - 0.5, R * 0.78, Math.PI * 1.5, Math.PI * 1.6); fs('transparent', css(HR[0], 0.7), 0.7);
    if (!baby && WEAR.head !== 'coroa' && WEAR.head !== 'tiara') {
      const cxp = hx - R + 2.2 - Math.max(0, fo), cyp = hy - R + 3;
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ball(cxp + Math.cos(a) * 1.3, cyp + Math.sin(a) * 1.3, 1.1, T.porc); }
      ball(cxp, cyp, 0.8, T.gold);
    }

    // olhos
    const ey = hy + (baby ? 2 : 1.3), erx = baby ? 1.8 : 1.55, ery = baby ? 2.6 : 2.3;
    const closed = face === 'sleep' || face === 'yawn' || blink;
    const lid = face === 'tired' || face === 'bored';
    [[hx - 3.6 + fo, -1], [hx + 3.6 + fo, 1]].forEach(([ex, side]) => {
      const far = (side > 0 && fc > 0.55) || (side < 0 && fc < -0.55);
      ctx.save(); ctx.translate(ex, ey); ctx.scale(far ? 0.65 : 1, 1);
      ctx.lineCap = 'round';
      if (closed) {
        ctx.beginPath(); ctx.ellipse(0, -0.4, erx * 1.15, ery * 0.6, 0, Math.PI * 0.12, Math.PI * 0.88); fs('transparent', DARK, 0.65);
        seg([[side * erx * 1.05, 0], [side * erx * 1.6, -0.3]], DARK, 0.5);
        if (face === 'yawn' && side < 0) { ell(-erx * 1.4, 1.3, 0.5, 0.7); fs(css(0x9fdcff)); }
      } else if (face === 'happy') {
        ctx.beginPath(); ctx.ellipse(0, 0.9, erx * 1.15, ery * 0.85, 0, Math.PI * 1.15, Math.PI * 1.85); fs('transparent', DARK, 0.7);
      } else {
        ell(0, 0, erx, ery); fs(lg(0, -ery, 0, ery, [[0, EYE.iris[0]], [0.5, EYE.iris[2]], [1, EYE.iris[5]]]));
        ell(0, 0.3, erx * 0.52, ery * 0.48); fs(css(EYE.pupil));
        ell(-erx * 0.35, -ery * 0.38, erx * 0.4, ery * 0.26, -0.3); fs('#ffffff');
        ell(erx * 0.38, ery * 0.45, erx * 0.2, erx * 0.2); fs('#ffffff');
        if (lid) { ctx.fillStyle = css(SK[1]); ctx.fillRect(-erx - 0.4, -ery - 0.5, erx * 2 + 0.8, ery * 0.95 + 0.5); seg([[-erx * 1.1, -ery * 0.05], [erx * 1.1, -ery * 0.05]], DARK, 0.6); }
        else { ctx.beginPath(); ctx.ellipse(0, 0.25, erx * 1.12, ery * 1.04, 0, Math.PI * 1.08, Math.PI * 1.92); fs('transparent', DARK, 0.7); seg([[side * erx * 1.05, -ery * 0.55], [side * erx * 1.7, -ery * 1.0]], DARK, 0.55); }
        if (face === 'sad') seg([[-side * erx * 0.2, -ery * 1.9 - 0.5], [side * erx * 1.2, -ery * 1.45]], dk(HR[2], .3), 0.55);
      }
      ctx.restore();
    });
    if (face === 'sad') { const ty2 = ey + ery + 1 + (t / 260) % 3; ctx.beginPath(); ctx.moveTo(hx - 4.4 + fo, ty2 - 1); ctx.quadraticCurveTo(hx - 3.7 + fo, ty2 + 0.4, hx - 4.4 + fo, ty2 + 0.8); ctx.quadraticCurveTo(hx - 5.1 + fo, ty2 + 0.4, hx - 4.4 + fo, ty2 - 1); fs(css(0x8fd2ff)); }

    // nariz e boca
    ell(hx + fo * 1.1, hy + (baby ? 4.4 : 3.3), 0.35, 0.25); fs(css(SK[3]));
    const mx = hx + fo, my = hy + (baby ? 6.4 : 5.2), M = 0xa8354f, MI = 0xff8fa8;
    ctx.lineCap = 'round';
    if (face === 'happy') { ctx.beginPath(); ctx.moveTo(mx - 1.7, my - 0.2); ctx.quadraticCurveTo(mx, my + 3.2, mx + 1.7, my - 0.2); ctx.closePath(); fs(css(M), dk(M, .3), 0.35); ell(mx, my + 1.4, 0.9, 0.55); fs(css(MI)); }
    else if (face === 'sad') { ctx.beginPath(); ctx.moveTo(mx - 1.4, my + 0.9); ctx.quadraticCurveTo(mx, my - 0.5, mx + 1.4, my + 0.9); fs('transparent', M, 0.5); }
    else if (face === 'yawn') { ell(mx, my + 0.7, 1.1, 1.6); fs(css(M)); ell(mx, my + 1.4, 0.6, 0.6); fs(css(MI)); }
    else if (face === 'sleep' || face === 'tired') { ell(mx, my + 0.2, 0.55, 0.42); fs(css(MI)); }
    else if (face === 'bored') seg([[mx - 1.2, my + 0.3], [mx + 1.2, my + 0.3]], M, 0.5);
    else { ctx.beginPath(); ctx.moveTo(mx - 1.5, my - 0.3); ctx.quadraticCurveTo(mx, my + 1.3, mx + 1.5, my - 0.3); fs('transparent', M, 0.5); }

    // acessórios
    const hwr = WEAR.head;
    if (hwr === 'laco') {
      const lx = hx + R - 3 - Math.min(0, fo), ly = hy - R + 1.5;
      [[-1, 0.5], [1, -0.5]].forEach(([s_, r_]) => { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + s_ * 2.5, ly - 3.4, lx + s_ * 4.2, ly - 0.6); ctx.quadraticCurveTo(lx + s_ * 3.4, ly + 2.2, lx, ly); fs(rg(lx + s_ * 2, ly - 1, 3.5, T.ribbon), dk(T.ribbon[2])); });
      [[-1], [1]].forEach(([s_]) => { ctx.beginPath(); ctx.moveTo(lx, ly + 0.4); ctx.lineTo(lx + s_ * 1.6, ly + 3.6); ctx.lineTo(lx + s_ * 0.5, ly + 3.2); ctx.closePath(); fs(css(T.ribbon[2]), dk(T.ribbon[3])); });
      ball(lx, ly, 1.1, T.ribbon);
    } else if (hwr === 'coroa') {
      const cols = [0xffffff, 0xff9cc8, 0xc4a6f2, 0xffe07a];
      for (let j = -4; j <= 4; j++) {
        const a = j * 0.3, x = hx + Math.sin(a) * (R + 0.4), y = hy - Math.cos(a) * (R + 0.4) + 1.2;
        if (j % 2) { ellS(x, y - 0.3, 1.3, 0.6, a + 0.6, T.leaf); continue; }
        const c = cols[(j + 8) % 4], ton = [0xffffff, c, mix(c, 0x9a6aa0, .35), mix(c, 0x6a4a80, .5)];
        for (let p = 0; p < 5; p++) { const b2 = p * Math.PI * 2 / 5; ball(x + Math.cos(b2) * 0.95, y + Math.sin(b2) * 0.95, 0.85, ton); }
        ball(x, y, 0.6, T.gold, false);
      }
    } else if (hwr === 'tiara') {
      ctx.beginPath(); ctx.ellipse(hx, hy + 0.5, R - 0.4, R - 0.6, 0, Math.PI * 1.2, Math.PI * 1.8); fs('transparent', dk(T.gold[2], .3), 1.1 + LW);
      ctx.beginPath(); ctx.ellipse(hx, hy + 0.5, R - 0.4, R - 0.6, 0, Math.PI * 1.2, Math.PI * 1.8); fs('transparent', T.gold[1], 1.1);
      const sx2 = hx + fo * 0.5, sy2 = hy - R + 0.3;
      glow(sx2, sy2, 7, 0xfff3b0, .5); at(sx2, sy2, 1, () => star(3, T.gold)); ball(sx2, sy2, 0.7, T.water, false);
    }
    if (WEAR.neck === 'colar') {
      const ny = hy + R + 0.8;
      for (let i = -3; i <= 3; i++) ball(bx + i * 1.05, ny + 0.9 - Math.abs(i) * 0.25, 0.5, T.porc, false);
      ball(bx, ny + 2.4, 1.15, T.water); ell(bx - 0.35, ny + 2, 0.3, 0.3); fs('#ffffff');
    }

    front.forEach(fn => fn());
    if (armL === 'mouth') arm(baby ? [[shL, shY], [mx - 3.6, my + 1]] : [[shL, shY], [bx - 9, ty - 1], [mx - 3.6, my + 1]]);
    return { hx: bx, hy, F, top: hy - R - (baby ? 4 : 7), cy: (hy + F) / 2, side: bx + 30 <= W - 6 ? bx + 22 : bx - 22, star: starPos };
  }

  // ---- cenário ----
  const PHASES = {
    day: { top: 0x7cc6ff, bot: 0xeaf7ff, tint: 0, k: 0 },
    dawn: { top: 0x8aa8ea, bot: 0xffd4b0, tint: 0x6a5aa0, k: .12 },
    dusk: { top: 0x4a3b8e, bot: 0xffa77a, tint: 0x5a3a7a, k: .28 },
    night: { top: 0x0d1030, bot: 0x2f2766, tint: 0x141a45, k: .58 },
  };
  const hillMid = x => 74 + 5 * Math.sin(x * 0.045 + 1) + 3 * Math.sin(x * 0.11);
  const STARS = Array.from({ length: 46 }, (_, i) => [(i * 53 + 7) % W, (i * 37 + 3) % 60, i % 4]);
  const TUFTS = Array.from({ length: 26 }, (_, i) => 4 + i * 7.3 + (i % 3));
  const FLOWERS = [0xff8fbf, 0xffd95a, 0xa9dcff, 0xffffff, 0xff8fbf, 0xa983ea, 0xffd95a, 0xff8fbf, 0xffffff, 0xa9dcff];
  function ridge(fn, top, bot, edge) {
    ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 2) ctx.lineTo(x, fn(x)); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = lg(0, 50, 0, GROUND, [[0, G(top)], [1, G(bot)]]); ctx.fill();
    if (edge) { ctx.beginPath(); for (let x = 0; x <= W; x += 2) x ? ctx.lineTo(x, fn(x)) : ctx.moveTo(x, fn(x)); ctx.strokeStyle = css(G(edge)); ctx.lineWidth = 0.6; ctx.stroke(); }
  }
  function tree(x, s) {
    const base = hillMid(x) + 3, L = Gt(T.leaf);
    rrect(x - 0.9 * s, base - 9 * s, 1.8 * s, 9 * s, 0.6); fs(css(G(T.wood[2])), dk(G(T.wood[3]), .3));
    ball(x - 3 * s, base - 9 * s, 4.2 * s, L); ball(x + 3 * s, base - 10 * s, 4.6 * s, L); ball(x, base - 14 * s, 5.2 * s, L);
  }
  function house(ph, inside) {
    const ST = Gt(T.stem), CP = Gt(T.cap), WD = Gt(T.wood);
    ctx.beginPath(); ctx.moveTo(12, GROUND + 0.5); ctx.bezierCurveTo(10.4, 92, 12, 85, 14.5, 82); ctx.lineTo(29.5, 82); ctx.bezierCurveTo(32, 85, 33.6, 92, 32, GROUND + 0.5); ctx.closePath();
    fs(lg(11, 0, 33, 0, [[0, ST[0]], [0.45, ST[1]], [1, ST[3]]]), dk(ST[2], .45));
    ctx.beginPath(); ctx.moveTo(16.6, GROUND + 0.5); ctx.lineTo(16.6, 92.6); ctx.arc(20.1, 92.6, 3.5, Math.PI, 0); ctx.lineTo(23.6, GROUND + 0.5); ctx.closePath();
    fs(lg(16.6, 0, 23.6, 0, [[0, WD[0]], [0.5, WD[1]], [1, WD[2]]]), dk(WD[2]));
    seg([[20.1, 89.5], [20.1, GROUND]], dk(WD[1], .25), 0.3); ball(22.4, 95.5, 0.55, Gt(T.gold), false);
    const lit = inside ? 2 : ph === 'night' ? 1 : 0;
    ball(28, 87, 2.5, WD); ell(28, 87, 1.6, 1.6); fs(lit ? css(0xffe27a) : css(G(0xa9dcff)));
    seg([[26.4, 87], [29.6, 87]], dk(WD[1], .2), 0.35); seg([[28, 85.4], [28, 88.6]], dk(WD[1], .2), 0.35);
    ctx.beginPath(); ctx.moveTo(1.5, 83.5); ctx.bezierCurveTo(1, 64.5, 43, 64.5, 42.5, 83.5); ctx.quadraticCurveTo(22, 87, 1.5, 83.5);
    fs(rg(18, 72, 22, CP), dk(CP[2], .45));
    ell(22, 83.8, 18, 1.6); fs(css(ST[2]));
    [[12, 76, 2.4], [22, 71.5, 2.8], [32, 76.5, 2.2], [6.5, 80.5, 1.5], [37.5, 80.5, 1.5], [28, 70.5, 1.3], [15.5, 70.5, 1.1]].forEach(([x, y, r]) => ellS(x, y, r, r * 0.8, 0, ST, false));
  }
  function scene(s, t, forced, pose) {
    const ph = forced || World.phase(Core.hour(s)), PH = PHASES[ph];
    TINT = PH.tint; TK = PH.k;
    ctx.fillStyle = lg(0, 0, 0, 78, [[0, PH.top], [1, PH.bot]]); ctx.fillRect(0, 0, W, H);
    const skyAt = y => mix(PH.top, PH.bot, Math.min(1, y / 78));
    if (ph === 'night') {
      STARS.forEach(([x, y, k], i) => {
        const tw = (Math.sin(t * 0.003 + i * 1.7) + 1) / 2;
        if (k === 0 && tw > 0.6) sparkle(x, y, 1.4 * tw, 0xffffff, tw);
        else if (tw > 0.25) { ell(x, y, 0.35, 0.35); fs(css(0xfff6d6, tw)); }
      });
      glow(160, 18, 20, 0xfff1d6, .3);
      ball(160, 18, 7, T.moon, false); ell(163.6, 15.6, 6.4, 6.4); fs(css(skyAt(15.6)));
      const cyc = t % 11000;
      if (cyc < 700) { const p = cyc / 700, x = 20 + p * 80, y = 8 + p * 24; seg([[x, y], [x - 16, y - 5]], lg(x, y, x - 16, y - 5, [[0, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]), 0.6); }
    } else {
      const sx = ph === 'day' ? 160 : ph === 'dusk' ? 150 : 40, sy = ph === 'day' ? 18 : 54;
      glow(sx, sy, 30, 0xfff3b0, .45); ball(sx, sy, 7, T.sun, false);
      [[0, 24, 1], [80, 12, 0.8], [140, 34, 0.65]].forEach(([o, y, k], i) => {
        const x = ((o + t * 0.0025 * (0.6 + i * 0.2)) % (W + 70)) - 35;
        const tones = ph === 'dusk' ? T.cloud.map(c => mix(c, 0xff9a8a, .3)) : PH.k ? T.cloud.map(c => mix(c, PH.tint, PH.k)) : T.cloud;
        at(x, y, k, () => cloud(tones, 0.95));
      });
    }
    ridge(x => 58 + 9 * Math.sin(x * 0.028 + 0.5) + 4 * Math.sin(x * 0.07 + 2), 0xc4dcf2, 0x9db9da, 0xe2eefa);
    ridge(hillMid, 0xa6dca0, 0x7cbd80, 0xc6ecb8);
    [[46, 1], [62, 0.8], [118, 1.1], [139, 0.9], [160, 1.2], [184, 0.9]].forEach(([x, s_]) => tree(x, s_));
    ridge(x => 87 + 3 * Math.sin(x * 0.06 + 2) + 2 * Math.sin(x * 0.17), 0x86cc82, 0x68b56c, 0xb0e49a);
    ctx.fillStyle = lg(0, GROUND, 0, H, [[0, G(0x92d880)], [1, G(0x5ea95c)]]); ctx.fillRect(0, GROUND, W, H - GROUND);
    seg([[0, GROUND], [W, GROUND]], G(0xbaf0a0), 0.6);
    house(ph, pose && pose.hidden);
    if (ph === 'night' && !(pose && pose.hidden)) glow(28, 87, 10, 0xffe27a, .5);
    // grama e flores
    const g1 = css(G(0x4f9e5c)), g2 = css(G(0x8ed57c));
    TUFTS.forEach(x => {
      const sw = Math.sin(t * 0.002 + x * 0.25) * 1.3;
      [[-1, -5, g1], [1.5, -6.5, g2], [3, -4.5, g1]].forEach(([dx, h, c]) => { ctx.beginPath(); ctx.moveTo(x + dx * 0.4, GROUND + 3); ctx.quadraticCurveTo(x + dx * 0.5, GROUND + 1, x + dx + sw, GROUND + 3 + h); fs('transparent', c, 0.55); });
    });
    World.flowers.forEach((fxn, i) => {
      const x = fxn * W, sw = Math.sin(t * 0.0022 + i) * 1.2, fx_ = x + sw, fy = GROUND - 6, c = G(FLOWERS[i]);
      ctx.beginPath(); ctx.moveTo(x, GROUND + 2); ctx.quadraticCurveTo(x, GROUND - 2, fx_, fy + 1); fs('transparent', g1, 0.5);
      for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5 + i; ell(fx_ + Math.cos(a) * 1, fy + Math.sin(a) * 1, 0.85, 0.85); fs(css(c), dk(c, .35), 0.2); }
      ell(fx_, fy, 0.55, 0.55); fs(css(G(0xffd95a)));
    });
    if (ph === 'day' || ph === 'dawn') for (let i = 0; i < 2; i++) {
      const bf = World.butterfly(i, t), x = bf.x * W, y = bf.y * H, op = Math.abs(Math.cos(t * 0.022 + i)), c = i ? 0xff9a4a : 0x7fb6ff;
      [-1, 1].forEach(sd => { ell(x + sd * 1.3 * op, y - 0.6, 1.4 * op + 0.2, 1.2, sd * 0.3); fs(css(c), dk(c, .4), 0.2); ell(x + sd * 0.9 * op, y + 0.8, 0.9 * op + 0.15, 0.8); fs(css(mix(c, 0xffffff, .3)), dk(c, .4), 0.2); });
      ell(x, y, 0.35, 1.3); fs(css(DARK));
    }
    const gathered = pose && pose.focus && pose.focus.kind === 'fireflies';
    if (ph === 'night' || ph === 'dusk') for (let i = gathered ? 6 : 0; i < 9; i++) {
      const ff = World.firefly(i, t);
      if (ff.pulse > .2) { glow(ff.x * W, ff.y * H, 5, 0xfff27a, .6 * ff.pulse); ell(ff.x * W, ff.y * H, 0.45, 0.45); fs(css(0xfffbb0)); }
    }
    return ph;
  }

  // ---- broto ----
  function bud(t, ageMin, excite) {
    const near = ageMin > 0.35 || excite, shake = near ? Math.sin(t * 0.03) * 1.6 : Math.sin(t * 0.003) * 0.8, bx = 96 + shake, HR = T.hair;
    ell(96, GROUND + 1, 9, 1.6); fs('rgba(30,60,40,.25)');
    glow(bx, 63, 24 + Math.sin(t * 0.004) * 3, 0xfff3b0, near ? .5 : .25);
    ctx.beginPath(); ctx.moveTo(96, GROUND + 1); ctx.quadraticCurveTo(95, 85, bx, 73); fs('transparent', dk(T.leaf[2], .3), 1.8 + LW * 2);
    ctx.beginPath(); ctx.moveTo(96, GROUND + 1); ctx.quadraticCurveTo(95, 85, bx, 73); fs('transparent', T.leaf[2], 1.8);
    ellS(88, 89, 7, 2.6, -0.5, T.leaf); ellS(104, 86, 7, 2.6, 0.45, T.leaf);
    ellS(bx - 3, 63, 4.5, 10, 0.22, [HR[0], HR[2], HR[3], HR[3]]); ellS(bx + 3, 63, 4.5, 10, -0.22, HR); ellS(bx, 61, 5, 11, 0, HR);
    ellS(bx, 72, 5.5, 2.6, 0, T.leaf);
  }

  // ---- partículas ----
  const dust = [];
  let lastT = 0;
  function stepDust(t, f, active) {
    const dt = Math.min(100, Math.max(0, t - lastT)); lastT = t;
    if (active && f && Math.random() < dt / 55) {
      const fromWing = Math.random() < .5;
      dust.push({ x: f.hx + (fromWing ? (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 8) : Math.random() * 8 - 4), y: fromWing ? f.cy - 6 + Math.random() * 6 : f.F - 2, vy: 0.006 + Math.random() * 0.008, life: 1, c: [0xffd95a, 0xffffff, 0xffa8d2, 0xbfe8ff][Math.floor(Math.random() * 4)] });
    }
    for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.y += d.vy * dt; d.x += Math.sin((t + i * 300) * 0.004) * 0.05; d.life -= dt / 1800; if (d.life <= 0 || d.y > H) dust.splice(i, 1); }
    dust.forEach(d => { glow(d.x, d.y, 2.2, d.c, .4 * d.life); ell(d.x, d.y, 0.4, 0.4); fs(css(d.c, Math.min(1, d.life * 1.5))); });
  }
  function sparkleRing(cx, cy, r, t, n) {
    glow(cx, cy, r + 6, 0xfff3b0, .3);
    for (let i = 0; i < n; i++) { const a = t * 0.003 + i * (Math.PI * 2 / n); at(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, 1, () => star(2.8, T.gold, t * 0.005)); }
  }
  function panelBg(top, bot) {
    ctx.fillStyle = lg(0, 0, 0, H, [[0, top], [1, bot]]); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    for (let y = 6; y < H; y += 12) for (let x = (y / 12 % 2) * 6 + 4; x < W; x += 12) { ctx.beginPath(); ctx.arc(x, y, 0.6, 0, Math.PI * 2); ctx.fill(); }
  }
  function card(x, y, w, h, fill, border) { rrect(x, y, w, h, 6); fs(css(fill), border, 0.8); }
  function zz(x, y, a) { ctx.save(); ctx.globalAlpha = a; ctx.font = 'bold 7px "Silkscreen", "Courier New", monospace'; ctx.lineWidth = 1.4; ctx.strokeStyle = css(DARK, .6); ctx.strokeText('z', x, y); ctx.fillStyle = '#ffffff'; ctx.fillText('z', x, y); ctx.restore(); }

  function draw(s, ui, now, pose) {
    const t = now;
    applyLook(lookOf(s)); WEAR = wearOf(s);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const anim = ui.anim && now - ui.anim.t0 < ui.anim.dur ? ui.anim : null;
    const prog = anim ? (now - anim.t0) / anim.dur : 0;
    const blink = (t % 4300) < 130;

    if (s.gone) {
      scene(s, t, 'night');
      for (let i = 0; i < 14; i++) { const y = H - ((t * 0.012 + i * 17) % H), x = (i * 37 + 11) % W; glow(x, y, 3, 0xfff3b0, .4); sparkle(x, y, 1.2, i % 2 ? 0xffd95a : 0xffffff); }
      return;
    }
    if (ui.view === 'status') {
      TK = 0;
      panelBg(0xf7efff, 0xdcc9f3);
      const p = STATUS_PAGES[ui.page], val = pageValue(s, p);
      card(14, 22, 64, 64, 0xffffff, 0xb59ad6);
      at(46, 54, 3, ICONF[p.k]);
      const full = Math.round(val / 25);
      for (let i = 0; i < 4; i++) at(101 + i * 22, 43, 1.5, () => heart(i < full ? T.heart : T.heartE));
      rrect(90, 64, 92, 11, 5.5); fs(css(0xece6f4), 0xb59ad6, 0.6);
      const bc = val < 25 ? T.red : val < 50 ? T.gold : LOOKS.dress.folha.tones;
      if (val > 2) { rrect(92, 66, 88 * val / 100, 7, 3.5); fs(lg(0, 66, 0, 73, [[0, bc[0]], [0.5, bc[1]], [1, bc[2]]])); }
      for (let i = 0; i < STATUS_PAGES.length; i++) { const x = 78 + i * 6; if (i === ui.page) ball(x, 104, 1.8, T.potion); else { ell(x, 104, 0.8, 0.8); fs(css(0xb5a8c8)); } }
      return;
    }
    if (ui.view === 'food') {
      TK = 0;
      panelBg(0xfff6e6, 0xffd9c4);
      const sel = ui.foodIdx;
      card(22, 16, 64, 66, sel === 0 ? 0xffffff : 0xfff0e2, sel === 0 ? T.gold[2] : 0xf2d2bc);
      card(106, 16, 64, 66, sel === 1 ? 0xffffff : 0xfff0e2, sel === 1 ? T.gold[2] : 0xf2d2bc);
      if (sel === 0) glow(54, 46, 30, 0xfff3b0, .3); else glow(138, 49, 30, 0xfff3b0, .3);
      at(54, 52, 3, bowl); at(138, 49, 2.6, candy);
      const ax = sel === 0 ? 54 : 138, ay = 96 + Math.sin(t * 0.008) * 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay - 6); ctx.lineTo(ax - 6, ay + 2.4); ctx.lineTo(ax + 6, ay + 2.4); ctx.closePath(); ctx.lineJoin = 'round';
      fs(lg(0, ay - 6, 0, ay + 3, [[0, T.gold[0]], [1, T.gold[2]]]), dk(T.gold[2], .3), 1.2);
      return;
    }

    scene(s, t, null, pose);

    if (s.stage === 'bud') {
      bud(t, s.ageMin, anim && anim.type === 'hatch');
      if (anim && anim.type === 'hatch') sparkleRing(96, 63, 26, t, 6);
      if (s.lightsOff) darkness(96, 63, 26);
      return;
    }
    TK = 0;

    // sujeira
    for (let i = 0; i < s.poops; i++) {
      const x = 178 - i * 16;
      at(x, GROUND + 1, 1.1, poop);
      ctx.save(); ctx.globalAlpha = 0.6;
      for (let k = 0; k < 2; k++) { ctx.beginPath(); const ox = x - 2 + k * 4, ph = Math.sin(t * 0.006 + k + i); ctx.moveTo(ox, GROUND - 13); ctx.bezierCurveTo(ox + 1.5 + ph, GROUND - 15, ox - 1.5 - ph, GROUND - 17, ox, GROUND - 19); fs('transparent', 0x8fc46a, 0.5); }
      ctx.restore();
      ell(x + Math.cos(t * 0.012 + i) * 6, GROUND - 16 + Math.sin(t * 0.017 + i) * 3, 0.5, 0.5); fs(css(0x2a2a35));
    }

    if (pose.hidden && ui.view !== 'game') {
      if (s.lightsOff) darkness(28, 87, 0);
      else glow(28, 87, 20, 0xffe27a, .7);
      for (let i = 0; i < 3; i++) { const q = ((t * 0.0004) + i / 3) % 1; zz(32 + q * 14, 80 - q * 26, Math.min(1, (1 - q) * 3)); }
      return;
    }
    if (pose.door) {
      ctx.beginPath(); ctx.moveTo(16.8, GROUND + 0.3); ctx.lineTo(16.8, 92.6); ctx.arc(20.1, 92.6, 3.3, Math.PI, 0); ctx.lineTo(23.4, GROUND + 0.3); ctx.closePath(); fs(css(0x3a2030));
      glow(20, 95, 8, 0xffe27a, .55);
    }

    const baby = s.stage === 'baby';
    let face = faceFor(s, anim, ui.view === 'game' ? null : pose), hx;
    const sp = pose.sleepP || 0, awakeF = baby ? 93 : 92;
    const F = awakeF + (GROUND - 3 - awakeF) * sp - (ui.view === 'game' ? 0 : pose.lift || 0);
    const bob = Math.sin(t * 0.004) * 2 * (1 - sp);
    if (ui.view === 'game') {
      const g = ui.game;
      if (g.phase === 'ask') { hx = 96; face = 'neutral'; }
      else { hx = g.dir === 'L' ? 36 : 156; face = g.guess === g.dir ? 'happy' : 'sad'; }
    } else {
      hx = pose.x * W + (pose.shake || 0);
      if (anim && anim.type === 'refuse') hx += Math.floor(t / 90) % 2 ? 1 : -1;
    }
    const fy = F + bob;
    ell(hx, GROUND + 1, Math.max(4, 11 - (GROUND - fy) * 0.6), 1.7); fs('rgba(30,60,40,.28)');
    if (s.lightsOff) darkness(hx, (fy - 30 + fy) / 2, 34);
    glow(hx, fy - 18, 26, 0xfff6d0, .14);
    const f = fairy(s.stage, hx, fy, face, t, blink && !['happy', 'sleep', 'yawn'].includes(face), ui.view === 'game' ? { wing: pose.wing } : pose);
    stepDust(t, f, !s.asleep);
    if (WEAR.aura === 'brilho') for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, ph = (Math.sin(t * 0.005 + i * 2.3) + 1) / 2;
      if (ph < 0.45) continue;
      const x = f.hx + side * (7 + ((i * 7) % 12)), y = f.cy - 14 + ((i * 5) % 14);
      glow(x, y, 3, 0xfff3b0, .5 * ph); sparkle(x, y, 1.6 * ph, ph > 0.8 ? 0xffffff : 0xfff0a0);
    }
    if (pose.trail && ui.view === 'main') { glow(f.hx, f.cy, 26, 0xfff3b0, .25); for (let i = 0; i < 4; i++) { const a = t * 0.012 + i * Math.PI / 2; at(f.hx + Math.cos(a) * 20, f.cy + Math.sin(a) * 9, 1, () => star(2.4, T.gold, a)); } }

    if (pose.focus && ui.view === 'main') {
      const fc = pose.focus;
      if (fc.kind === 'flower') {
        const fxp = fc.x * W, fy0 = GROUND - 6;
        for (let i = 0; i < 6; i++) { const q = ((t * 0.0006) + i / 6) % 1; const x = fxp + (f.hx - fxp) * q + Math.sin(q * 9 + i) * 2, y = fy0 + (f.hy + 4 - fy0) * q; glow(x, y, 1.6, 0xffe27a, .6); ell(x, y, 0.4, 0.4); fs(css(0xfff6c2)); }
        if (pose.p > 0.5) at(f.hx + (fxp < f.hx ? 13 : -13), f.top + 8 - (pose.p - 0.5) * 22, 0.7, () => heart());
      } else if (fc.kind === 'fireflies') {
        for (let i = 0; i < 6; i++) {
          const a = t * 0.002 + i * Math.PI / 3, r = 21 + 5 * Math.sin(t * 0.003 + i), x = f.hx + Math.cos(a) * r, y = f.cy - 4 + Math.sin(a) * r * 0.55, pu = (Math.sin(t * 0.006 + i * 1.3) + 1) / 2;
          glow(x, y, 7, 0xfff27a, .55 + .35 * pu); ell(x, y, 0.6, 0.6); fs('#ffffff');
        }
      }
    }

    if (ui.view === 'game') {
      const g = ui.game;
      for (let i = 0; i < 5; i++) { const x = 80 + i * 8; if (i < g.results.length) at(x, 8, 1, () => star(3.4, g.results[i] ? T.gold : T.heartE)); else { ell(x, 8, 1, 1); fs('#ffffff', dk(0xffffff, .3), 0.3); } }
      if (g.phase === 'ask' && Math.floor(t / 300) % 2 === 0) [[6, 1], [186, -1]].forEach(([x, d]) => {
        ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x + d * 10, 48); ctx.lineTo(x + d * 10, 64); ctx.closePath(); ctx.lineJoin = 'round';
        fs(lg(0, 48, 0, 64, [[0, T.gold[0]], [1, T.gold[2]]]), dk(T.gold[2], .3), 1.2);
      });
      return;
    }

    if (s.sick && !s.asleep) {
      at(f.hx, f.top - 7, 0.6, () => cloud(T.gray));
      for (let i = 0; i < 5; i++) { const x = f.hx - 6 + i * 3, y = f.top - 3 + ((t / 120 + i * 2) % 5); seg([[x, y], [x - 0.4, y + 1.6]], 0x7fc4f0, 0.5); }
    }
    if (s.asleep && sp >= 1) for (let i = 0; i < 3; i++) { const q = ((t * 0.0005) + i / 3) % 1; zz(f.hx + 12 + q * 12, f.top + 6 - q * 20, Math.min(1, (1 - q) * 3)); }

    if (anim) {
      const ty = anim.type;
      if (ty === 'eat') {
        const bites = Math.min(4, Math.floor(prog * 5)), right = f.side > f.hx, cyI = f.F - (anim.item === 'candy' ? 12 : 10);
        ctx.save(); ctx.beginPath();
        if (right) ctx.rect(f.side - 8 + bites * 4, 0, W, H); else ctx.rect(0, 0, f.side + 8 - bites * 4, H);
        ctx.clip(); at(f.side, cyI, 1, anim.item === 'candy' ? candy : bowl); ctx.restore();
      } else if (ty === 'pet') {
        [-15, 0, 15].forEach((o, i) => { const rise = ((prog * 30) + i * 9) % 30; at(f.hx + o, f.top + 12 - rise, 0.9, () => heart()); });
      } else if (ty === 'bath') {
        glow(f.hx, f.cy, 28, 0xdff5ff, .4);
        for (let i = 0; i < 22; i++) {
          const bx = (i * 37 + 9) % (W - 8) + 4, by = H + 6 - ((prog * 150 + i * 13) % 130), r = 1 + (i % 3) * 0.8;
          ell(bx, by, r, r); fs('rgba(200,236,255,.25)', 'rgba(170,220,255,.9)', 0.35);
          ell(bx - r * 0.35, by - r * 0.35, r * 0.25, r * 0.25); fs('#ffffff');
        }
      } else if (ty === 'toilet') {
        at(f.side, f.F - 6, 1, potty);
        if (prog > .5) for (let i = 0; i < 3; i++) { ell(f.side - 2 + i * 2, f.F - 5 + (t / 120 + i) % 2, 0.4, 0.6); fs(css(T.water[2])); }
      } else if (ty === 'med') {
        at(f.side, f.F - 10, 1, potion); sparkleRing(f.hx, f.cy, 20, t, 4);
      } else if (['hatch', 'grow', 'win', 'gift'].includes(ty)) sparkleRing(f.hx, f.cy, 24, t, 6);
    }
  }
  // escuridão com um "buraco" de luz em volta de um ponto (luz apagada)
  function darkness(x, y, r) {
    if (!r) { ctx.fillStyle = 'rgba(8,6,32,.62)'; ctx.fillRect(0, 0, W, H); return; }
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(8,6,32,.05)'); g.addColorStop(1, 'rgba(8,6,32,.62)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    glow(x, y, r * 0.8, 0xfff1b0, .18);
  }

  return {
    init(canvas, scale) { S = scale || renderScale(canvas); canvas.width = W * S; canvas.height = H * S; ctx = canvas.getContext('2d'); },
    draw,
    // peças reaproveitadas por outros renderers (desenham no mesmo canvas)
    kit: { at, heart, star, bowl, candy, potion, potty, poop, cloud, sparkle, glow, sparkleRing, zz, T },
    look: l => { applyLook(l); },
  };
})();

