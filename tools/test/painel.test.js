// Testes do painel (Playwright). Uso: python3 tools/build.py && node tools/test/painel.test.js [filtro]
const {chromium} = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), {pathToFileURL} = require('url');
const {mesDoc, picos, semear} = require('./fixtures');
const URL0 = pathToFileURL(path.join(__dirname, '..', '..', 'Infrações de velocidade.html')).href;

const fs = require('fs');
const XLSX_JS = path.join(__dirname, '.cache', 'xlsx.full.min.js'); // baixe com: cd tools/test/.cache && npm pack xlsx@0.18.5
const temXlsx = fs.existsSync(XLSX_JS);
// só o próprio arquivo é carregado; a biblioteca de planilhas vem do cache local quando existe
const rotas = p => p.route('**/*', r => { const u = r.request().url();
  if(u.startsWith('file:')) return r.continue();
  if(temXlsx && u.includes('xlsx.full')) return r.fulfill({path:XLSX_JS, contentType:'text/javascript'});
  return r.abort(); });
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

/* ---------- pendências de envio ---------- */
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cad = (nome, codigo, situacao = 'Ativo', celular = '13991234567') => ['c'+codigo, {codigo:String(codigo), nome, celular, situacao, atualizadoEm:'2026-11-01T10:00:00.000Z'}];
let nCom = 0;
const env = (nome, mes, tipo, chave, extra = {}) => ['t'+(++nCom), Object.assign({motorista:slug(nome), nome, mes, tipo, chave, enviadoEm:'2026-10-05T12:00:00.000Z', enviadoPor:'Teste'}, extra)];
const PEN = 'pen:2026-09:b1:s0';
const base36 = () => ({'2026-09-seco': mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92))});
const estado = p => p.evaluate(() => { const M = __painel.A().mot.get('ANA TESTE'); const e = __painel.estadoEnvio(M, '2026-09'); return {wa:e.wa.st, rh:e.rh.st, sig:e.sig, n:__painel.pendencias().length}; });

teste('pendências: penalidade sem envio conta nos dois canais', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101)])});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['pendente', 'pendente', 2]); igual(e.sig, PEN);
  ok((await p.innerText('#pend-alerta')).includes('2 pendências de envio'), 'faixa do topo');
});

teste('pendências: WhatsApp enviado e RH não → 1', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN, {sig:PEN})])});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['enviado', 'pendente', 1]);
});

teste('pendências: cadastro inativo não conta', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101, 'Inativo')])});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['bloqueado', 'bloqueado', 0]);
  ok(await p.isHidden('#pend-alerta'), 'sem faixa');
});

teste('pendências: fora do painel limpa o WhatsApp', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101, 'Ativo', '')])});
  await abrirMotorista(p);
  await p.click('#com-fora');
  await p.waitForFunction(() => __painel.pendencias().length === 1);
  const e = await estado(p); igual(e.wa, 'enviado');
  ok((await p.innerText('#pend-alerta')).includes('1 pendência de envio'), 'faixa');
  const r = await p.evaluate(() => Object.values(__painel.store.data.comunicados)[0]);
  igual([r.tipo, r.via, r.sig], ['pen', 'manual', PEN]);
});

teste('RF4: registro antigo de alerta não vale como envio de penalidade', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'alerta', 'alerta:2026-09:b1')])});
  const e = await estado(p); igual(e.wa, 'pendente');
});

teste('RF5: motorista sem cadastro conta como pendente', async p => {
  await semear(p, {meses:base36()});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['pendente', 'pendente', 2]);
});

teste('compatibilidade: envios antigos sem sig aparecem como enviados', async p => {
  await semear(p, {meses:base36(), motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN), env('ANA TESTE', '2026-09', 'rh', 'rh:'+PEN)])});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['enviado', 'enviado', 0]);
  ok(await p.isHidden('#pend-alerta'), 'alerta do topo some sem pendências');
});

/* ---------- retificação ---------- */
const enviadoNos2 = (sig, mes = '2026-09') => Object.fromEntries([env('ANA TESTE', mes, 'pen', sig, {sig}), env('ANA TESTE', mes, 'rh', 'rh:'+sig, {sig})]);
const L36 = () => picos('ANA TESTE', '2026-09', 36, 92);
const an3 = L => Object.fromEntries(L.slice(0, 3).map(l => anul('seco', l)));

teste('retificação: penalidade enviada nos dois canais e anulação que cancela → 2 retificações', async p => {
  const L = L36();
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:enviadoNos2(PEN), anulacoes:an3(L)});
  const e = await estado(p); igual([e.wa, e.rh, e.n], ['retificar', 'retificar', 2]);
  ok((await p.innerText('#pend-alerta')).includes('2 retificações'), 'faixa');
});

teste('retificação: e-mail traz antes, depois e picos anulados com motivo', async p => {
  const L = L36();
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:enviadoNos2(PEN), anulacoes:an3(L)});
  await abrirMotorista(p);
  const assunto = await p.inputValue('#rh-assunto');
  ok(assunto.startsWith('Retificação · Infração de velocidade · Penalidade cancelada · ANA TESTE · Código 101'), assunto);
  const corpo = await p.innerText('#rh-corpo');
  ok(corpo.includes('1 advertência (Seco · 90 a 95 km/h)'), 'antes: '+corpo); ok(corpo.includes('nenhuma penalidade'), 'depois');
  ok(corpo.includes('Erro de leitura SASCAR') && corpo.includes('por Teste'), 'picos anulados');
  ok(await p.isVisible('#com-dl'), 'cancelada: picos corrigidos vão com imagem');
  ok((await p.inputValue('#com-leg')).includes('picos de velocidade de setembro 2026 foram corrigidos'), 'texto do WhatsApp');
});

teste('retificação: marcar RH e abrir WhatsApp zeram as pendências', async p => {
  const L = L36();
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:enviadoNos2(PEN), anulacoes:an3(L)});
  await abrirMotorista(p);
  await p.click('#rh-ok');
  await p.click('#com-wa');
  await p.waitForFunction(() => __painel.pendencias().length === 0);
  const tipos = await p.evaluate(() => Object.values(__painel.store.data.comunicados).map(x => x.tipo+':'+x.sig).sort());
  ok(tipos.includes('ret:nenhuma') && tipos.includes('rhret:nenhuma'), JSON.stringify(tipos));
  ok(await p.isHidden('#pend-alerta'), 'faixa some');
});

teste('retificação: penalidade ajustada (2 adv → 1) mantém imagem e chip Retificação', async p => {
  const L = L36().concat(picos('ANA TESTE', '2026-09', 6, 97, null, {desloc:40}));
  const PEN2 = 'pen:2026-09:b1+b2:s0';
  const b2 = L.filter(l => l.vel === 97).slice(0, 2);
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:enviadoNos2(PEN2), anulacoes:Object.fromEntries(b2.map(l => anul('seco', l)))});
  const e = await estado(p); igual([e.wa, e.rh, e.sig], ['retificar', 'retificar', PEN]);
  await abrirMotorista(p);
  igual(await p.getAttribute('#com-tipos [data-tipo="ret"]', 'aria-pressed'), 'true');
  ok(await p.isVisible('#com-dl'), 'ajustada: com imagem');
  ok((await p.inputValue('#com-leg')).includes('foram corrigidos'), 'texto');
  ok((await p.inputValue('#rh-assunto')).includes('· Advertência ·'), 'assunto ajustado');
});

teste('retificação: desfazer anulação comunicada gera nova retificação', async p => {
  const L = L36();
  const com = Object.assign(enviadoNos2(PEN), Object.fromEntries([env('ANA TESTE', '2026-09', 'ret', 'ret:2026-09:nenhuma', {sig:'nenhuma', enviadoEm:'2026-10-20T12:00:00.000Z'}), env('ANA TESTE', '2026-09', 'rhret', 'rhret:2026-09:nenhuma', {sig:'nenhuma', enviadoEm:'2026-10-20T12:00:00.000Z'})]));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:com, anulacoes:an3(L)});
  let e = await estado(p); igual([e.wa, e.rh], ['enviado', 'enviado'], 'retificação enviada');
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:com});
  e = await estado(p); igual([e.wa, e.rh], ['retificar', 'retificar'], 'anulação desfeita');
});

/* ---------- correções da revisão final ---------- */
teste('final: retificação sem celular pode ser marcada fora do painel', async p => {
  const L = L36();
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101, 'Ativo', '')]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN, {sig:PEN, via:'manual'})]), anulacoes:an3(L)});
  igual((await estado(p)).wa, 'retificar');
  await abrirMotorista(p);
  ok(await p.isVisible('#com-fora'), 'botão visível em retificar');
  await p.click('#com-fora');
  await p.waitForFunction(() => __painel.estadoEnvio(__painel.A().mot.get('ANA TESTE'), '2026-09').wa.st === 'enviado');
  const r = await p.evaluate(() => Object.values(__painel.store.data.comunicados).find(x => x.tipo === 'ret'));
  igual([r.via, r.sig], ['manual', 'nenhuma']);
});

teste('final: penalidade que cresce com dados novos do mês (sem anulação) volta a pendente, não retificar', async p => {
  const L = L36().concat(picos('ANA TESTE', '2026-09', 6, 97, null, {desloc:40}));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:enviadoNos2(PEN)});
  const e = await estado(p); igual([e.wa, e.rh, e.sig], ['pendente', 'pendente', 'pen:2026-09:b1+b2:s0']);
  await abrirMotorista(p);
  ok(!(await p.inputValue('#rh-assunto')).startsWith('Retificação'), 'e-mail normal');
});

teste('final: e-mail ao RH informa o WhatsApp de retificação e o fora do painel', async p => {
  const L = L36().concat(picos('ANA TESTE', '2026-09', 6, 97, null, {desloc:40}));
  const PEN2 = 'pen:2026-09:b1+b2:s0';
  const b2 = L.filter(l => l.vel === 97).slice(0, 2);
  const com = Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN2, {sig:PEN2}), env('ANA TESTE', '2026-09', 'ret', 'ret:2026-09:'+PEN, {sig:PEN, enviadoEm:'2026-10-20T12:00:00.000Z'})]);
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:com, anulacoes:Object.fromEntries(b2.map(l => anul('seco', l)))});
  await abrirMotorista(p);
  await p.evaluate(() => { const M = __painel.A().mot.get('ANA TESTE'); }); // só garante a análise
  const txt = await p.evaluate(() => __painel.emailRH('ANA TESTE', '2026-09'));
  ok(txt.includes('Picos enviados ao motorista: enviados por WhatsApp em 20/10/2026'), txt.split('\n').filter(l => l.includes('motorista')).join(' | '));
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L36())}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN, {sig:PEN, via:'manual'})])});
  const t2 = await p.evaluate(() => __painel.emailRH('ANA TESTE', '2026-09'));
  ok(t2.includes('Picos enviados ao motorista: registrados como enviados fora do painel em 05/10/2026'), t2.split('\n').filter(l => l.includes('motorista')).join(' | '));
});

/* ---------- motorista recebe só os picos; RH recebe a imagem completa ---------- */
const PENALIDADE = /ADVERTÊNCIA|SUSPENS|TÉRMINO|penalidade|Perda de pontuação|advertência/;
teste('imagem do motorista: só picos, sem penalidade nem acumulado', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L36())}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)])});
  await abrirMotorista(p);
  for(const t of ['pen', 'resumo', 'alerta']){
    const tx = await p.evaluate(t => __painel.textosImg('ANA TESTE', '2026-09', t, false), t);
    const ruim = tx.filter(x => PENALIDADE.test(x));
    igual(ruim, [], 'tipo '+t);
    ok(tx.some(x => x.includes('Pista seca · 90 a 95')), 'faixas presentes ('+t+')');
  }
  ok((await p.evaluate(() => __painel.textosImg('ANA TESTE', '2026-09', 'pen', false))).includes('Picos de velocidade do mês'), 'título');
  igual(await p.innerText('#com-tipos [data-tipo="pen"]'), 'Picos do mês · pendente');
  ok(!(await p.inputValue('#com-leg')).includes('excesso'), 'legenda sem penalidade');
});

teste('imagem completa (RH): situação, penalidade e acumulado', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L36())}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)])});
  const tx = await p.evaluate(() => __painel.textosImg('ANA TESTE', '2026-09', 'pen', true));
  ok(tx.includes('ADVERTÊNCIA') && tx.includes('ADVERTÊNCIAS ACUMULADAS') && tx.includes('SUSPENSÕES ACUMULADAS'), JSON.stringify(tx));
});

teste('RH: .eml com destinatários, assunto, corpo e imagem anexada', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L36())}, motoristas:Object.fromEntries([cad('ANA TESTE', 101)]), config:{rh:{para:'rh@exemplo.com; dp@exemplo.com', cc:'gestor@exemplo.com'}}});
  await abrirMotorista(p);
  ok((await p.innerText('#rh-corpo')).includes('Segue em anexo o comunicado completo'), 'corpo cita o anexo');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rh-eml')]);
  ok(/^E-mail RH - ANA TESTE - Setembro 2026\.eml$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const eml = fs.readFileSync(await dl.path(), 'utf8');
  ok(eml.startsWith('X-Unsent: 1\r\n'), 'rascunho');
  ok(eml.includes('To: rh@exemplo.com, dp@exemplo.com\r\n') && eml.includes('Cc: gestor@exemplo.com\r\n'), 'destinatários');
  ok(/Content-Type: image\/jpeg; name="comunicado-completo-ana-teste-2026-09\.jpg"/.test(eml), 'anexo');
  const anexo = eml.split('filename="comunicado-completo-ana-teste-2026-09.jpg"')[1].split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
  ok(Buffer.from(anexo, 'base64').slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), 'JPEG válido');
  const assunto = await p.evaluate(eml => { const m = eml.match(/Subject: ((?:.*\r\n )*.*)\r\n/)[1]; return m.split('\r\n ').map(w => { const b = w.match(/=\?UTF-8\?B\?(.*)\?=/); return b ? decodeURIComponent(escape(atob(b[1]))) : w; }).join(''); }, eml);
  igual(assunto, await p.inputValue('#rh-assunto'));
  const [di] = await Promise.all([p.waitForEvent('download'), p.click('#rh-img')]);
  igual(di.suggestedFilename(), 'comunicado-completo-ana-teste-2026-09.jpg');
});

/* ---------- aba Histórico ---------- */
const doisMot = () => {
  const ana = picos('ANA TESTE', '2026-09', 36, 92, 'AAA1A11'), anaOut = picos('ANA TESTE', '2026-10', 10, 92, 'AAA1A11');
  const bia = picos('BIA TESTE', '2026-09', 5, 92, 'BBB2B22');
  return {'2026-09-seco': mesDoc('2026-09', 'seco', ana.concat(bia)), '2026-10-seco': mesDoc('2026-10', 'seco', anaOut)};
};

teste('histórico: linha por motorista e coluna por mês, com pontos M/RH', async p => {
  await semear(p, {meses:doisMot(), motoristas:Object.fromEntries([cad('ANA TESTE', 101), cad('BIA TESTE', 102)]), comunicados:Object.fromEntries([env('ANA TESTE', '2026-09', 'pen', PEN, {sig:PEN})])});
  await p.click('#tab-hist');
  igual(await p.$$eval('#hist-tbl thead th[data-mes]', t => t.map(x => x.dataset.mes)), ['2026-09', '2026-10']);
  igual(await p.$$eval('#hist-tbl tbody tr', t => t.length), 2);
  const cel = '#hist-tbl tbody tr[data-nome="ANA TESTE"] td[data-mes="2026-09"]';
  ok((await p.innerText(cel)).includes('Adv.'), 'selo');
  ok(await p.$(cel+' .ponto.m.ok'), 'M enviado'); ok(await p.$(cel+' .ponto.rh.pend'), 'RH pendente');
  ok((await p.getAttribute(cel+' .ponto.m', 'title')).includes('por Teste'), 'quem enviou');
  ok(!(await p.$('#hist-tbl tbody tr[data-nome="BIA TESTE"] .ponto')), 'sem penalidade sem pontos');
  ok((await p.innerText('#hist-tbl tbody tr[data-nome="BIA TESTE"] td[data-mes="2026-10"]')).trim() === '—', 'mês sem evento');
});

teste('histórico: anulações aparecem na célula do mês', async p => {
  const L = picos('ANA TESTE', '2026-09', 36, 92);
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09', 'seco', L)}, anulacoes:an3(L)});
  await p.click('#tab-hist');
  ok((await p.innerText('#hist-tbl td[data-mes="2026-09"] .anul-n')).includes('3'), 'marcador');
});

teste('histórico: filtro Com pendência e busca por placa', async p => {
  await semear(p, {meses:doisMot(), motoristas:Object.fromEntries([cad('ANA TESTE', 101), cad('BIA TESTE', 102)])});
  await p.click('#tab-hist');
  await p.click('#hist-chips [data-f="pend"]');
  igual(await p.$$eval('#hist-tbl tbody tr', t => t.map(x => x.dataset.nome)), ['ANA TESTE']);
  await p.click('#hist-chips [data-f="todos"]');
  await p.fill('#hist-q', 'bbb2');
  igual(await p.$$eval('#hist-tbl tbody tr', t => t.map(x => x.dataset.nome)), ['BIA TESTE']);
  await p.fill('#hist-q', '102');
  igual(await p.$$eval('#hist-tbl tbody tr', t => t.map(x => x.dataset.nome)), ['BIA TESTE'], 'por código');
});

teste('histórico: Ver no alerta abre a aba filtrada', async p => {
  await semear(p, {meses:doisMot(), motoristas:Object.fromEntries([cad('ANA TESTE', 101), cad('BIA TESTE', 102)])});
  await p.click('#pend-alerta [data-pend-ver]');
  ok(await p.isVisible('#v-hist'), 'aba');
  igual(await p.getAttribute('#hist-chips [data-f="pend"]', 'aria-pressed'), 'true');
});

teste('histórico: abrir ficha pelo nome e trocar para mês sem eventos', async p => {
  await semear(p, {meses:doisMot()});
  await p.selectOption('#mes', '2026-10');
  await p.click('#tab-hist');
  await p.click('#hist-tbl tbody tr[data-nome="BIA TESTE"] [data-hist-mot]');
  ok(await p.isVisible('#v-mot'), 'aba Motorista');
  igual(await p.inputValue('#mes'), '2026-09', 'mês mais recente com eventos');
  ok((await p.innerText('#m-hero')).includes('BIA TESTE'), 'ficha da Bia');
  await p.selectOption('#mes', '2026-10');
  ok((await p.innerText('#m-hero')).includes('BIA TESTE'), 'continua na Bia');
  ok((await p.innerText('#m-hero')).includes('Sem eventos em Outubro 2026'), 'sem eventos');
  ok(await p.isHidden('#com-sec'), 'sem quadro de envio');
  ok((await p.innerText('#m-tl')).includes('Setembro 2026'), 'timeline');
});

teste('ficha: histórico disciplinar mostra meses posteriores ao escolhido', async p => {
  await semear(p, {meses:doisMot()});
  await abrirMotorista(p, 'ANA TESTE', '2026-09');
  const tl = await p.innerText('#m-tl');
  ok(tl.includes('Outubro 2026') && tl.includes('Setembro 2026'), tl);
});

/* ---------- pasta da equipe e regressão ---------- */
// pasta simulada com o armazenamento privado do navegador (OPFS), como em tools/manual/prints.js
const HTTP0 = 'http://localhost:8765/painel.html'; // a pasta simulada (OPFS) não existe em páginas file://
const viaHttp = async pg => { await pg.route(HTTP0, r => r.fulfill({path:decodeURIComponent(new URL(URL0).pathname), contentType:'text/html; charset=utf-8'})); await pg.goto(HTTP0); };
const limparOpfs = p => p.evaluate(async () => { const r = await navigator.storage.getDirectory(); for await (const [n] of r.entries()) await r.removeEntry(n, {recursive:true}); });
// caminho "Sistema/dados/x.json" dentro do OPFS
const opfs = {
  ler: (p, cam) => p.evaluate(async cam => { let d = await navigator.storage.getDirectory(); const ps = cam.split('/'); for(const x of ps.slice(0, -1)) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(ps[ps.length-1])).getFile()).text(); }, cam),
  escrever: (p, cam, txt) => p.evaluate(async ([cam, txt]) => { let d = await navigator.storage.getDirectory(); const ps = cam.split('/'); for(const x of ps.slice(0, -1)) d = await d.getDirectoryHandle(x, {create:true}); const w = await (await d.getFileHandle(ps[ps.length-1], {create:true})).createWritable(); await w.write(txt); await w.close(); }, [cam, txt]),
  lista: (p, cam) => p.evaluate(async cam => { let d = await navigator.storage.getDirectory(); for(const x of cam.split('/')) d = await d.getDirectoryHandle(x); const l = []; for await (const [n] of d.entries()) l.push(n); return l.sort(); }, cam)
};
// define a pasta simulada, o id do navegador e tempos curtos; na próxima navegação, vale para a página
const prepPasta = async (p, disp, suf, o = {}) => {
  await p.addInitScript(([d, suf, o]) => {
    window.__escolherPasta = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(o.dir || 'Sistema', {create:true});
    window.__tempos = Object.assign({GRAVAR_MS:150, PULSO_MS:400}, o.tempos || {});
    if(!sessionStorage.x){ sessionStorage.x = 1; localStorage.setItem('infra-vel-dispositivo', d); if(o.nome) localStorage.setItem('infra-vel-usuario', o.nome); }
    // este Chromium de teste cai ao reler da IndexedDB um atalho de pasta OPFS: cada aba usa a sua base
    if(suf){ const op = indexedDB.open.bind(indexedDB); indexedDB.open = (x, v) => op(x+suf, v); }
  }, [disp, suf, o]);
};
// conecta direto (sem a janela de entrada): usado com __semLogin
const conectarPasta = async (p, disp, nome, suf, o = {}) => {
  await prepPasta(p, disp, suf, Object.assign({nome}, o));
  if(p.url().startsWith('http')) await p.reload(); else await viaHttp(p);
  await p.waitForFunction(() => window.__painel && __painel.store.mode !== 'loading');
  await p.evaluate(() => __painel.store.conectarPasta());
  await p.waitForFunction(() => __painel.store.mode === 'pasta', null, {timeout:15000});
};
const DADOS_V1 = (disp, cols) => JSON.stringify({formato:'infracoes-velocidade-pasta', versao:1, dispositivo:disp, usuario:'Velho', atualizadoEm:'2026-11-01T10:00:00.000Z', cols});

teste('pasta: anulação feita na aba A aparece na aba B após a leitura', async (p, ctx) => {
  await viaHttp(p); await limparOpfs(p);
  await conectarPasta(p, 'pcana', 'Ana Souza', '');
  const L = picos('ANA TESTE', '2026-09', 36, 92);
  await p.evaluate(d => __painel.store.put('meses', '2026-09-seco', d).then(__painel.render), mesDoc('2026-09', 'seco', L));
  const B = await ctx.newPage(); B.setDefaultTimeout(20000);
  await rotas(B); await B.addInitScript(() => { window.__teste = true; window.__semLogin = true; });
  await conectarPasta(B, 'pcbruno', 'Bruno Lima', '-b');
  await B.waitForFunction(() => { const M = __painel.A().mot.get('ANA TESTE'); return M && M.meses['2026-09'].b1 === 36; });
  const [id, reg] = anul('seco', L[0], 'caminhao');
  await p.evaluate(([i, r]) => __painel.store.put('anulacoes', i, Object.assign(r, {anuladoPor:'Ana Souza'})).then(__painel.render), [id, reg]);
  await B.waitForFunction(() => __painel.A().mot.get('ANA TESTE').meses['2026-09'].anulados === 1);
  igual(await B.evaluate(() => __painel.A().mot.get('ANA TESTE').meses['2026-09'].b1), 35);
});

teste('pasta: grava dados/<id>.json com versao 2, origem e usuario', async p => {
  await viaHttp(p); await limparOpfs(p);
  await conectarPasta(p, 'pcana', 'Ana Souza', '');
  await p.evaluate(d => __painel.store.put('meses', '2026-09-seco', d), mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 3, 92)));
  await p.waitForTimeout(700);
  const j = JSON.parse(await opfs.ler(p, 'Sistema/dados/pcana.json'));
  igual([j.versao, j.origem, j.usuario, typeof j.geradoEm], [2, 'pcana', 'Ana Souza', 'string']);
  ok(j.cols.meses['2026-09-seco'] && j.cols.meses['2026-09-seco'].b, 'mês gravado');
});

teste('pasta: lê arquivo versão 1 de outro navegador (pasta antiga renomeada)', async p => {
  await viaHttp(p); await limparOpfs(p);
  await opfs.escrever(p, 'Sistema/dados/pcvelho.json', DADOS_V1('pcvelho', {meses:{'2026-09-seco':{t:1700000000000, b:mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92))}}}));
  await opfs.escrever(p, 'Sistema/backups/backup-completo-infracoes-velocidade-2026-11-01_10h00.json', '{}');
  await conectarPasta(p, 'pcana', 'Ana Souza', '');
  await p.waitForFunction(() => { const M = __painel.A().mot.get('ANA TESTE'); return M && M.meses['2026-09'].b1 === 36; });
  const subs = await opfs.lista(p, 'Sistema');
  ok(['backups', 'dados', 'historico', 'presenca', 'usuarios'].every(x => subs.includes(x)), JSON.stringify(subs));
  ok((await opfs.lista(p, 'Sistema/backups')).includes('backup-completo-infracoes-velocidade-2026-11-01_10h00.json'), 'backup antigo fica');
});

const MSG_OUTRA = 'A pasta escolhida se chama Outra. Os dados do sistema ficam na pasta Sistema do canal. Escolha a pasta Sistema ou, se for esta mesmo, clique em Usar esta pasta.';
teste('pasta: pasta com outro nome mostra o aviso e Usar esta pasta segue', async p => {
  await viaHttp(p); await limparOpfs(p);
  await opfs.escrever(p, 'Outra/x.txt', 'oi');
  await prepPasta(p, 'pcana', '', {dir:'Outra', nome:'Ana Souza'}); await p.reload();
  await p.waitForFunction(() => window.__painel && __painel.store.mode !== 'loading');
  await p.evaluate(() => __painel.store.conectarPasta());
  await p.getByText(MSG_OUTRA).waitFor();
  ok(await p.isVisible('[data-pasta="outra"]'), 'Escolher outra pasta');
  igual(await p.evaluate(() => __painel.store.mode), 'local');
  igual(await opfs.lista(p, 'Outra'), ['x.txt'], 'nada criado antes de confirmar');
  await p.click('[data-pasta="usar"]');
  await p.waitForFunction(() => __painel.store.mode === 'pasta');
});

teste('pasta: pasta do canal com "Dados do painel" pede a renomeação', async p => {
  await viaHttp(p); await limparOpfs(p);
  await opfs.escrever(p, 'Equipe/Dados do painel/dados/pcvelho.json', '{}');
  await prepPasta(p, 'pcana', '', {dir:'Equipe', nome:'Ana Souza'}); await p.reload();
  await p.waitForFunction(() => window.__painel && __painel.store.mode !== 'loading');
  await p.evaluate(() => __painel.store.conectarPasta());
  await p.getByText('renomeie a pasta Dados do painel para Sistema', {exact:false}).waitFor();
  igual(await opfs.lista(p, 'Equipe'), ['Dados do painel'], 'nada criado na pasta do canal');
  ok(!(await p.isVisible('[data-pasta="usar"]')), 'sem Usar esta pasta');
});

const hojeISO = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2, '0')+'-'+String(d.getDate()).padStart(2, '0'); };
teste('backup: cópia do dia com o nome do usuário', async p => {
  await viaHttp(p); await limparOpfs(p);
  await conectarPasta(p, 'pcana', 'Ana Souza', '');
  await p.evaluate(d => __painel.store.put('meses', '2026-09-seco', d), mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 3, 92)));
  const nome = 'Infracoes-de-Velocidade_dados_'+hojeISO()+'_ana-souza.json';
  for(let i = 0; i < 40 && !(await opfs.lista(p, 'Sistema/backups')).includes(nome); i++) await p.waitForTimeout(150);
  const j = JSON.parse(await opfs.ler(p, 'Sistema/backups/'+nome));
  ok(j.versao && j.meses && j.meses['2026-09-seco'], 'conteúdo do backup completo');
});

teste('backup: limpeza mantém 60 dias e a primeira de cada mês, só do próprio usuário', async p => {
  await viaHttp(p); await limparOpfs(p);
  const pre = 'Sistema/backups/Infracoes-de-Velocidade_dados_';
  const arqs = ['2026-07-03_ana-souza', '2026-07-20_ana-souza', '2026-08-01_ana-souza', '2026-10-01_ana-souza', '2026-07-20_bruno-lima'];
  for(const a of arqs) await opfs.escrever(p, pre+a+'.json', '{}');
  await opfs.escrever(p, 'Sistema/dados/leia.txt', '');
  await opfs.escrever(p, 'Sistema/backups/backup-completo-infracoes-velocidade-2026-07-21_10h00.json', '{}');
  await conectarPasta(p, 'pcana', 'Ana Souza', '');
  await p.evaluate(() => { localStorage.removeItem('infra-vel-limpeza'); return __painel.limparBackups('2026-11-18'); });
  const l = await opfs.lista(p, 'Sistema/backups');
  ok(!l.includes('Infracoes-de-Velocidade_dados_2026-07-20_ana-souza.json'), 'segunda cópia de julho saiu');
  for(const a of ['2026-07-03_ana-souza', '2026-08-01_ana-souza', '2026-10-01_ana-souza', '2026-07-20_bruno-lima']) ok(l.includes('Infracoes-de-Velocidade_dados_'+a+'.json'), 'fica '+a);
  ok(l.includes('backup-completo-infracoes-velocidade-2026-07-21_10h00.json'), 'antigo fica');
  await opfs.escrever(p, pre+'2026-07-25_ana-souza.json', '{}');
  await p.evaluate(() => __painel.limparBackups('2026-11-18'));
  ok((await opfs.lista(p, 'Sistema/backups')).includes('Infracoes-de-Velocidade_dados_2026-07-25_ana-souza.json'), 'uma limpeza por dia');
});

/* ---------- login (Padrão de Sistemas Tóliman) ---------- */
const loginDe = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// abre o painel com a janela de entrada (sem __semLogin) e a pasta simulada
const abrirComLogin = async (p, disp, suf = '', o = {}) => {
  await p.addInitScript(() => { window.__semLogin = false; });
  await prepPasta(p, disp, suf, o);
  if(p.url().startsWith('http')) await p.reload(); else await viaHttp(p);
  await p.waitForSelector('#dlgEntrada[open]');
};
const enviarEntrada = p => p.click('#dlgEntrada button[type="submit"]');
// chega à tela de entrada já com a pasta conectada
const ateEntrada = async p => { if(await p.isVisible('#dlgEntrada [data-ac="conectar"]')) await p.click('#dlgEntrada [data-ac="conectar"]'); };
const entrar = async (p, o) => {
  await abrirComLogin(p, o.disp, o.suf || '', {tempos:o.tempos});
  await ateEntrada(p);
  if(o.primeiro){ await p.fill('#entNome', o.nome); await p.fill('#entSenha', o.senha); await p.fill('#entRepete', o.senha); }
  else { await p.waitForSelector('#entUsuario'); await p.selectOption('#entUsuario', loginDe(o.nome)); await p.fill('#entSenha', o.senha); }
  await enviarEntrada(p);
  if(!o.erro) await p.waitForFunction(() => __painel.sessao() && !document.querySelector('#dlgEntrada').open);
};
const semearUsuario = (p, u) => p.evaluate(async u => {
  const senha = await __painel.acesso.hashSenha(u.senha);
  const corpo = {versao:1, login:u.login, nome:u.nome, admin:!!u.admin, ativo:u.ativo !== false, trocarSenha:!!u.trocarSenha, senha, criadoEm:'2026-11-01T10:00:00.000Z', criadoPor:'Teste', alteradoEm:'2026-11-01T10:00:00.000Z', alteradoPor:'Teste'};
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Sistema', {create:true}); d = await d.getDirectoryHandle('usuarios', {create:true});
  const w = await (await d.getFileHandle(u.login+'.json', {create:true})).createWritable(); await w.write(JSON.stringify(corpo)); await w.close();
}, u);
const historico = async p => { const l = []; for(const n of await opfs.lista(p, 'Sistema/historico')) l.push(...JSON.parse(await opfs.ler(p, 'Sistema/historico/'+n)).eventos); return l; };
const msgEntrada = p => p.innerText('#entMsg');
const ANA = {login:'ana-souza', nome:'Ana Souza', admin:true, senha:'telemetria1'};
const novoComUsuarios = async (p, us) => { await viaHttp(p); await limparOpfs(p); for(const u of us) await semearUsuario(p, u); };

teste('login: painel fechado até entrar; Esc não fecha', async p => {
  await viaHttp(p); await limparOpfs(p);
  await abrirComLogin(p, 'pcana');
  igual(await p.innerText('#entTitulo'), 'Conectar a pasta do SharePoint');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => document.querySelector('#dlgEntrada').open), 'continua aberta');
  igual(await p.evaluate(() => document.querySelector('#dlgEntrada').matches(':modal')), true, 'modal');
});

teste('login: primeiro acesso cria administrador com senha só em hash', async p => {
  await viaHttp(p); await limparOpfs(p);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'segredo1', primeiro:true});
  const txt = await opfs.ler(p, 'Sistema/usuarios/ana-souza.json'), u = JSON.parse(txt);
  igual([u.admin, u.ativo, u.trocarSenha, u.senha.alg, u.senha.iter], [true, true, false, 'PBKDF2-SHA256', 150000]);
  ok(!txt.includes('segredo1'), 'sem a senha em texto');
  ok((await p.innerText('header')).includes('Ana Souza'), 'nome no topo');
  ok((await historico(p)).some(e => e.tipo === 'entrada' && e.login === 'ana-souza'), 'entrada no histórico');
});

teste('login: senhas curtas e diferentes mostram a mensagem padrão', async p => {
  await viaHttp(p); await limparOpfs(p);
  await abrirComLogin(p, 'pcana'); await ateEntrada(p);
  await p.fill('#entNome', 'Ana Souza'); await p.fill('#entSenha', '123'); await p.fill('#entRepete', '123'); await enviarEntrada(p);
  igual(await msgEntrada(p), 'A senha precisa ter pelo menos 6 caracteres.');
  await p.fill('#entNome', 'Ana Souza'); await p.fill('#entSenha', 'segredo1'); await p.fill('#entRepete', 'segredo2'); await enviarEntrada(p);
  igual(await msgEntrada(p), 'As duas senhas não são iguais.');
});

teste('login: senha errada mostra "Senha incorreta." e vai para o histórico', async p => {
  await novoComUsuarios(p, [ANA]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'errada99', erro:true});
  await p.waitForFunction(() => document.querySelector('#entMsg').innerText.includes('Senha incorreta.'));
  ok((await historico(p)).some(e => e.tipo === 'senha-errada' && e.login === 'ana-souza'), 'registrado');
});

teste('login: senha provisória obriga a troca e recusa a mesma', async p => {
  await novoComUsuarios(p, [ANA, {login:'bruno-lima', nome:'Bruno Lima', senha:'provisoria1', trocarSenha:true}]);
  await entrar(p, {disp:'pcbruno', nome:'Bruno Lima', senha:'provisoria1', erro:true});
  await p.waitForFunction(() => document.querySelector('#entTitulo').innerText === 'Crie a sua senha');
  ok((await p.innerText('#entCorpo')).includes('Olá, Bruno Lima. Você entrou com uma senha provisória. Escolha uma senha sua para continuar.'), 'texto padrão');
  await p.fill('#entSenha', 'provisoria1'); await p.fill('#entRepete', 'provisoria1'); await enviarEntrada(p);
  await p.waitForFunction(() => document.querySelector('#entMsg').innerText === 'Escolha uma senha diferente da provisória.');
  await p.fill('#entSenha', 'minha-senha'); await p.fill('#entRepete', 'minha-senha'); await enviarEntrada(p);
  await p.waitForFunction(() => __painel.sessao() && __painel.sessao().login === 'bruno-lima');
  igual(JSON.parse(await opfs.ler(p, 'Sistema/usuarios/bruno-lima.json')).trocarSenha, false);
});

teste('login: 20 min parado bloqueia e pede só a senha', async p => {
  await novoComUsuarios(p, [ANA]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1', tempos:{PARADO_MS:1500, CHECA_MS:300}});
  await p.evaluate(d => __painel.store.put('meses', '2026-09-seco', d).then(__painel.render), mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92)));
  await p.waitForTimeout(800); // deixa a gravação e o backup do dia terminarem (eles redesenham a tela)
  await abrirMotorista(p);
  await marcar(p, null, 2);
  ok(await p.isVisible('#anul-bar'), 'barra aberta');
  await p.waitForFunction(() => document.querySelector('#dlgEntrada').open, null, {timeout:8000});
  igual(await p.innerText('#entTitulo'), 'Sessão bloqueada');
  ok((await p.innerText('#entCorpo')).includes('O sistema ficou mais de 20 minutos sem uso. Para continuar como Ana Souza, digite a sua senha.'), 'texto padrão');
  const cod = await p.evaluate(() => __painel.store.put('config', 'x', {a:1}).then(() => 'gravou', e => e.code));
  igual(cod, 'bloqueado');
  await p.fill('#entSenha', 'telemetria1'); await enviarEntrada(p);
  await p.waitForFunction(() => !document.querySelector('#dlgEntrada').open);
  ok(await p.isVisible('#anul-bar'), 'a barra continua aberta');
  ok((await historico(p)).some(e => e.tipo === 'bloqueio'), 'bloqueio no histórico');
});

teste('login: usuário desativado some da lista', async p => {
  await novoComUsuarios(p, [ANA, {login:'bruno-lima', nome:'Bruno Lima', senha:'outra123', ativo:false}]);
  await abrirComLogin(p, 'pcana'); await ateEntrada(p);
  await p.waitForSelector('#entUsuario');
  igual(await p.$$eval('#entUsuario option', os => os.map(o => o.value)), ['ana-souza']);
});

teste('login: arquivo pela metade em usuarios/ é ignorado', async p => {
  await novoComUsuarios(p, [ANA]);
  await opfs.escrever(p, 'Sistema/usuarios/x.json', '{"login":');
  await abrirComLogin(p, 'pcana'); await ateEntrada(p);
  await p.waitForSelector('#entUsuario');
  igual(await p.innerText('#entTitulo'), 'Entrar');
  igual(await p.$$eval('#entUsuario option', os => os.map(o => o.value)), ['ana-souza']);
});

teste('login: primeiro acesso com nome já existente é recusado', async p => {
  await viaHttp(p); await limparOpfs(p);
  await abrirComLogin(p, 'pcana'); await ateEntrada(p);
  await p.waitForSelector('#entNome');
  await semearUsuario(p, ANA); // outro computador criou antes
  await p.fill('#entNome', 'Ana Souza'); await p.fill('#entSenha', 'segredo1'); await p.fill('#entRepete', 'segredo1'); await enviarEntrada(p);
  await p.waitForFunction(() => document.querySelector('#entMsg').innerText === 'Já existe um usuário com este nome.');
  ok((await opfs.ler(p, 'Sistema/usuarios/ana-souza.json')).includes('"criadoPor":"Teste"'), 'não sobrescreveu');
});

teste('login: navegador sem suporte', async p => {
  await p.addInitScript(() => { window.__semLogin = false; delete window.showDirectoryPicker; });
  await viaHttp(p);
  await p.waitForSelector('#dlgEntrada[open]');
  igual(await p.innerText('#entTitulo'), 'Navegador sem suporte');
  ok((await p.innerText('#entCorpo')).includes('Abra o sistema no Google Chrome ou no Microsoft Edge. Este navegador não permite usar a pasta do SharePoint, onde ficam os usuários e as senhas.'), 'texto padrão');
});

/* ---------- aba Configurações ---------- */
const BRUNO = {login:'bruno-lima', nome:'Bruno Lima', senha:'bruno-senha1'};
const usuarioArq = async (p, login) => JSON.parse(await opfs.ler(p, 'Sistema/usuarios/'+login+'.json'));
const esperarArq = async (p, cam, cond = () => true) => { for(let i = 0; i < 50; i++){ try{ const j = JSON.parse(await opfs.ler(p, cam)); if(cond(j)) return j; }catch(e){} await p.waitForTimeout(100); } throw new Error('arquivo não chegou: '+cam); };
const abrirCfg = async p => { await p.click('#tab-cfg'); await p.waitForSelector('#v-cfg:not([hidden])'); };

teste('config: administrador cadastra colega com senha provisória', async p => {
  await novoComUsuarios(p, [ANA]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1'});
  await abrirCfg(p);
  await p.fill('#cfg-novo-nome', 'Bruno Lima'); await p.fill('#cfg-novo-senha', 'inicio123');
  await p.click('#cfg-novo-ok');
  const u = await esperarArq(p, 'Sistema/usuarios/bruno-lima.json');
  igual([u.trocarSenha, u.admin, u.ativo, u.criadoPor], [true, false, true, 'Ana Souza']);
  ok(await __senhaOk(p, u, 'inicio123'), 'senha provisória confere');
  ok((await historico(p)).some(e => e.tipo === 'usuario-criado' && e.detalhe.includes('Bruno Lima')), 'histórico');
  await p.waitForSelector('#cfg-usu tr[data-login="bruno-lima"]');
});
const __senhaOk = (p, u, senha) => p.evaluate(async ([u, s]) => (await __painel.acesso.hashSenha(s, u.senha.sal, u.senha.iter)).hash === u.senha.hash, [u, senha]);

teste('config: redefinir senha gera provisória', async p => {
  await novoComUsuarios(p, [ANA, BRUNO]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1'});
  await abrirCfg(p);
  await p.click('#cfg-usu tr[data-login="bruno-lima"] [data-u-acao="redefinir"]');
  await p.waitForFunction(() => /Senha provisória de Bruno Lima: \S{8,}/.test(document.querySelector('#cfg-usu-msg').innerText));
  const prov = (await p.innerText('#cfg-usu-msg')).match(/Bruno Lima: (\S+?)\.?(\s|$)/)[1];
  const u = await esperarArq(p, 'Sistema/usuarios/bruno-lima.json', j => j.trocarSenha);
  ok(await __senhaOk(p, u, prov), 'a provisória mostrada é a gravada');
  ok((await historico(p)).some(e => e.tipo === 'senha-redefinida'), 'histórico');
});

teste('config: único administrador não pode se desativar nem perder o perfil', async p => {
  await novoComUsuarios(p, [ANA]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1'});
  await abrirCfg(p);
  const linha = '#cfg-usu tr[data-login="ana-souza"] ';
  ok(await p.isDisabled(linha+'[data-u-acao="ativo"]') && await p.isDisabled(linha+'[data-u-acao="admin"]'), 'controles desativados');
  igual(await p.getAttribute(linha+'[data-u-acao="admin"]', 'title'), 'Cadastre outro administrador antes');
  igual(await p.innerText('#cfg-admin-aviso'), 'Cadastre um segundo administrador para não perder o acesso em férias ou se alguém esquecer a senha.');
  await p.fill('#cfg-novo-nome', 'Bruno Lima'); await p.fill('#cfg-novo-senha', 'inicio123'); await p.check('#cfg-novo-admin');
  await p.click('#cfg-novo-ok');
  await p.waitForSelector('#cfg-usu tr[data-login="bruno-lima"]');
  ok(await p.isHidden('#cfg-admin-aviso'), 'aviso some com 2 administradores');
  ok(!(await p.isDisabled(linha+'[data-u-acao="admin"]')), 'liberado');
});

teste('config: usuário comum vê só Minha senha', async p => {
  await novoComUsuarios(p, [ANA, BRUNO]);
  await entrar(p, {disp:'pcbruno', nome:'Bruno Lima', senha:'bruno-senha1'});
  await abrirCfg(p);
  ok(await p.isHidden('#cfg-usu-sec') && await p.isHidden('#cfg-hist-sec'), 'só Minha senha');
  await p.fill('#cfg-atual', 'errada99'); await p.fill('#cfg-nova', 'nova-senha2'); await p.fill('#cfg-repete', 'nova-senha2'); await p.click('#cfg-minha-ok');
  await p.waitForFunction(() => document.querySelector('#cfg-minha-msg').innerText === 'Senha incorreta.');
  await p.fill('#cfg-atual', 'bruno-senha1'); await p.fill('#cfg-nova', 'nova-senha2'); await p.fill('#cfg-repete', 'nova-senha2'); await p.click('#cfg-minha-ok');
  await p.waitForFunction(() => document.querySelector('#cfg-minha-msg').innerText === 'Senha alterada.');
  ok(await __senhaOk(p, await usuarioArq(p, 'bruno-lima'), 'nova-senha2'), 'nova senha gravada');
  ok((await historico(p)).some(e => e.tipo === 'troca-senha' && e.login === 'bruno-lima'), 'histórico');
});

teste('config: histórico de acessos lista o mês atual e o anterior de todos os navegadores', async p => {
  await novoComUsuarios(p, [ANA]);
  const d = new Date(), ant = new Date(d.getFullYear(), d.getMonth()-1, 15, 9, 0);
  const mesAnt = ant.getFullYear()+'-'+String(ant.getMonth()+1).padStart(2, '0');
  await opfs.escrever(p, 'Sistema/historico/'+mesAnt+'_pcbruno.json', JSON.stringify({versao:1, origem:'pcbruno', eventos:[{em:ant.toISOString(), tipo:'entrada', login:'bruno-lima', nome:'Bruno Lima', detalhe:'', origem:'pcbruno'}]}));
  await opfs.escrever(p, 'Sistema/historico/2020-01_pcvelho.json', JSON.stringify({versao:1, origem:'pcvelho', eventos:[{em:'2020-01-05T10:00:00.000Z', tipo:'entrada', login:'velho', nome:'Velho', detalhe:'', origem:'pcvelho'}]}));
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1'});
  await abrirCfg(p);
  await p.waitForFunction(() => document.querySelectorAll('#cfg-hist tbody tr').length >= 2);
  const linhas = await p.$$eval('#cfg-hist tbody tr', trs => trs.map(t => t.innerText));
  ok(linhas[0].includes('Ana Souza') && linhas[0].includes('Entrou'), linhas[0]);
  ok(linhas.some(l => l.includes('Bruno Lima')), 'mês anterior, outro navegador');
  ok(!linhas.some(l => l.includes('Velho')), 'meses antigos ficam de fora');
});

/* ---------- ficha do motorista em uso por um colega ---------- */
const duasPessoas = async (p, ctx, tA = {}, tB = {}) => {
  await novoComUsuarios(p, [ANA, BRUNO]);
  await entrar(p, {disp:'pcana', nome:'Ana Souza', senha:'telemetria1', tempos:Object.assign({ONLINE_MS:3000}, tA)});
  await p.evaluate(d => __painel.store.put('meses', '2026-09-seco', d).then(__painel.render), mesDoc('2026-09', 'seco', picos('ANA TESTE', '2026-09', 36, 92, 'AAA1A11').concat(picos('BIA TESTE', '2026-09', 5, 92, 'BBB2B22'))));
  const B = await ctx.newPage(); B.setDefaultTimeout(15000);
  await rotas(B); await B.addInitScript(() => { window.__teste = true; });
  await entrar(B, {disp:'pcbruno', suf:'-b', nome:'Bruno Lima', senha:'bruno-senha1', tempos:Object.assign({ONLINE_MS:3000}, tB)});
  await B.waitForFunction(() => __painel.A().mot.has('ANA TESTE') && __painel.A().mot.has('BIA TESTE'));
  return B;
};
const fichaBloqueada = async B => (await B.isHidden('#m-ev input[data-anul]')) && (await B.getAttribute('#com-wa', 'aria-disabled')) === 'true' && (await B.isDisabled('#rh-ok')) && (await B.isDisabled('#rh-eml'));
const MSG_USO = /^A ficha de ANA TESTE está em uso por Ana Souza desde \d{2}:\d{2}\. Escolha outro motorista ou aguarde: ela é liberada sozinha quando essa pessoa trocar de motorista, ficar 20 minutos sem mexer ou fechar o sistema\.$/;

teste('ficha: aberta por A aparece em uso para B e bloqueia anular e envios', async (p, ctx) => {
  const B = await duasPessoas(p, ctx);
  await abrirMotorista(p, 'ANA TESTE'); await p.waitForTimeout(600);
  await abrirMotorista(B, 'ANA TESTE');
  await B.waitForFunction(() => !document.querySelector('#ficha-uso').hidden);
  ok(MSG_USO.test(await B.innerText('#ficha-uso')), await B.innerText('#ficha-uso'));
  ok(await fichaBloqueada(B), 'ações de gravar bloqueadas');
  ok(await p.isHidden('#ficha-uso'), 'quem abriu primeiro continua livre');
});

teste('ficha: liberada quando A troca de motorista', async (p, ctx) => {
  const B = await duasPessoas(p, ctx);
  await abrirMotorista(p, 'ANA TESTE'); await p.waitForTimeout(600);
  await abrirMotorista(B, 'ANA TESTE');
  await B.waitForFunction(() => !document.querySelector('#ficha-uso').hidden);
  await p.selectOption('#m-sel', 'BIA TESTE');
  await B.waitForFunction(() => document.querySelector('#ficha-uso').hidden);
  ok(!(await fichaBloqueada(B)) && await B.isVisible('#m-ev input[data-anul]'), 'liberada');
});

teste('ficha: liberada 3 min sem presença (A fechou sem avisar)', async (p, ctx) => {
  const B = await duasPessoas(p, ctx);
  await abrirMotorista(p, 'ANA TESTE'); await p.waitForTimeout(600);
  await abrirMotorista(B, 'ANA TESTE');
  await B.waitForFunction(() => !document.querySelector('#ficha-uso').hidden);
  // queda de energia: o computador de A para de avisar a presença e não grava a saída
  await p.evaluate(() => { clearInterval(__painel.pasta.timer); __painel.store._visto = async () => {}; });
  await p.close({runBeforeUnload:false});
  await B.waitForTimeout(800);
  ok(!(await B.isHidden('#ficha-uso')), 'ainda em uso antes do prazo');
  await B.waitForFunction(() => document.querySelector('#ficha-uso').hidden, null, {timeout:8000});
});

teste('ficha: aguardando dados do colega com Abrir assim mesmo', async (p, ctx) => {
  const B = await duasPessoas(p, ctx, {GRAVAR_MS:6000});
  await abrirMotorista(p, 'ANA TESTE'); await p.waitForTimeout(300);
  const L = picos('ANA TESTE', '2026-09', 36, 92, 'AAA1A11'), [id, reg] = anul('seco', L[0], 'sascar');
  await p.evaluate(([i, r]) => __painel.store.put('anulacoes', i, r), [id, reg]);
  await p.selectOption('#m-sel', 'BIA TESTE'); await p.waitForTimeout(600);
  await abrirMotorista(B, 'ANA TESTE');
  await B.waitForFunction(() => !document.querySelector('#ficha-uso').hidden);
  igual(await B.innerText('#ficha-uso .txt'), 'Aguardando chegar pelo OneDrive o que Ana Souza alterou nesta ficha. Costuma levar menos de um minuto.');
  ok(await fichaBloqueada(B), 'bloqueada enquanto aguarda');
  await B.click('[data-ficha="abrir"]');
  await B.waitForFunction(() => document.querySelector('#ficha-uso').hidden);
  ok(!(await fichaBloqueada(B)), 'abriu assim mesmo');
});

teste('regressão: importar planilha, salvar cadastro, comunicado e RH continuam funcionando', async p => {
  if(!temXlsx) throw new Error('falta tools/test/.cache/xlsx.full.min.js (cd tools/test/.cache && npm pack xlsx@0.18.5 e extraia package/dist/xlsx.full.min.js)');
  await semear(p, {config:{rh:{para:'rh@exemplo.com.br', cc:''}}});
  // planilha fictícia gerada no próprio navegador com a biblioteca do painel
  const b64 = await p.evaluate(() => {
    const rows = [['Infrações de Velocidade'], [], ['Data', 'Veículo', 'Motorista', 'Duração', 'Velocidade', 'Tipo Evento', 'Limite']];
    for(let i = 0; i < 36; i++) rows.push([String(1 + (i % 28)).padStart(2, '0')+'/09/2026 10:'+String(i).padStart(2, '0')+':00', 'REG1A23', 'ANA TESTE', '00:30', 92, 'Excesso de velocidade - Seco', 90]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Infrações');
    return XLSX.write(wb, {type:'base64', bookType:'xlsx'});
  });
  await p.click('#tab-imp');
  await p.setInputFiles('#file', {name:'teste-seco.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(b64, 'base64')});
  await p.click('#imp-ok');
  await p.waitForFunction(() => { const M = __painel.A().mot.get('ANA TESTE'); return M && M.meses['2026-09'].b1 === 36; });
  // cadastro manual
  await p.click('#tab-cad');
  await p.fill('#cad-nome', 'ANA TESTE'); await p.fill('#cad-cod', '101'); await p.fill('#cad-cel', '(13) 99123-4567');
  await p.click('#cad-form button[type="submit"]');
  await p.waitForFunction(() => Object.values(__painel.store.data.motoristas).some(m => m.codigo === '101'));
  // comunicado e RH
  await abrirMotorista(p);
  await p.click('#com-wa');
  await p.waitForFunction(() => __painel.estadoEnvio(__painel.A().mot.get('ANA TESTE'), '2026-09').wa.st === 'enviado');
  ok((await p.inputValue('#rh-assunto')).startsWith('Infração de velocidade · Advertência · ANA TESTE'), 'assunto RH');
  await p.click('#rh-ok');
  await p.waitForFunction(() => __painel.pendencias().length === 0);
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
    p.setDefaultTimeout(+process.env.TIMEOUT || 5000);
    const erros = [];
    p.on('pageerror', e => erros.push(e.message));
    await rotas(p);
    await p.addInitScript(() => { window.__teste = true; window.__semLogin = true; });
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
