"""Monta o painel a partir de src/painel.html.

Gera:
  index.html          documento completo, para abrir localmente (dados salvos no navegador)
  dist/artefato.html  fragmento publicado como artefato claude.ai (dados no banco compartilhado)
"""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
b64 = lambda p: base64.b64encode((ROOT / p).read_bytes()).decode()

src = (ROOT / 'src/painel.html').read_text(encoding='utf-8')
logos = ('<img src="data:image/png;base64,%s" alt="Grupo Dínamo">\n      <span class="sep"></span>\n'
         '      <img src="data:image/png;base64,%s" alt="Tóliman Transportes">') % (
    b64('assets/logo-grupo-dinamo.png'), b64('assets/logo-toliman-transportes.png'))
icon = '<link rel="icon" type="image/png" href="data:image/png;base64,%s">' % b64('assets/favicon.png')
frag = src.replace('%%LOGOS%%', logos).replace('%%ICON%%', icon)

out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist/artefato.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(frag, encoding='utf-8')
(ROOT / 'index.html').write_text(
    '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '</head>\n<body>\n' + frag + '\n</body>\n</html>\n', encoding='utf-8')
print('ok', out, len(frag))
