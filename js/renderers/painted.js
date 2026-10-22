/* ---------- 3e. PAINTED RENDERER (arte pintada, protótipo) ----------
   Usa o cenário, a luz e os efeitos do IllustratedRenderer e troca só a
   fada: em vez de desenhar por código, escolhe a ilustração pintada da
   pose do momento (assets/fada/*.webp, gerada por tools/process_art.py).
   Na pose parada o rosto muda com a expressão e pisca. As asas pintadas
   (uma meia asa espelhada) batem atrás da pintura.
   Enquanto não há arte da bebê, ela usa a fada do Ilustrado.            */
const PaintedRenderer = (() => {
  const imgs = {};
  let meta = null, failed = false, cur = null, prev = null, switchAt = 0, wingImg = null, animOn = false;
  // onde ficam as costas (raiz das asas), em fração da altura a partir dos pés
  const WING_AT = { tedio: 0.62, lado: 0.7, espreguicando: 0.68 };
  const ANCHOR_X = { lado: 0.6 };

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
      });
    };
    if (inline) return use(inline.meta);
    fetch('assets/fada/fada.json').then(r => r.json()).then(use).catch(() => { failed = true; });
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
  function wings(g, cx, wy, pose, t) {
    if (!wingImg || !meta.asa) return IllustratedRenderer.wings(g, cx, wy, pose, t, 1);
    const A = meta.asa, k = 26 / A.w;              // meia asa com ~26 unidades de largura
    const fc = Math.max(-1, Math.min(1, pose.facing || 0)), folded = (pose.sleepP || 0) > 0.6;
    const ph = pose.wing ?? t * 0.014, flap = folded ? 0 : Math.sin(ph);
    [[-1, 1 + (fc > 0 ? 0.12 : 0.3) * fc], [1, 1 - (fc < 0 ? 0.12 : 0.3) * fc]].forEach(([sd, persp]) => {
      g.save();
      g.translate(cx, wy); g.scale(sd * -1, 1);      // a imagem é a asa esquerda
      g.rotate(folded ? 0.55 : -0.08 + 0.16 * flap);
      g.scale(persp * (folded ? 0.55 : 0.78 + 0.22 * Math.cos(ph)), folded ? 0.8 : 1);
      g.globalAlpha = 0.88;
      g.drawImage(wingImg, -A.rootX * k, -A.rootY * k, A.w * k, A.h * k);
      g.restore();
    });
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
    let name = choose(pose, face, blink);
    if (!imgs[name]) name = 'referencia';
    if (!imgs[name]) return null;
    const now = t;
    const quick = name.startsWith('referencia') && (cur || '').startsWith('referencia');   // troca de rosto é instantânea
    if (name !== cur) { prev = quick ? null : cur; cur = name; switchAt = now; }
    if (name === 'tedio') F = 100.5;                   // sentada no chão
    const m = meta.poses[name], h = m.h * meta.unitsPerPx;
    wings(g, cx, F - h * (WING_AT[name.split('_')[0]] || 0.74), pose, t);
    const k = Math.min(1, (now - switchAt) / 160);     // troca suave entre poses
    if (prev && k < 1 && imgs[prev]) drawPose(g, prev, cx, prev === 'tedio' ? 100.5 : F, t, pose, 1 - k);
    drawPose(g, name, cx, F, t, pose, k < 1 && prev ? k : 1);
    const top = F - h;
    return { hx: cx, hy: top + h * 0.12, F, top, cy: (top + F) / 2, side: cx + 30 <= 186 ? cx + 22 : cx - 22, star: null };
  }

  return {
    init(canvas) { load(); IllustratedRenderer.init(canvas); },
    draw(s, ui, now, pose) {
      animOn = !!(ui.anim && now - ui.anim.t0 < ui.anim.dur);
      IllustratedRenderer.setFairy(fairy);
      try { IllustratedRenderer.draw(s, ui, now, pose); } finally { IllustratedRenderer.setFairy(null); }
    },
  };
})();
