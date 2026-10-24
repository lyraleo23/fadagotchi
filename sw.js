/* Service worker do Fadagotchi: guarda o app para funcionar offline.
   Ao publicar uma versão nova, suba VERSION (igual a js/version.js). */
const VERSION = '1.8.1';
const CACHE = 'fadagotchi-' + VERSION;
const FONTS = 'fadagotchi-fonts';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/version.js', 'js/sprites.js', 'js/core.js', 'js/looks.js', 'js/accessories.js', 'js/world.js',
  'js/behavior.js', 'js/faces.js', 'js/renderers/lcd.js', 'js/renderers/pixel.js', 'js/renderers/smooth.js', 'js/renderers/illustrated.js', 'js/renderers/painted.js',
  'assets/fada/fada.json', 'assets/fada/referencia.webp', 'assets/fada/acenando.webp', 'assets/fada/espreguicando.webp', 'assets/fada/fome.webp', 'assets/fada/bocejo.webp', 'assets/fada/cochilo.webp', 'assets/fada/tedio.webp', 'assets/fada/lado.webp', 'assets/fada/asa.webp',
  'assets/fada/referencia.mask.png', 'assets/fada/acenando.mask.png', 'assets/fada/espreguicando.mask.png', 'assets/fada/fome.mask.png', 'assets/fada/bocejo.mask.png', 'assets/fada/cochilo.mask.png', 'assets/fada/tedio.mask.png', 'assets/fada/lado.mask.png', 'assets/fada/referencia_feliz.mask.png', 'assets/fada/referencia_triste.mask.png', 'assets/fada/referencia_dormindo.mask.png', 'assets/fada/referencia_cansada.mask.png', 'assets/fada/referencia_entediada.mask.png', 'assets/fada/bebe_referencia.mask.png', 'assets/fada/bebe_acenando.mask.png', 'assets/fada/bebe_espreguicando.mask.png', 'assets/fada/bebe_fome.mask.png', 'assets/fada/bebe_bocejo.mask.png', 'assets/fada/bebe_cochilo.mask.png', 'assets/fada/bebe_tedio.mask.png', 'assets/fada/bebe_lado.mask.png', 'assets/fada/bebe_referencia_feliz.mask.png', 'assets/fada/bebe_referencia_triste.mask.png', 'assets/fada/bebe_referencia_dormindo.mask.png', 'assets/fada/bebe_referencia_cansada.mask.png', 'assets/fada/bebe_referencia_entediada.mask.png', 'assets/fada/referencia_feliz.webp', 'assets/fada/referencia_triste.webp', 'assets/fada/referencia_dormindo.webp', 'assets/fada/referencia_cansada.webp', 'assets/fada/referencia_entediada.webp',
  'assets/fada/bebe_referencia.webp', 'assets/fada/bebe_acenando.webp', 'assets/fada/bebe_espreguicando.webp', 'assets/fada/bebe_fome.webp', 'assets/fada/bebe_bocejo.webp', 'assets/fada/bebe_cochilo.webp', 'assets/fada/bebe_tedio.webp', 'assets/fada/bebe_lado.webp',
  'assets/fada/bebe_referencia_feliz.webp', 'assets/fada/bebe_referencia_triste.webp', 'assets/fada/bebe_referencia_dormindo.webp', 'assets/fada/bebe_referencia_cansada.webp', 'assets/fada/bebe_referencia_entediada.webp',
  'js/backup.js', 'js/app.js', 'js/ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fadagotchi-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // app: primeiro o que está guardado (funciona offline); o resto vem da rede e é guardado
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
    );
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // fontes do Google: guardadas na primeira vez
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
  }
});
