// Dados fictícios para os testes do painel (nunca dados reais de motoristas).
const p2 = n => String(n).padStart(2, '0');

// linhas = [{nome, ts:'2026-09-03 10:00:00', placa, vel, dur}]
function mesDoc(mes, tipo, linhas){
  const motoristas = [], ix = {};
  const ev = linhas.map(l => {
    if(!(l.nome in ix)){ ix[l.nome] = motoristas.length; motoristas.push(l.nome); }
    return [ix[l.nome], l.ts, l.placa, l.vel, l.dur == null ? (tipo === 'chuva' ? 120 : 30) : l.dur];
  });
  return {mes, tipo, arquivo:'teste', importadoEm:'2026-11-01T10:00:00.000Z', motoristas, ev};
}

// n eventos em instantes distintos do mês (dia 1..28, hora 6..21, minuto = índice)
function picos(nome, mes, n, vel, placa, o = {}){
  const out = [];
  for(let i = 0; i < n; i++){
    const dia = 1 + (i % 28), hora = 6 + (Math.floor(i / 28) % 16), min = (i + (o.desloc || 0)) % 60;
    out.push({nome, ts:mes+'-'+p2(dia)+' '+p2(hora)+':'+p2(min)+':00', placa:placa || 'TST1A11', vel, dur:o.dur});
  }
  return out;
}

const LS = c => c === 'meses' ? 'infra-vel-meses-v1' : 'infra-vel-'+c+'-v1';
async function semear(page, dados){
  await page.evaluate(([d, keys]) => {
    localStorage.clear();
    for(const c of Object.keys(d)) localStorage.setItem(keys[c], JSON.stringify(d[c]));
  }, [dados, Object.fromEntries(Object.keys(dados).map(c => [c, LS(c)]))]);
  await page.reload();
  await page.waitForFunction(() => window.__painel && window.__painel.A());
}

module.exports = {mesDoc, picos, semear};
