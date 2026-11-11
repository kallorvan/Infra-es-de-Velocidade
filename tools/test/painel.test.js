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

/* ---------- anulações: cálculo ---------- */
const anul = (cond, l, motivo = 'sascar', extra = {}) => {
  const chave = cond+'|'+l.ts+'|'+l.nome+'|'+l.placa+'|'+l.vel;
  return [chave.toLowerCase().replace(/[^a-z0-9]+/g, '-'), Object.assign({chave, mes:l.ts.slice(0,7), cond, motorista:l.nome, ts:l.ts, placa:l.placa, vel:l.vel, dur:l.dur || 30, motivo, obs:'', anuladoEm:'2026-11-10T12:00:00.000Z', anuladoPor:'Teste'}, extra)];
};
const hist = (p, nome, mes) => p.evaluate(([n, m]) => { const M = __painel.A().mot.get(n); const c = M.meses[m]; return Object.assign({}, M.hist[m], {b1:c && c.b1, b2:c && c.b2, ch:c && c.ch, anulados:c && c.anulados, temMes:!!c}); }, [nome, mes]);

teste('anular 3 de 36 picos 90–95 tira a advertência e desfazer devolve', async p => {
  const L = picos('ANA TESTE', '2026-09', 36, 92, 'AAA1A11');
  const an = Object.fromEntries(L.slice(0, 3).map(l => anul('seco', l)));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, anulacoes:an});
  let r = await hist(p, 'ANA TESTE', '2026-09');
  igual(r.advs, []); igual(r.advAc, 0); igual(r.b1, 33); igual(r.anulados, 3);
  await p.evaluate(async ids => { for(const id of ids) await __painel.store.del('anulacoes', id); __painel.render(); }, Object.keys(an));
  r = await hist(p, 'ANA TESTE', '2026-09');
  igual(r.advs, ['b1']); igual(r.b1, 36); igual(r.anulados, 0);
});

teste('cascata: anulação em setembro desfaz suspensão por 3 advertências em outubro', async p => {
  const set = picos('BIA TESTE', '2026-09', 36, 92).concat(picos('BIA TESTE', '2026-09', 6, 97, null, {desloc:40}));
  const out = picos('BIA TESTE', '2026-10', 36, 92);
  const meses = {'2026-09-seco': mesDoc('2026-09', 'seco', set), '2026-10-seco': mesDoc('2026-10', 'seco', out)};
  await semear(p, {meses});
  let r = await hist(p, 'BIA TESTE', '2026-10'); igual(r.susAdv, 1, 'antes');
  const b2 = set.filter(l => l.vel === 97).slice(0, 2);
  await semear(p, {meses, anulacoes:Object.fromEntries(b2.map(l => anul('seco', l)))});
  r = await hist(p, 'BIA TESTE', '2026-10'); igual(r.susAdv, 0); igual(r.advAc, 2);
});

teste('RF1: mesmo instante em seco e chuva, só a condição anulada sai', async p => {
  const seco = picos('CAIO TESTE', '2026-09', 36, 92), chuva = picos('CAIO TESTE', '2026-09', 21, 92, null, {dur:120});
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', seco), '2026-09-chuva': mesDoc('2026-09', 'chuva', chuva)}, anulacoes:Object.fromEntries([anul('seco', seco[0])])});
  const r = await hist(p, 'CAIO TESTE', '2026-09');
  igual(r.b1, 35); igual(r.ch, 21); igual(r.advs, ['ch']);
});

teste('RF2: todos os picos anulados → mês continua, dentro da tolerância', async p => {
  const L = picos('DANI TESTE', '2026-09', 36, 92);
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, anulacoes:Object.fromEntries(L.map(l => anul('seco', l)))});
  const r = await hist(p, 'DANI TESTE', '2026-09');
  ok(r.temMes, 'mês existe'); igual(r.advs, []); igual(r.b1, 0); igual(r.anulados, 36);
});

teste('backup leva e restaura anulações', async p => {
  const L = picos('EDU TESTE', '2026-09', 36, 92);
  const an = Object.fromEntries(L.slice(0, 3).map(l => anul('seco', l)));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, anulacoes:an});
  const d = await p.evaluate(() => __painel.dadosCompletos());
  igual(Object.keys(d.anulacoes || {}).length, 3, 'no backup');
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}});
  await p.evaluate(d => __painel.restaurarCompleto(d).then(__painel.render), d);
  const r = await hist(p, 'EDU TESTE', '2026-09'); igual(r.anulados, 3); igual(r.advs, []);
});

/* ---------- anulações: tela ---------- */
const abrirMotorista = async (p, nome, mes) => {
  if(mes) await p.selectOption('#mes', mes);
  await p.click('#tab-mot');
  if(nome) await p.selectOption('#m-sel', nome);
};
const marcar = async (p, filtroTexto, n) => {
  const linhas = await p.$$('#m-ev tbody tr');
  let k = 0;
  for(const tr of linhas){ if(k >= n) break; const t = await tr.innerText(); const cb = await tr.$('input[data-anul]'); if(cb && (!filtroTexto || t.includes(filtroTexto))){ await cb.check(); k++; } }
  return k;
};

teste('UI: selecionar 3 picos, motivo SASCAR, prévia e confirmar', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92))}});
  await abrirMotorista(p);
  igual(await marcar(p, '', 3), 3, 'caixas');
  ok(await p.isVisible('#anul-bar'), 'barra visível');
  await p.selectOption('#anul-motivo', 'sascar');
  const prev = await p.innerText('#anul-prev');
  ok(prev.includes('36 → 33'), 'prévia contagem: '+prev); ok(prev.includes('Advertência → Dentro da tolerância'), 'prévia situação: '+prev);
  await p.click('#anul-ok');
  await p.waitForFunction(() => document.querySelectorAll('#m-ev tr.anulada').length === 3);
  ok((await p.innerText('#m-hero')).includes('Dentro da tolerância'), 'hero');
  ok((await p.innerText('#m-ev')).includes('Erro de leitura SASCAR'), 'motivo na linha');
  ok(!(await p.isVisible('#anul-bar')), 'barra some');
  const n = await p.evaluate(() => Object.keys(__painel.store.data.anulacoes).length); igual(n, 3, 'gravadas');
});

teste('UI: desfazer anulação na linha', async p => {
  const L = picos('ANA TESTE', '2026-09', 36, 92);
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, anulacoes:Object.fromEntries([anul('seco', L[0])])});
  await abrirMotorista(p);
  await p.click('[data-anul-desfazer]');
  await p.waitForFunction(() => !document.querySelector('#m-ev tr.anulada'));
  igual(await p.evaluate(() => Object.keys(__painel.store.data.anulacoes).length), 0);
});

teste('UI: motivo Outro exige observação', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92))}});
  await abrirMotorista(p); await marcar(p, '', 1);
  await p.selectOption('#anul-motivo', 'outro');
  ok(await p.isDisabled('#anul-ok'), 'desabilitado sem obs');
  await p.fill('#anul-obs', 'Velocímetro trocado em 05/09');
  ok(!(await p.isDisabled('#anul-ok')), 'habilitado com obs');
});

teste('UI: prévia avisa mês seguinte afetado', async p => {
  const set = picos('BIA TESTE', '2026-09', 36, 92).concat(picos('BIA TESTE', '2026-09', 6, 97, null, {desloc:40}));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', set), '2026-10-seco': mesDoc('2026-10', 'seco', picos('BIA TESTE', '2026-10', 36, 92))}});
  await abrirMotorista(p, 'BIA TESTE', '2026-09');
  igual(await marcar(p, '97 km/h', 2), 2);
  await p.selectOption('#anul-motivo', 'caminhao');
  const prev = await p.innerText('#anul-prev');
  ok(prev.includes('Outubro 2026'), 'mês seguinte: '+prev);
});

teste('RF3: seleção com chave que deixou de existir é descartada', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92)), '2026-09-chuva': mesDoc('2026-09', 'chuva', picos('ANA TESTE', '2026-09', 3, 75, null, {dur:120}))}});
  await abrirMotorista(p); await marcar(p, 'Chuva', 1);
  ok(await p.isVisible('#anul-bar'), 'barra');
  await p.evaluate(() => __painel.store.del('meses', '2026-09-chuva').then(__painel.render));
  ok(!(await p.isVisible('#anul-bar')), 'barra some sem seleção válida');
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
