// Testes do painel (Playwright). Uso: python3 tools/build.py && node tools/test/painel.test.js [filtro]
const {chromium} = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), {pathToFileURL} = require('url');
const {mesDoc, picos, semear} = require('./fixtures');
const URL0 = pathToFileURL(path.join(__dirname, '..', '..', 'Infrações de velocidade.html')).href;

const testes = [];
const teste = (nome, fn) => testes.push({nome, fn});
function ok(c, msg){ if(!c) throw new Error('falhou: '+(msg || '')); }
function igual(a, b, msg){ const x = JSON.stringify(a), y = JSON.stringify(b); if(x !== y) throw new Error((msg ? msg+': ' : '')+'esperado '+y+', veio '+x); }

/* ---------- cenários ---------- */
teste('base: 36 picos 90–95 em setembro geram advertência', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92, 'AAA1A11'))}});
  const r = await p.evaluate(() => __painel.A().mot.get('ANA TESTE').hist['2026-09']);
  igual(r.advs, ['b1']); igual(r.advAc, 1);
});

/* ---------- runner ---------- */
(async () => {
  const filtro = process.argv[2] || '';
  const b = await chromium.launch({args:['--disable-dev-shm-usage']});
  let falhas = 0, n = 0;
  for(const t of testes.filter(t => t.nome.includes(filtro))){
    n++;
    const ctx = await b.newContext({viewport:{width:1280, height:900}});
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', e => erros.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await p.addInitScript(() => { window.__teste = true; });
    p.on('dialog', d => d.accept());
    try{
      await p.goto(URL0);
      await t.fn(p, ctx);
      if(erros.length) throw new Error('erro na página: '+erros[0]);
      console.log('PASS', t.nome);
    }catch(e){ falhas++; console.log('FAIL', t.nome, '\n   ', e.message.split('\n')[0]); }
    await ctx.close();
  }
  await b.close();
  console.log((n - falhas)+'/'+n+' passaram');
  process.exit(falhas ? 1 : 0);
})();

module.exports = {teste, ok, igual, mesDoc, picos, semear};
