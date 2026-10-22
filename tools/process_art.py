#!/usr/bin/env python3
"""Prepara a arte pintada da fada para o jogo.

Lê art/referencia/fada-adulta.png e art/recebidas/fada_pose_*.png e gera
assets/fada/<pose>.webp + assets/fada/fada.json (âncoras em pixels).

- limpa o halo quase invisível (alfa < 24 vira 0) e firma o miolo (alfa >= 240 vira 255)
- normaliza a escala: a fada em pé (pés → topo do cabelo) fica com ALTURA px
- recorta na área visível e registra onde ficam os pés
"""
import json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'fada'
ALTURA = 520                     # altura da fada em pé no arquivo final (px)
# correção de escala por pose (a IA às vezes encolhe a figura para caber os braços)
FATOR = {'espreguicando': 1503 / 1391}
POSES = ['referencia', 'acenando', 'espreguicando', 'fome', 'bocejo', 'cochilo', 'tedio', 'lado']


def src(n):
    return ROOT / ('art/referencia/fada-adulta.png' if n == 'referencia' else f'art/recebidas/fada_pose_{n}.png')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {'unitsPerPx': 56 / ALTURA, 'poses': {}}   # fada em pé com ~56 unidades de altura no mundo 192x120
    ref_h = None
    for n in POSES:
        p = src(n)
        if not p.exists():
            print('faltando:', p.name); continue
        im = Image.open(p).convert('RGBA')
        a = im.getchannel('A').point(lambda v: 0 if v < 24 else (255 if v >= 240 else v))
        im.putalpha(a)
        if ref_h is None:   # a referência define a escala (pés → topo do cabelo)
            x0, y0, x1, y1 = a.getbbox(); ref_h = y1 - y0
        k = ALTURA / ref_h * FATOR.get(n, 1)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        x0, y0, x1, y1 = im.getchannel('A').getbbox()
        im = im.crop((x0, y0, x1, y1))
        px = im.load(); fy = im.height - 1
        xs = [x for x in range(im.width) if px[x, max(0, fy - 2)][3] > 200]
        fx = sum(xs) / len(xs) if xs else im.width / 2
        im.save(OUT / f'{n}.webp', 'WEBP', quality=88, method=6)
        meta['poses'][n] = {'w': im.width, 'h': im.height, 'footX': round(fx, 1), 'footY': im.height}
        print(f'{n:14s} {im.width}x{im.height}  pés x={fx:.0f}  {(OUT / f"{n}.webp").stat().st_size // 1024} KB')
    (OUT / 'fada.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
