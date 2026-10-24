#!/usr/bin/env python3
"""Prepara a arte pintada da fada para o jogo.

Lê a referência e as poses de cada fase e gera assets/fada/<pose>.webp
+ assets/fada/fada.json (âncoras em pixels):
  adulta: art/referencia/fada-adulta.png + art/recebidas/fada_pose_*.png / fada_rosto_*.png
  bebê:   art/referencia/fada-bebe.png  + art/recebidas/bebe_pose_*.png  / bebe_rosto_*.png
          (saem com o prefixo bebe_; a bebê usa as asas da adulta, menores)

- limpa o halo quase invisível (alfa < 24 vira 0) e firma o miolo (alfa >= 240 vira 255)
- normaliza a escala: a fada em pé (pés → topo do cabelo) fica com ALTURA px
- recorta na área visível e registra onde ficam os pés
- gera <pose>.mask.png com as regiões (cabelo, pele, olhos, vestido, sapatos) para recolorir no jogo
  (precisa de numpy e scipy)
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageStat
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'fada'
ALTURA = 840                     # altura da fada adulta em pé no arquivo final (px) — nítida até a escala 12
UNIDADES = 56                    # ... e no mundo do jogo (192x120)
# cada fase: arquivos, altura em pé no jogo e correção de escala por pose
# (a IA às vezes encolhe a figura para caber os braços, ou aproxima a câmera)
FASES = {
    'adulta': {'prefixo': '', 'ref': 'art/referencia/fada-adulta.png', 'arq': 'fada', 'unidades': 56,
               'fator': {'espreguicando': 1503 / 1391},
               # encaixe dos rostos: (olho esq., olho dir., boca) na referência e nos rostos; elipse do rosto
               'rosto': {'ref': [(466, 196), (531, 190), (500, 247)], 'img': [(548, 745), (805, 735), (681, 942)],
                         'mascara': ((499, 221), 48, 52), 'blur': 9}},
    'bebe':   {'prefixo': 'bebe_', 'ref': 'art/referencia/fada-bebe.png', 'arq': 'bebe', 'unidades': 38,
               'fator': {'tedio': 0.75},
               'rosto': {'ref': [(446, 386), (580, 354), (531, 463)], 'img': [(543, 854), (822, 847), (686, 1052)],
                         'mascara': ((513, 405), 124, 98), 'blur': 12,
                         'olhos': [((446, 368), 62, 58), ((586, 336), 64, 60)]}},   # a cabeça dela é inclinada
}
POSES = ['referencia', 'acenando', 'espreguicando', 'fome', 'bocejo', 'cochilo', 'tedio', 'lado']
# expressões aplicadas sobre a pose parada (referência)
ROSTOS = ['feliz', 'triste', 'dormindo', 'cansada', 'entediada']


def src(fase, n):
    return ROOT / (fase['ref'] if n == 'referencia' else f"art/recebidas/{fase['arq']}_pose_{n}.png")


# ---- máscara de regiões (para recolorir cabelo, pele, olhos, vestido e sapatos no jogo) ----
# classes: 0 nada (ouro, flores, boca...) · 1 cabelo · 2 pele · 3 olhos · 4 vestido · 5 sapatos
# no PNG cada classe vira um cinza bem espaçado (classe × 50): navegadores que ajustam a cor ao
# desenhar (Safari) mudam o valor em poucos pontos, e o jogo arredonda de volta
NONE, HAIR,SKIN,EYES,DRESS,SHOE=0,1,2,3,4,5
def hsv(im):
    r,g,b=im[...,0],im[...,1],im[...,2]
    mx=im[...,:3].max(-1); mn=im[...,:3].min(-1); d=mx-mn+1e-6
    h=np.where(mx==r,((g-b)/d)%6,np.where(mx==g,(b-r)/d+2,(r-g)/d+4))*60
    return h, d/(mx+1e-6), mx
def fill(cls, a, k, size=7, frac=0.5):
    """pixels sem classe cercados pela classe k viram k (fios claros/escuros, bordas das folhas)"""
    m=(cls==k).astype(float)
    f=ndi.uniform_filter(m,size)
    cls[(cls==NONE)&a&(f>=frac)]=k
def classify(img):
    im=np.asarray(img.convert('RGBA')).astype(float)/255
    a=im[...,3]>0.1; h,s,v=hsv(im); H,W=a.shape
    cls=np.zeros((H,W),np.uint8)
    pinkish=(h>=330)|(h<8)
    pink=a&pinkish&(s>0.16)&(v>0.3)
    skin=(a&(h>=8)&(h<45)&(s>0.06)&(s<0.7)&(v>0.4)) | (a&pinkish&(s<=0.16)&(v>0.6))
    green=a&(h>=48)&(h<170)&(s>0.18)
    purple=a&(h>=235)&(h<330)&(s>0.15)
    # o que fica dentro da pele (boca, bochechas, olhos) não é cabelo
    inner=ndi.binary_fill_holes(ndi.binary_closing(skin,iterations=2))&~skin
    blush=inner&pinkish&(s<0.5)
    pink=pink&~inner
    # rosa grande: junta os fios, separa cabelo (encosta no alto) de sapatos (embaixo); manchas pequenas (boca) ficam de fora
    joined=ndi.binary_closing(pink,iterations=3)
    lab,nl=ndi.label(joined)
    hair=np.zeros_like(pink); shoe=np.zeros_like(pink)
    for i,sl in enumerate(ndi.find_objects(lab),1):
        comp=(lab==i)&pink
        if comp.sum()<a.sum()*0.003: continue
        if sl[0].start>H*0.55: shoe|=comp
        else: hair|=comp
    cls[(skin|blush)&~hair&~shoe]=SKIN; cls[green]=DRESS; cls[hair]=HAIR; cls[shoe]=SHOE
    lab,nl=ndi.label(purple); sizes=ndi.sum(purple,lab,range(1,nl+1))
    cls[np.isin(lab,1+np.where(sizes<a.sum()*0.01)[0])&purple]=EYES
    # mechas claras no meio do cabelo (pele cercada de cabelo) viram cabelo
    hf=ndi.uniform_filter((cls==HAIR).astype(float),15)
    cls[(cls==SKIN)&(hf>0.6)&((h<25)|(h>=330))]=HAIR
    fill(cls,a,HAIR,7,0.45); fill(cls,a,HAIR,9,0.45); fill(cls,a,HAIR,9,0.45); fill(cls,a,DRESS,5,0.5); fill(cls,a,SHOE,5,0.5)
    return cls


def affine_from(src, dst):
    """Coeficientes para Image.transform (mapeia ponto de saída -> ponto de entrada)."""
    import numpy as np
    A = np.array([[x, y, 1] for x, y in dst], float)
    bx = np.array([p[0] for p in src], float); by = np.array([p[1] for p in src], float)
    a = np.linalg.solve(A, bx); b = np.linalg.solve(A, by)
    return (a[0], a[1], a[2], b[0], b[1], b[2])


def rosto_sobre_referencia(fase, nome):
    """Cola a expressão sobre o rosto da referência, alinhando olhos e boca."""
    R = fase['rosto']
    ref = Image.open(src(fase, 'referencia')).convert('RGBA')
    face = Image.open(ROOT / f"art/recebidas/{fase['arq']}_rosto_{nome}.png").convert('RGBA')
    warped = face.transform(ref.size, Image.AFFINE, affine_from(R['img'], R['ref']), resample=Image.BICUBIC)
    (cx, cy), rx, ry = R['mascara']
    mask = Image.new('L', ref.size, 0)
    dm = ImageDraw.Draw(mask)
    for (ex, ey), erx, ery in [R['mascara']] + R.get('olhos', []):
        dm.ellipse((ex - erx, ey - ery, ex + erx, ey + ery), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(R['blur']))
    # acerta a cor da pele do rosto novo pela da referência (média e contraste por canal)
    inner = Image.new('L', ref.size, 0)
    ImageDraw.Draw(inner).ellipse((cx - rx * .7, cy - ry * .7, cx + rx * .7, cy + ry * .7), fill=255)
    sr = ImageStat.Stat(ref.convert('RGB'), inner); sw = ImageStat.Stat(warped.convert('RGB'), inner)
    chans = []
    for i, ch in enumerate(warped.convert('RGB').split()):
        k = (sr.stddev[i] / sw.stddev[i]) if sw.stddev[i] > 1 else 1
        k = max(0.8, min(1.25, k)); off = sr.mean[i] - sw.mean[i] * k
        chans.append(ch.point(lambda v, k=k, off=off: max(0, min(255, round(v * k + off)))))
    fixed = Image.merge('RGB', chans).convert('RGBA')
    out = ref.copy()
    out.paste(fixed, (0, 0), ImageChops.multiply(mask, warped.getchannel('A')))
    return out


def asas():
    """Asas: limpa o brilho em volta e guarda só a metade esquerda (a direita é espelhada no jogo)."""
    p = ROOT / 'art/recebidas/fada_asas.png'
    if not p.exists():
        return None
    im = Image.open(p).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 0 if v < 60 else (255 if v >= 235 else round((v - 60) * 255 / 175)))
    im.putalpha(a)
    half = im.crop((0, 0, im.width // 2, im.height))
    x0, y0, x1, y1 = half.getchannel('A').getbbox()
    root = (im.width // 2 - x0, 518 - y0)            # ponto onde as asas se encontram
    half = half.crop((x0, y0, im.width // 2, y1))
    k = 420 / half.width
    half = half.resize((round(half.width * k), round(half.height * k)), Image.LANCZOS)
    half.save(OUT / 'asa.webp', 'WEBP', quality=86, method=6)
    print(f'asa           {half.width}x{half.height}  {(OUT / "asa.webp").stat().st_size // 1024} KB')
    return {'w': half.width, 'h': half.height, 'rootX': round(root[0] * k, 1), 'rootY': round(root[1] * k, 1)}


def processa(fase, meta):
    P = fase['prefixo']
    ref_h = None
    altura = ALTURA * fase['unidades'] / UNIDADES
    lista = POSES + [f'referencia_{r}' for r in ROSTOS
                     if 'rosto' in fase and (ROOT / f"art/recebidas/{fase['arq']}_rosto_{r}.png").exists()]
    for n in lista:
        if n.startswith('referencia_'):
            im = rosto_sobre_referencia(fase, n.split('_', 1)[1])
        else:
            p = src(fase, n)
            if not p.exists():
                print('faltando:', p.name); continue
            im = Image.open(p).convert('RGBA')
        a = im.getchannel('A').point(lambda v: 0 if v < 24 else (255 if v >= 240 else v))
        im.putalpha(a)
        if ref_h is None:   # a referência define a escala (pés → topo do cabelo)
            x0, y0, x1, y1 = a.getbbox(); ref_h = y1 - y0
        k = altura / ref_h * fase['fator'].get(n.split('_')[0], 1)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        x0, y0, x1, y1 = im.getchannel('A').getbbox()
        im = im.crop((x0, y0, x1, y1))
        px = im.load(); fy = im.height - 1
        xs = [x for x in range(im.width) if px[x, max(0, fy - 2)][3] > 200]
        fx = sum(xs) / len(xs) if xs else im.width / 2
        im.save(OUT / f'{P}{n}.webp', 'WEBP', quality=88, method=6)
        Image.fromarray(classify(im) * 50).save(OUT / f'{P}{n}.mask.png', optimize=True)
        meta['poses'][P + n] = {'w': im.width, 'h': im.height, 'footX': round(fx, 1), 'footY': im.height}
        print(f'{P + n:22s} {im.width}x{im.height}  pés x={fx:.0f}  {(OUT / f"{P}{n}.webp").stat().st_size // 1024} KB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {'unitsPerPx': UNIDADES / ALTURA, 'poses': {}}
    for fase in FASES.values():
        if (ROOT / fase['ref']).exists():
            processa(fase, meta)
    w = asas()
    if w:
        meta['asa'] = w
    (OUT / 'fada.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
