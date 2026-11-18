"""Monta o painel a partir de src/painel.html.

Gera:
  Infrações de velocidade.html   documento completo, para abrir localmente (dados salvos no navegador)
  dist/artefato.html  fragmento publicado como artefato claude.ai (dados no banco compartilhado)
"""
import base64, datetime, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
b64 = lambda p: base64.b64encode((ROOT / p).read_bytes()).decode()

src = (ROOT / 'src/painel.html').read_text(encoding='utf-8')
logos = ('<img src="data:image/png;base64,%s" alt="Grupo Dínamo">\n      <span class="sep"></span>\n'
         '      <img src="data:image/png;base64,%s" alt="Tóliman Transportes">') % (
    b64('assets/logo-grupo-dinamo.png'), b64('assets/logo-toliman-transportes.png'))
icon = '<link rel="icon" type="image/png" href="data:image/png;base64,%s">' % b64('assets/favicon.png')
logo = '<img src="data:image/png;base64,%s" alt="Grupo Dínamo · Tóliman Transportes">' % b64('assets/logo.png')
# fontes do padrão (Barlow Condensed, IBM Plex Sans e IBM Plex Mono), embutidas para abrir sem internet
FONTES = [('Barlow Condensed', 'barlow-condensed', (500, 600, 700)), ('IBM Plex Sans', 'ibm-plex-sans', (400, 500, 600, 700)), ('IBM Plex Mono', 'ibm-plex-mono', (400, 500, 600))]
fontes = ''.join("@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, w, b64('assets/fonts/%s-latin-%d-normal.woff2' % (arq, w)))
                 for fam, arq, pesos in FONTES for w in pesos)
versao = 'v' + datetime.date.today().strftime('%Y.%m.%d')
frag = (src.replace('%%LOGOS%%', logos).replace('%%LOGO%%', logo).replace('%%ICON%%', icon)
        .replace('%%FONTES%%', fontes).replace('__VERSAO__', versao))

out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist/artefato.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(frag, encoding='utf-8')
(ROOT / 'Infrações de velocidade.html').write_text(
    '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '</head>\n<body>\n' + frag + '\n</body>\n</html>\n', encoding='utf-8')
print('ok', out, len(frag))
