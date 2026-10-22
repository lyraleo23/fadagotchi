/* =====================================================================
   FADAGOTCHI
   Arquivos (carregados nesta ordem, todos compartilham o escopo global):
     version.js         versão do app (também usada pelo service worker)
     sprites.js         pixel art monocromática do visual LCD
     core.js            estado + regras da simulação (não sabe nada de tela)
     looks.js           aparência da fada (cabelo, pele, olhos, vestido, asas)
     accessories.js     acessórios ganhos com bom cuidado
     world.js           mapa do cenário (casinha, flores, borboletas, vaga-lumes)
     behavior.js        decide o gesto do momento e entrega uma Pose
     faces.js           expressão final + páginas de status
     renderers/*.js     Smooth (vetorial, padrão), Pixel art e LCD.
                        Interface comum: init(canvas), draw(state, ui, now, pose)
     backup.js          exportar/importar a fada
     app.js             instalação como app (service worker, atualizações)
     ui.js              botões, ficha, persistência e loop principal
   ===================================================================== */


/* ---------- 2. CORE (simulação) ---------- */
const MIN = 60000;
const cl = v => Math.max(0, Math.min(100, v));

function newState() {
  const now = Date.now();
  return {
    v: 1, name: 'Lumi', stage: 'bud', ageMin: 0, simTime: now, simOffset: 0, lastReal: now,
    hunger: 80, affection: 70, fun: 70, bladder: 10, hygiene: 95, energy: 90, health: 100,
    sick: false, poops: 0, asleep: false, lightsOff: false, sweets: [],
    gone: false, speed: 1, sound: false, skin: 'smooth', skinV: 2, look: randomLook(), care: 0, unlocked: [], wear: {}, log: [],
  };
}

const Core = {
  hour(s) { const d = new Date(s.simTime); return d.getHours() + d.getMinutes() / 60; },
  isNight(s) { const h = this.hour(s); return h >= 22 || h < 7; },
  emit: () => {},
  stepMinute(s, dm) {
    s.ageMin += dm; s.simTime += dm * MIN;
    if (s.gone) return;
    if (s.stage === 'bud') {
      if (s.ageMin >= 0.5) { s.stage = 'baby'; this.emit('hatch'); }
      return;
    }
    if (s.stage === 'baby' && s.ageMin >= 24 * 60) { s.stage = 'adult'; this.emit('grow'); }
    const h = dm / 60, k = s.stage === 'baby' ? 1.3 : 1, p = s.poops;
    const night = this.isNight(s);

    if (!s.asleep) {
      if (s.energy <= 8 || night || (s.lightsOff && s.energy < 60)) { s.asleep = true; this.emit('sleep'); }
    } else if (!night && s.energy >= 90) {
      s.asleep = false; s.lightsOff = false; this.emit('wake');
    }

    if (s.asleep) {
      s.hunger = cl(s.hunger - 4 * k * h);
      s.fun = cl(s.fun - 2 * h);
      s.affection = cl(s.affection - (s.lightsOff ? 2 : 6) * h);
      s.hygiene = cl(s.hygiene - (2 + 8 * p) * h);
      s.energy = cl(s.energy + (s.lightsOff ? 22 : 10) * h);
      s.bladder = cl(s.bladder + 6 * h);
    } else {
      s.hunger = cl(s.hunger - 10 * k * h);
      s.fun = cl(s.fun - 9 * k * h);
      s.affection = cl(s.affection - 7 * k * h);
      s.hygiene = cl(s.hygiene - (5 + 8 * p) * h);
      s.energy = cl(s.energy - 7 * k * h);
      s.bladder = cl(s.bladder + 20 * k * h);
    }

    if (s.bladder >= 100) {
      s.poops = Math.min(3, s.poops + 1); s.bladder = 15;
      s.hygiene = cl(s.hygiene - 15); s.affection = cl(s.affection - 5);
      this.emit('accident');
    }

    s.sweets = s.sweets.filter(t => s.simTime - t < 6 * 60 * MIN);
    let risk = 0;
    if (s.poops >= 2) risk += .004;
    if (s.hygiene < 20) risk += .004;
    if (s.health < 40) risk += .003;
    if (s.sweets.length > 3) risk += .003;
    if (!s.sick && Math.random() < risk * dm) { s.sick = true; this.emit('sick'); }

    let dh = 0;
    for (const st of ['hunger', 'affection', 'fun', 'hygiene', 'energy']) if (s[st] <= 0) dh -= 8;
    if (s.sick) dh -= 10;
    if (s.poops >= 3) dh -= 4;
    if (dh === 0 && ['hunger', 'affection', 'fun', 'hygiene', 'energy'].every(st => s[st] >= 40)) dh = 4;
    s.health = cl(s.health + dh * h);
    if (s.health <= 0) { s.gone = true; this.emit('gone'); return; }

    // brilho de cuidado → acessórios
    if (s.asleep ? (s.lightsOff && !s.sick) : this.needs(s).length === 0) {
      s.care += dm / 60;
      for (const a of ACCESSORIES) if (s.care >= a.hours && !s.unlocked.includes(a.id)) {
        s.unlocked.push(a.id); s.wear = Object.assign({}, s.wear, { [a.slot]: a.id });
        this.emit('unlock', a);
      }
    }
  },
  advance(s, minutes) {
    while (minutes > 1e-9) { const dm = Math.min(1, minutes); this.stepMinute(s, dm); minutes -= dm; }
  },
  needs(s) {
    if (s.gone || s.stage === 'bud') return [];
    const n = [];
    if (s.sick) n.push('está doente e precisa de poção');
    if (s.asleep) return n;
    if (s.hunger < 25) n.push('está com fome');
    if (s.bladder > 80) n.push('precisa ir ao banheiro');
    if (s.poops > 0) n.push('fez sujeira e precisa de banho');
    else if (s.hygiene < 25) n.push('está precisando de um banho');
    if (s.affection < 25) n.push('quer carinho');
    if (s.fun < 25) n.push('está entediada');
    if (s.energy < 25) n.push('está com sono');
    return n;
  },
  mood(s) {
    if (s.asleep) return 'sleep';
    if (s.sick || this.needs(s).length) return 'sad';
    const avg = (s.hunger + s.affection + s.fun + s.hygiene + s.energy + (100 - s.bladder)) / 6;
    return avg >= 70 ? 'happy' : 'neutral';
  },
};

