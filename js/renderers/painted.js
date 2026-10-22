/* ---------- 3e. PAINTED RENDERER (arte pintada, protótipo) ----------
   Usa o cenário, a luz e os efeitos do IllustratedRenderer e troca só a
   fada: em vez de desenhar por código, escolhe a ilustração pintada da
   pose do momento (assets/fada/*.webp, gerada por tools/process_art.py).
   As asas continuam por código e batem atrás da pintura.
   Enquanto não há arte da bebê, ela usa a fada do Ilustrado.            */
const PaintedRenderer = (() => {
  const imgs = {};
  let meta = null, failed = false, cur = null, prev = null, switchAt = 0;
  // onde ficam as costas (raiz das asas), em fração da altura a partir dos pés
  const WING_AT = { tedio: 0.62, lado: 0.7, espreguicando: 0.68 };
  const ANCHOR_X = { lado: 0.6 };

  function load() {
    if (meta || failed) return;
    const inline = window.PAINTED_INLINE;
    const use = m => {
      meta = m;
      Object.keys(m.poses).forEach(n => {
        const im = new Image();
        im.onload = () => { imgs[n] = im; };
        im.src = inline ? inline.imgs[n] : `assets/fada/${n}.webp`;
      });
    };
    if (inline) return use(inline.meta);
    fetch('assets/fada/fada.json').then(r => r.json()).then(use).catch(() => { failed = true; });
  }

  function choose(pose, face) {
    const a = pose.action, arm = pose.armL;
    if (a === 'bored') return 'tedio';
    if (arm === 'wave') return 'acenando';
    if (arm === 'up') return 'espreguicando';
    if (arm === 'belly') return 'fome';
    if (arm === 'mouth' || face === 'yawn') return 'bocejo';
    if (face === 'sleep' || face === 'tired' || a === 'doze') return 'cochilo';
    if (Math.abs(pose.facing || 0) > 0.45) return 'lado';
    return 'referencia';
  }

  function drawPose(g, name, cx, F, t, pose, alpha) {
    const im = imgs[name], m = meta.poses[name];
    if (!im || !m) return null;
    const u = meta.unitsPerPx, w = m.w * u, h = m.h * u;
    const ax = (ANCHOR_X[name] != null ? ANCHOR_X[name] * m.w : m.footX) * u;
    const mirror = name === 'lado' && (pose.facing || 0) < 0;
    const breathe = 1 + Math.sin(t * 0.0025) * 0.006;
    g.save(); g.globalAlpha = alpha;
    g.translate(cx, F); if (mirror) g.scale(-1, 1); g.scale(1, breathe);
    g.drawImage(im, -ax, -h, w, h);
    g.restore();
    return { w, h };
  }

  function fairy(g, stage, cx, F, face, t, blink, pose) {
    if (stage !== 'adult' || !meta) return null;
    let name = choose(pose, face);
    if (!imgs[name]) name = 'referencia';
    if (!imgs[name]) return null;
    const now = t;
    if (name !== cur) { prev = cur; cur = name; switchAt = now; }
    if (name === 'tedio') F = 100.5;                   // sentada no chão
    const m = meta.poses[name], h = m.h * meta.unitsPerPx;
    IllustratedRenderer.wings(g, cx, F - h * (WING_AT[name] || 0.74), pose, t, 1);
    const k = Math.min(1, (now - switchAt) / 160);     // troca suave entre poses
    if (prev && k < 1 && imgs[prev]) drawPose(g, prev, cx, prev === 'tedio' ? 100.5 : F, t, pose, 1 - k);
    drawPose(g, name, cx, F, t, pose, k < 1 && prev ? k : 1);
    const top = F - h;
    return { hx: cx, hy: top + h * 0.12, F, top, cy: (top + F) / 2, side: cx + 30 <= 186 ? cx + 22 : cx - 22, star: null };
  }

  return {
    init(canvas) { load(); IllustratedRenderer.init(canvas); },
    draw(s, ui, now, pose) {
      IllustratedRenderer.setFairy(fairy);
      try { IllustratedRenderer.draw(s, ui, now, pose); } finally { IllustratedRenderer.setFairy(null); }
    },
  };
})();
