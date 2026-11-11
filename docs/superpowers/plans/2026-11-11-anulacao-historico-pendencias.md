# Anulação de picos, aba Histórico e pendências de envio · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** anular picos com motivo e recalcular penalidades, criar a aba Histórico e o alerta de pendências de envio (penalidade e retificação) de todos os meses.

**Architecture:** tudo continua em `src/painel.html` (arquivo único, JS dentro de uma IIFE), seguindo os padrões existentes (`store.put/del`, `render()` redesenha tudo, `COLECOES` sincronizadas pela pasta). Uma coleção nova `anulacoes`; o motor `analisar()` passa a pular eventos anulados; uma função única `estadoEnvio()` decide pendente/enviado/retificar por canal e alimenta Visão geral, Motorista, Histórico e o alerta do topo.

**Tech Stack:** HTML/CSS/JS sem framework; testes com Playwright (`/opt/node-tools/node_modules/playwright`, Chromium pré-instalado) contra o `Infrações de velocidade.html` gerado por `python3 tools/build.py`.

**Spec:** `docs/superpowers/specs/2026-11-11-anulacao-historico-pendencias-design.md`

## Global Constraints

- Textos da tela em português, sem jargão; datas `dd/mm/aaaa hh:mm`.
- Motivos: `caminhao` = "Falha no caminhão (sensor/velocidade)", `sascar` = "Erro de leitura SASCAR", `outro` = "Outro"; `obs` obrigatória só em `outro`.
- Nunca alterar documentos de `meses` ao anular.
- Envio bloqueado (cadastro inativo) não conta como pendência.
- Alerta preventivo e resumo do mês não entram nas pendências.
- Registros antigos de `comunicados` (sem `sig`) continuam válidos: WhatsApp `tipo:'pen'` → `sig = chave`; RH `tipo:'rh'` → `sig = chave` sem o prefixo `rh:`.
- Dados de teste sempre fictícios.
- Depois de cada mudança em `src/painel.html`: `python3 tools/build.py`.

## Review Focus

1. Anular picos de um motorista cujo nome aparece em seco e chuva no mesmo instante: só o evento da condição escolhida é anulado (chave inclui `cond`).
2. Anular todos os picos de um mês: o motorista continua no Histórico com "Dentro da tolerância" e o mês não some.
3. Anulação feita em outro computador chega pela pasta enquanto a ficha está aberta com picos selecionados: a seleção de ids que não existem mais é descartada sem erro.
4. Registro de envio antigo com `chave` de alerta/resumo não pode ser lido como envio de penalidade.
5. Motorista sem cadastro (sem código): Histórico, alerta e retificação funcionam; WhatsApp fica "sem celular" mas a pendência conta.

Cada item tem teste na tarefa dona (marcado "RF n").

---

## Estrutura de arquivos

- Modify: `src/painel.html` — todo o código e CSS.
- Create: `tools/test/painel.test.js` — runner Playwright mínimo (sem dependências extras) com os cenários.
- Create: `tools/test/fixtures.js` — monta dados fictícios (meses, cadastro, comunicados) para semear o `localStorage`.
- Modify: `README.md`, `docs/HANDOFF.md`, `tools/manual/completo/guia.html`, `tools/manual/rapido/manual.html` (Task 7).

---

### Task 1: Runner de testes e gancho de teste

**Files:**
- Create: `tools/test/painel.test.js`, `tools/test/fixtures.js`
- Modify: `src/painel.html` (fim da IIFE)

**Interfaces:**
- Produces:
  - `fixtures.js`: `mesDoc(mes, tipo, linhas) -> {mes, tipo, arquivo:'teste', importadoEm, motoristas:string[], ev:[idx, ts, placa, vel, dur][]}` onde `linhas = [{nome, ts:'2026-09-03 10:00:00', placa, vel, dur}]`; `picos(nome, mes, n, vel, placa) -> linhas` (n eventos em dias/horas distintos); `semear(page, {meses:{id:doc}, motoristas:{}, comunicados:{}, anulacoes:{}})` grava as chaves `infra-vel-meses-v1`, `infra-vel-<col>-v1` e recarrega.
  - `painel.test.js`: `teste(nome, async (page) => {...})`, `ok(cond, msg)`, `igual(a, b, msg)`; abre `file://…/Infrações de velocidade.html` com rota que aborta CDNs; imprime `PASS`/`FAIL` por teste e sai com código 1 se algum falhar. Uso: `node tools/test/painel.test.js [filtro]`.
  - `src/painel.html`: se `window.__teste` for verdadeiro antes do script, expõe `window.__painel = {A:()=>A, store, analisar, estadoEnvio, pendencias, render}` (os nomes que ainda não existem entram nas tarefas seguintes).

- [ ] **Step 1: Escrever `fixtures.js` e o runner com o teste base**

```js
teste('base: 36 picos 90–95 em setembro geram advertência', async p => {
  await semear(p, {meses:{'2026-09-seco': mesDoc('2026-09','seco', picos('ANA TESTE','2026-09',36,92,'AAA1A11'))}});
  const r = await p.evaluate(() => __painel.A().mot.get('ANA TESTE').hist['2026-09']);
  igual(r.advs, ['b1']); igual(r.advAc, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `python3 tools/build.py && node tools/test/painel.test.js` → FAIL (`__painel` indefinido).
- [ ] **Step 3: Adicionar o gancho `window.__painel`** no fim da IIFE, só com `window.__teste` (o runner usa `addInitScript(() => window.__teste = true)`).
- [ ] **Step 4: Rodar** → `PASS base…`.
- [ ] **Step 5: Commit** — `git commit -m "Testes Playwright do painel com dados fictícios"`.

---

### Task 2: Coleção `anulacoes` e motor de penalidades

**Files:**
- Modify: `src/painel.html` — `COLECOES`, `store.data`, `analisar()`, `render()`, `dadosCompletos()`, `prevCompleto()`, `restaurarCompleto()`.
- Test: `tools/test/painel.test.js`

**Interfaces:**
- Produces:
  - `const MOTIVOS = {caminhao:'Falha no caminhão (sensor/velocidade)', sascar:'Erro de leitura SASCAR', outro:'Outro'}`.
  - `chaveAnul(cond, nome, ts, placa, vel) -> string` = `cond+'|'+ts+'|'+nome+'|'+placa+'|'+vel`; `idAnul(chave) -> string` = `slug(chave)`.
  - `analisar(docs, anul)`; `anul` = `store.data.anulacoes`. Cada `ev` ganha `anulado: registro|null`; eventos anulados não somam em faixas, `vmax`, nem penalidades. Cada `M.meses[m]` ganha `anulados: number`.
  - Backup: `dadosCompletos().anulacoes`; restaurar inclui as que faltam (id ausente).

- [ ] **Step 1: Testes que falham**

```js
teste('anular 3 de 36 picos 90–95 tira a advertência e desfazer devolve', …) // semeia anulacoes com 3 registros → advs [] e advAc 0, b1 33, anulados 3; apaga 1 → advs ['b1']
teste('cascata: anulação em setembro desfaz suspensão por 3 advertências em outubro', …)
// set: b1 36 + b2 6 (2 adv); out: b1 36 (3ª adv → susAdv 1). Anular 2 picos b2 em set → out.susAdv 0, out.advAc 2
teste('RF1: mesmo instante em seco e chuva, só a condição anulada sai', …)
teste('RF2: todos os picos anulados → mês continua com situação Dentro da tolerância', …)
teste('backup leva e restaura anulações', …) // dadosCompletos tem anulacoes; apagar, restaurarCompleto(d) → volta
```

- [ ] **Step 2: Rodar** → FAIL nos 5.
- [ ] **Step 3: Implementar** — `COLECOES` += `'anulacoes'`; `store.data.anulacoes = {}`; índice por `chave` dentro de `analisar`; `render()` passa `store.data.anulacoes`; backup/restauração (prévia mostra "N anulações").
- [ ] **Step 4: Rodar** → PASS (incluindo `base`).
- [ ] **Step 5: Commit** — `"Anulação de picos: coleção e recálculo das penalidades"`.

---

### Task 3: Anular picos na aba Motorista

**Files:**
- Modify: `src/painel.html` — HTML da seção de eventos (`#m-ev`), `renderMot()`, CSS, eventos de clique.
- Test: `tools/test/painel.test.js`

**Interfaces:**
- Consumes: `MOTIVOS`, `chaveAnul`, `idAnul`, `analisar(docs, anul)`.
- Produces:
  - `anulUi = {sel:Set<chave>, motivo:'', obs:'', armado:false}` (zerado ao trocar de motorista/mês).
  - `preverAnulacao(M, mes, chaves) -> {antes:{b1,b2,b3,ch,sit}, depois:{…}, afetados:[{mes, antes:sit, depois:sit}]}` — roda `analisar` com as anulações atuais + as selecionadas.
  - `async anularSelecionados()` grava um registro por chave `{chave, mes, cond, motorista, ts, placa, vel, dur, motivo, obs, anuladoEm, anuladoPor:store.uid||null}`; `async desfazerAnulacao(id)` = `store.del('anulacoes', id)`.
  - DOM: `#m-ev` ganha coluna de seleção (`input[data-anul]` com a chave), `#anul-bar` (`#anul-motivo` select, `#anul-obs`, `#anul-prev`, `#anul-ok`), linhas anuladas com classe `anulada` e botão `[data-anul-desfazer=id]`.

- [ ] **Step 1: Testes que falham**

```js
teste('UI: selecionar 3 picos, motivo SASCAR, prévia e confirmar', …)
// marca 3 checkboxes; #anul-prev contém "36 → 33" e "Advertência → Dentro da tolerância"; #anul-ok; 3 linhas .anulada; situação no #m-hero vira Dentro da tolerância
teste('UI: motivo Outro exige observação', …) // #anul-ok desabilitado até preencher #anul-obs
teste('UI: prévia avisa mês seguinte afetado', …) // cenário da cascata → #anul-prev contém "Outubro 2026"
teste('RF3: seleção com chave que deixou de existir é descartada', …) // seleciona, remove o mês do store e chama render → sem erro, #anul-bar oculto
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — barra fixa abaixo da tabela de eventos quando `anulUi.sel.size>0`; "selecionar todos" no cabeçalho (só eventos não anulados); motivo/obs; linha anulada riscada com selo do motivo, "por <anuladoPor>" e data; tudo escondido se `!store.canWrite`.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** — `"Anulação de picos na aba Motorista, com prévia do efeito"`.

---

### Task 4: Estado de envio por canal, alerta do topo e "fora do painel"

**Files:**
- Modify: `src/painel.html` — `comInfo()`, `celEnvio()`, `registrarEnvio()`, `marcarRH()`, `renderCom()`, `renderRH()`, `render()`, HTML do topo.
- Test: `tools/test/painel.test.js`

**Interfaces:**
- Consumes: `A`, `comInfo`, `enviados(nome)`, `cadDe`, `ativo`.
- Produces:
  - `sigDe(registro) -> string|null` (regra de compatibilidade das Global Constraints; alerta/resumo → `null`).
  - `estadoEnvio(M, mes) -> {sig:string|null, wa:{st, ult}, rh:{st, ult}}`, `st ∈ 'pendente'|'enviado'|'retificar'|'bloqueado'|'nada'`, `ult` = registro mais recente do canal no mês entre `tipo ∈ {pen, ret}` (WhatsApp) / `{rh, rhret}` (RH) com `sigDe` não nulo. Tabela de estados da spec, seção 3.
  - `pendencias() -> [{M, mes, canal:'wa'|'rh', st:'pendente'|'retificar'}]` para todos os motoristas e meses.
  - Todo registro novo de envio grava `sig`. `comInfo().pendente` / `rhPendente` passam a vir de `estadoEnvio` (`pendente` continua `'pen'|'alerta'|null`; alerta só quando o canal WhatsApp está `nada`/`enviado` e o alerta não foi enviado).
  - `#pend-alerta` (faixa abaixo do cabeçalho): "N pendências de envio · X ao motorista · Y ao RH · Z retificações · Ver"; botão `[data-pend-ver]` (Task 6 liga ao Histórico; até lá abre a Visão geral com filtro Comunicado pendente).
  - Botão `#com-fora` "Marcar como enviado (fora do painel)" no quadro de WhatsApp quando `wa.st==='pendente'`: grava `{…, tipo:'pen', via:'manual', chave:info.chaves.pen, sig}` sem exigir celular.

- [ ] **Step 1: Testes que falham**

```js
teste('pendências: penalidade sem envio conta nos dois canais', …) // pendencias().length === 2
teste('pendências: WhatsApp enviado e RH não → 1', …)
teste('pendências: cadastro inativo não conta', …)
teste('pendências: fora do painel limpa o WhatsApp', …) // clica #com-fora → wa.st 'enviado'; #pend-alerta mostra "1 pendência"
teste('RF4: registro antigo de alerta não vale como envio de penalidade', …)
teste('RF5: motorista sem cadastro conta como pendente', …)
teste('compatibilidade: envios antigos sem sig aparecem como enviados', …)
teste('alerta do topo some sem pendências', …)
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** `sigDe`, `estadoEnvio`, `pendencias`, faixa `#pend-alerta`, `#com-fora`; ícone âmbar `.ei.ret` em `celEnvio` quando `retificar`.
- [ ] **Step 4: Rodar tudo** → PASS (inclusive Tasks 1–3).
- [ ] **Step 5: Commit** — `"Estado de envio por canal e alerta de pendências de todos os meses"`.

---

### Task 5: Retificação (RH e motorista)

**Files:**
- Modify: `src/painel.html` — `montarEmailRH()`, `renderRH()`, `marcarRH()`, `renderCom()`, `montarLegenda()`, `registrarEnvio()`, `TIPO_COM`.
- Test: `tools/test/painel.test.js`

**Interfaces:**
- Consumes: `estadoEnvio`, `MOTIVOS`, anulações do mês (`M.meses[mes].ev.filter(e=>e.anulado)`).
- Produces:
  - `TIPO_COM.ret = 'Retificação'`, `TIPO_COM.rhret = 'Retificação ao RH'`.
  - `descreverSig(sig) -> string` ("1 advertência (90–95)", "1 suspensão", "Término", "nenhuma penalidade").
  - `montarEmailRet(M, mes, est) -> {assunto, corpo, html}`; assunto `'Retificação · Infração de velocidade · '+(est.sig?rotulo:'Penalidade cancelada')+' · '+NOME+' · Código '+cód+' · '+Mês`. Corpo: "Penalidade comunicada em <data>: <descreverSig(ult.sig)>", "Penalidade correta após revisão: <descreverSig(est.sig)>", lista de picos anulados (`dd/mm hh:mm · placa · vel km/h · motivo · por <quem>`), acumulado atual.
  - Quadro RH em `retificar`: usa `montarEmailRet`; "Marcar como enviado" grava `tipo:'rhret'`, `chave:'rhret:'+mes+':'+(est.sig||'nenhuma')`, `sig:est.sig||'nenhuma'`.
  - Quadro WhatsApp em `retificar`: chip "Retificação" selecionado; legenda de cancelamento (`est.sig` nulo, sem imagem: botões de imagem ocultos) ou de ajuste (imagem de penalidade atual); abrir conversa grava `tipo:'ret'`, `sig:est.sig||'nenhuma'`.
  - `estadoEnvio`: `sig` atual nulo é comparado como `'nenhuma'`; com `ult.sig==='nenhuma'` e sem penalidade → `enviado`.

- [ ] **Step 1: Testes que falham**

```js
teste('retificação: penalidade enviada nos dois canais e anulação que cancela → 2 retificações', …)
teste('retificação: e-mail traz antes, depois e picos anulados com motivo', …) // #rh-assunto começa "Retificação"; #rh-corpo contém "Erro de leitura SASCAR" e "nenhuma penalidade"
teste('retificação: marcar RH e abrir WhatsApp zeram as pendências', …)
teste('retificação: penalidade ajustada (2 adv → 1) mantém imagem e chip Retificação', …)
teste('retificação: desfazer anulação comunicada gera nova retificação', …)
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar tudo** → PASS.
- [ ] **Step 5: Commit** — `"Retificação de penalidade já enviada (RH e motorista)"`.

---

### Task 6: Aba Histórico e ficha de qualquer motorista

**Files:**
- Modify: `src/painel.html` — botão e painel `#tab-hist`/`#v-hist`, `renderHist()`, `setTab()`, `renderMot()`, `linhasMes()`/seleção da ficha, CSS.
- Test: `tools/test/painel.test.js`

**Interfaces:**
- Consumes: `A`, `situacao`, `estadoEnvio`, `pendencias`, `cadDe`.
- Produces:
  - `histUi = {q:'', f:'todos'}`; filtros `todos|pend|pen|anul|ter` (`#hist-chips .chip[data-f]`), busca `#hist-q` (nome, placa, código).
  - `renderHist()` monta `#hist-tbl`: `th` por mês (`mesCurto`), célula `td[data-mes]` com selo (`.st adv|sus|ter|ok`), `.anul-n` (número de anulações) e pontos `.ponto.m` / `.ponto.rh` com classe `ok|pend|ret|bloq` e `title` "Enviado em dd/mm/aaaa hh:mm por <quem>"; colunas Acumulado e Contrato; nome em `button[data-hist-mot]`.
  - `abrirMot(nome, mes?)`: aceita motorista sem eventos no mês do topo; sem `mes`, usa o mês mais recente com eventos dele. `renderMot()` mostra "Sem eventos em <mês>" quando o mês escolhido não tem eventos e mantém o Histórico disciplinar.
  - Histórico disciplinar (`#m-tl`) lista todos os meses de `A.meses`, com pontos M/RH e "N anulados".
  - `[data-pend-ver]` → `setTab('hist')` com `histUi.f='pend'`.

- [ ] **Step 1: Testes que falham**

```js
teste('histórico: linha por motorista e coluna por mês, com pontos M/RH', …)
teste('histórico: filtro Com pendência e busca por placa', …)
teste('histórico: Ver no alerta abre a aba filtrada', …)
teste('histórico: abrir ficha de motorista sem eventos no mês do topo', …) // topo em outubro, motorista só com setembro → ficha abre, "Sem eventos em Outubro 2026", timeline com setembro
teste('ficha: histórico disciplinar mostra meses posteriores ao escolhido', …)
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — aba entre Motorista e Cadastro; tabela em `.tblbox` com coluna do nome `position:sticky;left:0`; legenda dos pontos abaixo da tabela.
- [ ] **Step 4: Rodar tudo** → PASS.
- [ ] **Step 5: Commit** — `"Aba Histórico e ficha de qualquer motorista"`.

---

### Task 7: Pasta da equipe, regressão e documentação

**Files:**
- Modify: `tools/test/painel.test.js`, `README.md`, `docs/HANDOFF.md`, `tools/manual/completo/guia.html` (+ `prints/` novos), `tools/manual/rapido/manual.html`, gerados em `docs/` e `Infrações de velocidade.html`.

**Interfaces:**
- Consumes: tudo acima; gancho `window.__escolherPasta` com OPFS, como em `tools/manual/prints.js` (duas páginas, a segunda com IndexedDB renomeada).

- [ ] **Step 1: Testes que falham**

```js
teste('pasta: anulação feita na aba A aparece na aba B após a leitura', …) // espera até POLL_MS+2s
teste('regressão: importar planilha, salvar cadastro, comunicado e RH continuam funcionando', …)
```

- [ ] **Step 2: Rodar** → ajustar até PASS; rodar a suíte completa → todos PASS.
- [ ] **Step 3: Documentação** — README (Uso diário: anulação, Histórico, pendências e retificação); HANDOFF (coleção `anulacoes`, `estadoEnvio`, testes em `tools/test/`); guia completo (seções novas "Anular picos", "Histórico", "Pendências e retificação", com 3 prints fictícios gerados pelo runner em modo `PRINTS=1`); manual rápido (linhas novas na rotina e em Problemas comuns). Rodar os dois `build.py` dos manuais e conferir o PDF renderizado.
- [ ] **Step 4: Build final** — `python3 tools/build.py`, suíte completa PASS.
- [ ] **Step 5: Commit e push** — `"Documentação e testes de sincronização da anulação e do Histórico"`; enviar `Infrações de velocidade.html` pelo chat.
