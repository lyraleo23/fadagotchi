/* expressão do momento (compartilhada pelos renderers) */
const HAPPY_ANIMS = ['eat', 'pet', 'toilet', 'bath', 'med', 'hatch', 'win', 'grow', 'gift'];
function faceFor(s, anim, pose) {
  let face = Core.mood(s);
  if (pose && pose.face) face = pose.face;
  if (anim) {
    if (HAPPY_ANIMS.includes(anim.type)) face = 'happy';
    if (['refuse', 'lose', 'accident'].includes(anim.type)) face = 'sad';
  }
  if (s.asleep && (!pose || pose.sleepP >= 1)) face = 'sleep';
  return face;
}
const STATUS_PAGES = [
  { k: 'hunger', icon: 'food', label: 'Barriga' },
  { k: 'affection', icon: 'pet', label: 'Carinho' },
  { k: 'fun', icon: 'play', label: 'Diversão' },
  { k: 'bladder', icon: 'toilet', label: 'Banheiro', inv: true },
  { k: 'hygiene', icon: 'bath', label: 'Higiene' },
  { k: 'energy', icon: 'moon', label: 'Energia' },
  { k: 'health', icon: 'cross', label: 'Saúde' },
];
const pageValue = (s, p) => p.inv ? 100 - s[p.k] : s[p.k];

