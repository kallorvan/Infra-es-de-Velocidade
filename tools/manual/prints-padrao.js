// Prints do guia completo e do manual rápido no Padrão de Sistemas Tóliman (dados fictícios).
// Uso: python3 tools/build.py && S=<pasta com fict/ e pdfjs/package/build/> node tools/manual/prints-padrao.js
//   fict/: backup-completo-exemplo.json, exemplo-dia-seco.xlsx, exemplo-dia-chuva.xlsx, exemplo-cadastro-motoristas.pdf
//   (gerados por tools/manual/gerar_ficticios.py). A biblioteca de planilhas vem de tools/test/.cache/xlsx.full.min.js.
// Saída: tools/manual/completo/prints/01-conectar.jpg … 07, 11, 12, 17-usuarios.jpg
// (08–10 e 13–16 saem de tools/manual/prints-historico.js)
const {chromium} = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const S = process.env.S || process.cwd(), F = path.join(S, 'fict') + '/', PJ = path.join(S, 'pdfjs/package/build') + '/';
const R = path.join(__dirname, '..', '..'), O = path.join(__dirname, 'completo', 'prints') + '/';
const HTML = path.join(R, 'Infrações de velocidade.html'), XLSX = path.join(R, 'tools/test/.cache/xlsx.full.min.js');
const URL0 = 'http://localhost:8765/painel.html';

const prep = async (p, disp, suf) => {
  await p.route('**/*', r => { const u = r.request().url();
    if(u === URL0) return r.fulfill({path:HTML, contentType:'text/html; charset=utf-8'});
    if(u.includes('xlsx.full')) return r.fulfill({path:XLSX, contentType:'text/javascript'});
    if(u.endsWith('pdf.min.js')) return r.fulfill({path:PJ+'pdf.min.js', contentType:'text/javascript'});
    if(u.endsWith('pdf.worker.min.js')) return r.fulfill({path:PJ+'pdf.worker.min.js', contentType:'text/javascript'});
    if(/^(blob|data):/.test(u)) return r.continue(); return r.abort(); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('dialog', d => d.accept());
  await p.addInitScript(([d, suf]) => {
    window.__teste = true;
    window.__escolherPasta = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Sistema', {create:true});
    if(!sessionStorage.x){ sessionStorage.x = 1; localStorage.setItem('infra-vel-dispositivo', d); }
    if(suf){ const o = indexedDB.open.bind(indexedDB); indexedDB.open = (x, v) => o(x+suf, v); }
  }, [disp, suf]);
};
const entrar = async (p, nome, senha, primeiro) => {
  await p.waitForSelector('#dlgEntrada[open]');
  if(await p.isVisible('#dlgEntrada [data-ac="conectar"]')) await p.click('#dlgEntrada [data-ac="conectar"]');
  if(primeiro){ await p.fill('#entNome', nome); await p.fill('#entSenha', senha); await p.fill('#entRepete', senha); }
  else { await p.waitForSelector('#entUsuario'); await p.selectOption('#entUsuario', {label:nome}); await p.fill('#entSenha', senha); }
  await p.click('#dlgEntrada button[type="submit"]');
  await p.waitForFunction(() => !document.querySelector('#dlgEntrada').open);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:1280, height:820}, deviceScaleFactor:1.5});
  const A = await ctx.newPage(); await prep(A, 'pcana', '');
  await A.goto(URL0);
  await A.evaluate(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, {recursive:true}); });
  await A.reload(); await A.waitForSelector('#dlgEntrada[open]'); await A.waitForTimeout(400);
  const tela = async nome => { await A.waitForTimeout(250); await A.screenshot({path:O+nome, type:'jpeg', quality:88}); };
  const shot = async (nome, sel, pad = 8, maxH) => {
    const el = await A.$(sel); await el.scrollIntoViewIfNeeded(); await A.waitForTimeout(250); const bb = await el.boundingBox();
    await A.screenshot({path:O+nome, type:'jpeg', quality:88, clip:{x:Math.max(0, bb.x-pad), y:Math.max(0, bb.y-pad), width:Math.min(1280, bb.width+2*pad), height:Math.min(maxH || 1e5, bb.height+2*pad)}});
  };
  // janela de entrada: conectar a pasta e primeiro acesso
  await tela('01-conectar.jpg');
  await A.click('#dlgEntrada [data-ac="conectar"]'); await A.waitForSelector('#entNome');
  await A.fill('#entNome', 'Ana Souza');
  await tela('01b-primeiro-acesso.jpg');
  await A.fill('#entSenha', 'telemetria1'); await A.fill('#entRepete', 'telemetria1');
  await A.click('#dlgEntrada button[type="submit"]'); await A.waitForFunction(() => !document.querySelector('#dlgEntrada').open);
  // cadastra o colega (Configurações) e restaura a base fictícia
  await A.click('#tab-cfg'); await A.fill('#cfg-novo-nome', 'Bruno Lima'); await A.fill('#cfg-novo-senha', 'inicio123'); await A.check('#cfg-novo-admin'); await A.click('#cfg-novo-ok');
  await A.waitForSelector('#cfg-usu tr[data-login="bruno-lima"]');
  await A.click('#tab-imp'); await A.setInputFiles('#rest-file', F+'backup-completo-exemplo.json'); await A.waitForSelector('#rest-ok'); await A.click('#rest-ok');
  await A.waitForFunction(() => /restaurado/.test(document.querySelector('#rest-prev').textContent), null, {timeout:60000});
  // o colega entra com a senha provisória e troca
  const B = await ctx.newPage(); await prep(B, 'pcbruno', '-b'); await B.goto(URL0);
  await B.waitForSelector('#dlgEntrada[open]'); await B.click('#dlgEntrada [data-ac="conectar"]'); await B.waitForSelector('#entUsuario');
  await B.selectOption('#entUsuario', {label:'Bruno Lima'}); await B.fill('#entSenha', 'inicio123'); await B.click('#dlgEntrada button[type="submit"]');
  await B.waitForSelector('#entRepete'); await B.fill('#entSenha', 'bruno-senha'); await B.fill('#entRepete', 'bruno-senha'); await B.click('#dlgEntrada button[type="submit"]');
  await B.waitForFunction(() => !document.querySelector('#dlgEntrada').open);
  await A.bringToFront(); await A.waitForTimeout(25000); // ciclo de 20 s: Ana vê Bruno online
  await A.click('#tab-geral'); await A.evaluate(() => scrollTo(0, 0));
  await A.screenshot({path:O+'02-topo-online.jpg', type:'jpeg', quality:88, clip:{x:0, y:0, width:1280, height:118}});
  // Configurações › Usuários e senhas
  await A.click('#tab-cfg'); await A.waitForTimeout(600); await shot('17-usuarios.jpg', '#cfg-usu-sec');
  // importação do dia
  await A.click('#tab-imp'); await A.evaluate(() => { document.querySelector('#rest-prev').innerHTML = ''; });
  await A.setInputFiles('#file', [F+'exemplo-dia-seco.xlsx', F+'exemplo-dia-chuva.xlsx']); await A.waitForSelector('#imp-ok');
  await A.evaluate(() => scrollTo(0, 0)); await tela('03-importar.jpg');
  await A.click('#imp-ok'); await A.waitForTimeout(800);
  // cadastro: PDF e aba
  await A.click('#tab-cad'); await A.setInputFiles('#cad-file', F+'exemplo-cadastro-motoristas.pdf'); await A.waitForSelector('#cadimp-ok', {timeout:120000});
  await shot('05-cadastro-conferir.jpg', '#cadimp-sec');
  await A.click('#cadimp-ok'); await A.waitForFunction(() => /atualizado/.test(document.querySelector('#cadimp-msg').textContent), null, {timeout:60000});
  await A.evaluate(() => scrollTo(0, 0)); await tela('04-cadastro.jpg');
  // visão geral e filtro Com penalidade
  await A.click('#tab-geral'); await A.evaluate(() => scrollTo(0, 0)); await tela('06-visao-geral.jpg');
  await A.click('#v-geral .chip[data-f="pen"]'); await A.waitForTimeout(300);
  await shot('07-situacao.jpg', '#geral-body .tbl-scroll', 8, 520);
  // motorista inativo
  await A.click('#tab-mot');
  const ina = await A.evaluate(() => { const o = [...document.querySelectorAll('#m-sel option')].map(x => x.value); return o.find(n => __painel.store && Object.values(__painel.store.data.motoristas).some(m => m.nome === n && /inativ/i.test(m.situacao||''))) || null; });
  if(ina){ await A.selectOption('#m-sel', ina); await A.waitForTimeout(800); await shot('11-inativo.jpg', '#com-sec', 4, 360); } else console.log('sem motorista inativo no mês: 11-inativo.jpg mantido');
  // backup
  await A.click('#tab-imp'); await A.evaluate(() => { document.querySelector('#imp-msg').innerHTML = ''; }); await A.waitForTimeout(300);
  await shot('12-backup.jpg', '#bkpc-sec');
  await b.close();
  console.log('ok');
})();
