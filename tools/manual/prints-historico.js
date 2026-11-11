// Prints do guia completo para anulação, Histórico, pendências e retificação (dados fictícios).
// Uso: python3 tools/build.py && node tools/manual/prints-historico.js
// Saída: tools/manual/completo/prints/08-whatsapp.jpg, 09-imagem-motorista.jpg, 10-email-rh.jpg, 13-anular.jpg, 14-historico.jpg, 15-pendencias.jpg, 16-retificacao.jpg
const {chromium} = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), {pathToFileURL} = require('url');
const {mesDoc, picos, semear} = require('../test/fixtures');
const R = path.join(__dirname, '..', '..');
const O = path.join(__dirname, 'completo', 'prints');
const URL0 = pathToFileURL(path.join(R, 'Infrações de velocidade.html')).href;

const RAF = 'RAFAEL DA TEIXEIRA JARDIM', WAG = 'WAGNER DA ESTEVES DUARTE', CAR = 'CARLOS DA MOREIRA PRADO', JOS = 'JOSE DA FARIAS LOPES';
const chave = l => 'seco|'+l.ts+'|'+l.nome+'|'+l.placa+'|'+l.vel;
const anul = (l, motivo, obs, por) => [chave(l).toLowerCase().replace(/[^a-z0-9]+/g, '-'), {chave:chave(l), mes:l.ts.slice(0, 7), cond:'seco', motorista:l.nome, ts:l.ts, placa:l.placa, vel:l.vel, dur:30, motivo, obs, anuladoEm:'2026-11-10T14:20:00.000Z', anuladoPor:por}];
const env = (nome, mes, tipo, sig, quando) => ['e'+Math.random().toString(36).slice(2), {motorista:nome.toLowerCase().replace(/[^a-z0-9]+/g, '-'), nome, mes, tipo, chave:tipo === 'rh' ? 'rh:'+sig : sig, sig, enviadoEm:quando, enviadoPor:'Ana Souza', celular:'13991234567', email:'rh@exemplo.com.br'}];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:1280, height:900}, deviceScaleFactor:2});
  await p.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await p.addInitScript(() => { window.__teste = true; });
  await p.goto(URL0);

  const rafSet = picos(RAF, '2026-09', 37, 92, 'FMY1B78'), rafOut = picos(RAF, '2026-10', 36, 93, 'FMY1B78');
  const wagSet = picos(WAG, '2026-09', 12, 92, 'BPS0D14'), wagOut = picos(WAG, '2026-10', 38, 92, 'BPS0D14').concat(picos(WAG, '2026-10', 6, 97, 'BPS0D14', {desloc:40}));
  const carSet = picos(CAR, '2026-09', 41, 94, 'EQY2C31'), carOut = picos(CAR, '2026-10', 20, 91, 'EQY2C31');
  const josOut = picos(JOS, '2026-10', 30, 92, 'AQS4A81');
  const meses = {'2026-09-seco': mesDoc('2026-09', 'seco', rafSet.concat(wagSet, carSet)), '2026-10-seco': mesDoc('2026-10', 'seco', rafOut.concat(wagOut, carOut, josOut))};
  const PW = 'pen:2026-10:b1+b2:s0', PC = 'pen:2026-09:b1:s0', PR = 'pen:2026-09:b1:s0';
  const dados = {
    meses,
    motoristas:{c1040:{codigo:'1040', nome:RAF, celular:'13991234567', situacao:'Ativo'}, c1047:{codigo:'1047', nome:WAG, celular:'13991234568', situacao:'Ativo'}, c1054:{codigo:'1054', nome:CAR, celular:'13991234569', situacao:'Ativo'}, c1061:{codigo:'1061', nome:JOS, celular:'13991234570', situacao:'Inativo'}},
    comunicados:Object.fromEntries([env(WAG, '2026-10', 'pen', PW, '2026-11-03T09:10:00.000Z'), env(WAG, '2026-10', 'rh', PW, '2026-11-03T09:15:00.000Z'), env(CAR, '2026-09', 'pen', PC, '2026-10-02T10:00:00.000Z'), env(CAR, '2026-09', 'rh', PC, '2026-10-02T10:05:00.000Z'), env(RAF, '2026-09', 'pen', PR, '2026-10-02T11:00:00.000Z')]),
    anulacoes:Object.fromEntries(wagOut.filter(l => l.vel === 97).slice(0, 2).map(l => anul(l, 'sascar', 'Chamado SASCAR 48213', 'Ana Souza'))),
    config:{rh:{para:'rh@exemplo.com.br', cc:'frota@exemplo.com.br'}}
  };
  await semear(p, dados);
  await p.evaluate(() => { document.querySelector('header.top') && (document.querySelector('header.top').style.position = 'static'); });
  const shot = async (nome, sel, pad = 8) => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); const bb = await el.boundingBox();
    await p.screenshot({path:path.join(O, nome), type:'jpeg', quality:88, clip:{x:Math.max(0, bb.x - pad), y:Math.max(0, bb.y - pad), width:Math.min(1280, bb.width + 2 * pad), height:bb.height + 2 * pad}}); };

  // pendências (faixa do topo)
  await shot('15-pendencias.jpg', '#pend-alerta');
  // Histórico
  await p.click('#tab-hist'); await p.waitForTimeout(300);
  await shot('14-historico.jpg', '#v-hist .sec');
  // retificação ao RH (Wagner: penalidade ajustada depois da anulação)
  await p.click('#hist-tbl tbody tr[data-nome="'+WAG+'"] td[data-mes="2026-10"]'); await p.waitForTimeout(400);
  await shot('16-retificacao.jpg', '#rh-card');
  // comunicados de Rafael em outubro: picos ao motorista (WhatsApp) e e-mail ao RH
  await p.click('#tab-hist'); await p.click('#hist-tbl tbody tr[data-nome="'+RAF+'"] td[data-mes="2026-10"]'); await p.waitForTimeout(400);
  await p.waitForFunction(() => document.querySelector('#com-img').naturalWidth > 0); await p.waitForTimeout(300);
  { const el = await p.$('#com-sec'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); const bb = await el.boundingBox();
    await p.screenshot({path:path.join(O, '08-whatsapp.jpg'), type:'jpeg', quality:88, clip:{x:bb.x, y:bb.y, width:bb.width, height:Math.min(bb.height, 560)}}); }
  const img = await p.evaluate(async () => { const b = await (await fetch(document.querySelector('#com-img').src)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); }); });
  require('fs').writeFileSync(path.join(O, '09-imagem-motorista.jpg'), Buffer.from(img, 'base64'));
  await shot('10-email-rh.jpg', '#rh-card');
  // anulação: Carlos, setembro, 6 picos selecionados
  await p.click('#tab-hist'); await p.click('#hist-tbl tbody tr[data-nome="'+CAR+'"] td[data-mes="2026-09"]'); await p.waitForTimeout(400);
  const cbs = await p.$$('#m-ev input[data-anul]'); for(const c of cbs.slice(0, 6)) await c.check();
  await p.selectOption('#anul-motivo', 'caminhao'); await p.fill('#anul-obs', 'Sensor de velocidade trocado em 12/09');
  await p.evaluate(() => { document.querySelector('#anul-bar').style.position = 'static'; });
  await shot('13-anular.jpg', '#anul-bar');
  await b.close();
  console.log('ok');
})();
