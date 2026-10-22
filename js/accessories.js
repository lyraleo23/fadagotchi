/* ---------- ACESSÓRIOS (ganhos com bom cuidado) ----------
   Cada hora bem cuidada (nenhuma necessidade pendente, ou dormindo de luz
   apagada) soma "brilho de cuidado". Nos marcos abaixo ela ganha um
   acessório. Contrato com os renderers: o id e o slot; a arte é de cada um. */
const ACCESSORIES = [
  { id: 'laco', label: 'Laço de fita', slot: 'head', hours: 3 },
  { id: 'colar', label: 'Colar de orvalho', slot: 'neck', hours: 8 },
  { id: 'coroa', label: 'Coroa de flores', slot: 'head', hours: 16 },
  { id: 'capa', label: 'Capa de pétalas', slot: 'back', hours: 30 },
  { id: 'tiara', label: 'Tiara de estrela', slot: 'head', hours: 50 },
  { id: 'brilho', label: 'Asas cintilantes', slot: 'aura', hours: 80 },
];
const wearOf = s => s.wear || {};

