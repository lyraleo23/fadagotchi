/* ---------- BACKUP (exportar / importar a fada) ----------
   Formato: "FADA1:" + JSON do estado em base64 (UTF-8). O arquivo .json
   baixado contém o mesmo JSON puro; os dois são aceitos na importação.  */
const Backup = (() => {
  const PREFIX = 'FADA1:';
  const encode = st => PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(st))));
  function decode(text) {
    text = (text || '').trim();
    if (!text) throw new Error('vazio');
    let json = text;
    if (text.startsWith(PREFIX)) json = decodeURIComponent(escape(atob(text.slice(PREFIX.length).replace(/\s+/g, ''))));
    const o = JSON.parse(json);
    if (!o || o.v !== 1 || typeof o.simTime !== 'number' || !['bud', 'baby', 'adult'].includes(o.stage)) throw new Error('formato');
    return o;
  }
  const slug = n => (n || 'fada').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const STAGE = { bud: 'botão de flor', baby: 'fadinha bebê', adult: 'fada adulta' };

  let pending = null;
  function msg(text, kind = '') { const m = $('bkMsg'); m.textContent = text; m.className = 'small ' + kind; }
  function resetImport() {
    pending = null; $('bkInput').value = ''; $('bkFileIn').value = ''; msg('');
    $('bkActions').innerHTML = '<button class="ghost" id="bkCheck">Conferir</button><button class="ghost" id="bkCancel">Cancelar</button>';
    $('bkCheck').onclick = check; $('bkCancel').onclick = close;
  }
  function close() { $('bkPanel').hidden = true; resetImport(); }
  function check() {
    try {
      pending = decode($('bkInput').value);
      const lk = lookOf(pending), age = fmtAge(pending.ageMin || 0);
      msg(`Encontrei ${pending.name || 'uma fada'}: ${STAGE[pending.stage]}, ${age} de vida, cabelo ${LOOKS.hair[lk.hair].label.toLowerCase()}. Ela vai substituir ${s.name}, que está aqui agora.`, 'ok');
      $('bkActions').innerHTML = `<button class="ghost danger" id="bkDo">Trocar por ${pending.name || 'ela'}</button><button class="ghost" id="bkCancel">Cancelar</button>`;
      $('bkDo').onclick = apply; $('bkCancel').onclick = close;
    } catch (e) {
      pending = null;
      msg('Esse código não parece ser de uma fada. Confira se copiou ele inteiro, começando por FADA1:.', 'err');
    }
  }
  function apply() {
    if (!pending) return;
    const keep = { speed: 1, sound: s.sound, skin: s.skin };
    s = Object.assign(newState(), pending, keep);
    if (!s.look) s.look = { ...DEFAULT_LOOK };
    s.skinV = 3; s.simOffset = 0;
    if (s.simTime > Date.now()) s.simTime = Date.now();
    logEv(`${s.name} chegou de outro aparelho.`);
    ui.view = 'main'; ui.sel = -1; ui.anim = null;
    Behavior.reset(s); setSkin(); renderLooks(); save();
    close(); syncClock(); render();
    say(`${s.name} chegou! Ela viveu o tempo da viagem e já está aqui.`, 7000);
  }
  async function copy() {
    const code = encode(s);
    $('bkCode').value = code; $('bkExport').hidden = false;
    try { await navigator.clipboard.writeText(code); say('Código da fada copiado. Cole em Importar no outro aparelho.'); }
    catch (e) { $('bkCode').focus(); $('bkCode').select(); say('Selecionei o código: copie e cole em Importar no outro aparelho.'); }
    render();
  }
  function download() {
    const blob = new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fadagotchi-${slug(s.name)}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function setup() {
    $('bkCopy').onclick = copy;
    $('bkImport').onclick = () => { $('bkPanel').hidden = false; resetImport(); $('bkInput').focus(); };
    $('bkFileIn').onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { $('bkInput').value = String(r.result || ''); check(); };
      r.readAsText(f);
    };
    // baixar arquivo só fora do Claude (lá o download é bloqueado)
    if (document.querySelector('link[rel="manifest"]')) { $('bkFile').hidden = false; $('bkFile').onclick = download; }
    resetImport();
  }
  return { encode, decode, setup };
})();
