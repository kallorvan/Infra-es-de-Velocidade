"""Gera o manual rápido (HTML único + PDF A4) no layout padrão Grupo Dínamo / Tóliman.

Uso: python3 tools/manual/rapido/build.py
Saída: docs/Manual rápido - Infrações de velocidade.html e .pdf
"""
import base64, pathlib, subprocess, sys

D = pathlib.Path(__file__).resolve().parent
DOCS = D.parents[2] / "docs"
html = (D / "manual.html").read_text(encoding="utf-8")
css = (D / "layout.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="layout.css">', "<style>\n" + css + "\n</style>")
for nome, tipo in [("logo.png", "image/png"), ("logo-light.png", "image/png"), ("favicon.svg", "image/svg+xml")]:
    b = base64.b64encode((D / nome).read_bytes()).decode()
    html = html.replace(f'"{nome}"', f'"data:{tipo};base64,{b}"')
saida = DOCS / "Manual rápido - Infrações de velocidade.html"
saida.write_text(html, encoding="utf-8")
print("ok", saida)

js = r"""
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[1]);await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
await p.pdf({path:process.argv[2],format:'A4',printBackground:true,preferCSSPageSize:true});await b.close();})();
"""
subprocess.run(["node", "-e", js, str(saida), str(saida.with_suffix(".pdf"))], check=True)
print("ok", saida.with_suffix(".pdf"))
