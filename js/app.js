/* ---------- APP (PWA: instalação, offline e atualizações) ----------
   Só liga quando a página tem o manifesto (GitHub Pages / app instalado).
   No artifact do Claude o build remove o manifesto e isto fica desligado. */
const App = (() => {
  const hasManifest = !!document.querySelector('link[rel="manifest"]');
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const enabled = hasManifest && secure && 'serviceWorker' in navigator;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installEvt = null;

  function info() {
    const el = $('appInfo'); if (!el) return;
    let t = `Versão ${APP_VERSION}. `;
    if (!hasManifest) t += 'Para instalar no celular, abra o Fadagotchi pelo endereço do GitHub Pages.';
    else if (standalone()) t += 'Rodando como app instalado. Funciona sem internet.';
    else if (installEvt) t += 'Dá pra instalar na tela inicial e jogar em tela cheia, até sem internet.';
    else if (ios) t += 'Para instalar: no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".';
    else t += 'Para instalar: no menu do navegador, escolha "Instalar app" ou "Adicionar à tela inicial".';
    el.textContent = t;
    $('installBtn').hidden = !installEvt || standalone();
  }

  function showUpdate(worker) {
    if (!worker) return;
    $('updateBar').hidden = false;
    $('updateBtn').onclick = () => { $('updateBtn').disabled = true; $('updateBtn').textContent = 'Atualizando…'; worker.postMessage('skipWaiting'); };
  }

  function init() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; info(); });
    window.addEventListener('appinstalled', () => { installEvt = null; info(); say('Fadagotchi instalado! Agora ela mora na sua tela inicial.', 6000); });
    $('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; info(); };
    info();
    if (!enabled) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
      });
      const check = () => reg.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(() => {});
    // só recarrega em atualização (na primeira instalação já estamos na versão nova)
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true; try { save(); } catch (e) {}
      location.reload();
    });
  }
  return { init, info, enabled, standalone };
})();
