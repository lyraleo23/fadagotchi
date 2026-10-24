#!/usr/bin/env python3
"""Gera a versão de arquivo único do Fadagotchi (usada no artifact do Claude).

Uso: python3 tools/build_artifact.py SAIDA.html

- junta css/ e js/ dentro do HTML
- remove o bloco <!-- pwa:start --> ... <!-- pwa:end --> (manifesto e ícones)
- remove doctype/html/head/body (o Claude coloca o esqueleto na publicação)
- confere se APP_VERSION (js/version.js) == VERSION (sw.js)
"""
import base64, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def main(out):
    app_v = re.search(r"APP_VERSION = '([^']+)'", read('js/version.js')).group(1)
    sw_v = re.search(r"VERSION = '([^']+)'", read('sw.js')).group(1)
    if app_v != sw_v:
        sys.exit(f'Versões diferentes: js/version.js={app_v} sw.js={sw_v}')

    html = read('index.html')
    html = re.sub(r'<!-- pwa:start.*?<!-- pwa:end -->\n', '', html, flags=re.S)
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + read('css/style.css') + '</style>')
    html = re.sub(r'<script src="([^"]+)" defer></script>', lambda m: '<script>\n' + read(m.group(1)) + '</script>', html)
    # arte pintada embutida (no Claude não dá para buscar arquivos ao lado)
    fada = ROOT / 'assets' / 'fada' / 'fada.json'
    if fada.exists():
        meta = json.loads(fada.read_text(encoding='utf-8'))
        imgs = {n: 'data:image/webp;base64,' + base64.b64encode((ROOT / 'assets' / 'fada' / f'{n}.webp').read_bytes()).decode() for n in meta['poses']}
        if 'asa' in meta:
            imgs['asa'] = 'data:image/webp;base64,' + base64.b64encode((ROOT / 'assets' / 'fada' / 'asa.webp').read_bytes()).decode()
        masks = {n: 'data:image/png;base64,' + base64.b64encode((ROOT / 'assets' / 'fada' / f'{n}.mask.png').read_bytes()).decode()
                 for n in meta['poses'] if (ROOT / 'assets' / 'fada' / f'{n}.mask.png').exists()}
        inline = '<script>window.PAINTED_INLINE = ' + json.dumps({'meta': meta, 'imgs': imgs, 'masks': masks}) + ';</script>\n'
        html = html.replace('<script>\n/* Versão do app', inline + '<script>\n/* Versão do app', 1)
    for tag in ['<!doctype html>\n', '<html lang="pt-BR">\n', '<head>\n', '<meta charset="utf-8">\n',
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n',
                '</head>\n', '<body>\n', '</body>\n', '</html>\n']:
        if tag not in html:
            sys.exit(f'Não achei {tag!r} no index.html')
        html = html.replace(tag, '', 1)
    pathlib.Path(out).write_text(html, encoding='utf-8')
    print(f'ok: {out} ({len(html) // 1024} KB, versão {app_v})')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'fadagotchi-artifact.html')
