/* ---------- 3e. PAINTED RENDERER (arte pintada, protótipo) ----------
   Usa o cenário, a luz e os efeitos do IllustratedRenderer e troca só a
   fada: em vez de desenhar por código, escolhe a ilustração pintada da
   pose do momento (assets/fada/*.webp, gerada por tools/process_art.py).
   Na pose parada o rosto muda com a expressão e pisca. As asas pintadas
   (uma meia asa espelhada) batem atrás da pintura.
   A bebê usa as poses bebe_* e as mesmas asas, menores. Sem arte de uma
   fase, ela volta para a fada do Ilustrado.
   Aparência: cada pose tem uma máscara (<pose>.mask.png) com as regiões
   cabelo/pele/olhos/vestido/sapatos; a região é repintada com a paleta
   escolhida pelo brilho de cada pixel (mapa de degradê), o que mantém a
   luz e a textura da pintura. Na opção original, a pintura fica intacta. */
const PaintedRenderer = (() => {
  const imgs = {};
  let meta = null, failed = false, cur = null, prev = null, switchAt = 0, wingImg = null, animOn = false;
  const masks = {}, recolored = {}, ranges = {};
  let look = DEFAULT_LOOK, wingPic = null, wingKey = '';
  // onde ficam as costas (raiz das asas), em fração da altura a partir dos pés
  const WING_AT = { tedio: 0.62, lado: 0.7, espreguicando: 0.68, bebe_: 0.6, bebe_tedio: 0.55, bebe_lado: 0.62 };
  const ANCHOR_X = { lado: 0.6, bebe_lado: 0.55 };
  const SIT = { tedio: 100.5, bebe_tedio: 100.5 };   // sentada no chão

  function load() {
    if (meta || failed) return;
    const inline = window.PAINTED_INLINE;
    const use = m => {
      meta = m;
      if (m.asa) { const w = new Image(); w.onload = () => { wingImg = w; }; w.src = inline ? inline.imgs.asa : 'assets/fada/asa.webp'; }
      Object.keys(m.poses).forEach(n => {
        const im = new Image();
        im.onload = () => { imgs[n] = im; };
        im.src = inline ? inline.imgs[n] : `assets/fada/${n}.webp`;
        const mk = new Image();
        mk.onload = () => {
          const c = document.createElement('canvas'); c.width = mk.naturalWidth; c.height = mk.naturalHeight;
          const g = c.getContext('2d'); g.drawImage(mk, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data, m = new Uint8Array(c.width * c.height);
          for (let i = 0; i < m.length; i++) m[i] = d[i * 4];
          masks[n] = m;
        };
        if (!inline || inline.masks) mk.src = inline ? inline.masks[n] : `assets/fada/${n}.mask.png`;
      });
    };
    if (inline) return use(inline.meta);
    fetch('assets/fada/fada.json').then(r => r.json()).then(use).catch(() => { failed = true; });
  }

  // ---- recolorir pela aparência ----
  const hexRGB = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // degradê do escuro ao claro; cada stop é [posição 0..1, cor]
  function ramp(stops) {
    const lut = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
      for (let j = 0; j < 3; j++) lut[i * 3 + j] = Math.round(c0[j] + (c1[j] - c0[j]) * f);
    }
    return lut;
  }
  const tones4 = tn => ramp([[0, hexRGB(tn[3])], [0.3, hexRGB(tn[2])], [0.66, hexRGB(tn[1])], [1, hexRGB(tn[0])]]);
  function luts(l) {
    const out = [];
    if (l.hair !== DEFAULT_LOOK.hair) out[1] = tones4(LOOKS.hair[l.hair].tones);
    if (l.skin !== DEFAULT_LOOK.skin) out[2] = tones4(LOOKS.skin[l.skin].tones);
    if (l.eyes !== DEFAULT_LOOK.eyes) { const ir = LOOKS.eyes[l.eyes].iris; out[3] = ramp(ir.map((c, i) => [i / (ir.length - 1), hexRGB(c)])); }
    if (l.dress !== DEFAULT_LOOK.dress) { out[4] = tones4(LOOKS.dress[l.dress].tones); out[5] = tones4(LOOKS.dress[l.dress].shoe); }
    return out;
  }
  const lkey = l => `${l.hair}|${l.skin}|${l.eyes}|${l.dress}`;
  // brilho de cada região na pintura original (percentis 3 e 97), para esticar o degradê
  function rangeOf(n, d, m) {
    if (ranges[n]) return ranges[n];
    const hist = Array.from({ length: 6 }, () => new Uint32Array(256));
    for (let i = 0; i < m.length; i++) if (m[i] && d[i * 4 + 3] > 40) hist[m[i]][(d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8]++;
    return (ranges[n] = hist.map(h => {
      const tot = h.reduce((a, b) => a + b, 0); if (!tot) return [0, 255];
      let acc = 0, lo = 0, hi = 255;
      for (let i = 0; i < 256; i++) { acc += h[i]; if (acc <= tot * 0.03) lo = i; if (acc <= tot * 0.97) hi = i; }
      return [lo, Math.max(lo + 1, hi)];
    }));
  }
  function pic(n) {
    const im = imgs[n], m = masks[n];
    if (!im || !m) return im;
    const key = lkey(look);
    if (key === lkey(DEFAULT_LOOK)) return im;
    if (recolored[n] && recolored[n].key === key) return recolored[n].c;
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    if (m.length !== c.width * c.height) return im;
    const L = luts(look), R = rangeOf(n, d, m);
    for (let i = 0; i < m.length; i++) {
      const lut = L[m[i]]; if (!lut) continue;
      const o = i * 4, [lo, hi] = R[m[i]];
      const y = (d[o] * 77 + d[o + 1] * 150 + d[o + 2] * 29) >> 8;
      const t = Math.max(0, Math.min(255, Math.round((y - lo) * 255 / (hi - lo)))) * 3;
      d[o] = lut[t]; d[o + 1] = lut[t + 1]; d[o + 2] = lut[t + 2];
    }
    g.putImageData(id, 0, 0);
    recolored[n] = { key, c };
    return c;
  }
  // asas: o desenho inteiro vira o degradê das asas escolhidas
  function wingsPic() {
    if (!wingImg || look.wings === DEFAULT_LOOK.wings) return wingImg;
    if (wingPic && wingKey === look.wings) return wingPic;
    const W = LOOKS.wings[look.wings], lut = ramp([[0, hexRGB(W.rim)], [0.45, hexRGB(W.a)], [0.75, hexRGB(W.b)], [1, hexRGB(W.root)]]);
    const c = document.createElement('canvas'); c.width = wingImg.naturalWidth; c.height = wingImg.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(wingImg, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    let lo = 255, hi = 0;
    for (let o = 0; o < d.length; o += 4) if (d[o + 3] > 60) { const y = (d[o] * 77 + d[o + 1] * 150 + d[o + 2] * 29) >> 8; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    for (let o = 0; o < d.length; o += 4) {
      if (!d[o + 3]) continue;
      const y = (d[o] * 77 + d[o + 1] * 150 + d[o + 2] * 29) >> 8, t = Math.max(0, Math.min(255, Math.round((y - lo) * 255 / Math.max(1, hi - lo)))) * 3;
      d[o] = lut[t]; d[o + 1] = lut[t + 1]; d[o + 2] = lut[t + 2];
    }
    g.putImageData(id, 0, 0);
    wingPic = c; wingKey = look.wings;
    return c;
  }

  function choose(pose, face, blink) {
    const a = pose.action, arm = pose.armL;
    if (a === 'bored') return 'tedio';
    if (arm === 'wave') return 'acenando';
    if (arm === 'up') return 'espreguicando';
    if (arm === 'belly') return 'fome';
    if (arm === 'mouth' || face === 'yawn') return 'bocejo';
    if (a === 'doze' || (pose.sleepP || 0) > 0.5) return 'cochilo';
    if (Math.abs(pose.facing || 0) > 0.45) return 'lado';
    // pose parada: o rosto muda com a expressão (e pisca de vez em quando)
    if (face === 'sleep' || blink) return 'referencia_dormindo';
    if (face === 'tired') return 'referencia_cansada';
    if (face === 'bored') return 'referencia_entediada';
    if (face === 'sad') return 'referencia_triste';
    if (face === 'happy' && (animOn || a === 'giggle' || a === 'spin')) return 'referencia_feliz';
    return 'referencia';
  }

  // asas pintadas: meia asa esquerda, espelhada para a direita, batendo em volta da raiz
  function wings(g, cx, wy, pose, t, ws) {
    if (!wingImg || !meta.asa) return IllustratedRenderer.wings(g, cx, wy, pose, t, ws);
    const A = meta.asa, k = 26 * ws / A.w;         // meia asa com ~26 unidades de largura (adulta)
    const fc = Math.max(-1, Math.min(1, pose.facing || 0)), folded = (pose.sleepP || 0) > 0.6;
    const ph = pose.wing ?? t * 0.014, flap = folded ? 0 : Math.sin(ph);
    [[-1, 1 + (fc > 0 ? 0.12 : 0.3) * fc], [1, 1 - (fc < 0 ? 0.12 : 0.3) * fc]].forEach(([sd, persp]) => {
      g.save();
      g.translate(cx, wy); g.scale(sd * -1, 1);      // a imagem é a asa esquerda
      g.rotate(folded ? 0.55 : -0.08 + 0.16 * flap);
      g.scale(persp * (folded ? 0.55 : 0.78 + 0.22 * Math.cos(ph)), folded ? 0.8 : 1);
      g.globalAlpha = 0.88; g.imageSmoothingQuality = 'high';
      g.drawImage(wingsPic(), -A.rootX * k, -A.rootY * k, A.w * k, A.h * k);
      g.restore();
    });
  }

  function drawPose(g, name, cx, F, t, pose, alpha) {
    const im = pic(name), m = meta.poses[name];
    if (!im || !m) return null;
    const u = meta.unitsPerPx, w = m.w * u, h = m.h * u;
    const ax = (ANCHOR_X[name] != null ? ANCHOR_X[name] * m.w : m.footX) * u;
    const mirror = name.endsWith('lado') && (pose.facing || 0) < 0;
    const breathe = 1 + Math.sin(t * 0.0025) * 0.006;
    g.save(); g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.translate(cx, F); if (mirror) g.scale(-1, 1); g.scale(1, breathe);
    g.drawImage(im, -ax, -h, w, h);
    g.restore();
    return { w, h };
  }

  function fairy(g, stage, cx, F, face, t, blink, pose) {
    if (!meta || (stage !== 'adult' && stage !== 'baby')) return null;
    const P = stage === 'baby' ? 'bebe_' : '';
    let name = P + choose(pose, face, blink);
    if (!imgs[name]) name = P + 'referencia';
    if (!imgs[name]) return null;
    const now = t, isRef = n => (n || '').replace('bebe_', '').startsWith('referencia');
    const quick = isRef(name) && isRef(cur);           // troca de rosto é instantânea
    if (name !== cur) { prev = quick || (cur || '').startsWith('bebe_') !== !!P ? null : cur; cur = name; switchAt = now; }
    if (SIT[name]) F = SIT[name];
    const m = meta.poses[name], h = m.h * meta.unitsPerPx;
    const wAt = WING_AT[name] ?? (P ? WING_AT.bebe_ : WING_AT[name.split('_')[0]]) ?? 0.74;
    wings(g, cx, F - h * wAt, pose, t, P ? 0.68 : 1);
    const k = Math.min(1, (now - switchAt) / 160);     // troca suave entre poses
    if (prev && k < 1 && imgs[prev]) drawPose(g, prev, cx, SIT[prev] || F, t, pose, 1 - k);
    drawPose(g, name, cx, F, t, pose, k < 1 && prev ? k : 1);
    const top = F - h;
    return { hx: cx, hy: top + h * 0.12, F, top, cy: (top + F) / 2, side: cx + 30 <= 186 ? cx + 22 : cx - 22, star: null };
  }

  return {
    init(canvas) { load(); IllustratedRenderer.init(canvas); },
    draw(s, ui, now, pose) {
      animOn = !!(ui.anim && now - ui.anim.t0 < ui.anim.dur);
      look = lookOf(s);
      IllustratedRenderer.setFairy(fairy);
      try { IllustratedRenderer.draw(s, ui, now, pose); } finally { IllustratedRenderer.setFairy(null); }
    },
  };
})();
