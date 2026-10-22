/* ---------- 3b. COLOR RENDERER (192×120, colorido HD) ---------- */
const ColorRenderer = (() => {
  const W = 192, H = 120, SC = 4, GROUND = 100;
  let ctx, off, octx, img;
  const buf = () => new Uint32Array(W * H);
  const main = buf(), body = buf(), wing = buf(), fx = buf(), tmp = buf();
  const landCache = {};
  const DARK = 0x24142f;

  // paletas em 4 tons: [luz, base, sombra, sombra profunda]
  const T = {
    skin: [0xfff0e6, 0xffdcc8, 0xf5bba0, 0xe09a82],
    hair: [0xffbade, 0xec74b0, 0xc4538f, 0x8f3a72],
    dress: [0xbdf2c9, 0x7fd498, 0x55ab72, 0x3b8055],
    dress2: [0x93dfa9, 0x5fbb7e, 0x449a62, 0x2f7548],
    gold: [0xfff6c2, 0xffd95a, 0xf0a53c, 0xc07a28],
    shoe: [0xffc2dc, 0xf07aaa, 0xc85088, 0x983a68],
    cap: [0xff9a9a, 0xe8505b, 0xbf3a4c, 0x8f2a3e],
    stem: [0xfffaf0, 0xf6e7cf, 0xdcc8ab, 0xb8a283],
    wood: [0xc9905f, 0x9a6440, 0x774a2e, 0x55331e],
    bowl: [0xc4e6ff, 0x5aa9e6, 0x3d7fc0, 0x2d5f99],
    rice: [0xffffff, 0xfff4e0, 0xeedfc4, 0xd6c3a2],
    berry: [0xffa3ad, 0xe8505b, 0xb03348, 0x7f2234],
    candy: [0xffd6ea, 0xff8fbf, 0xd8569a, 0xa83a75],
    heart: [0xffd3e3, 0xff6f9e, 0xd8457c, 0xa8305e],
    heartE: [0xf4f1f8, 0xdcd6e6, 0xc2bad2, 0xa79dbb],
    poop: [0xc69468, 0x9a6440, 0x744a2e, 0x52331f],
    potion: [0xe6d2ff, 0xa983ea, 0x7d5ac7, 0x5a3e99],
    glass: [0xffffff, 0xeaf5ff, 0xc9def2, 0xa3bdd8],
    porc: [0xffffff, 0xf1f3f8, 0xd5dae6, 0xb3bacb],
    cloud: [0xffffff, 0xf8f6ff, 0xe4def6, 0xcbc3e8],
    gray: [0xc9d0dc, 0x9aa3b5, 0x737c90, 0x565d6e],
    leaf: [0xa6e48f, 0x6fc274, 0x4f9e5c, 0x3a7a4a],
    water: [0xd9f3ff, 0x7fd3ff, 0x4aa8e0, 0x2f7fb8],
    red: [0xffa0a0, 0xef5f6a, 0xc43e4f, 0x8f2a3e],
    moon: [0xfffaf0, 0xfff1d6, 0xe6d6b8, 0xc9b896],
    sun: [0xffffff, 0xfff6b0, 0xffe27a, 0xffd04a],
  };

  // ---- primitivas ----
  function P(B, x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) B[y * W + x] = c; }
  function mix(a, b, t) {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
    const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
    const bl = (a & 255) * (1 - t) + (b & 255) * t;
    return ((r << 16) | (g << 8) | bl) || 1;
  }
  function rect(B, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P(B, x + i, y + j, c); }
  function ellF(B, cx, cy, rx, ry, a, col, clip) {
    const R = Math.ceil(Math.max(rx, ry)) + 1, ca = Math.cos(a), sa = Math.sin(a);
    const x0 = Math.round(cx), y0 = Math.round(cy), fn = typeof col === 'function';
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const ox = x0 + dx - cx, oy = y0 + dy - cy;
      const u = (ox * ca + oy * sa) / rx, v = (-ox * sa + oy * ca) / ry;
      if (u * u + v * v > 1) continue;
      if (clip && !clip(u, v)) continue;
      const c = fn ? col(u, v) : col;
      if (c) P(B, x0 + dx, y0 + dy, c);
    }
  }
  // sombreamento esférico com luz vindo do alto à esquerda
  const sh = tones => (u, v) => {
    const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const d = -0.45 * u - 0.6 * v + 0.66 * z;
    return d > 0.82 ? tones[0] : d > 0.35 ? tones[1] : d > -0.1 ? tones[2] : tones[3];
  };
  const ball = (B, cx, cy, r, tones) => ellF(B, cx, cy, r, r, 0, sh(tones));
  function line(B, x0, y0, x1, y1, c, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 500; n++) {
      if (w > 1) rect(B, x0, y0, w, w, c); else P(B, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function poly(B, pts, col) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) P(B, x, y, typeof col === 'function' ? col(x, y) : col);
    }
  }
  // contorno colorido ("selout"): a borda puxa a cor do vizinho, escurecida
  function selout(B, k = .62) {
    tmp.set(B);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (tmp[i]) continue;
      const n = (x > 0 && tmp[i - 1]) || (x < W - 1 && tmp[i + 1]) || (y > 0 && tmp[i - W]) || (y < H - 1 && tmp[i + W]);
      if (n) B[i] = mix(n, DARK, k);
    }
  }
  function comp(dst, src, a = 1) { for (let i = 0; i < src.length; i++) if (src[i]) dst[i] = a >= 1 ? src[i] : mix(dst[i] || src[i], src[i], a); }
  function tint(B, c, k) { if (k <= 0) return; for (let i = 0; i < B.length; i++) if (B[i]) B[i] = mix(B[i], c, k); }
  function glow(B, cx, cy, r, c, a) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) { const i = y * W + x, f = 1 - d / r; B[i] = mix(B[i] || 1, c, a * f * f); }
    }
  }
  function shadowAt(cx, rx, a) {
    const ry = Math.max(1, rx / 4);
    for (let y = Math.floor(GROUND + 1 - ry); y <= GROUND + 1 + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x - cx) / rx, v = (y - GROUND - 1) / ry;
      if (u * u + v * v <= 1 && x >= 0 && x < W) { const i = y * W + x; main[i] = mix(main[i], 0x2c5236, a); }
    }
  }

  // ---- itens ----
  function heart(B, cx, cy, k, tones = T.heart) {
    const s = 4 * k, R = Math.ceil(s * 1.4);
    for (let py = -R; py <= R; py++) for (let px = -R; px <= R; px++) {
      const x = px / s, y = -py / s + 0.2, q = x * x + y * y - 1;
      if (q * q * q - x * x * y * y * y > 0) continue;
      let c = tones[1];
      if (x < -0.2 && x > -0.85 && y > 0.45) c = tones[0];
      else if (y < -0.35 || x > 0.78) c = tones[2];
      P(B, cx + px, cy + py, c);
    }
  }
  function star(B, cx, cy, r, tones = T.gold, rot = 0) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    poly(B, pts, (x, y) => (y - cy < -r * 0.15 && x - cx < r * 0.2) ? tones[0] : (y - cy > r * 0.3 || x - cx > r * 0.45) ? tones[2] : tones[1]);
  }
  function bowl(B, cx, cy, k = 1) {
    ellF(B, cx, cy, 6 * k, 4.2 * k, 0, sh(T.rice), (u, v) => v <= 0.1);
    ball(B, cx - 2.6 * k, cy - 2.4 * k, 1.3 * k, T.berry); ball(B, cx + 0.8 * k, cy - 3.4 * k, 1.3 * k, T.berry); ball(B, cx + 3.4 * k, cy - 1.6 * k, 1.2 * k, T.berry);
    P(B, cx + 0.8 * k, cy - 4.8 * k, T.leaf[1]);
    ellF(B, cx, cy, 7.5 * k, 5.5 * k, 0, sh(T.bowl), (u, v) => v >= 0);
    ellF(B, cx, cy, 7.5 * k, 1.2 * k, 0, T.bowl[0]);
    for (let i = -2; i <= 2; i++) P(B, cx + i * 2.5 * k, cy + 2.6 * k, 0xffffff);
  }
  function candy(B, cx, cy, k = 1) {
    poly(B, [[cx - 3 * k, cy], [cx - 8 * k, cy - 3.5 * k], [cx - 7 * k, cy], [cx - 8 * k, cy + 3.5 * k]], T.candy[2]);
    poly(B, [[cx + 3 * k, cy], [cx + 8 * k, cy - 3.5 * k], [cx + 7 * k, cy], [cx + 8 * k, cy + 3.5 * k]], T.candy[2]);
    ellF(B, cx, cy, 4 * k, 4 * k, 0, (u, v) => Math.sin((u + v) * 5) > 0.55 ? 0xffffff : sh(T.candy)(u, v));
  }
  function poop(B, cx, base, k = 1) {
    ellF(B, cx, base - 2.5 * k, 6 * k, 2.8 * k, 0, sh(T.poop));
    ellF(B, cx + 0.5 * k, base - 5.6 * k, 4.4 * k, 2.3 * k, 0, sh(T.poop));
    ellF(B, cx + 1 * k, base - 8.2 * k, 2.8 * k, 1.8 * k, 0, sh(T.poop));
    P(B, cx + 2 * k, base - 10 * k, T.poop[1]);
  }
  function potion(B, cx, cy, k = 1) {
    ellF(B, cx, cy, 5 * k, 5 * k, 0, (u, v) => v > -0.15 ? sh(T.potion)(u, v) : sh(T.glass)(u, v));
    rect(B, cx - 1.5 * k, cy - 8.5 * k, 3 * k + 1, 4 * k, T.glass[2]); rect(B, cx - 1.5 * k, cy - 8.5 * k, Math.max(1, k), 4 * k, T.glass[0]);
    rect(B, cx - 2 * k, cy - 10.5 * k, 4 * k + 1, 2.2 * k, T.wood[1]);
    P(B, cx - 2.5 * k, cy - 1.5 * k, 0xffffff); P(B, cx + 1 * k, cy + 2 * k, T.potion[0]); P(B, cx + 2.5 * k, cy + 0.5 * k, T.potion[0]);
  }
  function potty(B, cx, cy, k = 1) {
    rect(B, cx - 8 * k, cy - 9 * k, 4 * k, 9 * k, T.porc[1]); rect(B, cx - 5 * k, cy - 9 * k, Math.max(1, k), 9 * k, T.porc[2]);
    ellF(B, cx, cy, 7 * k, 6 * k, 0, sh(T.porc), (u, v) => v >= 0);
    ellF(B, cx, cy, 7 * k, 1.5 * k, 0, T.porc[3]); ellF(B, cx, cy, 5.5 * k, 0.8 * k, 0, T.water[1]);
    rect(B, cx - 3 * k, cy + 5 * k, 6 * k + 1, 2 * k, T.porc[2]);
  }
  function drop(B, cx, cy, k = 1) {
    poly(B, [[cx, cy - 9 * k], [cx - 4.7 * k, cy], [cx + 4.7 * k, cy]], T.water[1]);
    ball(B, cx, cy + 1.5 * k, 5 * k, T.water);
    P(B, cx - 2 * k, cy, 0xffffff); P(B, cx - 2 * k, cy - 1 * k, 0xffffff);
  }
  const moonIcon = (B, cx, cy, k) => ellF(B, cx, cy, 6 * k, 6 * k, 0, sh(T.gold), (u, v) => ((u - 0.55) ** 2 + (v + 0.35) ** 2) > 0.55);
  function cross(B, cx, cy, k) {
    rect(B, cx - 2 * k, cy - 6 * k, 4 * k, 12 * k, T.red[1]); rect(B, cx - 6 * k, cy - 2 * k, 12 * k, 4 * k, T.red[1]);
    rect(B, cx - 2 * k, cy - 6 * k, Math.max(1, k), 12 * k, T.red[0]); rect(B, cx - 6 * k, cy - 2 * k, 12 * k, Math.max(1, k), T.red[0]);
    rect(B, cx + 2 * k - Math.max(1, k), cy - 6 * k, Math.max(1, k), 12 * k, T.red[2]); rect(B, cx - 6 * k, cy + 2 * k - Math.max(1, k), 12 * k, Math.max(1, k), T.red[2]);
  }
  function cloud(B, cx, cy, k, tones = T.cloud) {
    ellF(B, cx, cy + 3 * k, 13 * k, 3 * k, 0, tones[2]);
    ball(B, cx - 7 * k, cy + 1 * k, 4.5 * k, tones); ball(B, cx + 7 * k, cy + 1 * k, 5 * k, tones); ball(B, cx, cy - 2 * k, 6.5 * k, tones);
  }
  function zz(B, x, y) {
    const c = 0xffffff;
    for (let i = 0; i < 5; i++) { P(B, x + i, y, c); P(B, x + i, y + 4, c); }
    P(B, x + 3, y + 1, c); P(B, x + 2, y + 2, c); P(B, x + 1, y + 3, c);
  }
  const ICONF = {
    hunger: (B, cx, cy, k) => bowl(B, cx, cy + 2 * k, k),
    affection: (B, cx, cy, k) => heart(B, cx, cy, k * 1.5),
    fun: (B, cx, cy, k) => star(B, cx, cy, 8 * k),
    bladder: (B, cx, cy, k) => potty(B, cx + 1 * k, cy + 1 * k, k),
    hygiene: (B, cx, cy, k) => drop(B, cx, cy, k),
    energy: (B, cx, cy, k) => moonIcon(B, cx, cy, k),
    health: (B, cx, cy, k) => cross(B, cx, cy, k),
  };

  // ---- aparência (Looks) ----
  let EYE = LOOKS.eyes.ametista, WING = LOOKS.wings.cristal, lookKey = '';
  let WEAR = {};
  const RIBBON = [0xffb8c0, 0xf05868, 0xc83a4c, 0x96283a], CAPE = [0xffd6e0, 0xf590ac, 0xd26482, 0xa04460];
  function applyLook(look) {
    const k = JSON.stringify(look);
    if (k === lookKey) return;
    lookKey = k;
    T.hair = LOOKS.hair[look.hair].tones; T.skin = LOOKS.skin[look.skin].tones;
    const d = LOOKS.dress[look.dress]; T.dress = d.tones; T.dress2 = d.back; T.shoe = d.shoe;
    EYE = LOOKS.eyes[look.eyes]; WING = LOOKS.wings[look.wings];
  }

  // ---- fada (desenha uma Pose) ----
  function fairy(stage, cx, F, face, t, blink, pose = {}) {
    body.fill(0); wing.fill(0);
    const baby = stage === 'baby';
    const R = baby ? 10 : 9;
    const legH = baby ? 3 : 7, skirtH = baby ? 7 : 12, bodiceH = baby ? 0 : 5;
    const skirtBot = F - legH, skirtTop = skirtBot - skirtH, ty = skirtTop - bodiceH;
    const bx = Math.round(cx);                                   // eixo do corpo
    const fc = Math.max(-1, Math.min(1, pose.facing || 0));      // -1 esquerda · 0 frente · 1 direita
    const fo = Math.round(fc * 2);                               // deslocamento dos traços do rosto
    const hx = bx + Math.round(fc);                              // a cabeça inclina para onde ela olha
    const hy = ty - R + 1 + (pose.nod || 0);
    const folded = (pose.sleepP || 0) > 0.6;
    const armL = pose.armL || 'down', armR = baby ? 'none' : (pose.armR || 'wand');

    // asas iridescentes, com perspectiva quando ela vira
    const flap = folded ? 0 : Math.sin(pose.wing ?? t * 0.014);
    const ws = baby ? 0.78 : 1, sx = bx, sy = ty + 2, shift = t * 0.002;
    const sL = 1 + (fc > 0 ? 0.12 : 0.3) * fc, sR = 1 - (fc < 0 ? 0.12 : 0.3) * fc;
    const wcol = (u, v) => {
      if (u * u + v * v > 0.8) return WING.rim;
      if (Math.abs(v) < 0.09 && u < 0.75) return WING.vein;
      if ((u - 0.45) ** 2 + (v * 0.7 - 0.25) ** 2 < 0.018) return 0xffffff;
      const tt = (u + 1) / 2;
      return mix(WING.root, mix(WING.a, WING.b, (Math.sin(tt * 3 + v * 2 + shift) + 1) / 2), tt * 0.9);
    };
    const wingOne = (phi, rx, ry, side) => {
      const k = side < 0 ? sL : sR; rx *= k; ry *= k;
      const dx = Math.cos(phi) * rx * 0.95, dy = Math.sin(phi) * rx * 0.95;
      if (side < 0) ellF(wing, sx + dx, sy + dy, rx, ry, phi, wcol);
      else ellF(wing, sx - dx, sy + dy, rx, ry, -phi, (u, v) => wcol(-u, v));
    };
    const pair = (phi, rx, ry) => { wingOne(phi, rx, ry, -1); wingOne(phi, rx, ry, 1); };
    if (folded) { pair(Math.PI + 1.3, 14 * ws, 4 * ws); pair(Math.PI + 0.95, 9 * ws, 3 * ws); }
    else { pair(Math.PI + 0.6 + 0.42 * flap, 17 * ws, (7 + 1.6 * flap) * ws); pair(Math.PI - 0.62 + 0.2 * flap, 10 * ws, 4.6 * ws); }

    // capa de pétalas (atrás do corpo, na frente das asas)
    if (WEAR.back === 'capa') {
      const c0 = ty - 1, h = F - 2 - c0;
      for (let k = -2; k <= 2; k++) ellF(body, bx + k * 4.6 - fo * 0.5, c0 + h * 0.55, 4.4, h * 0.6, -k * 0.24, (u, v) => (Math.round((u + 1) * 3) % 2 && v > 0.6) ? CAPE[2] : sh(CAPE)(u, v));
    }
    // cabelo de trás (vai para o lado oposto ao olhar)
    const sway = Math.sin(t * 0.003);
    if (!baby) {
      ellF(body, hx - fo + sway * 0.6, hy + R * 0.7, R + 3, R + 3.5, 0, (u, v) => v < -0.1 ? 0 : (Math.round((u + 1) * 7) % 3 === 0 ? T.hair[2] : sh(T.hair)(u, v)));
      ellF(body, hx + 1 - Math.round(fo / 2), hy - R - 2, 4.2, 3.6, 0, sh(T.hair));
    }
    ellF(body, hx - Math.round(fo / 2), hy, R + 2, R + 1.5, 0, sh(T.hair));
    if (baby) { const cx2 = hx - Math.round(fo / 2); P(body, cx2 + 1, hy - R - 2, T.hair[1]); P(body, cx2 + 2, hy - R - 3, T.hair[1]); P(body, cx2 + 3, hy - R - 3, T.hair[1]); P(body, cx2 + 4, hy - R - 2, T.hair[2]); }

    // pernas e sapatilhas (balançam quando ela está entediada)
    const kick = pose.kick ? Math.round(Math.sin(t * 0.01) * 1.5) : 0;
    [bx - 3, bx + 1].forEach((x, i) => {
      const kk = i ? -kick : kick;
      if (kk) line(body, x, skirtBot - 2, x + kk, F - 2, T.skin[1], 2);
      else { rect(body, x, skirtBot - 2, 2, legH + 1, T.skin[1]); rect(body, x + 1, skirtBot - 2, 1, legH + 1, T.skin[2]); }
      ellF(body, x + kk + (i ? 1 : 0), F - 0.5, 2, 1.3, 0, sh(T.shoe));
      if (!baby) P(body, (i ? x + 2 : x - 1) + kk, F - 1, 0xffffff);
    });

    // saia de pétalas em duas camadas
    const ks = baby ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
    const kf = baby ? [-0.5, 0.5] : [-1.5, -0.5, 0.5, 1.5];
    const pw = baby ? 2.6 : 3;
    ks.forEach(k => ellF(body, bx + k * pw, skirtTop + skirtH * 0.55, pw * 0.95, skirtH * 0.55, -k * 0.3, sh(T.dress2)));
    kf.forEach(k => ellF(body, bx + k * pw * 1.05, skirtTop + skirtH * 0.42, pw * 0.9, skirtH * 0.5, -k * 0.28, sh(T.dress)));
    if (!baby) {
      ellF(body, bx, ty + 2.5, 4.2, 3.6, 0, sh(T.dress));
      ball(body, bx - 4.5, ty + 1.5, 2, T.dress); ball(body, bx + 4.5, ty + 1.5, 2, T.dress);
      ellF(body, bx - 2.5, ty, 2, 1.2, -0.4, T.dress[0]); ellF(body, bx + 2.5, ty, 2, 1.2, 0.4, T.dress[0]);
    }
    rect(body, bx - (baby ? 3 : 4), skirtTop - 1, baby ? 7 : 9, 1, T.gold[1]); ball(body, bx, skirtTop - 1, 1, T.gold);

    // braços
    const shY = baby ? skirtTop + 1 : ty + 2, shL = bx - (baby ? 4 : 5), shR = bx + (baby ? 4 : 5);
    const hand = (x, y) => ball(body, x, y, baby ? 1.1 : 1.3, T.skin);
    const arm = (pts) => { for (let i = 1; i < pts.length; i++) line(body, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], T.skin[1], 2); hand(...pts[pts.length - 1]); };
    let starPos = null;
    const front = [];                       // braços erguidos são desenhados por cima da cabeça
    const later = (raised, fn) => raised ? front.push(fn) : fn();
    // braço direito (segura a varinha)
    if (armR === 'wand') later(false, () => {
      line(body, bx + 8, ty + 10, bx + 13, ty - 3, T.stem[1]); line(body, bx + 9, ty + 10, bx + 14, ty - 3, T.stem[2]);
      starPos = [bx + 14, ty - 6];
      star(body, starPos[0], starPos[1], 3.8, T.gold, Math.sin(t * 0.004) * 0.3);
      arm([[shR, shY], [bx + 9, ty + 7.5]]);
    });
    else if (armR === 'up') later(true, () => {
      const hxr = bx + 12, hyr = hy - 4;
      line(body, hxr, hyr, hxr + 2, hyr - 9, T.stem[1]); line(body, hxr + 1, hyr, hxr + 3, hyr - 9, T.stem[2]);
      starPos = [hxr + 3, hyr - 12];
      star(body, starPos[0], starPos[1], 3.8, T.gold, Math.sin(t * 0.004) * 0.3);
      arm([[shR, shY], [bx + 9, hy + 4], [hxr, hyr]]);
    });
    else if (baby) {
      if (armL === 'up') later(true, () => arm([[shR, shY], [bx + 10, skirtTop - 9]]));
      else arm([[shR, shY], [bx + 7, skirtTop + 4]]);
    }
    // braço esquerdo (o livre: acena, espreguiça, segura a barriga, cobre o bocejo)
    const wv = Math.sin(t * 0.018) * 2.5;
    if (baby) {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 9, skirtTop - 2], [bx - 11 + wv, skirtTop - 9]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 10, skirtTop - 9]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 1, skirtTop + 2]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 7, skirtTop + 4]]);
    } else {
      if (armL === 'wave') later(true, () => arm([[shL, shY], [bx - 11, ty - 1], [bx - 13 + wv, ty - 9]]));
      else if (armL === 'up') later(true, () => arm([[shL, shY], [bx - 9, hy + 4], [bx - 12, hy - 4]]));
      else if (armL === 'belly') arm([[shL, shY], [bx - 6, ty + 5], [bx - 2, ty + 4.5]]);
      else if (armL !== 'mouth') arm([[shL, shY], [bx - 8, ty + 8], [bx - 7.5, ty + 9.5]]);
    }

    // orelhas pontudas (a de trás some quando ela vira)
    const earY = hy + 1;
    if (fc < 0.55) poly(body, [[hx - R + 1, earY - 2], [hx - R - 5, earY - 6], [hx - R + 1, earY + 3]], T.skin[1]);
    if (fc > -0.55) poly(body, [[hx + R - 1, earY - 2], [hx + R + 5, earY - 6], [hx + R - 1, earY + 3]], T.skin[2]);
    if (!baby) rect(body, hx - 1, hy + R - 1, 3, 2, T.skin[2]);

    // cabeça
    ellF(body, hx, hy, R + 0.4, R, 0, sh(T.skin));
    for (let dy = -R - 1; dy <= R; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const u = dx / (R + 0.4), v = dy / R;
      if (u * u + v * v > 1.02) continue;
      const zig = Math.abs(((dx - fo + 60) % 5) - 2) * 0.9;
      const lim = -R * 0.25 + zig - 1 + (Math.abs(u) > 0.72 ? R * 0.9 : 0);
      if (dy > lim) continue;
      let c = sh(T.hair)(u, v);
      const ring = (u + fc * 0.2) ** 2 + (v + 0.2) ** 2;
      if (ring > 0.42 && ring < 0.56 && u < 0.25 && v < -0.35) c = T.hair[0];
      P(body, hx + dx, hy + dy, c);
    }
    if (!baby && WEAR.head !== 'coroa' && WEAR.head !== 'tiara') {
      const fxp = hx - R + 2 - Math.max(0, fo), fyp = hy - R + 3;
      ball(body, fxp - 1.5, fyp, 1.3, T.porc); ball(body, fxp + 1.5, fyp, 1.3, T.porc); ball(body, fxp, fyp - 1.5, 1.3, T.porc); ball(body, fxp, fyp + 1.5, 1.3, T.porc);
      P(body, fxp, fyp, T.gold[1]);
    }

    // olhos
    const ey = hy + (baby ? 1 : 0), eyeH = baby ? 7 : 6;
    const IR = EYE.iris;
    const closed = face === 'sleep' || face === 'yawn' || blink;
    const lid = face === 'tired' ? 2 : face === 'bored' ? 2 : 0;
    [hx - 6 + fo, hx + 3 + fo].forEach((ex, i) => {
      const far = (i === 1 && fc > 0.55) || (i === 0 && fc < -0.55);
      const c0 = far && i === 0 ? 1 : 0, c1 = far && i === 1 ? 2 : 3;
      const outer = i === 0 ? ex + c0 - 1 : ex + c1 + 1;
      if (closed) {
        P(body, ex + c0, ey + 3, DARK); for (let c = c0 + 1; c < c1; c++) P(body, ex + c, ey + 4, DARK); P(body, ex + c1, ey + 3, DARK);
        if (!far) P(body, outer, ey + 2, DARK);
        if (face === 'yawn' && i === 0) P(body, ex - 1, ey + 5, 0x9fdcff);
      } else if (face === 'happy') {
        P(body, ex + c0, ey + 4, DARK); for (let c = c0 + 1; c < c1; c++) P(body, ex + c, ey + 3, DARK); P(body, ex + c1, ey + 4, DARK);
      } else {
        for (let r = lid; r < eyeH; r++) for (let c = c0; c <= c1; c++) {
          if (r === eyeH - 1 && (c === c0 || c === c1)) continue;
          let col = r === lid ? DARK : IR[Math.min(IR.length - 1, r - 1)];
          if (r > lid && r >= 2 && r <= 3 && (c === 1 || c === 2)) col = EYE.pupil;
          P(body, ex + c, ey + r, col);
        }
        const hr = Math.max(1, lid + 1);
        P(body, ex + c0, ey + hr, 0xffffff); if (!lid) { P(body, ex + c0 + 1, ey + hr, 0xffffff); P(body, ex + c0, ey + hr + 1, 0xffffff); }
        P(body, ex + c1, ey + eyeH - 2, 0xffffff);
        if (!far) { P(body, outer, ey + lid, DARK); if (!lid) P(body, outer + (i ? 1 : -1), ey - 1, DARK); }
        if (face === 'sad') {
          (i === 0 ? [ex + 2, ex + 3] : [ex, ex + 1]).forEach(x => P(body, x, ey - 3, T.hair[3]));
          (i === 0 ? [ex, ex + 1] : [ex + 2, ex + 3]).forEach(x => P(body, x, ey - 2, T.hair[3]));
        }
      }
    });
    if (face === 'sad') P(body, hx - 5 + fo, ey + eyeH + 1 + Math.floor(t / 250) % 3, 0x7cc8ff);

    // nariz, bochechas, boca
    const mx = hx + fo;
    P(body, mx + (fc > 0.3 ? 1 : fc < -0.3 ? -1 : 0), hy + (baby ? 6 : 4), T.skin[2]);
    const by = hy + (baby ? 7 : 5);
    [hx - 8 + fo, hx + 6 + fo].forEach(bxx => { P(body, bxx, by, 0xffb6c6); P(body, bxx + 1, by, 0xff9db5); P(body, bxx + 2, by, 0xffb6c6); });
    const my = hy + (baby ? 8 : 6), M = 0xb8405e, MI = 0xff8fa8;
    if (face === 'happy') { for (let x = -2; x <= 2; x++) P(body, mx + x, my, M); for (let x = -1; x <= 1; x++) P(body, mx + x, my + 1, MI); }
    else if (face === 'sad') { P(body, mx - 2, my + 1, M); P(body, mx + 2, my + 1, M); for (let x = -1; x <= 1; x++) P(body, mx + x, my, M); }
    else if (face === 'yawn') ellF(body, mx, my + 0.5, 1.8, 2, 0, (u, v) => u * u + v * v > 0.45 ? M : 0x7a1f3a);
    else if (face === 'sleep' || face === 'tired') P(body, mx, my, MI);
    else if (face === 'bored') for (let x = -1; x <= 1; x++) P(body, mx + x, my, M);
    else { P(body, mx - 2, my - 1, M); P(body, mx + 2, my - 1, M); for (let x = -1; x <= 1; x++) P(body, mx + x, my, M); }

    // acessórios de cabeça e pescoço
    const hw = WEAR.head;
    if (hw === 'laco') {
      const lx = hx + R - 3 - Math.min(0, fo), ly = hy - R + 1;
      ellF(body, lx - 2.2, ly, 2.2, 1.6, 0.45, sh(RIBBON)); ellF(body, lx + 2.2, ly, 2.2, 1.6, -0.45, sh(RIBBON));
      P(body, lx - 1, ly + 2, RIBBON[2]); P(body, lx + 1, ly + 2, RIBBON[2]); P(body, lx - 1, ly + 3, RIBBON[3]); P(body, lx + 2, ly + 3, RIBBON[3]);
      ball(body, lx, ly, 1, RIBBON);
    } else if (hw === 'coroa') {
      const cols = [0xffffff, 0xff9cc8, 0xc4a6f2, 0xffe07a];
      for (let j = -4; j <= 4; j++) {
        const a = j * 0.3, x = hx + Math.sin(a) * (R + 0.6), y = hy - Math.cos(a) * (R + 0.6) + 1.2;
        if (j % 2) { P(body, x, y, 0x5fbb7e); P(body, x, y - 1, 0x93dfa9); continue; }
        const c = cols[(j + 8) % 4];
        ball(body, x, y, 1.6, [0xffffff, c, mix(c, 0x9a6aa0, .35), mix(c, 0x6a4a80, .5)]); P(body, x, y, 0xffd95a);
      }
    } else if (hw === 'tiara') {
      for (let x = -R + 2; x <= R - 2; x++) P(body, hx + x, hy - Math.sqrt(R * R - x * x) + 2.5, x < 0 ? T.gold[0] : T.gold[2]);
      star(body, hx + Math.round(fo / 2), hy - R, 3.2, T.gold, 0);
      P(body, hx + Math.round(fo / 2), hy - R, 0x9fdcff);
    }
    if (WEAR.neck === 'colar') {
      const ny = hy + R + 1;
      for (let i = -3; i <= 3; i++) P(body, bx + i, ny + (Math.abs(i) < 2 ? 1 : 0), i % 2 ? 0xffffff : 0xe8e6f4);
      ball(body, bx, ny + 3, 1.3, T.water);
    }
    front.forEach(fn => fn());
    // mão na frente da boca (bocejo)
    if (armL === 'mouth') {
      if (baby) arm([[shL, shY], [mx - 4, my + 1]]);
      else arm([[shL, shY], [bx - 9, ty - 1], [mx - 4, my + 1]]);
    }

    selout(wing, .5); selout(body, .62);
    return {
      hx: bx, hy, F, top: hy - R - (baby ? 4 : 7), cy: Math.round((hy + F) / 2),
      side: bx + 30 <= W - 6 ? bx + 22 : bx - 22, star: starPos,
    };
  }

  // ---- cenário ----
  const PHASES = {
    day: { top: 0x7cc6ff, bot: 0xeaf7ff, tint: 0, k: 0 },
    dawn: { top: 0x8aa8ea, bot: 0xffd4b0, tint: 0x6a5aa0, k: .12 },
    dusk: { top: 0x4a3b8e, bot: 0xffa77a, tint: 0x5a3a7a, k: .28 },
    night: { top: 0x0d1030, bot: 0x2f2766, tint: 0x141a45, k: .58 },
  };
  const phaseOf = h => (h >= 21 || h < 5.5) ? 'night' : h >= 18 ? 'dusk' : h < 8 ? 'dawn' : 'day';
  const hillMid = x => Math.round(74 + 5 * Math.sin(x * 0.045 + 1) + 3 * Math.sin(x * 0.11));

  function buildLand(ph) {
    const L = buf(), PH = PHASES[ph];
    for (let x = 0; x < W; x++) {
      const m = Math.round(58 + 9 * Math.sin(x * 0.028 + 0.5) + 4 * Math.sin(x * 0.07 + 2));
      for (let y = m; y < GROUND; y++) L[y * W + x] = y === m ? 0xd4e4f5 : mix(0xbad3ee, 0x9db9da, Math.min(1, (y - m) / 14));
      const hh = hillMid(x);
      for (let y = hh; y < GROUND; y++) L[y * W + x] = y === hh ? 0xb4e2a8 : mix(0x93cf92, 0x7cbd80, (y - hh) / 20);
    }
    fx.fill(0);
    [[46, 1], [62, 0.8], [118, 1.1], [139, 0.9], [160, 1.2], [184, 0.9]].forEach(([x, s]) => {
      const base = hillMid(x) + 3;
      rect(fx, x - 1, base - 8 * s, 2, 8 * s, T.wood[2]);
      ball(fx, x - 3 * s, base - 9 * s, 4 * s, T.leaf); ball(fx, x + 3 * s, base - 10 * s, 4.5 * s, T.leaf); ball(fx, x, base - 14 * s, 5 * s, T.leaf);
    });
    selout(fx, .45); comp(L, fx);
    for (let x = 0; x < W; x++) {
      const n = Math.round(87 + 3 * Math.sin(x * 0.06 + 2) + 2 * Math.sin(x * 0.17));
      for (let y = n; y < GROUND; y++) L[y * W + x] = y === n ? 0x9fdc8a : ((x * 7 + y * 3) % 13 === 0 ? 0x5fae68 : 0x72c072);
      for (let y = GROUND; y < H; y++) {
        const g = mix(0x8ed57c, 0x5ea95c, (y - GROUND) / (H - GROUND));
        L[y * W + x] = y === GROUND ? 0xb2ea98 : ((x * 5 + y * 11) % 17 === 0 ? mix(g, 0x3f8f4c, .4) : g);
      }
    }
    // casinha de cogumelo
    fx.fill(0);
    ellF(fx, 22, 92, 11, 12, 0, sh(T.stem), (u, v) => v <= (GROUND - 92) / 12);
    rect(fx, 17, 92, 7, 8, T.wood[1]); ellF(fx, 20, 92, 3.5, 3, 0, T.wood[1]); rect(fx, 22, 91, 1, 9, T.wood[2]); P(fx, 22, 96, T.gold[1]);
    ball(fx, 28, 87, 2.6, T.wood); ellF(fx, 28, 87, 1.6, 1.6, 0, ph === 'night' ? 0xffe27a : 0xa9dcff); P(fx, 27, 86, 0xffffff);
    ellF(fx, 22, 82, 20, 13, 0, sh(T.cap), (u, v) => v <= 0.12);
    ellF(fx, 22, 83.5, 17, 2.2, 0, T.stem[2]);
    [[13, 77, 2.2], [22, 73, 2.6], [31, 78, 2], [8, 81, 1.4], [36, 81, 1.4], [28, 72, 1.2], [16, 72, 1]].forEach(([x, y, r]) => ball(fx, x, y, r, T.stem));
    selout(fx, .55); comp(L, fx);
    tint(L, PH.tint, PH.k);
    return L;
  }

  const STARS = Array.from({ length: 46 }, (_, i) => [(i * 53 + 7) % W, (i * 37 + 3) % 60, i % 4]);
  const TUFTS = Array.from({ length: 26 }, (_, i) => Math.round(4 + i * 7.3 + (i % 3)));
  const FLOWERS = [[46, 0xff8fbf], [57, 0xffd95a], [71, 0xa9dcff], [88, 0xffffff], [103, 0xff8fbf], [121, 0xa983ea], [137, 0xffd95a], [153, 0xff8fbf], [176, 0xffffff], [188, 0xa9dcff]];

  function scene(s, t, forced, pose) {
    const ph = forced || phaseOf(Core.hour(s)), PH = PHASES[ph];
    for (let y = 0; y < H; y++) main.fill(mix(PH.top, PH.bot, Math.min(1, y / 78)), y * W, y * W + W);
    if (ph === 'night') {
      STARS.forEach(([x, y, k], i) => {
        const tw = (Math.sin(t * 0.003 + i * 1.7) + 1) / 2;
        if (tw > 0.25) P(main, x, y, mix(PH.top, k === 0 ? 0xffffff : 0xfff2c4, tw));
        if (k === 0 && tw > .85) { P(main, x - 1, y, mix(PH.top, 0xffffff, .4)); P(main, x + 1, y, mix(PH.top, 0xffffff, .4)); P(main, x, y - 1, mix(PH.top, 0xffffff, .4)); P(main, x, y + 1, mix(PH.top, 0xffffff, .4)); }
      });
      glow(main, 160, 18, 18, 0xfff1d6, .25);
      ellF(main, 160, 18, 7, 7, 0, sh(T.moon), (u, v) => ((u - 0.55) ** 2 + (v + 0.3) ** 2) > 0.6);
      const cyc = t % 11000;
      if (cyc < 700) { const p = cyc / 700, x = 20 + p * 80, y = 8 + p * 24; for (let i = 0; i < 10; i++) P(main, x - i * 1.6, y - i * 0.5, mix(PH.top, 0xffffff, 1 - i / 10)); }
    } else {
      const sx = ph === 'day' ? 160 : ph === 'dusk' ? 150 : 40, sy = ph === 'day' ? 18 : 54;
      glow(main, sx, sy, 28, 0xfff3b0, .38); ball(main, sx, sy, 7, T.sun);
      [[0, 24, 1], [80, 12, 0.8], [140, 34, 0.65]].forEach(([o, y, k], i) => {
        const x = ((o + t * 0.0025 * (0.6 + i * 0.2)) % (W + 70)) - 35;
        fx.fill(0); cloud(fx, x, y, k);
        if (PH.k) tint(fx, ph === 'dusk' ? 0xff9a8a : PH.tint, ph === 'dusk' ? .3 : PH.k);
        comp(main, fx, .92);
      });
    }
    if (!landCache[ph]) landCache[ph] = buildLand(ph);
    comp(main, landCache[ph]);
    if (ph === 'night' && !(pose && pose.hidden)) glow(main, 28, 87, 10, 0xffe27a, .45);

    const gt = c => PH.k ? mix(c, PH.tint, PH.k) : c;
    const g1 = gt(0x4f9e5c), g2 = gt(0x8ed57c), cen = gt(0xffd95a);
    TUFTS.forEach(x => {
      const sw = Math.round(Math.sin(t * 0.002 + x * 0.25) * 1.3);
      line(main, x, GROUND + 3, x - 1 + sw, GROUND - 2, g1); line(main, x + 1, GROUND + 3, x + 2 + sw, GROUND - 1, g2); line(main, x + 2, GROUND + 3, x + 3 + sw, GROUND, g1);
    });
    FLOWERS.forEach(([x, c], i) => {
      const sw = Math.sin(t * 0.0022 + i) * 1.2, fx_ = Math.round(x + sw), fy = GROUND - 6, pc = gt(c);
      line(main, x, GROUND + 2, fx_, fy + 1, g1);
      P(main, fx_ - 1, fy, pc); P(main, fx_ + 1, fy, pc); P(main, fx_, fy - 1, pc); P(main, fx_, fy + 1, pc); P(main, fx_, fy, cen);
    });
    if (ph === 'day' || ph === 'dawn') for (let i = 0; i < 2; i++) {
      const bf = World.butterfly(i, t), x = bf.x * W, y = bf.y * H;
      const open = Math.floor(t / 140 + i) % 2, c = i ? 0xff9a4a : 0x7fb6ff, c2 = i ? 0xffd27a : 0xc9e2ff;
      P(main, x, y, DARK); P(main, x, y + 1, DARK);
      if (open) { [[-1, -1], [-2, -1], [-2, 0], [1, -1], [2, -1], [2, 0], [-1, 1], [1, 1]].forEach(([a, b]) => P(main, x + a, y + b, c)); P(main, x - 1, y, c2); P(main, x + 1, y, c2); }
      else { P(main, x - 1, y - 1, c); P(main, x + 1, y - 1, c); P(main, x - 1, y - 2, c); P(main, x + 1, y - 2, c); }
    }
    const gathered = pose && pose.focus && pose.focus.kind === 'fireflies';
    if (ph === 'night' || ph === 'dusk') for (let i = gathered ? 6 : 0; i < 9; i++) {
      const ff = World.firefly(i, t), x = ff.x * W, y = ff.y * H, pulse = ff.pulse;
      if (pulse > .2) { glow(main, x, y, 4, 0xfff27a, .55 * pulse); P(main, x, y, mix(0x88aa44, 0xfffbb0, pulse)); }
    }
    return ph;
  }

  // ---- broto ----
  function drawBud(t, ageMin, excite) {
    body.fill(0);
    const near = ageMin > 0.35 || excite;
    const shake = near ? Math.sin(t * 0.03) * 1.6 : Math.sin(t * 0.003) * 0.8;
    const bx = 96 + shake;
    line(body, 96, GROUND + 1, 96, 84, T.leaf[2], 2); line(body, 96, 84, bx, 73, T.leaf[2], 2);
    ellF(body, 88, 89, 7, 2.6, -0.5, sh(T.leaf)); ellF(body, 104, 86, 7, 2.6, 0.45, sh(T.leaf));
    const bt = T.hair, btL = [bt[0], bt[2], bt[3], bt[3]];
    ellF(body, bx - 3, 63, 4.5, 10, 0.22, sh(btL)); ellF(body, bx + 3, 63, 4.5, 10, -0.22, sh(bt));
    ellF(body, bx, 61, 5, 11, 0, sh(bt));
    ellF(body, bx, 72, 5.5, 2.6, 0, sh(T.leaf));
    selout(body, .6);
    glow(main, bx, 63, 24 + Math.sin(t * 0.004) * 3, 0xfff3b0, near ? .45 : .2);
    shadowAt(96, 8, .3);
    comp(main, body);
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
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]; d.y += d.vy * dt; d.x += Math.sin((t + i * 300) * 0.004) * 0.05; d.life -= dt / 1800;
      if (d.life <= 0 || d.y > H) dust.splice(i, 1);
    }
    dust.forEach(d => { if (d.life > 0.3 || Math.random() < .5) { P(main, d.x, d.y, d.c); if (d.life > 0.75) glow(main, d.x, d.y, 2.5, d.c, .3); } });
  }

  function sparkleRing(cx, cy, r, t, n) {
    glow(main, cx, cy, r + 4, 0xfff3b0, .25);
    fx.fill(0);
    for (let i = 0; i < n; i++) { const a = t * 0.003 + i * (Math.PI * 2 / n); star(fx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, 2.8, T.gold, t * 0.005); }
    selout(fx, .5); comp(main, fx);
  }
  function panelBg(top, bot) {
    for (let y = 0; y < H; y++) main.fill(mix(top, bot, y / H), y * W, y * W + W);
    for (let y = 6; y < H; y += 12) for (let x = (y / 12 % 2) * 6 + 4; x < W; x += 12) P(main, x, y, mix(mix(top, bot, y / H), 0xffffff, .5));
  }
  function card(x, y, w, h, fill, border) {
    rect(main, x + 1, y + 1, w - 2, h - 2, fill);
    rect(main, x + 2, y, w - 4, 1, border); rect(main, x + 2, y + h - 1, w - 4, 1, border);
    rect(main, x, y + 2, 1, h - 4, border); rect(main, x + w - 1, y + 2, 1, h - 4, border);
    P(main, x + 1, y + 1, border); P(main, x + w - 2, y + 1, border); P(main, x + 1, y + h - 2, border); P(main, x + w - 2, y + h - 2, border);
  }
  const layer = fn => { fx.fill(0); fn(fx); selout(fx, .55); comp(main, fx); };
  const triUp = (B, cx, cy, s, c) => poly(B, [[cx, cy - s], [cx - s, cy + s * 0.4], [cx + s, cy + s * 0.4]], c);

  function draw(s, ui, now, pose) {
    const t = now;
    applyLook(lookOf(s)); WEAR = wearOf(s);
    const anim = ui.anim && now - ui.anim.t0 < ui.anim.dur ? ui.anim : null;
    const prog = anim ? (now - anim.t0) / anim.dur : 0;
    const blink = (t % 4300) < 130;

    if (s.gone) {
      scene(s, t, 'night');
      for (let i = 0; i < 14; i++) { const y = H - ((t * 0.012 + i * 17) % H), x = (i * 37 + 11) % W; P(main, x, y, i % 2 ? 0xffd95a : 0xffffff); glow(main, x, y, 3, 0xfff3b0, .3); }
      return flush();
    }

    if (ui.view === 'status') {
      panelBg(0xf7efff, 0xdcc9f3);
      const p = STATUS_PAGES[ui.page], val = pageValue(s, p);
      card(14, 22, 64, 64, 0xffffff, 0xb59ad6);
      layer(B => ICONF[p.k](B, 46, 54, 3));
      const full = Math.round(val / 25);
      layer(B => { for (let i = 0; i < 4; i++) heart(B, 101 + i * 22, 43, 1.5, i < full ? T.heart : T.heartE); });
      card(90, 64, 92, 11, 0xece6f4, 0xb59ad6);
      const fw = Math.round(88 * val / 100), bc = val < 25 ? T.red : val < 50 ? T.gold : T.dress;
      if (fw > 0) { rect(main, 92, 66, fw, 7, bc[1]); rect(main, 92, 66, fw, 2, bc[0]); rect(main, 92, 72, fw, 1, bc[2]); }
      for (let i = 0; i < STATUS_PAGES.length; i++) {
        const x = 78 + i * 6;
        if (i === ui.page) ball(main, x, 104, 2, T.potion); else P(main, x, 104, 0xb5a8c8);
      }
      return flush();
    }

    if (ui.view === 'food') {
      panelBg(0xfff6e6, 0xffd9c4);
      const sel = ui.foodIdx;
      card(22, 16, 64, 66, sel === 0 ? 0xffffff : 0xfff0e2, sel === 0 ? T.gold[2] : 0xf2d2bc);
      card(106, 16, 64, 66, sel === 1 ? 0xffffff : 0xfff0e2, sel === 1 ? T.gold[2] : 0xf2d2bc);
      layer(B => { bowl(B, 54, 52, 3); candy(B, 138, 49, 2.6); });
      if (sel === 0) glow(main, 54, 46, 26, 0xfff3b0, .2); else glow(main, 138, 49, 26, 0xfff3b0, .2);
      const bounce = Math.round(Math.sin(t * 0.008) * 2);
      layer(B => triUp(B, sel === 0 ? 54 : 138, 97 + bounce, 6, T.gold[1]));
      return flush();
    }

    scene(s, t, null, pose);

    if (s.stage === 'bud') {
      drawBud(t, s.ageMin, anim && anim.type === 'hatch');
      if (anim && anim.type === 'hatch') sparkleRing(96, 63, 26, t, 6);
      if (s.lightsOff) { tint(main, 0x080620, .6); glow(main, 96, 63, 22, 0xfff1b0, .35); }
      return flush();
    }

    // sujeira
    if (s.poops) {
      layer(B => { for (let i = 0; i < s.poops; i++) poop(B, 178 - i * 16, GROUND + 1, 1.1); });
      for (let i = 0; i < s.poops; i++) {
        const x = 178 - i * 16, ph = Math.floor(t / 300 + i) % 2;
        for (let k = 0; k < 3; k++) { P(main, x - 3 + k * 3 + ph, GROUND - 14 - k % 2, 0x8fc46a); P(main, x - 3 + k * 3 + 1 - ph, GROUND - 16 - k % 2, 0x8fc46a); }
        P(main, x + Math.cos(t * 0.012 + i) * 6, GROUND - 16 + Math.sin(t * 0.017 + i) * 3, 0x2a2a35);
      }
    }

    // dentro da casinha: janela acesa (ou apagada) e Zzz saindo
    if (pose.hidden && ui.view !== 'game') {
      if (s.lightsOff) { tint(main, 0x080620, .62); glow(main, 28, 87, 5, 0x6a5a9a, .3); }
      else glow(main, 28, 87, 18, 0xffe27a, .7);
      layer(B => { for (let i = 0; i < 3; i++) { const q = ((t * 0.0004) + i / 3) % 1; zz(B, 32 + q * 14, 78 - q * 26); } });
      return flush();
    }
    if (pose.door) { rect(main, 17, 92, 7, 8, 0x3a2030); ellF(main, 20, 92, 3.5, 3, 0, 0x3a2030, (u, v) => v <= 0); glow(main, 20, 95, 7, 0xffe27a, .45); }

    const baby = s.stage === 'baby';
    let face = faceFor(s, anim, ui.view === 'game' ? null : pose), hx;
    const sp = pose.sleepP || 0, awakeF = baby ? 93 : 92;
    const F = Math.round(awakeF + (GROUND - 3 - awakeF) * sp - (ui.view === 'game' ? 0 : pose.lift || 0));
    const bob = Math.round(Math.sin(t * 0.004) * 2 * (1 - sp));
    if (ui.view === 'game') {
      const g = ui.game;
      if (g.phase === 'ask') { hx = 96; face = 'neutral'; }
      else { hx = g.dir === 'L' ? 36 : 156; face = g.guess === g.dir ? 'happy' : 'sad'; }
    } else {
      hx = pose.x * W + (pose.shake || 0);
      if (anim && anim.type === 'refuse') hx += Math.floor(t / 90) % 2 ? 1 : -1;
    }
    const f = fairy(s.stage, hx, F + bob, face, t, blink && !['happy', 'sleep', 'yawn'].includes(face), ui.view === 'game' ? { wing: pose.wing } : pose);

    shadowAt(f.hx, Math.max(4, 11 - (GROUND - f.F) * 0.6), .3);
    if (s.lightsOff) { tint(main, 0x080620, .62); glow(main, f.hx, f.cy, 32, 0xfff1b0, .45); }
    glow(main, f.hx, f.cy, 24, 0xfff6d0, .1);
    if (f.star) glow(main, f.star[0], f.star[1], 9, 0xfff3b0, .45 + Math.sin(t * 0.006) * .15);
    comp(main, wing, .72);
    comp(main, body);
    stepDust(t, f, !s.asleep);
    if (WEAR.aura === 'brilho') {
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1, ph = (Math.sin(t * 0.005 + i * 2.3) + 1) / 2;
        if (ph < 0.45) continue;
        const x = f.hx + side * (7 + ((i * 7) % 12)), y = f.cy - 14 + ((i * 5) % 14);
        glow(main, x, y, 3, 0xfff3b0, .5 * ph); P(main, x, y, ph > 0.85 ? 0xffffff : 0xfff0a0);
        if (ph > 0.85) { P(main, x - 1, y, 0xfff6c8); P(main, x + 1, y, 0xfff6c8); P(main, x, y - 1, 0xfff6c8); P(main, x, y + 1, 0xfff6c8); }
      }
    }
    if (pose.trail && ui.view === 'main') {
      glow(main, f.hx, f.cy, 26, 0xfff3b0, .2);
      layer(B => { for (let i = 0; i < 4; i++) { const a = t * 0.012 + i * Math.PI / 2; star(B, f.hx + Math.cos(a) * 20, f.cy + Math.sin(a) * 9, 2.4, T.gold, a); } });
    }

    if (pose.focus && ui.view === 'main') {
      const fc = pose.focus;
      if (fc.kind === 'flower') {
        const fxp = fc.x * W, fy = GROUND - 6;
        for (let i = 0; i < 6; i++) {
          const q = ((t * 0.0006) + i / 6) % 1;
          P(main, fxp + (f.hx - fxp) * q + Math.sin(q * 9 + i) * 2, fy + (f.hy + 4 - fy) * q, i % 2 ? 0xffe27a : 0xfff6c2);
        }
        if (pose.p > 0.5) layer(B => heart(B, f.hx + (fxp < f.hx ? 13 : -13), f.top + 8 - (pose.p - 0.5) * 22, 0.7));
      } else if (fc.kind === 'fireflies') {
        for (let i = 0; i < 6; i++) {
          const a = t * 0.002 + i * Math.PI / 3, r = 21 + 5 * Math.sin(t * 0.003 + i);
          const x = f.hx + Math.cos(a) * r, y = f.cy - 4 + Math.sin(a) * r * 0.55, pulse = (Math.sin(t * 0.006 + i * 1.3) + 1) / 2;
          glow(main, x, y, 7, 0xfff27a, .55 + .35 * pulse); rect(main, x - 0.5, y - 0.5, 2, 2, 0xfff27a); P(main, x, y, 0xffffff);
        }
      }
    }

    if (ui.view === 'game') {
      const g = ui.game;
      layer(B => {
        for (let i = 0; i < 5; i++) {
          const x = 80 + i * 8;
          if (i < g.results.length) star(B, x, 8, 3.4, g.results[i] ? T.gold : T.heartE);
          else ball(B, x, 8, 1, T.porc);
        }
        if (g.phase === 'ask' && Math.floor(t / 300) % 2 === 0) {
          poly(B, [[6, 56], [16, 48], [16, 64]], T.gold[1]);
          poly(B, [[186, 56], [176, 48], [176, 64]], T.gold[1]);
        }
      });
      return flush();
    }

    if (s.sick && !s.asleep) {
      layer(B => cloud(B, f.hx, f.top - 7, 0.55, T.gray));
      for (let i = 0; i < 5; i++) { const x = f.hx - 6 + i * 3, y = f.top - 3 + ((Math.floor(t / 120) + i * 2) % 5); P(main, x, y, 0x5aa9e6); P(main, x, y + 1, 0x7fc4f0); }
    }
    if (s.asleep && sp >= 1) layer(B => { for (let i = 0; i < 3; i++) { const p = ((t * 0.0005) + i / 3) % 1; zz(B, f.hx + 12 + p * 12, f.top + 4 - p * 20); } });

    if (anim) {
      const ty = anim.type;
      if (ty === 'eat') {
        const bites = Math.min(4, Math.floor(prog * 5)), right = f.side > f.hx;
        fx.fill(0);
        if (anim.item === 'candy') candy(fx, f.side, f.F - 12, 1); else bowl(fx, f.side, f.F - 10, 1);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (right ? x < f.side - 8 + bites * 4 : x > f.side + 8 - bites * 4) fx[y * W + x] = 0;
        }
        selout(fx, .55); comp(main, fx);
      } else if (ty === 'pet') {
        layer(B => [-15, 0, 15].forEach((o, i) => { const rise = ((prog * 30) + i * 9) % 30; heart(B, f.hx + o, f.top + 12 - rise, 0.9); }));
      } else if (ty === 'bath') {
        glow(main, f.hx, f.cy, 26, 0xdff5ff, .35);
        for (let i = 0; i < 22; i++) {
          const bx = (i * 37 + 9) % (W - 8) + 4, by = H + 6 - ((prog * 150 + i * 13) % 130), r = 1 + (i % 3);
          for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
            const d = dx * dx + dy * dy;
            if (d <= (r + 1) * (r + 1) && d >= r * r - 1) P(main, bx + dx, by + dy, dx < 0 && dy < 0 ? 0xffffff : 0xa9dcff);
          }
        }
      } else if (ty === 'toilet') {
        layer(B => potty(B, f.side, f.F - 6, 1));
        if (prog > .5) for (let i = 0; i < 3; i++) P(main, f.side - 2 + i * 2, f.F - 6 + Math.floor(t / 120 + i) % 2, T.water[2]);
      } else if (ty === 'med') {
        layer(B => potion(B, f.side, f.F - 10, 1));
        sparkleRing(f.hx, f.cy, 20, t, 4);
      } else if (['hatch', 'grow', 'win', 'gift'].includes(ty)) {
        sparkleRing(f.hx, f.cy, 24, t, 6);
      }
    }
    flush();
  }

  function flush() {
    const d = img.data;
    for (let i = 0; i < main.length; i++) { const c = main[i]; d[i * 4] = (c >> 16) & 255; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255; }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W * SC, H * SC);
  }

  return {
    init(canvas) {
      canvas.width = W * SC; canvas.height = H * SC;
      ctx = canvas.getContext('2d');
      off = document.createElement('canvas'); off.width = W; off.height = H;
      octx = off.getContext('2d'); img = octx.createImageData(W, H);
    },
    draw,
  };
})();

