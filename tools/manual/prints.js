const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
// Uso: S=<pasta de trabalho> node tools/manual/prints.js  (S precisa ter xlsx.js, pdfjs/package/build/, fict/ e prints/)
const S = process.env.S || process.cwd(), F = S+'/fict/', O = S+'/prints/', PJ = S+'/pdfjs/package/build/';
const HTML = require('path').join(__dirname, '..', '..', 'Infrações de velocidade.html');
const URL0 = 'http://localhost:8765/painel.html';
const prep = async (p, dev, nome) => {
  await p.route('**/*', r => { const u=r.request().url();
    if(u===URL0) return r.fulfill({path:HTML, contentType:'text/html; charset=utf-8'});
    if(u.includes('xlsx.full')) return r.fulfill({path:S+'/xlsx.js', contentType:'text/javascript'});
    if(u.endsWith('pdf.min.js')) return r.fulfill({path:PJ+'pdf.min.js', contentType:'text/javascript'});
    if(u.endsWith('pdf.worker.min.js')) return r.fulfill({path:PJ+'pdf.worker.min.js', contentType:'text/javascript'});
    if(/^(blob|data):/.test(u)) return r.continue(); return r.abort(); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.addInitScript(([dev,nome]) => { window.__escolherPasta = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Equipe', {create:true});
    if(!sessionStorage.x){ sessionStorage.x=1; localStorage.setItem('infra-vel-dispositivo',dev); if(nome) localStorage.setItem('infra-vel-usuario',nome); } }, [dev,nome]);
};
(async () => {
  const b = await chromium.launch({args:['--disable-dev-shm-usage']});
  const ctx = await b.newContext({viewport:{width:1280,height:820}, deviceScaleFactor:1.5});
  const A = await ctx.newPage(); await prep(A,'pcana',null); A.on('crash',()=>console.log('CRASH')); A.on('close',()=>console.log('CLOSE')); A.on('dialog', d=>{console.log('DIALOG',d.type()); d.accept();});
  await A.goto(URL0); await A.waitForTimeout(400);
  await A.evaluate(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n,{recursive:true}); });
  await A.reload(); await A.waitForTimeout(500);
  const shot = async (nome, sel, pad=0) => { await A.evaluate(()=>{document.querySelector('header.top').style.position='static';}); const el = await A.$(sel); await el.scrollIntoViewIfNeeded(); await A.waitForTimeout(200);
    const bb = await el.boundingBox(); await A.screenshot({path:O+nome, clip:{x:Math.max(0,bb.x-pad), y:Math.max(0,bb.y-pad), width:Math.min(1280,bb.width+2*pad), height:bb.height+2*pad}}); await A.evaluate(()=>{document.querySelector('header.top').style.position='';}); };
  await A.fill('#pasta-nome','Ana Souza');
  await A.screenshot({path:O+'00-conectar.png', clip:{x:0,y:0,width:1280,height:260}});
  console.log('connect'); await A.click('[data-pasta="escolher"]'); await A.waitForTimeout(800); console.log('connected');
  const B = await ctx.newPage(); await prep(B,'pcbruno','Bruno Lima');
  // este Chromium de teste cai ao ler da IndexedDB um atalho de pasta OPFS: a aba B usa outra base
  await B.addInitScript(() => { const o = indexedDB.open.bind(indexedDB); indexedDB.open = (n, v) => o(n+'-b', v); });
  await B.goto(URL0); await B.waitForTimeout(500); await B.click('[data-pasta="escolher"]'); await B.waitForTimeout(1500);
  console.log('B up');
  await A.bringToFront();

  // restaura a base fictícia
  await A.click('#tab-imp'); await A.setInputFiles('#rest-file', F+'backup-completo-exemplo.json'); await A.waitForSelector('#rest-ok'); await A.click('#rest-ok');
  await A.waitForFunction(() => /restaurado/.test(document.querySelector('#rest-prev').textContent), null, {timeout:60000});
  await A.waitForTimeout(800);
  console.log('restored');  b.on('disconnected',()=>console.log('BROWSER DISC'));
  // colega conectado
  await A.waitForTimeout(9000);
  await A.evaluate(()=>window.scrollTo(0,0));
  await A.click('#tab-geral'); await A.waitForTimeout(300);
  await A.screenshot({path:O+'00-topo-online.png', clip:{x:0,y:0,width:1280,height:150}});
  // importação do dia
  await A.click('#tab-imp'); await A.evaluate(()=>{document.querySelector('#rest-prev').innerHTML='';}); await A.setInputFiles('#file', [F+'exemplo-dia-seco.xlsx', F+'exemplo-dia-chuva.xlsx']); await A.waitForSelector('#imp-ok');
  await A.evaluate(()=>window.scrollTo(0,0)); await A.waitForTimeout(200); await A.screenshot({path:O+'01-importar.png'});
  await A.click('#imp-ok'); await A.waitForTimeout(500);
  // cadastro PDF
  await A.click('#tab-cad'); await A.setInputFiles('#cad-file', F+'exemplo-cadastro-motoristas.pdf'); await A.waitForSelector('#cadimp-ok', {timeout:120000});
  await shot('02-cadastro-conferencia.png', '#cadimp-sec', 8);
  await A.click('#cadimp-ok'); await A.waitForFunction(() => /atualizado/.test(document.querySelector('#cadimp-msg').textContent), null, {timeout:60000});
  await A.evaluate(()=>window.scrollTo(0,0)); await A.waitForTimeout(200); await A.screenshot({path:O+'03-cadastro.png'});
  // visão geral
  await A.click('#tab-geral'); await A.evaluate(()=>window.scrollTo(0,0)); await A.waitForTimeout(300);
  await A.screenshot({path:O+'04-visao-geral.png'});
  await A.click('#v-geral .chip[data-f="pen"]'); await A.waitForTimeout(300);
  const tb = await A.$('#geral-body table'); await tb.scrollIntoViewIfNeeded(); const bb = await tb.boundingBox();
  await A.screenshot({path:O+'05-penalidade.png', clip:{x:bb.x-8, y:bb.y-60, width:bb.width+16, height:Math.min(bb.height+70, 520)}});
  // motorista com penalidade
  await A.click('[data-com-ir="RAFAEL DA TEIXEIRA JARDIM"]'); await A.waitForTimeout(1500);
  await shot('06-whatsapp.png', '#com-sec', 4);
  const img = await A.evaluate(async () => { const r = await fetch(document.querySelector('#com-img').src); const b = await r.blob(); return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result.split(',')[1]); fr.readAsDataURL(b); }); });
  fs.writeFileSync(O+'07-imagem-comunicado.jpg', Buffer.from(img, 'base64'));
  await shot('08-email-rh.png', '#rh-card', 4);
  // inativo
  await A.selectOption('#m-sel', 'WAGNER DA ESTEVES DUARTE').catch(async () => { const v = await A.$$eval('#m-sel option', os => os.map(o=>[o.value,o.textContent])); console.log(v.slice(0,5)); });
  await A.waitForTimeout(800);
  await shot('09-inativo.png', '#com-sec', 4);
  // backup
  await A.click('#tab-imp'); await A.evaluate(()=>{document.querySelector('#rest-prev').innerHTML='';document.querySelector('#imp-msg').innerHTML='';}); await A.waitForTimeout(300); await shot('10-backup.png', '#bkpc-sec', 8);
  await b.close();
})();
