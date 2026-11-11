"""Gera o guia completo (HTML único + PDF A4) no layout padrão Grupo Dínamo / Tóliman.

Uso: python3 tools/manual/completo/build.py
Usa layout.css e logos de tools/manual/rapido/ e os prints de prints/ (dados fictícios).
Saída: docs/Guia completo - Infrações de velocidade.html e .pdf
"""
import base64, pathlib, re, subprocess

D = pathlib.Path(__file__).resolve().parent
R = D.parent / "rapido"
DOCS = D.parents[2] / "docs"
TIPOS = {".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml"}

def data_uri(p):
    return f"data:{TIPOS[p.suffix]};base64," + base64.b64encode(p.read_bytes()).decode()

html = (D / "guia.html").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="layout.css">', "<style>\n" + (R / "layout.css").read_text(encoding="utf-8") + "\n</style>")
for nome in ["logo.png", "logo-light.png", "favicon.svg"]:
    html = html.replace(f'"{nome}"', '"' + data_uri(R / nome) + '"')
html = re.sub(r'src="(prints/[^"]+)"', lambda m: 'src="' + data_uri(D / m.group(1)) + '"', html)

saida = DOCS / "Guia completo - Infrações de velocidade.html"
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
