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
  ok(await p.isHidden('#com-dl'), 'cancelada: sem imagem');
  ok((await p.inputValue('#com-leg')).includes('foi cancelada'), 'texto do WhatsApp');
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
  ok((await p.inputValue('#com-leg')).includes('foi ajustada'), 'texto');
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
