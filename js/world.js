/* ---------- 2b. WORLD (mapa do cenário, em coordenadas normalizadas) ----------
   x: 0 = borda esquerda · 1 = borda direita.  y: 0 = topo · 1 = base da tela.
   O Behavior usa o mapa para saber aonde ir; os renderers desenham tudo
   nesses mesmos lugares. Um visual novo só precisa respeitar o mapa.     */
const World = {
  house: { x: 0.115, door: 0.105 },
  flowers: [46, 57, 71, 88, 103, 121, 137, 153, 176, 188].map(x => x / 192),
  walk(s) { return { min: 0.28, max: 0.88 - s.poops * 0.083 }; },
  butterfly(i, t) {
    return { x: (112 + 58 * Math.sin(t * 0.00035 + i * 2.4)) / 192, y: (46 + 14 * Math.sin(t * 0.0009 + i * 1.3) + 3 * Math.sin(t * 0.004 + i)) / 120 };
  },
  firefly(i, t) {
    const x = ((i * 29 + 30 + 18 * Math.sin(t * 0.0005 + i)) % 192 + 192) % 192;
    return { x: x / 192, y: (64 + 13 * Math.sin(t * 0.0007 + i * 2.1) + (i % 3) * 6) / 120, pulse: (Math.sin(t * 0.004 + i * 1.9) + 1) / 2 };
  },
  phase(h) { return (h >= 21 || h < 5.5) ? 'night' : h >= 18 ? 'dusk' : h < 8 ? 'dawn' : 'day'; },
};

