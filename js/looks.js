/* ---------- 2a. LOOKS (aparência da fada) ----------
   Cada opção tem um nome (o contrato com qualquer renderer) e a paleta
   padrão em 4 tons [luz, base, sombra, sombra profunda]. Um renderer novo
   pode usar só os nomes e trazer a própria arte para cada um.            */
const LOOKS = {
  hair: {
    rosa: { label: 'Rosa', tones: [0xffbade, 0xec74b0, 0xc4538f, 0x8f3a72] },
    lilas: { label: 'Lilás', tones: [0xeedcff, 0xb990ec, 0x8e66cc, 0x64459c] },
    ceu: { label: 'Azul-céu', tones: [0xd2f0ff, 0x7cc4f0, 0x4f98cc, 0x386f9e] },
    dourado: { label: 'Dourado', tones: [0xfff4c4, 0xf5cf62, 0xd5a23c, 0xa4762a] },
    ruivo: { label: 'Ruivo', tones: [0xffc8a4, 0xe8763f, 0xbd5228, 0x8a3a1d] },
    castanho: { label: 'Castanho', tones: [0xd9ad84, 0x9b6a43, 0x74492b, 0x50301b] },
    preto: { label: 'Preto', tones: [0x7a7590, 0x45405a, 0x2d2a3d, 0x1d1b28] },
    prata: { label: 'Prateado', tones: [0xffffff, 0xe3e7f0, 0xb9c0cf, 0x9097a9] },
  },
  skin: {
    clara: { label: 'Clara', tones: [0xfff0e6, 0xffdcc8, 0xf5bba0, 0xe09a82] },
    media: { label: 'Média', tones: [0xffe6cc, 0xf2c196, 0xd9a072, 0xb98052] },
    morena: { label: 'Morena', tones: [0xedc09a, 0xcc9064, 0xa86f46, 0x82522f] },
    escura: { label: 'Escura', tones: [0xc08d6a, 0x8f5c3c, 0x70442b, 0x52301d] },
    lavanda: { label: 'Lavanda', tones: [0xf6eeff, 0xdfcdf7, 0xc3abe8, 0xa28acf] },
  },
  eyes: {
    ametista: { label: 'Ametista', iris: [0x4a2f8a, 0x5f40b0, 0x7b5cd6, 0x9a7ce8, 0xbca2f8, 0xd6c6ff], pupil: 0x231543 },
    safira: { label: 'Safira', iris: [0x1f3f7a, 0x2c5aa8, 0x3f7fd0, 0x63a0e8, 0x93c4f5, 0xc4e2ff], pupil: 0x0f1f40 },
    esmeralda: { label: 'Esmeralda', iris: [0x1d5a3a, 0x26804f, 0x35a566, 0x5cc487, 0x92deb0, 0xc6f2d6], pupil: 0x0d2e1d },
    ambar: { label: 'Âmbar', iris: [0x6a3a12, 0x8f5418, 0xb87422, 0xd89a3a, 0xf0c060, 0xffe09a], pupil: 0x3a1d08 },
    rubi: { label: 'Rubi', iris: [0x7a1f3f, 0xa82c58, 0xd04478, 0xe8709a, 0xf5a0bc, 0xffd0de], pupil: 0x3d0f20 },
  },
  dress: {
    folha: { label: 'Folha', tones: [0xbdf2c9, 0x7fd498, 0x55ab72, 0x3b8055], back: [0x93dfa9, 0x5fbb7e, 0x449a62, 0x2f7548], shoe: [0xffc2dc, 0xf07aaa, 0xc85088, 0x983a68] },
    petala: { label: 'Pétala', tones: [0xffd8ea, 0xff9cc8, 0xe06fa2, 0xb04d7e], back: [0xffbcd8, 0xf07fb2, 0xc85a8c, 0x9a3f68], shoe: [0xfff4c4, 0xf5cf62, 0xd5a23c, 0xa4762a] },
    lavanda: { label: 'Lavanda', tones: [0xeee0ff, 0xc4a6f2, 0x9c7cd8, 0x7458b0], back: [0xd8c4fa, 0xa888e2, 0x8264c4, 0x5e4498], shoe: [0xffd8ea, 0xff9cc8, 0xe06fa2, 0xb04d7e] },
    ceu: { label: 'Céu', tones: [0xd6f0ff, 0x8ccdf5, 0x5ea6dc, 0x4080b8], back: [0xb6e2ff, 0x6cb6ea, 0x4a8ecc, 0x336ca4], shoe: [0xffffff, 0xe3e7f0, 0xb9c0cf, 0x9097a9] },
    sol: { label: 'Sol', tones: [0xfff6c8, 0xffe07a, 0xf0bc48, 0xc89430], back: [0xffe9a0, 0xf5cc5a, 0xdca43a, 0xae7c26], shoe: [0xffc8a4, 0xe8763f, 0xbd5228, 0x8a3a1d] },
    noite: { label: 'Noite', tones: [0x9aa4d8, 0x5f68b0, 0x434b8e, 0x2f3570], back: [0x7a84c4, 0x4a5298, 0x353c7a, 0x242a5c], shoe: [0xeedcff, 0xb990ec, 0x8e66cc, 0x64459c] },
  },
  wings: {
    cristal: { label: 'Cristal', root: 0xf0fdff, a: 0xb8e4ff, b: 0xe8caff, rim: 0x8cc4ec, vein: 0xa6d6f5 },
    aurora: { label: 'Aurora', root: 0xfffaf0, a: 0xffc8de, b: 0xffe7a0, rim: 0xe89ab8, vein: 0xf5c0d0 },
    menta: { label: 'Menta', root: 0xf0fff8, a: 0xb4f0d6, b: 0xa8e6f0, rim: 0x6cc4a8, vein: 0x98dcc4 },
    crepusculo: { label: 'Crepúsculo', root: 0xfff0fa, a: 0xd8b4ff, b: 0xffb4d8, rim: 0xa880d8, vein: 0xc8a8ec },
    monarca: { label: 'Monarca', root: 0xfff6e0, a: 0xffc070, b: 0xffe08a, rim: 0x9a4a20, vein: 0xd88a40 },
  },
};
const LOOK_PARTS = [['hair', 'Cabelo'], ['skin', 'Pele'], ['eyes', 'Olhos'], ['dress', 'Vestido'], ['wings', 'Asas']];
const DEFAULT_LOOK = { hair: 'rosa', skin: 'clara', eyes: 'ametista', dress: 'folha', wings: 'cristal' };
function randomLook() {
  const o = {};
  for (const [k] of LOOK_PARTS) { const keys = Object.keys(LOOKS[k]); o[k] = keys[Math.floor(Math.random() * keys.length)]; }
  return o;
}
const lookOf = s => { const l = Object.assign({}, DEFAULT_LOOK, s.look || {}); for (const [k] of LOOK_PARTS) if (!LOOKS[k][l[k]]) l[k] = DEFAULT_LOOK[k]; return l; };

