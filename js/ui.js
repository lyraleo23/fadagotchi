/* ---------- 4. UI ---------- */
const SAVE_KEY = 'fadagotchi-v1';
const ACTS = [
  { id: 'food', label: 'Comida' }, { id: 'pet', label: 'Carinho' }, { id: 'play', label: 'Brincar' }, { id: 'toilet', label: 'Banheiro' },
  { id: 'bath', label: 'Banho' }, { id: 'light', label: 'Luz' }, { id: 'med', label: 'Poção' }, { id: 'status', label: 'Status' },
];
const BAR_DEF = [
  { k: 'hunger', lbl: 'Barriga', sub: 'cheia ou com fome' },
  { k: 'affection', lbl: 'Carinho' },
  { k: 'fun', lbl: 'Diversão' },
  { k: 'bladder', lbl: 'Banheiro', sub: 'cai quando dá vontade', inv: true },
  { k: 'hygiene', lbl: 'Higiene' },
  { k: 'energy', lbl: 'Energia' },
  { k: 'health', lbl: 'Saúde' },
];

let s, R;
const ui = { view: 'main', sel: -1, page: 0, foodIdx: 0, game: null, anim: null, msg: '', msgUntil: 0, lastAlert: false, confirmReset: false };
const $ = id => document.getElementById(id);

function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const o = JSON.parse(raw); if (o && o.v === 1) return Object.assign(newState(), o); } } catch (e) {}
  return null;
}
function save() { try { s.lastReal = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }

const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function logEv(text) { s.log.unshift({ t: s.simTime, text }); s.log = s.log.slice(0, 8); }
function say(text, ms = 4500) { ui.msg = text; ui.msgUntil = performance.now() + ms; }
function anim(type, dur, extra = {}) { ui.anim = Object.assign({ type, t0: performance.now(), dur }, extra); }
let catchingUp = false;
Core.emit = (ev, data) => {
  const n = s.name;
  const map = {
    hatch: (() => { const l = lookOf(s); return `O botão de flor abriu! ${n} nasceu com cabelo ${LOOKS.hair[l.hair].label.toLowerCase()} e asas ${LOOKS.wings[l.wings].label.toLowerCase()}.`; })(),
    grow: `${n} cresceu e virou uma fada adulta!`,
    sleep: `${n} pegou no sono.`,
    wake: `${n} acordou.`,
    accident: `${n} não aguentou e fez sujeira no chão.`,
    sick: `${n} ficou doente.`,
    gone: `${n} voltou para a floresta.`,
    unlock: data ? `${n} foi tão bem cuidada que ganhou: ${data.label}!` : '',
  };
  logEv(map[ev]);
  if (!catchingUp) {
    say(map[ev]);
    if (ev === 'hatch' || ev === 'grow') anim(ev, 3000);
    if (ev === 'unlock') { anim('gift', 3200); say(map[ev], 7000); beep(1046, .08, 3); }
    if (ev === 'accident') anim('accident', 2500);
    if (ev === 'sick' || ev === 'accident') beep(330, .15, 2);
  }
};

function refuse(text) { anim('refuse', 1500); say(text); beep(200, .12); }

function act(id) {
  if (s.gone) return;
  if (s.stage === 'bud') { say('Ainda é um botão de flor. Espere ele abrir.'); return render(); }
  if (s.asleep && id !== 'light' && id !== 'status') { say(`${s.name} está dormindo. Shhh.`); return render(); }
  const n = s.name;
  beep(880, .04);
  switch (id) {
    case 'food': ui.view = 'food'; ui.foodIdx = 0; say('Refeição ou doce?', 60000); break;
    case 'pet':
      s.affection = cl(s.affection + 25); s.fun = cl(s.fun + 3);
      anim('pet', 2200); say(`${n} adorou o carinho.`); break;
    case 'play':
      if (s.sick) { refuse(`${n} está doente demais pra brincar.`); break; }
      if (s.energy < 15) { refuse(`${n} está cansada demais pra brincar.`); break; }
      ui.view = 'game'; ui.game = { phase: 'ask', results: [], guess: null, dir: null, t0: 0 };
      say('Pra que lado ela vai voar? Use ◀ ou ▶.', 60000); break;
    case 'toilet':
      if (s.bladder < 30) { refuse('Não estou com vontade agora.'); break; }
      s.bladder = 0; s.affection = cl(s.affection + 4); s.hygiene = cl(s.hygiene - 10);
      anim('toilet', 2400); say(`Muito bem! ${n} foi no banheirinho. Um banho depois cai bem.`); logEv(`${n} usou o banheiro.`); break;
    case 'bath': {
      const had = s.poops; s.hygiene = 100; s.poops = 0;
      anim('bath', 2000); say(had ? 'Sujeira lavada, tudo limpinho!' : `${n} tomou banho e está cheirosa.`); break;
    }
    case 'light':
      s.lightsOff = !s.lightsOff;
      // de dia, acender a luz acorda a fada (à noite ela continua dormindo)
      if (!s.lightsOff && s.asleep && !Core.isNight(s)) {
        s.asleep = false; logEv(`${n} acordou com a luz.`);
        if (s.energy < 40) { s.fun = cl(s.fun - 5); say(`${n} acordou, mas ainda está com soninho.`); }
        else say(`Bom dia! ${n} acordou.`);
        break;
      }
      if (s.lightsOff) say(s.asleep ? 'Luz apagada. Bom sono.' : (s.energy < 60 ? 'Luz apagada. Ela vai cochilar.' : 'Luz apagada, mas ela ainda não está com sono.'));
      else say(s.asleep ? 'Luz acesa. À noite ela continua dormindo, e com luz descansa pior.' : 'Luz acesa.');
      break;
    case 'med':
      // cura a doença ou recupera a saúde baixa (com a saúde boa, não precisa)
      if (!s.sick && s.health >= 70) { refuse(`${n} está com a saúde boa. Poção só quando precisar.`); break; }
      if (s.sick) {
        s.sick = false; s.health = cl(s.health + 20);
        say('Poção tomada. Já está melhorando!'); logEv(`${n} tomou poção e sarou.`);
      } else {
        s.health = cl(s.health + 30);
        say(`Poção tomada. ${n} recuperou as forças!`); logEv(`${n} tomou poção pra recuperar a saúde.`);
      }
      s.fun = cl(s.fun - 5); anim('med', 2200); break;
    case 'status': ui.view = 'status'; ui.page = 0; say('◀ ▶ passam a página. ✓ ou ✕ fecha.', 60000); break;
  }
  render();
}

function feed(kind) {
  const n = s.name;
  ui.view = 'main';
  if (kind === 'meal') {
    if (s.hunger >= 95) { refuse('Estou cheia!'); return render(); }
    s.hunger = cl(s.hunger + 35); s.bladder = cl(s.bladder + 25);
    anim('eat', 2400, { item: 'meal' }); say(`Nhac! ${n} comeu a refeição.`);
  } else {
    s.hunger = cl(s.hunger + 8); s.fun = cl(s.fun + 15); s.bladder = cl(s.bladder + 8); s.sweets.push(s.simTime);
    anim('eat', 2000, { item: 'candy' });
    if (s.sweets.length > 3) { s.health = cl(s.health - 8); say('Doce demais faz mal pra barriga...'); }
    else say(`${n} amou o docinho.`);
  }
  render();
}

function gameGuess(g) {
  const game = ui.game;
  if (!game || game.phase !== 'ask') return;
  game.guess = g; game.dir = Math.random() < .5 ? 'L' : 'R';
  game.phase = 'show'; game.t0 = performance.now();
  const win = g === game.dir;
  game.results.push(win);
  beep(win ? 1046 : 220, .1);
  say(win ? 'Acertou!' : 'Errou...', 60000);
  render();
}
function gameTick(now) {
  const g = ui.game;
  if (!g || g.phase !== 'show' || now - g.t0 < 1300) return;
  if (g.results.length >= 5) {
    const wins = g.results.filter(Boolean).length;
    s.fun = cl(s.fun + 10 + wins * 8); s.energy = cl(s.energy - 6); s.hunger = cl(s.hunger - 4);
    ui.view = 'main'; ui.game = null;
    anim(wins >= 3 ? 'win' : 'lose', 2500);
    if (wins >= 3) setTimeout(() => Behavior.play('spin'), 2500);
    say(wins >= 3 ? `${wins} de 5! ${s.name} se divertiu muito.` : `${wins} de 5. Mesmo assim foi divertido.`);
    logEv(`Brincaram de adivinhar: ${wins} de 5.`);
  } else { g.phase = 'ask'; say('De novo! Pra que lado?', 60000); }
  render();
}

function pressLeft() {
  beep(660, .03);
  if (ui.view === 'game') return gameGuess('L');
  if (ui.view === 'food') { ui.foodIdx = 1 - ui.foodIdx; return render(); }
  if (ui.view === 'status') { ui.page = (ui.page + STATUS_PAGES.length - 1) % STATUS_PAGES.length; return render(); }
  ui.sel = ui.sel <= 0 ? ACTS.length - 1 : ui.sel - 1; render();
}
function pressRight() {
  beep(660, .03);
  if (ui.view === 'game') return gameGuess('R');
  if (ui.view === 'food') { ui.foodIdx = 1 - ui.foodIdx; return render(); }
  if (ui.view === 'status') { ui.page = (ui.page + 1) % STATUS_PAGES.length; return render(); }
  ui.sel = (ui.sel + 1) % ACTS.length; render();
}
function pressOk() {
  if (ui.view === 'game') return;
  if (ui.view === 'food') return feed(ui.foodIdx === 0 ? 'meal' : 'candy');
  if (ui.view === 'status') { ui.view = 'main'; ui.msgUntil = 0; return render(); }
  if (ui.sel >= 0) return act(ACTS[ui.sel].id);
  beep(660, .03); ui.sel = 0; render();
}
function pressCancel() {
  beep(520, .03);
  if (ui.view === 'game') {
    ui.view = 'main'; ui.game = null; say('Vocês pararam de brincar.');
    return render();
  }
  if (ui.view !== 'main') { ui.view = 'main'; ui.msgUntil = 0; return render(); }
  ui.sel = -1; render();
}

/* som */
let actx = null;
function beep(freq, dur = .08, times = 1) {
  if (!s || !s.sound || !actx) return;
  for (let i = 0; i < times; i++) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = freq; g.gain.value = .05;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime + i * (dur + .06);
    o.start(t); o.stop(t + dur);
  }
}

/* ficha e ícones */
function drawIcon(canvas, sp, color) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 8, 8); c.fillStyle = color;
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) if (sp.d[y * sp.w + x]) c.fillRect(x, y, 1, 1);
}
function buildPanel() {
  $('bars').innerHTML = BAR_DEF.map(b => `
    <li class="bar"><span class="lbl">${b.lbl}${b.sub ? `<small>${b.sub}</small>` : ''}</span>
    <div class="track"><div class="fill" id="f-${b.k}"></div></div><span class="val" id="v-${b.k}"></span></li>`).join('');
  const mk = (row, list) => {
    $(row).innerHTML = '';
    list.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'ico'; btn.dataset.act = a.id; btn.title = a.label; btn.setAttribute('aria-label', a.label);
      const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8; btn.appendChild(cv);
      drawIcon(cv, ICON[a.id], '#2b2236');
      btn.addEventListener('click', () => { ui.sel = ACTS.indexOf(a); ui.view = 'main'; act(a.id); });
      btn.addEventListener('mouseenter', () => { ui.hover = a.label; render(); });
      btn.addEventListener('mouseleave', () => { ui.hover = null; render(); });
      $(row).appendChild(btn);
    });
  };
  mk('iconsTop', ACTS.slice(0, 4)); mk('iconsBottom', ACTS.slice(4));
}

const hex = c => '#' + c.toString(16).padStart(6, '0');
function swatchBg(part, opt) {
  if (part === 'eyes') return `radial-gradient(circle at 50% 55%, ${hex(opt.pupil)} 0 22%, ${hex(opt.iris[2])} 24% 60%, ${hex(opt.iris[4])} 62%)`;
  if (part === 'wings') return `linear-gradient(135deg, ${hex(opt.root)}, ${hex(opt.a)} 45%, ${hex(opt.b)})`;
  return `linear-gradient(135deg, ${hex(opt.tones[0])}, ${hex(opt.tones[1])} 50%, ${hex(opt.tones[2])})`;
}
function buildLooks() {
  $('looks').innerHTML = LOOK_PARTS.map(([part, name]) => `
    <div class="look-row"><span class="lbl">${name}<small id="ln-${part}"></small></span>
      <div class="swatches" role="radiogroup" aria-label="${name}">
        ${Object.entries(LOOKS[part]).map(([k, o]) => `<button class="sw" role="radio" data-part="${part}" data-k="${k}" title="${o.label}" aria-label="${name}: ${o.label}" style="background:${swatchBg(part, o)}"></button>`).join('')}
      </div></div>`).join('');
  $('looks').querySelectorAll('.sw').forEach(b => b.onclick = () => setLook({ ...lookOf(s), [b.dataset.part]: b.dataset.k }));
  $('lookRandom').onclick = () => setLook(randomLook());
  renderLooks();
}
function setLook(l) {
  s.look = l; save(); renderLooks();
  if (Behavior.state.routine && Behavior.state.routine.phase === 'inside') say(`${s.name} está dormindo na casinha. A roupa nova aparece quando ela sair.`);
  else if (s.stage === 'bud') say('O botão de flor já mudou de cor. O resto aparece quando ela nascer.');
  else say(`${s.name} adorou o visual novo!`);
  render();
}
function renderLooks() {
  const l = lookOf(s);
  $('looks').querySelectorAll('.sw').forEach(b => { const on = l[b.dataset.part] === b.dataset.k; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  for (const [part] of LOOK_PARTS) $('ln-' + part).textContent = LOOKS[part][l[part]].label;
}

const fmtH = h => h >= 10 ? `${Math.floor(h)} h` : h >= 1 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(h * 60)} min`;
let accKey = '';
function renderAccs() {
  const next = ACCESSORIES.find(a => !s.unlocked.includes(a.id));
  const prev = [...ACCESSORIES].reverse().find(a => s.unlocked.includes(a.id));
  $('careMeta').textContent = `${fmtH(s.care)} bem cuidada` + (next ? ` · próximo em ${fmtH(next.hours - s.care)}` : ' · coleção completa');
  const lo = prev ? prev.hours : 0, hi = next ? next.hours : lo || 1;
  $('careFill').style.width = (next ? Math.min(100, (s.care - lo) / (hi - lo) * 100) : 100).toFixed(1) + '%';
  const w = wearOf(s), key = JSON.stringify([s.unlocked, w]);
  if (key === accKey) return;
  accKey = key;
  $('accs').innerHTML = ACCESSORIES.map(a => s.unlocked.includes(a.id)
    ? `<button class="acc" data-id="${a.id}" aria-pressed="${w[a.slot] === a.id}">${a.label}</button>`
    : `<span class="acc locked" title="Libera com ${a.hours} h bem cuidada">${a.label} · ${a.hours} h</span>`).join('');
  $('accs').querySelectorAll('button.acc').forEach(b => b.onclick = () => {
    const a = ACCESSORIES.find(x => x.id === b.dataset.id), cur = wearOf(s);
    s.wear = Object.assign({}, cur, { [a.slot]: cur[a.slot] === a.id ? null : a.id });
    say(s.wear[a.slot] ? `${s.name} colocou: ${a.label}.` : `${s.name} tirou: ${a.label}.`);
    save(); render();
  });
}

function fmtAge(min) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.floor(min % 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m} min`;
}
const STAGE_LABEL = { bud: 'Botão de flor', baby: 'Fadinha bebê', adult: 'Fada adulta' };

function sectionLabel() {
  if (ui.view === 'food') return ['Comida', ui.foodIdx === 0 ? 'Refeição' : 'Doce'];
  if (ui.view === 'status') { const p = STATUS_PAGES[ui.page]; return ['Status · ' + p.label, `${ui.page + 1}/${STATUS_PAGES.length}`]; }
  if (ui.view === 'game') return ['Brincar', `rodada ${Math.min(5, ui.game.results.length + (ui.game.phase === 'ask' ? 1 : 0))}/5`];
  if (ui.hover) return [ui.hover, ''];
  if (ui.sel >= 0) return [ACTS[ui.sel].label, '✓ confirma'];
  return [s.name, hhmm(s.simTime)];
}

function render() {
  document.querySelectorAll('.ico').forEach(b => b.classList.toggle('on', ACTS[ui.sel] && b.dataset.act === ACTS[ui.sel].id));
  const [secName, secInfo] = sectionLabel();
  $('secName').textContent = secName; $('secInfo').textContent = secInfo;

  const needs = Core.needs(s);
  const alertOn = needs.length > 0;
  $('alert').classList.toggle('on', alertOn);
  if (alertOn && !ui.lastAlert) beep(1200, .08, 3);
  ui.lastAlert = alertOn;

  const n = s.name;
  let cap;
  if (performance.now() < ui.msgUntil) cap = ui.msg;
  else if (s.gone) cap = `${n} voltou para a floresta.`;
  else if (s.stage === 'bud') cap = 'Um botão de flor. Algo se mexe lá dentro...';
  else if (needs.length) cap = `${n} ${needs[0]}.`;
  else if (s.asleep) cap = !Core.isNight(s) ? `${n} está tirando um cochilo. Acenda a luz pra acordar.` : s.lightsOff ? 'Zzz… dormindo.' : 'Zzz… dormindo, mas a luz está acesa.';
  else cap = { happy: `${n} está feliz, voando por aí.`, neutral: `${n} está tranquila.`, sad: `${n} não parece bem.` }[Core.mood(s)];
  $('caption').textContent = cap;

  const ch = $('choices');
  if (ui.view === 'food') {
    if (ch.hidden || !ch.querySelector('[data-k]')) {
      ch.innerHTML = '<button class="chip-btn" data-k="meal">Refeição</button><button class="chip-btn" data-k="candy">Doce</button>';
      ch.querySelectorAll('button').forEach(b => b.onclick = () => feed(b.dataset.k));
      ch.hidden = false;
    }
  } else if (ui.view === 'game') {
    if (ch.hidden || !ch.querySelector('[data-g]')) {
      ch.innerHTML = '<button class="chip-btn" data-g="L">◀ Esquerda</button><button class="chip-btn" data-g="R">Direita ▶</button>';
      ch.querySelectorAll('button').forEach(b => b.onclick = () => gameGuess(b.dataset.g));
      ch.hidden = false;
    }
  } else if (!ch.hidden) { ch.hidden = true; ch.innerHTML = ''; }

  if (document.activeElement !== $('nome')) $('nome').value = n;
  $('meta').textContent = `${STAGE_LABEL[s.stage]} · ${fmtAge(s.ageMin)} · ${hhmm(s.simTime)}`;
  const tags = [];
  if (s.gone) tags.push(['crit', 'foi embora']);
  if (s.sick) tags.push(['crit', 'doente']);
  else if (!s.gone && s.stage !== 'bud' && s.health < 30) tags.push(['crit', 'fraquinha']);
  if (s.asleep) tags.push(['', 'dormindo']);
  if (s.lightsOff) tags.push(['', 'luz apagada']);
  if (s.poops) tags.push(['warn', s.poops === 1 ? '1 sujeira no chão' : `${s.poops} sujeiras no chão`]);
  if (!tags.length && s.stage !== 'bud') tags.push(['ok', 'tudo em ordem']);
  $('tags').innerHTML = tags.map(([c, t]) => `<span class="tag ${c}">${t}</span>`).join('');

  for (const b of BAR_DEF) {
    const v = b.inv ? 100 - s[b.k] : s[b.k];   // todas as barras: 100 = tudo certo
    const f = $('f-' + b.k);
    f.style.width = v.toFixed(0) + '%';
    f.className = 'fill' + (v < 25 ? ' crit' : v < 50 ? ' warn' : '');
    $('v-' + b.k).textContent = Math.round(v);
  }
  $('log').innerHTML = s.log.length ? s.log.map(e => `<li><time>${hhmm(e.t)}</time>${e.text}</li>`).join('') : '<li>Nada aconteceu ainda.</li>';
  $('goneBox').hidden = !s.gone;
  if (s.gone) $('goneText').textContent = `${n} ficou fraca demais e voltou para a floresta. Fadas precisam de comida, carinho, banho e descanso todos os dias.`;
  renderAccs();
  $('speed').value = String(s.speed);
  $('skin').value = s.skin;
  $('sound').checked = !!s.sound;
}

function renderReset() {
  const w = $('resetWrap');
  if (ui.confirmReset) {
    w.innerHTML = 'Apagar tudo? <button class="ghost danger" id="rY">Sim, recomeçar</button> <button class="ghost" id="rN">Não</button>';
    $('rY').onclick = () => { restart(); ui.confirmReset = false; renderReset(); };
    $('rN').onclick = () => { ui.confirmReset = false; renderReset(); };
  } else {
    w.innerHTML = '<button class="ghost" id="reset">Recomeçar</button>';
    $('reset').onclick = () => { ui.confirmReset = true; renderReset(); };
  }
}
function restart() {
  const keep = { speed: s.speed, sound: s.sound, skin: s.skin };
  s = Object.assign(newState(), keep);
  logEv('Um novo botão de flor foi plantado.');
  ui.view = 'main'; ui.sel = -1; ui.anim = null; Behavior.reset(s);
  save(); renderLooks(); render();
}
function setSkin() {
  R = s.skin === 'lcd' ? LcdRenderer : s.skin === 'color' ? ColorRenderer : s.skin === 'smooth' ? SmoothRenderer : s.skin === 'painted' ? PaintedRenderer : IllustratedRenderer;
  R.init($('lcd')); skinScale = renderScale($('lcd'));
  $('lcd').style.imageRendering = R === SmoothRenderer || R === IllustratedRenderer || R === PaintedRenderer ? 'auto' : 'pixelated';
  $('screen').style.background = s.skin === 'lcd' ? '#a9b897' : '#1d2350';
}
// tela mudou de tamanho (girou o celular, redimensionou a janela): refaz na resolução nova
let skinScale = 0, resizeT = 0;
function checkScale() {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { const k = renderScale($('lcd')); if (k !== skinScale) { skinScale = k; setSkin(); } }, 200);
}
if (window.ResizeObserver) new ResizeObserver(checkScale).observe($('lcd'));
else window.addEventListener('resize', checkScale);

/* loop */
let lastTick = performance.now();
/* O relógio da fada segue o relógio real do aparelho (+ o adiantamento
   acumulado nas velocidades de teste). Qualquer tempo que faltar — aba no
   fundo, celular bloqueado, página fechada — é simulado de uma vez.     */
function syncClock() {
  const target = Date.now() + (s.simOffset || 0);
  let gap = (target - s.simTime) / MIN;
  if (gap <= 0) return;
  const cap = 3 * 24 * 60;
  if (gap > cap) { s.simTime = target - cap * MIN; gap = cap; }
  if (gap < 1) return Core.advance(s, gap);
  catchingUp = true; Core.advance(s, gap); catchingUp = false;
  if (gap > 30) say(`Você ficou fora ${fmtAge(gap)}. Veja o diário.`, 7000);
  render();
}
function frame(now) {
  const realDt = Math.min(1000, Math.max(0, now - lastTick)); lastTick = now;
  if (s.speed > 1) s.simOffset = (s.simOffset || 0) + realDt * (s.speed - 1);
  syncClock();

  if (ui.view === 'game') gameTick(now);
  const pose = Behavior.update(s, ui, now, realDt);
  R.draw(s, ui, now, pose);
  frame.acc = (frame.acc || 0) + realDt;
  if (frame.acc > 500) { frame.acc = 0; render(); }
  requestAnimationFrame(frame);
}

function start(snap) {
  s = (snap && snap.state) || load();
  if (!s) { s = newState(); logEv('Um botão de flor foi plantado.'); }
  else {
    if (!s.look) s.look = { ...DEFAULT_LOOK };
    if (!s.skinV) { if (s.skin === 'color') s.skin = 'smooth'; s.skinV = 2; }
    if (s.skinV < 3) { if (s.skin === 'smooth') s.skin = 'illustrated'; s.skinV = 3; }
    s = Object.assign(newState(), s);
    // relógio adiantado por testes: em 1× volta ao horário real; acima disso vira adiantamento
    if (s.simTime > Date.now() + (s.simOffset || 0)) {
      if (s.speed > 1) s.simOffset = s.simTime - Date.now(); else { s.simTime = Date.now(); s.simOffset = 0; }
    }
  }
  setSkin();
  buildPanel(); buildLooks(); renderReset();
  Backup.setup(); App.init();
  syncClock();

  $('bL').onclick = pressLeft; $('bR').onclick = pressRight; $('bOK').onclick = pressOk; $('bX').onclick = pressCancel;
  $('screen').addEventListener('click', e => {
    if (ui.view === 'main' && !s.gone && !s.asleep && s.stage !== 'bud' && !Behavior.state.act) {
      const happy = Core.mood(s) === 'happy';
      Behavior.play(happy ? 'spin' : 'giggle'); say(happy ? 'Wiii! Uma pirueta!' : 'Hihi! Cócegas!', 2500); beep(1320, .05, 2);
      return;
    }
    if (ui.view !== 'game') return;
    const r = e.currentTarget.getBoundingClientRect();
    gameGuess(e.clientX - r.left < r.width / 2 ? 'L' : 'R');
  });
  // tela cheia: a classe faz o layout; a API do navegador esconde as barras quando existe (no iPhone, só a classe)
  const setFull = on => {
    document.body.classList.toggle('full', on);
    $('fullBtn').setAttribute('aria-label', on ? 'Sair da tela cheia' : 'Tela cheia');
    const el = document.documentElement;
    try {
      if (on && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (err) {}
  };
  $('fullBtn').addEventListener('click', e => { e.stopPropagation(); setFull(!document.body.classList.contains('full')); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('full')) setFull(false); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); setFull(!document.body.classList.contains('full')); return; }
    if (k === 'arrowleft') { e.preventDefault(); pressLeft(); }
    else if (k === 'arrowright') { e.preventDefault(); pressRight(); }
    else if (k === 'enter' || k === ' ') { if (e.target.closest('button')) return; e.preventDefault(); pressOk(); }
    else if (k === 'escape' || k === 'backspace') { e.preventDefault(); pressCancel(); }
  });
  $('nome').addEventListener('input', e => { s.name = e.target.value.trim() || 'Lumi'; save(); });
  $('speed').addEventListener('change', e => {
    s.speed = Number(e.target.value);
    if (s.speed === 1 && (s.simOffset || s.simTime > Date.now())) {
      s.simOffset = 0;
      if (s.simTime > Date.now()) s.simTime = Date.now();
      say('Relógio de volta ao horário real.');
    }
    save(); render();
  });
  $('skin').addEventListener('change', e => { s.skin = e.target.value; setSkin(); save(); });
  $('sound').addEventListener('change', e => {
    s.sound = e.target.checked;
    if (s.sound && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) {} }
    if (actx && actx.state === 'suspended') actx.resume();
    beep(880, .06); save();
  });
  $('restart2').onclick = restart;
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else syncClock(); });
  window.addEventListener('pagehide', save);
  window.claude?.hot?.snapshot?.(() => ({ state: s }));
  render();
  requestAnimationFrame(frame);
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
