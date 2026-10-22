/* ---------- 3d. ILLUSTRATED RENDERER (ilustração: luz, profundidade, rosto realista) ----------
   Mesmo mundo de 192×120 unidades e mesmo contrato:
     init(canvas) + draw(state, ui, now, pose)
   Camadas por quadro:
     1. fundo em baixa resolução (céu, montanhas, árvores) ampliado = desfoque de profundidade
     2. meio (colinas, chão, casinha) nítido, guardado por fase do dia
     3. fada desenhada numa camada própria e iluminada pela luz da cena
     4. brilhos somados (sol, varinha, vaga-lumes, janela), cor da hora e vinheta
   Telas de Status/Comida e itens de efeito vêm do SmoothRenderer (mesmo canvas). */
const IllustratedRenderer = (() => {
  const W = 192, H = 120, GROUND = 100, BGS = 2;
  let S = 6, ctx, fx, fcv, bg, bgx, K, scen, scx, scenAt = 0, scenKey = '', fairyOverride = null;
  const midCache = {};
  const DARK = 0x1e1228;

  // ---- cores ----
  function mix(a, b, t) {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }
  const css = (n, a = 1) => a >= 1 ? '#' + (n >>> 0).toString(16).padStart(6, '0') : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  const dk = (n, k = .5) => mix(n, DARK, k);

  // ---- luz por fase do dia ----
  const PH = {
    day: { sky: [0x4f9fe8, 0x92cbf5, 0xe6f5ff], light: 0xfff2d6, la: .16, shade: 0x3d4f8f, sa: .2, sun: [160, 16], grade: [0xfff4e0, .08], far: 0xa9c6e6, haze: 0xdcebfa, tint: 0, k: 0 },
    dawn: { sky: [0x5f78c9, 0xc99ac6, 0xffd5ad], light: 0xffc896, la: .24, shade: 0x5a4a8a, sa: .22, sun: [38, 56], grade: [0xffc8a0, .12], far: 0xb6a9d6, haze: 0xf6d2c4, tint: 0x6a5aa0, k: .12 },
    dusk: { sky: [0x2d2470, 0xa75a96, 0xffa36a], light: 0xff9a58, la: .3, shade: 0x3a2a6a, sa: .28, sun: [150, 58], grade: [0xff8a5a, .14], far: 0x8a6aa6, haze: 0xe89a8c, tint: 0x5a3a7a, k: .28 },
    night: { sky: [0x060920, 0x121546, 0x2a2464], light: 0xa8bcff, la: .2, shade: 0x0a0a30, sa: .42, sun: [160, 18], grade: [0x2a3a8a, .18], far: 0x232452, haze: 0x2c2a62, tint: 0x141a45, k: .58 },
  };
  let P = PH.day, G = n => n;

  // ---- primitivas (recebem o contexto g) ----
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rot, 0, Math.PI * 2); }
  function rg(g, x, y, r, tones, ox = -0.35, oy = -0.42) {
    const gr = g.createRadialGradient(x + r * ox, y + r * oy, r * 0.05, x, y, r * 1.05);
    gr.addColorStop(0, css(tones[0])); gr.addColorStop(0.45, css(tones[1])); gr.addColorStop(0.85, css(tones[2])); gr.addColorStop(1, css(tones[3]));
    return gr;
  }
  function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c, a]) => gr.addColorStop(o, typeof c === 'number' ? css(c, a ?? 1) : c)); return gr; }
  function stroke(g, color, w, a = 1) { g.strokeStyle = typeof color === 'number' ? css(color, a) : color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
  function fill(g, f) { g.fillStyle = typeof f === 'number' ? css(f) : f; g.fill(); }
  function glowAdd(g, x, y, r, c, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(c, a)); gr.addColorStop(0.4, css(c, a * 0.35)); gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  function limb(g, pts, tones, w0, w1, light) {
    // membro afinando: sombra, base e brilho do lado da luz
    const n = pts.length;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n; i++) {
        const t0 = (i - 1) / (n - 1), t1 = i / (n - 1), w = w0 + (w1 - w0) * (t0 + t1) / 2;
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        g.beginPath();
        if (pass === 2) { const ox = light * w * 0.22; g.moveTo(x0 + ox, y0); g.lineTo(x1 + ox, y1); stroke(g, tones[0], w * 0.32, .55); }
        else { g.moveTo(x0, y0); g.lineTo(x1, y1); stroke(g, pass ? tones[1] : dk(tones[2], .25), pass ? w : w + 0.45); }
      }
    }
  }

  // ---- fundo (baixa resolução = desfocado) ----
  const STARS = Array.from({ length: 70 }, (_, i) => [(i * 53 + 7) % W, (i * 37 + 3) % 62, i % 5]);
  const hillFar = x => 56 + 9 * Math.sin(x * 0.028 + 0.5) + 4 * Math.sin(x * 0.07 + 2) + 1.5 * Math.sin(x * 0.21);
  const hillMid = x => 73 + 5 * Math.sin(x * 0.045 + 1) + 3 * Math.sin(x * 0.11);
  const hillNear = x => 87 + 3 * Math.sin(x * 0.06 + 2) + 2 * Math.sin(x * 0.17);
  function ridge(g, fn, top, bot, y0 = 45) {
    g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 1.5) g.lineTo(x, fn(x)); g.lineTo(W, H); g.closePath();
    fill(g, lg(g, 0, y0, 0, GROUND, [[0, top], [1, bot]]));
  }
  function treeBlob(g, x, s, tones) {
    const base = hillMid(x) + 3;
    g.beginPath(); g.moveTo(x - 0.7 * s, base); g.lineTo(x - 0.5 * s, base - 9 * s); g.lineTo(x + 0.5 * s, base - 9 * s); g.lineTo(x + 0.7 * s, base); fill(g, dk(tones[3], .3));
    [[-3, -9, 4.4], [3.2, -10, 4.8], [0, -14.5, 5.4], [-1.5, -11.5, 4], [2, -13, 3.6]].forEach(([dx, dy, r]) => { ell(g, x + dx * s, base + dy * s, r * s, r * s * 0.92); fill(g, rg(g, x + dx * s, base + dy * s, r * s, tones)); });
  }
  function background(s, t, ph) {
    const g = bgx;
    g.setTransform(BGS, 0, 0, BGS, 0, 0);
    g.fillStyle = lg(g, 0, 0, 0, 80, [[0, P.sky[0]], [0.55, P.sky[1]], [1, P.sky[2]]]); g.fillRect(0, 0, W, H);
    if (ph === 'night') {
      glowAdd(g, 160, 18, 26, 0xc8d4ff, .35);
      ell(g, 160, 18, 7, 7); fill(g, rg(g, 160, 18, 7, [0xffffff, 0xf4efe2, 0xd8d0bc, 0xb8ae98]));
      ell(g, 163.4, 15.8, 6.5, 6.5); fill(g, css(mix(P.sky[0], P.sky[1], .25)));
    } else {
      const [sx, sy] = P.sun;
      glowAdd(g, sx, sy, 40, 0xfff0c0, .55); ell(g, sx, sy, 6.5, 6.5); fill(g, rg(g, sx, sy, 6.5, [0xffffff, 0xfffbe6, 0xffe9a6, 0xffd77a], 0, 0));
      [[0, 22, 1.1], [80, 12, 0.85], [140, 32, 0.7], [40, 40, 0.55]].forEach(([o, y, k], i) => {
        const x = ((o + t * 0.0022 * (0.6 + i * 0.2)) % (W + 80)) - 40;
        const top = ph === 'day' ? 0xffffff : mix(0xffffff, P.grade[0], .45), bot = mix(top, P.shade, .25);
        [[-8, 1.5, 5], [8, 1.5, 5.4], [0, -2, 7], [-3.5, 2.5, 4.5], [4, 2.5, 4.5], [-13, 3, 3], [13, 3, 3.2]].forEach(([dx, dy, r]) => { ell(g, x + dx * k, y + dy * k, r * k, r * k * 0.85); fill(g, lg(g, 0, y - 8 * k, 0, y + 5 * k, [[0, top, .95], [1, bot, .9]])); });
      });
    }
    ridge(g, hillFar, mix(P.far, P.haze, .25), mix(P.far, P.haze, .65));
    ridge(g, hillMid, G(0x8fcf8e), G(0x6db478), 60);
    const L = [0xb8ee9c, 0x74c47a, 0x4f9e5c, 0x356f43].map(c => mix(G(c), P.haze, .12));
    [[44, 1], [62, 0.8], [118, 1.1], [139, 0.9], [160, 1.2], [184, 0.9], [100, 0.7]].forEach(([x, s_]) => treeBlob(g, x, s_, L));
    // névoa de distância
    g.fillStyle = lg(g, 0, 50, 0, 92, [[0, P.haze, 0], [1, P.haze, ph === 'night' ? .12 : .28]]); g.fillRect(0, 50, W, 45);
  }

  // ---- meio nítido (colinas próximas, chão, casinha) ----
  function midground(ph) {
    const mk = ph + S;
    if (midCache[mk]) return midCache[mk];
    const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
    const g = c.getContext('2d'); g.setTransform(S, 0, 0, S, 0, 0);
    ridge(g, hillNear, G(0x86cc82), G(0x5fac64), 80);
    g.beginPath(); for (let x = 0; x <= W; x += 1.5) x ? g.lineTo(x, hillNear(x)) : g.moveTo(x, hillNear(x)); stroke(g, G(0xbdeca4), 0.5, .8);
    g.fillStyle = lg(g, 0, GROUND, 0, H, [[0, G(0x8fd47c)], [0.35, G(0x72bf66)], [1, G(0x4d924f)]]); g.fillRect(0, GROUND, W, H - GROUND);
    for (let i = 0; i < 260; i++) { const x = (i * 73.3) % W, y = GROUND + 1 + ((i * 37) % 19); ell(g, x, y, 0.5 + (i % 3) * 0.3, 0.25); fill(g, css(G(i % 2 ? 0x5ea65a : 0xa2dc8c), .55)); }
    g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); stroke(g, G(0xc4f0a8), 0.5, .9);
    house(g, ph);
    return (midCache[mk] = c);
  }
  function house(g, ph) {
    const ST = [0xfffcf4, 0xf4e6cc, 0xd9c2a0, 0xa8916e].map(G), CP = [0xff9c90, 0xe2454f, 0xb02e40, 0x7a1e30].map(G), WD = [0xc58c5a, 0x96603c, 0x6e4428, 0x4a2c18].map(G);
    ell(g, 22, GROUND + 1.2, 16, 2.2); fill(g, css(0x1a3a22, .3));
    g.beginPath(); g.moveTo(11.6, GROUND + 0.5); g.bezierCurveTo(10, 92, 12, 85, 14.5, 81.5); g.lineTo(29.5, 81.5); g.bezierCurveTo(32, 85, 34, 92, 32.4, GROUND + 0.5); g.closePath();
    fill(g, lg(g, 11, 0, 33, 0, [[0, ST[0]], [0.4, ST[1]], [0.85, ST[2]], [1, ST[3]]]));
    for (let i = 0; i < 9; i++) { g.beginPath(); const y = 84 + i * 1.8; g.moveTo(13 + (i % 2), y); g.quadraticCurveTo(22, y + 0.5, 31 - (i % 2), y); stroke(g, ST[2], 0.18, .5); }
    // porta
    g.beginPath(); g.moveTo(16.6, GROUND + 0.5); g.lineTo(16.6, 92.6); g.arc(20.1, 92.6, 3.5, Math.PI, 0); g.lineTo(23.6, GROUND + 0.5); g.closePath();
    fill(g, lg(g, 16.6, 0, 23.6, 0, [[0, WD[0]], [0.5, WD[1]], [1, WD[2]]]));
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(17.4 + i * 1.75, 90.2 + (i === 0 || i === 3 ? 1.2 : 0)); g.lineTo(17.4 + i * 1.75, GROUND); stroke(g, WD[3], 0.18, .6); }
    g.beginPath(); g.moveTo(16.6, GROUND + 0.5); g.lineTo(16.6, 92.6); g.arc(20.1, 92.6, 3.5, Math.PI, 0); g.lineTo(23.6, GROUND + 0.5); stroke(g, WD[3], 0.4);
    ell(g, 22.5, 95.6, 0.5, 0.5); fill(g, 0xffd95a);
    // janela (vidro desenhado a cada quadro)
    ell(g, 28, 87, 2.6, 2.6); fill(g, rg(g, 28, 87, 2.6, WD)); ell(g, 28, 87, 1.7, 1.7); fill(g, css(0x1c2238));
    // chapéu
    g.beginPath(); g.moveTo(1.2, 83.4); g.bezierCurveTo(0.4, 63.5, 43.6, 63.5, 42.8, 83.4); g.quadraticCurveTo(22, 87.2, 1.2, 83.4);
    fill(g, rg(g, 17, 70, 24, CP, -0.2, -0.3));
    g.save(); g.beginPath(); g.moveTo(1.2, 83.4); g.bezierCurveTo(0.4, 63.5, 43.6, 63.5, 42.8, 83.4); g.quadraticCurveTo(22, 87.2, 1.2, 83.4); g.clip();
    g.fillStyle = lg(g, 0, 70, 0, 86, [[0, CP[3], 0], [1, CP[3], .45]]); g.fillRect(0, 60, 46, 30); g.restore();
    ell(g, 22, 83.8, 18.2, 1.7); fill(g, ST[2]);
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(22 + i * 2, 84.5); g.lineTo(22 + i * 1.6, 83.1); stroke(g, ST[3], 0.2, .6); }
    [[12, 76, 2.5], [22, 71.2, 2.9], [32, 76.6, 2.3], [6.4, 80.6, 1.5], [37.6, 80.6, 1.5], [28, 70.4, 1.3], [15.6, 70.4, 1.1], [18, 79.5, 1.2]].forEach(([x, y, r]) => { ell(g, x, y, r, r * 0.8); fill(g, rg(g, x, y, r, ST)); });
    // musgo
    for (let i = 0; i < 14; i++) { ell(g, 11.5 + (i % 7) * 3.3, GROUND - 0.2 - (i > 6 ? 0.8 : 0), 1.4, 0.7); fill(g, css(G(i % 2 ? 0x6fb46a : 0x8fcf7e), .9)); }
  }

  // ---- grama e flores animadas ----
  const BLADES = Array.from({ length: 90 }, (_, i) => [(i * 2.17 + (i % 5) * 0.3) % W, 3 + (i * 7 % 5), i]);
  const FRONT = Array.from({ length: 46 }, (_, i) => [(i * 4.31) % W, 6 + (i * 11 % 7), i]);
  const FLOWERS = [0xff8fbf, 0xffd95a, 0xa9dcff, 0xffffff, 0xff8fbf, 0xa983ea, 0xffd95a, 0xff8fbf, 0xffffff, 0xa9dcff];
  function grass(g, t, list, base, cA, cB) {
    cA = css(cA); cB = css(cB);
    list.forEach(([x, h, i]) => {
      const sw = Math.sin(t * 0.0018 + x * 0.21) * (1 + h * 0.12);
      g.beginPath(); g.moveTo(x - 0.35, base); g.quadraticCurveTo(x - 0.2, base - h * 0.5, x + sw, base - h); g.quadraticCurveTo(x + 0.1, base - h * 0.45, x + 0.35, base);
      g.fillStyle = i % 3 ? cA : cB; g.fill();
    });
  }
  function flowers(g, t) {
    World.flowers.forEach((fxn, i) => {
      const x = fxn * W, sw = Math.sin(t * 0.0022 + i) * 1.2, fx_ = x + sw, fy = GROUND - 6.5, c = G(FLOWERS[i]);
      g.beginPath(); g.moveTo(x, GROUND + 2); g.quadraticCurveTo(x - 0.4, GROUND - 2, fx_, fy + 1); stroke(g, G(0x4a8f4c), 0.45);
      ell(g, x + 0.9 + sw * 0.3, GROUND - 2.5, 1.3, 0.45, -0.5); fill(g, G(0x5fae5a));
      const cs = css(c), csh = css(mix(c, 0x6a4a80, .3));
      for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5 + i; ell(g, fx_ + Math.cos(a) * 1.05, fy + Math.sin(a) * 0.95, 0.95, 0.7, a); g.fillStyle = Math.sin(a) > 0.3 ? csh : cs; g.fill(); }
      ell(g, fx_ - 0.3, fy - 0.4, 0.5, 0.35); fill(g, css(0xffffff, .55));
      ell(g, fx_, fy, 0.55, 0.55); fill(g, G(0xffd95a));
    });
  }
  function butterflies(g, t) {
    for (let i = 0; i < 2; i++) {
      const bf = World.butterfly(i, t), x = bf.x * W, y = bf.y * H, op = Math.abs(Math.cos(t * 0.022 + i)), c = i ? 0xff9a3a : 0x6aa8ff, c2 = i ? 0x4a2a10 : 0x1a2a5a;
      [-1, 1].forEach(sd => {
        g.save(); g.translate(x, y); g.scale(sd * (0.25 + op * 0.75), 1);
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(1.2, -2.6, 3.4, -2.4, 3, -0.6); g.bezierCurveTo(2.8, 0.4, 1.4, 0.2, 0, 0); fill(g, lg(g, 0, 0, 3, 0, [[0, c2], [0.35, c], [1, mix(c, 0xffffff, .3)]]));
        g.beginPath(); g.moveTo(0, 0.2); g.bezierCurveTo(1.6, 0.4, 2.4, 2, 1.2, 2.3); g.bezierCurveTo(0.6, 2.2, 0.2, 1, 0, 0.2); fill(g, lg(g, 0, 0, 2, 2, [[0, c2], [0.5, c]]));
        ell(g, 2.3, -1.3, 0.35, 0.35); fill(g, 0xffffff);
        g.restore();
      });
      ell(g, x, y + 0.4, 0.3, 1.3); fill(g, 0x2a1a20);
    }
  }

  // ---- broto ----
  function bud(g, t, ageMin, excite) {
    const near = ageMin > 0.35 || excite, shake = near ? Math.sin(t * 0.03) * 1.6 : Math.sin(t * 0.003) * 0.8, bx = 96 + shake, HR = T.hair;
    ell(g, 96, GROUND + 1, 9, 1.6); fill(g, css(0x1a3a22, .3));
    g.beginPath(); g.moveTo(96, GROUND + 1); g.quadraticCurveTo(95, 85, bx, 73); stroke(g, 0x3d7d48, 1.9); g.beginPath(); g.moveTo(96.4, GROUND); g.quadraticCurveTo(95.4, 85, bx + 0.3, 74); stroke(g, 0x7cc47a, 0.5, .7);
    [[88, 89, -0.5], [104, 86, 0.45]].forEach(([x, y, r]) => { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, -3.6, 8, 0); g.quadraticCurveTo(0, 3, -8, 0); fill(g, lg(g, 0, -3, 0, 3, [[0, 0xa6e48f], [1, 0x3f8a4c]])); g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); stroke(g, 0xc6f0b0, 0.3, .7); g.restore(); });
    [[-3.2, 0.22, [HR[0], HR[2], HR[3], HR[3]]], [3.2, -0.22, HR], [0, 0, HR]].forEach(([dx, r, tones]) => {
      g.save(); g.translate(bx + dx, 72); g.rotate(r);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(5.2, -3, 4, -16, 0, -22); g.bezierCurveTo(-4, -16, -5.2, -3, 0, 0);
      fill(g, lg(g, -5, 0, 5, 0, [[0, tones[0]], [0.45, tones[1]], [1, tones[3]]])); g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(0.6, -11, 0, -20); stroke(g, tones[0], 0.3, .6);
      g.restore();
    });
    [[-1, 1], [1, -1]].forEach(([sd]) => { g.beginPath(); g.moveTo(bx, 73); g.quadraticCurveTo(bx + sd * 5, 71, bx + sd * 4, 66); g.quadraticCurveTo(bx + sd * 2, 70, bx, 73); fill(g, lg(g, bx, 66, bx, 73, [[0, 0x8fd47c], [1, 0x3f8a4c]])); });
    ell(g, bx + 2, 60, 0.9, 1.2); fill(g, css(0xffffff, .7)); ell(g, bx + 1.7, 59.6, 0.3, 0.4); fill(g, 0xffffff);
    return near;
  }

  // ---- fada ----
  let T = { skin: LOOKS.skin.clara.tones, hair: LOOKS.hair.rosa.tones, dress: LOOKS.dress.folha.tones, dress2: LOOKS.dress.folha.back, shoe: LOOKS.dress.folha.shoe };
  let EYE = LOOKS.eyes.ametista, WING = LOOKS.wings.cristal, WEAR = {};
  const GOLD = [0xfff6c2, 0xffd95a, 0xf0a53c, 0xc07a28], RIB = [0xffc0c8, 0xf05868, 0xc03448, 0x8a2236], CAPE = [0xffdbe4, 0xf59ab2, 0xd26a88, 0x9a4462], WATER = [0xe6f8ff, 0x8ad8ff, 0x4aa8e0, 0x2f7fb8], PEARL = [0xffffff, 0xf4f1f8, 0xd8d2e4, 0xb4abc6];
  function applyLook(l) {
    T = { skin: LOOKS.skin[l.skin].tones, hair: LOOKS.hair[l.hair].tones, dress: LOOKS.dress[l.dress].tones, dress2: LOOKS.dress[l.dress].back, shoe: LOOKS.dress[l.dress].shoe };
    EYE = LOOKS.eyes[l.eyes]; WING = LOOKS.wings[l.wings];
  }

  function wing(g, sx, sy, side, theta, len, wid, k, t, alpha) {
    len *= k; wid *= k;
    g.save(); g.translate(sx, sy); g.scale(side, 1); g.rotate(-theta);
    const path = () => { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.2, -wid * 1.15, len * 0.86, -wid * 1.05, len, -wid * 0.1); g.bezierCurveTo(len * 1.03, wid * 0.55, len * 0.5, wid * 0.95, 0, 0); };
    const sh = (Math.sin(t * 0.002) + 1) / 2;
    path(); g.globalAlpha = alpha;
    fill(g, lg(g, 0, 0, len, 0, [[0, WING.root, .9], [0.4, mix(WING.a, WING.b, sh), .78], [1, mix(WING.b, WING.a, sh), .62]]));
    g.globalAlpha = Math.min(1, alpha + 0.2);
    stroke(g, dk(WING.rim, .15), 0.45, .95);
    // nervuras
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid * 0.35, len * 0.97, -wid * 0.12); stroke(g, WING.vein, 0.26, .75);
    for (let i = 1; i <= 4; i++) {
      const u = i / 5, mx = len * u, my = -wid * 0.35 * Math.sin(u * Math.PI) - wid * 0.05;
      g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo(mx + len * 0.08, my - wid * 0.4, mx + len * 0.12, -wid * (0.85 - u * 0.4)); stroke(g, WING.vein, 0.18, .55);
      g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo(mx + len * 0.06, my + wid * 0.3, mx + len * 0.05, wid * (0.75 - u * 0.35)); stroke(g, WING.vein, 0.16, .45);
    }
    // reflexo que corre pela asa
    const hp = 0.25 + 0.5 * ((Math.sin(t * 0.0015 + side) + 1) / 2);
    ell(g, len * hp, -wid * 0.35, len * 0.12, wid * 0.22, 0.2); fill(g, css(0xffffff, .5 * alpha));
    g.restore(); g.globalAlpha = 1;
  }
  function petal(g, x, y, len, wid, ang, tones, alpha = 1) {
    g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = alpha;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, len * 0.25, wid * 0.95, len * 0.78, 0, len); g.bezierCurveTo(-wid * 0.95, len * 0.78, -wid, len * 0.25, 0, 0);
    fill(g, lg(g, -wid, 0, wid, len, [[0, tones[0]], [0.45, tones[1]], [1, tones[3]]]));
    stroke(g, dk(tones[2], .3), 0.22, .7);
    g.beginPath(); g.moveTo(0, len * 0.08); g.quadraticCurveTo(wid * 0.15, len * 0.5, 0, len * 0.9); stroke(g, tones[0], 0.22, .55);
    g.restore(); g.globalAlpha = 1;
  }

  // par de asas batendo (também usado pelo visual Pintado)
  function wings(g, bx, wy, pose, t, ws = 1) {
    const fc = Math.max(-1, Math.min(1, pose.facing || 0)), folded = (pose.sleepP || 0) > 0.6;
    const flap = folded ? 0 : Math.sin(pose.wing ?? t * 0.014);
    const sL = 1 + (fc > 0 ? 0.12 : 0.3) * fc, sR = 1 - (fc < 0 ? 0.12 : 0.3) * fc;
    [[-1, sL], [1, sR]].forEach(([sd, k]) => {
      if (folded) { wing(g, bx, wy, sd, 0.95, 11, 3.2, k * ws, t, .7); wing(g, bx, wy, sd, 1.3, 15, 4, k * ws, t, .75); return; }
      const up = 0.55 + 0.45 * flap, lo = -0.55 + 0.2 * flap;
      wing(g, bx, wy + 1, sd, lo, 12, 4.6, k * ws, t, .78);
      if (Math.abs(Math.cos(pose.wing ?? 0)) > 0.6) wing(g, bx, wy, sd, up + 0.22 * Math.sign(Math.cos(pose.wing ?? 0)), 19, 7.5, k * ws, t, .18);
      wing(g, bx, wy, sd, up, 19, 7.5, k * ws, t, .8);
    });
  }

  function fairy(g, stage, cx, F, face, t, blink, pose, light) {
    const baby = stage === 'baby';
    const fc = Math.max(-1, Math.min(1, pose.facing || 0)), fo = fc * 2.2;
    const bx = cx, hx = bx + fc * 0.8;
    const folded = (pose.sleepP || 0) > 0.6, armL = pose.armL || 'down', armR = baby ? 'none' : (pose.armR || 'wand');
    const SK = T.skin, HR = T.hair, DR = T.dress, DR2 = T.dress2, SH = T.shoe;
    // proporções
    const G_ = baby
      ? { leg: 4, skirt: 7, torso: 4, neck: 0.8, hr: 8.6, hrx: 8.4, eye: 1.3, shW: 3.2, waW: 2.6 }
      : { leg: 13, skirt: 13, torso: 9, neck: 2.5, hr: 7.2, hrx: 6.2, eye: 1, shW: 4.4, waW: 2.5 };
    const skirtBot = F - G_.leg + (baby ? 1 : 4), waist = skirtBot - G_.skirt, sh = waist - G_.torso, neckTop = sh - G_.neck;
    const hy = neckTop - G_.hr * 0.95 + (pose.nod || 0);
    const R = G_.hr;

    // asas (atrás de tudo)
    wings(g, bx, sh + (baby ? 1 : 2.5), pose, t, baby ? 0.7 : 1);

    // capa
    if (WEAR.back === 'capa') for (let k = -2; k <= 2; k++) petal(g, bx + k * 2.2 - fo * 0.4, sh - 0.5, F - sh - 2, 3.6, -k * 0.2, CAPE, .92);

    // cabelo de trás
    const sw = Math.sin(t * 0.0021) * 1.2, hb = hx - fo * 0.7;
    if (!baby) {
      const bot = hy + 19;
      g.beginPath(); g.moveTo(hb - R + 0.5, hy - 2);
      g.bezierCurveTo(hb - R - 3, hy + 6, hb - R - 1.5 + sw * 0.5, bot - 5, hb - 6.5 + sw, bot);
      for (let i = 0; i < 6; i++) { const x0 = hb - 6.5 + sw + i * 2.17, x1 = x0 + 2.17; g.quadraticCurveTo((x0 + x1) / 2, bot + 1.6 + (i % 2) * 0.8, x1, bot - (i % 2 ? 0 : 0.6)); }
      g.bezierCurveTo(hb + R + 1.5 + sw * 0.5, bot - 5, hb + R + 3, hy + 6, hb + R - 0.5, hy - 2);
      g.closePath(); fill(g, lg(g, 0, hy - 4, 0, bot + 2, [[0, HR[1]], [0.6, HR[2]], [1, HR[3]]]));
      for (let i = -5; i <= 5; i++) {
        g.beginPath(); g.moveTo(hb + i * 1.1, hy + 1);
        g.bezierCurveTo(hb + i * 1.45, hy + 7, hb + i * 1.4 + sw * 0.7, hy + 13, hb + i * 1.25 + sw, bot - 0.5 + (i % 2) * 0.8);
        stroke(g, i % 2 ? HR[3] : HR[0], i % 2 ? 0.3 : 0.22, i % 2 ? .45 : .35);
      }
      // coque
      const bnx = hx + 0.8 - fo * 0.4, bny = hy - R - 1;
      ell(g, bnx, bny, 3, 2.5); fill(g, rg(g, bnx, bny, 3, HR));
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(bnx, bny, 2.4 - i * 0.7, 1.9 - i * 0.55, 0.3, Math.PI * 0.9, Math.PI * 2.1); stroke(g, i % 2 ? HR[3] : HR[0], 0.22, .55); }
    } else {
      ell(g, hb, hy + 0.5, R + 1.2, R + 0.9); fill(g, rg(g, hb, hy + 0.5, R + 1.2, HR));
      [-1, 1].forEach(sd => { g.beginPath(); g.moveTo(hb + sd * (R - 1), hy - 1); g.quadraticCurveTo(hb + sd * (R + 2.6), hy + 4, hb + sd * (R + 0.6) + sw * 0.3, hy + R - 0.5); g.quadraticCurveTo(hb + sd * (R - 0.6), hy + 4, hb + sd * (R - 2.5), hy + 1); g.closePath(); fill(g, lg(g, 0, hy - 1, 0, hy + R, [[0, HR[1]], [1, HR[2]]])); });
    }

    // pernas
    const kick = pose.kick ? Math.sin(t * 0.01) * 1.6 : 0;
    [[-1, kick], [1, -kick]].forEach(([sd, kk]) => {
      const x0 = bx + sd * (baby ? 1.3 : 1.2), x1 = x0 + kk + sd * 0.2;
      limb(g, [[x0, skirtBot - 3], [x0 + kk * 0.4, (skirtBot + F) / 2], [x1, F - 1.2]], SK, baby ? 1.7 : 1.5, baby ? 1.3 : 0.95, light);
      ell(g, x1 + sd * 0.4, F - 0.6, baby ? 1.6 : 1.5, 0.95, sd * 0.15); fill(g, rg(g, x1 + sd * 0.4, F - 0.6, 1.6, SH));
      if (!baby) { g.beginPath(); g.moveTo(x1 - 0.8, F - 1.6); g.lineTo(x1 + 0.8, F - 3.2); g.moveTo(x1 + 0.8, F - 1.6); g.lineTo(x1 - 0.8, F - 3.2); stroke(g, SH[1], 0.25, .9); }
    });

    // saia de pétalas
    const pl = G_.skirt + 1.5, pw = baby ? 2.4 : 2.6;
    (baby ? [-1.6, -0.5, 0.5, 1.6] : [-2.6, -1.6, -0.55, 0.55, 1.6, 2.6]).forEach(k => petal(g, bx + k * (baby ? 1.2 : 1.05), waist - 0.3, pl, pw, -k * 0.2, DR2, .95));
    (baby ? [-1, 0, 1] : [-2, -1, 0, 1, 2]).forEach(k => petal(g, bx + k * 1.1, waist - 0.2, pl - 2.2, pw * 0.95, -k * 0.19, DR, .93));

    // tronco
    if (!baby) {
      g.beginPath(); g.moveTo(bx - 1.4, neckTop + 0.5); g.lineTo(bx + 1.4, neckTop + 0.5); g.lineTo(bx + 3.4, sh + 2.4); g.lineTo(bx - 3.4, sh + 2.4); g.closePath(); fill(g, lg(g, bx - 4, 0, bx + 4, 0, [[0, SK[light < 0 ? 0 : 2]], [0.5, SK[1]], [1, SK[light < 0 ? 2 : 0]]]));
      g.beginPath(); g.moveTo(bx - G_.shW, sh + 1); g.quadraticCurveTo(bx - 2, sh + 3.4, bx, sh + 2.2); g.quadraticCurveTo(bx + 2, sh + 3.4, bx + G_.shW, sh + 1);
      g.lineTo(bx + G_.waW + 0.3, waist); g.quadraticCurveTo(bx, waist + 0.9, bx - G_.waW - 0.3, waist); g.closePath();
      fill(g, lg(g, bx - 4.5, 0, bx + 4.5, 0, [[0, DR[light < 0 ? 0 : 2]], [0.5, DR[1]], [1, DR[light < 0 ? 2 : 0]]]));
      stroke(g, dk(DR[2], .3), 0.22, .7);
      [[-1.2, 0.5], [1.4, -0.4]].forEach(([dx, c]) => { g.beginPath(); g.moveTo(bx + dx, sh + 3.4); g.quadraticCurveTo(bx + dx + c, (sh + waist) / 2 + 1, bx + dx * 0.6, waist - 0.3); stroke(g, DR[2], 0.2, .55); });
      [-1, 1].forEach(sd => petal(g, bx + sd * 3.6, sh + 0.6, 3.4, 1.6, -sd * 1.15, [0xffffff, DR[0], DR[1], DR[2]], .95));
    } else {
      ell(g, bx, waist - 1.5, 3.2, 2.6); fill(g, rg(g, bx, waist - 1.5, 3.2, DR));
    }
    g.beginPath(); g.moveTo(bx - (baby ? 2.8 : G_.waW + 0.2), waist - 0.1); g.quadraticCurveTo(bx, waist + 0.8, bx + (baby ? 2.8 : G_.waW + 0.2), waist - 0.1); stroke(g, GOLD[2], 0.9); g.beginPath(); g.moveTo(bx - (baby ? 2.8 : G_.waW + 0.2), waist - 0.3); g.quadraticCurveTo(bx, waist + 0.6, bx + (baby ? 2.8 : G_.waW + 0.2), waist - 0.3); stroke(g, GOLD[1], 0.45);
    for (let p = 0; p < 5; p++) { const a = p * Math.PI * 2 / 5; ell(g, bx + Math.cos(a) * 0.65, waist + 0.25 + Math.sin(a) * 0.6, 0.55, 0.55); fill(g, 0xfff6f0); }
    ell(g, bx, waist + 0.25, 0.35, 0.35); fill(g, GOLD[1]);

    // braços
    const shY = baby ? waist - 3 : sh + 1.6, shL = bx - (baby ? 2.8 : G_.shW - 0.6), shR = bx + (baby ? 2.8 : G_.shW - 0.6);
    const aw = baby ? [1.6, 1.25] : [1.35, 0.95];
    const front = [], later = (raised, fn) => raised ? front.push(fn) : fn();
    const arm = pts => { limb(g, pts, SK, aw[0], aw[1], light); const [x, y] = pts[pts.length - 1]; ell(g, x, y, baby ? 1.05 : 0.95, baby ? 1.05 : 1.15); fill(g, rg(g, x, y, 1.1, SK)); };
    let starPos = null;
    const wand = (x0, y0, x1, y1) => {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); stroke(g, 0x8a8aa8, 0.85); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); stroke(g, 0xf2f2ff, 0.45);
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
      for (let i = 1; i < 6; i++) { const u = i / 6, px = x0 + dx * u, py = y0 + dy * u; ell(g, px, py, 0.45, 0.25, Math.atan2(dy, dx) + 0.8); fill(g, css(0xff9cc8, .85)); }
      starPos = [x1 + dx / l * 2.8, y1 + dy / l * 2.8];
      g.save(); g.translate(starPos[0], starPos[1]); g.rotate(Math.sin(t * 0.004) * 0.3);
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 1.45 : 3.3; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.lineJoin = 'round'; fill(g, rg(g, 0, 0, 3.3, [0xffffff, 0xfff4b0, 0xffd95a, 0xe6a83a], -0.2, -0.3)); stroke(g, 0xc0882a, 0.25, .8);
      g.restore();
    };
    if (armR === 'wand') later(false, () => { wand(bx + 7.2, sh + 10.5, bx + 11, sh - 1.5); arm([[shR, shY], [bx + 6.4, sh + 5.5], [bx + 7.6, sh + 8.6]]); });
    else if (armR === 'up') later(true, () => { wand(bx + 9.5, hy - 5, bx + 11.5, hy - 13); arm([[shR, shY], [bx + 8, hy + 3], [bx + 9.5, hy - 4.5]]); });
    else if (baby) { if (armL === 'up') later(true, () => arm([[shR, shY], [bx + 6, shY - 4], [bx + 7.5, shY - 8]])); else arm([[shR, shY], [bx + 4.6, shY + 3.6]]); }
    const wv = Math.sin(t * 0.018) * 2.2;
    if (baby) {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 6.4, shY - 2.5], [bx - 7.5 + wv, shY - 7.5]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 6, shY - 4], [bx - 7.5, shY - 8]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 1, shY + 2.4]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 4.6, shY + 3.6]]);
    } else {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 8.2, sh + 1], [bx - 9.5 + wv, sh - 5.5]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 7.5, hy + 3], [bx - 9.5, hy - 4.5]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 5.6, sh + 6], [bx - 1.6, sh + 6.6]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 5.8, sh + 5.6], [bx - 6.4, sh + 9.6]]);
    }

    // pescoço e orelhas
    if (!baby) { g.beginPath(); g.moveTo(hx - 1.3, hy + R - 1.5); g.lineTo(hx + 1.3, hy + R - 1.5); g.lineTo(bx + 1.4, neckTop + 1); g.lineTo(bx - 1.4, neckTop + 1); g.closePath(); fill(g, lg(g, hx - 1.4, 0, hx + 1.4, 0, [[0, SK[light < 0 ? 1 : 2]], [1, SK[light < 0 ? 2 : 1]]])); ell(g, hx, hy + R - 0.8, 1.6, 0.7); fill(g, css(SK[3], .45)); }
    const ear = sd => {
      const ex = hx + sd * (G_.hrx - 0.6), ey = hy + (baby ? 0.5 : 0.3), k = baby ? 0.62 : 0.72;
      g.beginPath(); g.moveTo(ex, ey - 1.6 * k); g.quadraticCurveTo(ex + sd * 3 * k, ey - 3 * k, ex + sd * 5.6 * k, ey - 6 * k); g.quadraticCurveTo(ex + sd * 3.4 * k, ey + 0.8 * k, ex, ey + 2.6 * k); g.closePath();
      fill(g, rg(g, ex + sd * 2, ey - 1.5, 4, SK)); stroke(g, dk(SK[2], .3), 0.2, .6);
      g.beginPath(); g.moveTo(ex + sd * 0.6, ey - 0.6 * k); g.quadraticCurveTo(ex + sd * 2.6 * k, ey - 2.2 * k, ex + sd * 4.2 * k, ey - 4.4 * k); stroke(g, mix(SK[2], 0xff9db5, .35), 0.45, .8);
    };
    if (fc < 0.55) ear(-1);
    if (fc > -0.55) ear(1);

    // cabeça
    const faceP = () => {
      g.beginPath();
      if (baby) { g.ellipse(hx, hy, G_.hrx, R, 0, 0, Math.PI * 2); return; }
      g.moveTo(hx - G_.hrx, hy - 1);
      g.bezierCurveTo(hx - G_.hrx - 0.3, hy - R - 2.2, hx + G_.hrx + 0.3, hy - R - 2.2, hx + G_.hrx, hy - 1);
      g.bezierCurveTo(hx + G_.hrx - 0.2, hy + 3.4, hx + 2.8, hy + R - 0.2, hx + fo * 0.15, hy + R + 0.2);
      g.bezierCurveTo(hx - 2.8, hy + R - 0.2, hx - G_.hrx + 0.2, hy + 3.4, hx - G_.hrx, hy - 1);
    };
    faceP(); fill(g, rg(g, hx - light * 1.2, hy, R * 1.05, SK, light * -0.25, -0.4));
    g.save(); faceP(); g.clip();
    g.fillStyle = lg(g, hx - G_.hrx * light, 0, hx + G_.hrx * light, 0, [[0, SK[0], 0], [0.55, SK[2], 0], [1, SK[3], .45]]); g.fillRect(hx - 12, hy - 12, 24, 24);
    // sombra da franja na testa
    g.translate(0.2, 1.1); bangsPath(); fill(g, css(SK[3], .35));
    g.restore();
    faceP(); stroke(g, dk(SK[2], .35), 0.2, .55);

    // bochechas
    [-1, 1].forEach(sd => { const x = hx + fo + sd * (baby ? 4.3 : 3.6), y = hy + (baby ? 3.6 : 3); const gr = g.createRadialGradient(x, y, 0, x, y, baby ? 2.4 : 1.9); gr.addColorStop(0, 'rgba(255,120,150,.38)'); gr.addColorStop(1, 'rgba(255,120,150,0)'); g.fillStyle = gr; g.fillRect(x - 3, y - 3, 6, 6); });

    // olhos
    const ek = G_.eye, ey = hy + (baby ? 1.4 : 0.6), edx = baby ? 3.4 : 2.65;
    const closed = face === 'sleep' || face === 'yawn' || blink;
    const lidDrop = face === 'tired' || face === 'bored' ? 0.55 : face === 'sad' ? 0.15 : 0;
    const lowerLift = face === 'happy' ? 0.55 : 0;
    [-1, 1].forEach(sd => {
      const far = (sd > 0 && fc > 0.55) || (sd < 0 && fc < -0.55);
      const ex = hx + fo + sd * edx * (far ? 0.85 : 1);
      g.save(); g.translate(ex, ey); g.scale((far ? 0.68 : 1) * ek, ek);
      const w = 1.75, top = -1.55 + lidDrop * 1.3, bot = 1.1 - lowerLift * 1.2;
      // sobrancelha
      const bIn = face === 'sad' ? -3.9 : face === 'happy' ? -3.2 : -3.3, bOut = face === 'sad' ? -2.9 : -3.4;
      g.beginPath(); g.moveTo(-sd * 1.6, bIn); g.quadraticCurveTo(sd * 0.3, (bIn + bOut) / 2 - 0.5, sd * 2.1, bOut); stroke(g, dk(HR[2], .2), 0.32 / ek, .75);
      if (closed) {
        g.beginPath(); g.moveTo(-w, -0.1); g.quadraticCurveTo(0, 1.0, w, -0.2); stroke(g, DARK, 0.42);
        for (let i = 0; i < 3; i++) { const u = -0.4 + i * 0.6; g.beginPath(); g.moveTo(u * w, 0.35 + (1 - Math.abs(u)) * 0.3); g.lineTo(u * w + sd * 0.25, 0.95 + (1 - Math.abs(u)) * 0.3); stroke(g, DARK, 0.2, .8); }
        if (face === 'yawn' && sd < 0) { ell(g, -w * 1.2, 1.4, 0.4, 0.6); fill(g, css(0xa8e2ff, .9)); }
      } else {
        const eyeP = () => { g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(-0.2, top * 1.25, w, top * 0.25 - 0.05); g.quadraticCurveTo(0.1, bot * 1.3, -w, 0); };
        eyeP(); fill(g, 0xfaf4f0);
        g.save(); eyeP(); g.clip();
        const ir = 1.08, ix = fc * 0.25;
        ell(g, ix, 0.05, ir, ir); fill(g, (() => { const gr = g.createRadialGradient(ix, 0.05, 0.1, ix, 0.05, ir); gr.addColorStop(0, css(EYE.iris[5])); gr.addColorStop(0.45, css(EYE.iris[3])); gr.addColorStop(0.85, css(EYE.iris[1])); gr.addColorStop(1, css(EYE.iris[0])); return gr; })());
        ell(g, ix, 0.05, ir * 0.42, ir * 0.42); fill(g, EYE.pupil);
        g.fillStyle = lg(g, 0, top, 0, 0.4, [[0, SK[3], .55], [1, SK[3], 0]]); g.fillRect(-2, top - 1, 4, 2.2);
        ell(g, ix - 0.38, -0.32, 0.32, 0.26); fill(g, 0xffffff); ell(g, ix + 0.42, 0.45, 0.14, 0.14); fill(g, css(0xffffff, .85));
        g.restore();
        g.beginPath(); g.moveTo(-w - 0.1, 0.05); g.quadraticCurveTo(-0.2, top * 1.25, w + 0.1, top * 0.25 - 0.05); stroke(g, DARK, 0.48 / ek);
        g.beginPath(); g.moveTo(sd * w, top * 0.25 - 0.05); g.lineTo(sd * (w + 0.75), top * 0.25 - 0.7); stroke(g, DARK, 0.3);
        g.beginPath(); g.moveTo(sd * (w - 0.3), top * 0.25 - 0.25); g.lineTo(sd * (w + 0.35), top * 0.25 - 1.0); stroke(g, DARK, 0.2);
        g.beginPath(); g.moveTo(-w * 0.7, bot * 0.9 + 0.15); g.quadraticCurveTo(0, bot * 1.35 + 0.2, w * 0.8, bot * 0.4 + 0.1); stroke(g, SK[3], 0.2, .7);
        g.beginPath(); g.moveTo(-w * 0.8, top * 1.25 - 0.5); g.quadraticCurveTo(0, top * 1.6 - 0.6, w * 0.9, top * 0.6 - 0.4); stroke(g, SK[3], 0.18, .5);
      }
      g.restore();
    });
    if (face === 'sad') { const ty = ey + 2.4 + (t / 280) % 3, tx = hx + fo - edx - 0.6; g.beginPath(); g.moveTo(tx, ty - 0.9); g.quadraticCurveTo(tx + 0.6, ty + 0.3, tx, ty + 0.7); g.quadraticCurveTo(tx - 0.6, ty + 0.3, tx, ty - 0.9); fill(g, css(0xaee4ff, .9)); }

    // nariz
    const nx = hx + fo * 1.15, ny = hy + (baby ? 4.6 : 3.4);
    g.beginPath(); g.moveTo(nx - light * 0.1, ny - 1.6); g.quadraticCurveTo(nx + 0.5 * light, ny - 0.3, nx + 0.2 * light, ny + 0.3); stroke(g, SK[3], 0.22, .5);
    ell(g, nx - 0.45, ny + 0.35, 0.22, 0.14); fill(g, css(SK[3], .7)); ell(g, nx + 0.45, ny + 0.35, 0.22, 0.14); fill(g, css(SK[3], .7));
    ell(g, nx - light * 0.2, ny - 0.3, 0.25, 0.2); fill(g, css(SK[0], .8));

    // boca
    const mx = hx + fo, my = hy + (baby ? 6.4 : 5.3), LIP = mix(SK[1], 0xd84a6a, .45), LIPD = mix(SK[2], 0xa82a48, .5);
    if (face === 'happy') {
      g.beginPath(); g.moveTo(mx - 1.6, my - 0.3); g.quadraticCurveTo(mx, my + 2.4, mx + 1.6, my - 0.3); g.quadraticCurveTo(mx, my + 0.3, mx - 1.6, my - 0.3); fill(g, 0x5a1a2a);
      g.save(); g.beginPath(); g.moveTo(mx - 1.6, my - 0.3); g.quadraticCurveTo(mx, my + 2.4, mx + 1.6, my - 0.3); g.closePath(); g.clip(); g.fillStyle = '#fbf6f2'; g.fillRect(mx - 1.6, my - 0.2, 3.2, 0.55); ell(g, mx, my + 1.6, 0.9, 0.5); fill(g, 0xe0607a); g.restore();
      g.beginPath(); g.moveTo(mx - 1.6, my - 0.3); g.quadraticCurveTo(mx, my + 2.4, mx + 1.6, my - 0.3); stroke(g, LIPD, 0.25);
    } else if (face === 'yawn') {
      ell(g, mx, my + 0.6, 1.1, 1.5); fill(g, 0x4a1422); ell(g, mx, my + 1.4, 0.65, 0.45); fill(g, 0xe0607a); ell(g, mx, my + 0.6, 1.1, 1.5); stroke(g, LIP, 0.35);
    } else {
      const curve = face === 'sad' ? -0.55 : face === 'bored' || face === 'tired' || face === 'sleep' ? 0 : 0.45, wM = face === 'sleep' || face === 'tired' ? 0.8 : 1.3;
      g.beginPath(); g.moveTo(mx - wM, my - curve * 0.5); g.quadraticCurveTo(mx, my + curve * 0.6, mx + wM, my - curve * 0.5); stroke(g, LIPD, 0.32);
      ell(g, mx, my + 0.55 + curve * 0.2, wM * 0.65, 0.38); fill(g, css(LIP, .75));
      ell(g, mx - 0.2, my + 0.45 + curve * 0.2, wM * 0.25, 0.1); fill(g, css(0xffffff, .5));
    }

    // franja e mechas da frente
    function bangsPath() {
      const dir = fo >= 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(hx - G_.hrx - 0.7, hy + (baby ? 2.5 : 1.5));
      g.bezierCurveTo(hx - G_.hrx - 1.3, hy - R - 1.6, hx + G_.hrx + 1.3, hy - R - 1.6, hx + G_.hrx + 0.7, hy + (baby ? 2.5 : 1.5));
      const pts = 7, y0 = hy - R * (baby ? 0.12 : 0.18), yv = hy - R * 0.55;
      for (let i = 0; i <= pts; i++) {
        const u = 1 - i / pts, x = hx - G_.hrx + 0.5 + u * (G_.hrx * 2 - 1) + dir * 0.4;
        const tip = i % 2 === 0;
        const y = tip ? y0 + Math.sin(u * Math.PI) * (baby ? 1.2 : 0.8) : yv;
        g.quadraticCurveTo(x + dir * 0.9, (y + yv) / 2, x, y);
      }
      g.closePath();
    }
    bangsPath(); fill(g, rg(g, hx - light, hy - R * 0.4, R * 1.3, HR));
    g.save(); bangsPath(); g.clip();
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(hx + i * 1.4, hy - R - 1.5); g.quadraticCurveTo(hx + i * 1.6 + 0.6, hy - R * 0.6, hx + i * 1.5 + 0.3, hy - R * 0.15); stroke(g, i % 2 ? HR[3] : HR[0], i % 2 ? 0.25 : 0.2, i % 2 ? .4 : .45); }
    g.beginPath(); g.ellipse(hx - light * 0.6, hy - R * 0.55, R * 0.8, R * 0.42, 0, Math.PI * 1.08, Math.PI * 1.9); stroke(g, HR[0], 0.8, .55);
    g.restore();
    bangsPath(); stroke(g, dk(HR[2], .3), 0.22, .6);
    if (!baby) [-1, 1].forEach(sd => {
      const x = hx + sd * (G_.hrx - 0.4) - fo * 0.25;
      g.beginPath(); g.moveTo(x - sd * 0.8, hy - 2); g.bezierCurveTo(x + sd * 0.9, hy + 4, x + sd * 0.2 + sw * 0.3, hy + 9, x + sd * 0.9 + sw * 0.4, sh + 4);
      g.bezierCurveTo(x - sd * 0.6 + sw * 0.3, hy + 9, x - sd * 0.6, hy + 4, x - sd * 1.8, hy - 1); g.closePath();
      fill(g, lg(g, 0, hy - 2, 0, sh + 4, [[0, HR[1]], [1, HR[2]]])); stroke(g, dk(HR[2], .3), 0.18, .6);
    });
    if (!baby && WEAR.head !== 'coroa' && WEAR.head !== 'tiara') {
      const cxp = hx - G_.hrx + 1.6 - Math.max(0, fo) * 0.5, cyp = hy - R + 2.2;
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ell(g, cxp + Math.cos(a) * 1.05, cyp + Math.sin(a) * 1.05, 0.95, 0.95); fill(g, rg(g, cxp + Math.cos(a), cyp + Math.sin(a), 0.95, PEARL)); }
      ell(g, cxp, cyp, 0.55, 0.55); fill(g, GOLD[1]);
    }
    if (baby) { const tx = hx + 1 - fo * 0.4; [[-1.1, -0.5], [1.3, 0.6]].forEach(([dx, r]) => { g.save(); g.translate(tx + dx, hy - R + 0.2); g.rotate(r); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(1.6, -2, 0.4, -4.2); g.quadraticCurveTo(-1.2, -2, 0, 0); fill(g, rg(g, 0, -2, 2.4, HR)); g.restore(); }); }

    // acessórios
    const hw = WEAR.head;
    if (hw === 'laco') {
      const lx = hx + G_.hrx - 2.2 - Math.min(0, fo) * 0.5, ly = hy - R + 1.6;
      [[-1], [1]].forEach(([s_]) => { g.beginPath(); g.moveTo(lx, ly); g.bezierCurveTo(lx + s_ * 1.5, ly - 3.6, lx + s_ * 4.6, ly - 2.4, lx + s_ * 4, ly + 0.4); g.bezierCurveTo(lx + s_ * 3.2, ly + 2.2, lx + s_ * 1.4, ly + 1.2, lx, ly); fill(g, lg(g, lx, ly - 3, lx + s_ * 4, ly + 2, [[0, RIB[0]], [0.5, RIB[1]], [1, RIB[3]]])); stroke(g, RIB[3], 0.18, .7); g.beginPath(); g.moveTo(lx + s_ * 0.8, ly - 0.2); g.quadraticCurveTo(lx + s_ * 2.6, ly - 1.8, lx + s_ * 3.6, ly - 0.6); stroke(g, RIB[0], 0.2, .7); });
      [[-1], [1]].forEach(([s_]) => { g.beginPath(); g.moveTo(lx, ly + 0.5); g.quadraticCurveTo(lx + s_ * 1, ly + 2.6, lx + s_ * 1.9 + sw * 0.2, ly + 4.2); g.lineTo(lx + s_ * 0.7, ly + 3.6); g.closePath(); fill(g, RIB[2]); });
      ell(g, lx, ly + 0.1, 1, 1.1); fill(g, rg(g, lx, ly, 1.1, RIB));
    } else if (hw === 'coroa') {
      const cols = [0xffffff, 0xff9cc8, 0xc4a6f2, 0xffe07a];
      for (let j = -5; j <= 5; j++) {
        const a = j * 0.26, x = hx + Math.sin(a) * (G_.hrx + 0.6), y = hy - Math.cos(a) * (R + 0.4) + 1.6;
        if (j % 2) { g.save(); g.translate(x, y); g.rotate(a + 0.9); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.7, -0.8, 0, -1.9); g.quadraticCurveTo(-0.7, -0.8, 0, 0); fill(g, lg(g, 0, -2, 0, 0, [[0, 0xa6e48f], [1, 0x3f8a4c]])); g.restore(); continue; }
        const c = cols[(j + 10) % 4], ton = [0xffffff, c, mix(c, 0x9a6aa0, .35), mix(c, 0x6a4a80, .55)];
        for (let p = 0; p < 5; p++) { const b2 = p * Math.PI * 2 / 5 + j; ell(g, x + Math.cos(b2) * 0.85, y + Math.sin(b2) * 0.85, 0.85, 0.65, b2); fill(g, rg(g, x + Math.cos(b2) * 0.85, y + Math.sin(b2) * 0.85, 0.85, ton)); }
        ell(g, x, y, 0.45, 0.45); fill(g, GOLD[1]);
      }
    } else if (hw === 'tiara') {
      g.beginPath(); g.ellipse(hx, hy + 0.5, G_.hrx - 0.2, R - 0.5, 0, Math.PI * 1.18, Math.PI * 1.82); stroke(g, GOLD[3], 1.1); g.beginPath(); g.ellipse(hx, hy + 0.5, G_.hrx - 0.2, R - 0.5, 0, Math.PI * 1.18, Math.PI * 1.82); stroke(g, GOLD[1], 0.55);
      [-0.32, 0.32].forEach(a => { const x = hx + Math.sin(a) * (G_.hrx - 0.2), y = hy + 0.5 - Math.cos(a) * (R - 0.5); ell(g, x, y - 0.3, 0.45, 0.45); fill(g, 0xffc8e8); });
      const sx2 = hx + fo * 0.4, sy2 = hy - R + 0.4;
      g.save(); g.translate(sx2, sy2); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 1.2 : 2.7; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); fill(g, rg(g, 0, 0, 2.7, [0xffffff, 0xfff4b0, 0xffd95a, 0xe6a83a])); stroke(g, GOLD[3], 0.2); ell(g, 0, 0, 0.6, 0.6); fill(g, rg(g, 0, 0, 0.6, WATER)); g.restore();
      starPos = starPos || null;
    }
    if (WEAR.neck === 'colar') {
      const ny2 = baby ? hy + R + 0.2 : sh + 0.8;
      g.beginPath(); g.moveTo(bx - 2.6, ny2 - 0.6); g.quadraticCurveTo(bx, ny2 + 2.2, bx + 2.6, ny2 - 0.6); stroke(g, 0xd8d2e4, 0.15, .8);
      for (let i = -4; i <= 4; i++) { const u = i / 4, x = bx + u * 2.6, y = ny2 - 0.6 + (1 - u * u) * 1.4; ell(g, x, y, 0.42, 0.42); fill(g, rg(g, x, y, 0.42, PEARL)); }
      g.beginPath(); g.moveTo(bx, ny2 + 1.2); g.quadraticCurveTo(bx + 1.2, ny2 + 2.6, bx, ny2 + 3.8); g.quadraticCurveTo(bx - 1.2, ny2 + 2.6, bx, ny2 + 1.2); fill(g, lg(g, bx - 1, 0, bx + 1, 0, [[0, WATER[0]], [0.5, WATER[1]], [1, WATER[3]]])); ell(g, bx - 0.35, ny2 + 2.3, 0.22, 0.35); fill(g, 0xffffff);
    }

    front.forEach(fn => fn());
    if (armL === 'mouth') arm(baby ? [[shL, shY], [bx - 4, shY - 2], [mx - 2.4, my + 0.8]] : [[shL, shY], [bx - 7, sh + 1], [mx - 2.4, my + 0.9]]);
    const top = hy - R - (baby ? 4 : 5.5);
    return { hx: bx, hy, F, top, cy: (top + F) / 2, side: bx + 30 <= W - 6 ? bx + 22 : bx - 22, star: starPos };
  }

  // ---- iluminação da camada da fada ----
  function lightLayer(f, light, sx) {
    const x0 = f.hx - 30, x1 = f.hx + 30, y0 = f.top - 8, y1 = f.F + 3;
    fx.save(); fx.globalCompositeOperation = 'source-atop';
    fx.fillStyle = lg(fx, f.hx - 24 * light, 0, f.hx + 24 * light, 0, [[0, P.light, P.la], [0.5, P.light, 0], [0.55, P.shade, 0], [1, P.shade, P.sa]]); fx.fillRect(x0, y0, x1 - x0, y1 - y0);
    fx.fillStyle = lg(fx, 0, y0, 0, y1, [[0, P.light, P.la * 0.6], [0.6, P.light, 0], [1, P.shade, P.sa * 0.6]]); fx.fillRect(x0, y0, x1 - x0, y1 - y0);
    fx.restore();
  }

  let lastT = 0; const dust = [];
  function stepDust(g, t, f, active) {
    const dt = Math.min(100, Math.max(0, t - lastT)); lastT = t;
    if (active && f && Math.random() < dt / 45) {
      const fromWing = Math.random() < .55;
      dust.push({ x: f.hx + (fromWing ? (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 10) : Math.random() * 6 - 3), y: fromWing ? f.cy - 10 + Math.random() * 8 : f.F - 2, vy: 0.005 + Math.random() * 0.007, life: 1, c: [0xffe27a, 0xffffff, 0xffb8dc, 0xc8ecff][Math.floor(Math.random() * 4)] });
    }
    for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.y += d.vy * dt; d.x += Math.sin((t + i * 300) * 0.004) * 0.05; d.life -= dt / 2000; if (d.life <= 0 || d.y > H) dust.splice(i, 1); }
    g.save(); g.globalCompositeOperation = 'lighter';
    dust.forEach(d => { glowAdd(g, d.x, d.y, 2.4, d.c, .35 * d.life); ell(g, d.x, d.y, 0.32, 0.32); fill(g, css(d.c, Math.min(1, d.life * 1.4))); });
    g.restore();
  }

  function finish(ph, extra) {
    // brilhos somados
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (ph !== 'night') glowAdd(ctx, P.sun[0], P.sun[1], 34, 0xffe8b0, ph === 'day' ? .22 : .3);
    extra.forEach(([x, y, r, c, a]) => glowAdd(ctx, x, y, r, c, a));
    ctx.restore();
    // raios de sol
    if (ph === 'day' || ph === 'dawn' || ph === 'dusk') {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const [sx, sy] = P.sun;
      [[-0.9, 9], [-0.55, 6], [-0.25, 10], [0.15, 7]].forEach(([a, w], i) => {
        const L = 170, ang = Math.PI / 2 + a + (sx > 96 ? 0.35 : -0.35);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(ang - w / 100) * L, sy + Math.sin(ang - w / 100) * L); ctx.lineTo(sx + Math.cos(ang + w / 100) * L, sy + Math.sin(ang + w / 100) * L); ctx.closePath();
        ctx.fillStyle = lg(ctx, sx, sy, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L, [[0, P.light, .16], [1, P.light, 0]]); ctx.fill();
      });
      ctx.restore();
    }
    // cor da hora e vinheta
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = css(P.grade[0], P.grade[1] * 2.2); ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.62);
    vg.addColorStop(0, 'rgba(20,10,40,0)'); vg.addColorStop(1, 'rgba(20,10,40,.32)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  function darkness(x, y, r) {
    if (!r) { ctx.fillStyle = 'rgba(6,4,26,.66)'; ctx.fillRect(0, 0, W, H); return; }
    const gr = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    gr.addColorStop(0, 'rgba(6,4,26,.05)'); gr.addColorStop(1, 'rgba(6,4,26,.66)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  function draw(s, ui, now, pose) {
    const t = now;
    if (s.gone || ui.view === 'status' || ui.view === 'food') {
      if (!s.gone) return SmoothRenderer.draw(s, ui, now, pose);
    }
    applyLook(lookOf(s)); WEAR = wearOf(s); SmoothRenderer.look(lookOf(s));
    const ph = s.gone ? 'night' : World.phase(Core.hour(s));
    P = PH[ph]; G = n => P.k ? mix(n, P.tint, P.k) : n;
    const anim = ui.anim && now - ui.anim.t0 < ui.anim.dur ? ui.anim : null;
    const prog = anim ? (now - anim.t0) / anim.dur : 0;
    const blink = (t % 4300) < 130;
    const glows = [];

    // 1+2. cenário (fundo desfocado + meio nítido), recomposto a cada 150 ms
    const key = ph;
    if (key !== scenKey || t - scenAt > 150 || t < scenAt) {
      background(s, t, ph);
      scx.setTransform(S, 0, 0, S, 0, 0);
      scx.imageSmoothingEnabled = true; scx.imageSmoothingQuality = 'high';
      scx.drawImage(bg, 0, 0, W, H);
      scx.drawImage(midground(ph), 0, 0, W, H);
      scenAt = t; scenKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scen, 0, 0);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (ph === 'night') STARS.forEach(([x, y, k], i) => { const tw = (Math.sin(t * 0.003 + i * 1.7) + 1) / 2; if (tw < 0.2) return; ell(ctx, x, y, k === 0 ? 0.42 : 0.26, k === 0 ? 0.42 : 0.26); fill(ctx, css(k === 0 ? 0xffffff : 0xfff2d0, tw)); if (k === 0 && tw > .8) K.sparkle(x, y, 1.6 * tw, 0xffffff, tw * 0.8); });
    if (ph === 'night') { const cyc = t % 11000; if (cyc < 700) { const p = cyc / 700, x = 20 + p * 80, y = 8 + p * 24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 16, y - 5); stroke(ctx, lg(ctx, x, y, x - 16, y - 5, [[0, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]), 0.5); } }

    grass(ctx, t, BLADES, GROUND + 2.5, G(0x9ad884), G(0x5ea65a));
    const inside = pose && pose.hidden;
    const lit = inside ? !s.lightsOff : ph === 'night';
    ell(ctx, 28, 87, 1.7, 1.7); fill(ctx, lit ? rg(ctx, 28, 87, 1.7, [0xfffbe0, 0xffe27a, 0xf0b040, 0xc08030]) : css(G(0xa9dcff), .9));
    ctx.beginPath(); ctx.moveTo(26.4, 87); ctx.lineTo(29.6, 87); ctx.moveTo(28, 85.4); ctx.lineTo(28, 88.6); stroke(ctx, 0x5a3a24, 0.3);
    if (lit) glows.push([28, 87, 10, 0xffd870, .55]);
    flowers(ctx, t);
    if (!s.gone && (ph === 'day' || ph === 'dawn')) butterflies(ctx, t);
    const gathered = pose && pose.focus && pose.focus.kind === 'fireflies';
    if (ph === 'night' || ph === 'dusk') for (let i = gathered ? 6 : 0; i < 9; i++) { const ff = World.firefly(i, t); if (ff.pulse > .2) { glows.push([ff.x * W, ff.y * H, 6, 0xfff27a, .6 * ff.pulse]); ell(ctx, ff.x * W, ff.y * H, 0.4, 0.4); fill(ctx, 0xfffbd0); } }

    if (s.gone) {
      for (let i = 0; i < 14; i++) { const y = H - ((t * 0.012 + i * 17) % H), x = (i * 37 + 11) % W; glows.push([x, y, 4, 0xfff3b0, .5]); K.sparkle(x, y, 1.2, i % 2 ? 0xffd95a : 0xffffff); }
      grass(ctx, t, FRONT, H + 0.5, G(0x6fb466), G(0x3f7f45)); finish(ph, glows); return;
    }
    if (s.stage === 'bud') {
      const near = bud(ctx, t, s.ageMin, anim && anim.type === 'hatch');
      glows.push([96, 62, 26, 0xfff0b0, near ? .45 : .22]);
      if (anim && anim.type === 'hatch') K.sparkleRing(96, 62, 26, t, 6);
      if (s.lightsOff) darkness(96, 62, 28);
      grass(ctx, t, FRONT, H + 0.5, G(0x6fb466), G(0x3f7f45)); finish(ph, glows); return;
    }

    // sujeira
    for (let i = 0; i < s.poops; i++) {
      const x = 178 - i * 16;
      ell(ctx, x, GROUND + 1, 7, 1.4); fill(ctx, css(0x1a3a22, .3));
      K.at(x, GROUND + 1, 1.1, K.poop);
      ctx.save(); ctx.globalAlpha = 0.55;
      for (let k = 0; k < 2; k++) { ctx.beginPath(); const ox = x - 2 + k * 4, q = Math.sin(t * 0.006 + k + i); ctx.moveTo(ox, GROUND - 13); ctx.bezierCurveTo(ox + 1.5 + q, GROUND - 15, ox - 1.5 - q, GROUND - 17, ox, GROUND - 19); stroke(ctx, 0x8fc46a, 0.45); }
      ctx.restore();
      ell(ctx, x + Math.cos(t * 0.012 + i) * 6, GROUND - 16 + Math.sin(t * 0.017 + i) * 3, 0.45, 0.45); fill(ctx, 0x2a2a35);
    }

    if (inside && ui.view !== 'game') {
      if (s.lightsOff) darkness(28, 87, 0);
      for (let i = 0; i < 3; i++) { const q = ((t * 0.0004) + i / 3) % 1; K.zz(32 + q * 14, 80 - q * 26, Math.min(1, (1 - q) * 3)); }
      grass(ctx, t, FRONT, H + 0.5, G(0x6fb466), G(0x3f7f45)); finish(ph, glows); return;
    }
    if (pose.door) {
      ctx.beginPath(); ctx.moveTo(16.8, GROUND + 0.3); ctx.lineTo(16.8, 92.6); ctx.arc(20.1, 92.6, 3.3, Math.PI, 0); ctx.lineTo(23.4, GROUND + 0.3); ctx.closePath(); fill(ctx, 0x3a2030);
      glows.push([20, 95, 9, 0xffd870, .55]);
    }

    // 3. fada
    const baby = s.stage === 'baby';
    let face = faceFor(s, anim, ui.view === 'game' ? null : pose), hx;
    const sp = pose.sleepP || 0, awakeF = baby ? 93 : 92;
    const F = awakeF + (GROUND - 3 - awakeF) * sp - (ui.view === 'game' ? 0 : pose.lift || 0);
    const bob = Math.sin(t * 0.004) * 2 * (1 - sp);
    if (ui.view === 'game') {
      const gm = ui.game;
      if (gm.phase === 'ask') { hx = 96; face = 'neutral'; }
      else { hx = gm.dir === 'L' ? 36 : 156; face = gm.guess === gm.dir ? 'happy' : 'sad'; }
    } else {
      hx = pose.x * W + (pose.shake || 0);
      if (anim && anim.type === 'refuse') hx += Math.floor(t / 90) % 2 ? 1 : -1;
    }
    const fy = F + bob;
    const sunX = ph === 'night' ? 160 : P.sun[0], light = sunX >= hx ? 1 : -1;
    const sr = Math.max(4, 12 - (GROUND - fy) * 0.6);
    const shg = ctx.createRadialGradient(hx, GROUND + 1, 0, hx, GROUND + 1, sr); shg.addColorStop(0, 'rgba(20,40,28,.4)'); shg.addColorStop(1, 'rgba(20,40,28,0)');
    ctx.save(); ctx.translate(hx, GROUND + 1); ctx.scale(1, 0.18); ctx.translate(-hx, -(GROUND + 1)); ctx.fillStyle = shg; ctx.beginPath(); ctx.arc(hx, GROUND + 1, sr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (s.lightsOff) darkness(hx, fy - 22, 38);

    const bx0 = Math.max(0, Math.floor((hx - 36) * S)), by0 = Math.max(0, Math.floor((fy - 66) * S)), bx1 = Math.min(fcv.width, Math.ceil((hx + 36) * S)), by1 = Math.min(fcv.height, Math.ceil((fy + 4) * S));
    fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(bx0, by0, bx1 - bx0, by1 - by0); fx.setTransform(S, 0, 0, S, 0, 0);
    const fArgs = [fx, s.stage, hx, fy, face, t, blink && !['happy', 'sleep', 'yawn'].includes(face), ui.view === 'game' ? { wing: pose.wing } : pose, light];
    const f = (fairyOverride && fairyOverride(...fArgs)) || fairy(...fArgs);
    lightLayer(f, light, sunX);
    glowAdd(ctx, f.hx, f.cy, 26, ph === 'night' ? 0xc8d4ff : 0xfff6d8, s.lightsOff ? .28 : .14);
    if (bx1 > bx0 && by1 > by0) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fcv, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0); ctx.restore(); }
    if (f.star) glows.push([f.star[0], f.star[1], 9, 0xfff0a0, .5 + Math.sin(t * 0.006) * .15]);
    stepDust(ctx, t, f, !s.asleep);
    if (WEAR.aura === 'brilho') for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, q = (Math.sin(t * 0.005 + i * 2.3) + 1) / 2;
      if (q < 0.45) continue;
      const x = f.hx + side * (7 + ((i * 7) % 14)), y = f.cy - 18 + ((i * 5) % 16);
      glows.push([x, y, 3.5, 0xfff3b0, .5 * q]); K.sparkle(x, y, 1.5 * q, q > 0.8 ? 0xffffff : 0xfff0a0);
    }
    if (pose.trail && ui.view === 'main') { glows.push([f.hx, f.cy, 28, 0xfff3b0, .25]); for (let i = 0; i < 4; i++) { const a = t * 0.012 + i * Math.PI / 2; K.at(f.hx + Math.cos(a) * 20, f.cy + Math.sin(a) * 9, 1, () => K.star(2.4, K.T.gold, a)); } }

    if (pose.focus && ui.view === 'main') {
      const fc = pose.focus;
      if (fc.kind === 'flower') {
        const fxp = fc.x * W, fy0 = GROUND - 6;
        for (let i = 0; i < 6; i++) { const q = ((t * 0.0006) + i / 6) % 1, x = fxp + (f.hx - fxp) * q + Math.sin(q * 9 + i) * 2, y = fy0 + (f.hy + 4 - fy0) * q; glows.push([x, y, 2, 0xffe27a, .6]); ell(ctx, x, y, 0.35, 0.35); fill(ctx, 0xfff6c2); }
        if (pose.p > 0.5) K.at(f.hx + (fxp < f.hx ? 13 : -13), f.top + 10 - (pose.p - 0.5) * 22, 0.7, () => K.heart());
      } else if (fc.kind === 'fireflies') {
        for (let i = 0; i < 6; i++) { const a = t * 0.002 + i * Math.PI / 3, r = 22 + 5 * Math.sin(t * 0.003 + i), x = f.hx + Math.cos(a) * r, y = f.cy - 4 + Math.sin(a) * r * 0.55, q = (Math.sin(t * 0.006 + i * 1.3) + 1) / 2; glows.push([x, y, 8, 0xfff27a, .55 + .35 * q]); ell(ctx, x, y, 0.55, 0.55); fill(ctx, 0xffffff); }
      }
    }

    if (ui.view === 'game') {
      const gm = ui.game;
      for (let i = 0; i < 5; i++) { const x = 80 + i * 8; if (i < gm.results.length) K.at(x, 8, 1, () => K.star(3.4, gm.results[i] ? K.T.gold : K.T.heartE)); else { ell(ctx, x, 8, 1, 1); fill(ctx, css(0xffffff, .9)); } }
      if (gm.phase === 'ask' && Math.floor(t / 300) % 2 === 0) [[6, 1], [186, -1]].forEach(([x, d]) => { ctx.beginPath(); ctx.moveTo(x, 56); ctx.lineTo(x + d * 10, 48); ctx.lineTo(x + d * 10, 64); ctx.closePath(); fill(ctx, lg(ctx, 0, 48, 0, 64, [[0, 0xfff6c2], [1, 0xf0a53c]])); stroke(ctx, 0xc07a28, 0.5); });
      grass(ctx, t, FRONT, H + 0.5, G(0x6fb466), G(0x3f7f45)); finish(ph, glows); return;
    }

    if (s.sick && !s.asleep) {
      K.at(f.hx, f.top - 6, 0.6, () => K.cloud(K.T.gray));
      for (let i = 0; i < 5; i++) { const x = f.hx - 6 + i * 3, y = f.top - 2 + ((t / 120 + i * 2) % 5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.4, y + 1.6); stroke(ctx, 0x7fc4f0, 0.45); }
    }
    if (s.asleep && sp >= 1) for (let i = 0; i < 3; i++) { const q = ((t * 0.0005) + i / 3) % 1; K.zz(f.hx + 12 + q * 12, f.top + 8 - q * 20, Math.min(1, (1 - q) * 3)); }

    if (anim) {
      const ty = anim.type;
      if (ty === 'eat') {
        const bites = Math.min(4, Math.floor(prog * 5)), right = f.side > f.hx, cyI = f.F - 14;
        ctx.save(); ctx.beginPath(); if (right) ctx.rect(f.side - 8 + bites * 4, 0, W, H); else ctx.rect(0, 0, f.side + 8 - bites * 4, H); ctx.clip();
        K.at(f.side, cyI, 1, anim.item === 'candy' ? K.candy : K.bowl); ctx.restore();
      } else if (ty === 'pet') {
        [-15, 0, 15].forEach((o, i) => { const rise = ((prog * 30) + i * 9) % 30; K.at(f.hx + o, f.top + 12 - rise, 0.9, () => K.heart()); });
      } else if (ty === 'bath') {
        glows.push([f.hx, f.cy, 28, 0xdff5ff, .3]);
        for (let i = 0; i < 24; i++) {
          const bx = (i * 37 + 9) % (W - 8) + 4, by = H + 6 - ((prog * 150 + i * 13) % 130), r = 1 + (i % 3) * 0.8;
          ell(ctx, bx, by, r, r); fill(ctx, 'rgba(210,240,255,.22)'); stroke(ctx, 'rgba(180,225,255,.9)', 0.3);
          ell(ctx, bx - r * 0.35, by - r * 0.35, r * 0.25, r * 0.2); fill(ctx, 0xffffff);
        }
      } else if (ty === 'toilet') {
        K.at(f.side, f.F - 6, 1, K.potty);
      } else if (ty === 'med') {
        K.at(f.side, f.F - 12, 1, K.potion); K.sparkleRing(f.hx, f.cy, 22, t, 4);
      } else if (['hatch', 'grow', 'win', 'gift'].includes(ty)) K.sparkleRing(f.hx, f.cy, 26, t, 6);
    }

    grass(ctx, t, FRONT, H + 0.5, G(0x6fb466), G(0x3f7f45));
    finish(ph, glows);
  }

  return {
    init(canvas) {
      S = renderScale(canvas);
      SmoothRenderer.init(canvas, S);
      K = SmoothRenderer.kit;
      canvas.width = W * S; canvas.height = H * S; ctx = canvas.getContext('2d');
      fcv = document.createElement('canvas'); fcv.width = W * S; fcv.height = H * S; fx = fcv.getContext('2d');
      scen = document.createElement('canvas'); scen.width = W * S; scen.height = H * S; scx = scen.getContext('2d'); scenKey = '';
      bg = document.createElement('canvas'); bg.width = W * BGS; bg.height = H * BGS; bgx = bg.getContext('2d');
    },
    draw,
    // ganchos para outros visuais que só trocam a fada (ex.: Pintado)
    setFairy(fn) { fairyOverride = fn; },
    wings: (g, bx, wy, pose, t, ws) => { applyLook(lookOf(s)); wings(g, bx, wy, pose, t, ws); },
  };
})();
