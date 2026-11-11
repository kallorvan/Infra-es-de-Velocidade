# Anulação de picos, aba Histórico e pendências de envio

Data: 11/11/2026 · Painel Infrações de Velocidade (`src/painel.html`)

## Objetivo

1. Anular picos gerados por falha no caminhão ou erro de leitura da SASCAR, com motivo, e recalcular as penalidades.
2. Ver o histórico de cada motorista ao longo dos meses numa aba própria.
3. Saber, para cada penalidade, se já foi enviada ao motorista (WhatsApp) e ao RH (e-mail), em qualquer mês, com um alerta no topo.
4. Quando uma anulação mudar uma penalidade já enviada, gerar uma pendência de retificação.

Decisões do usuário (entrevista de 11/11/2026): anular **eventos** (não a penalidade inteira); **aba Histórico nova**; alerta **no topo + no Histórico**; anulação após envio vira **pendência de retificação**.

## Fora do escopo

- Anular a penalidade inteira sem anular picos.
- Lançar penalidade manual (sem planilha).
- Exportar o histórico em planilha/PDF.
- Mudar as regras de tolerância.

## 1. Anulações

### Dados

Coleção nova `anulacoes` em `COLECOES` (sincroniza pela pasta da equipe como as demais; vale a versão mais recente de cada id; exclusão = registro vazio, como já funciona em `fundir()`).

- **id:** `slug` da chave do evento, a mesma de `chaveEv(nome, e)`: `data/hora|motorista|placa|velocidade` (mais a condição, para separar seco e chuva no mesmo instante).
- **corpo:** `{chave, mes, cond, motorista, ts, placa, vel, dur, motivo, obs, anuladoEm, anuladoPor}`.
- **motivo:** `caminhao` (Falha no caminhão: sensor/velocidade), `sascar` (Erro de leitura SASCAR) ou `outro` (Outro). `obs` é obrigatória quando o motivo é `outro`, opcional nos demais.
- **anuladoPor:** `store.uid` (o nome informado na conexão da pasta).
- Desfazer = apagar o registro (`store.del`).

A planilha importada (`meses`) nunca é alterada.

### Motor

- `analisar()` recebe o índice de anulações. Evento anulado continua na lista do mês, com `anulado` preenchido, mas não entra nas contagens por faixa, na velocidade máxima, nos gráficos nem nas penalidades.
- O acumulado (advertências → suspensão, suspensões → término) é recalculado em todos os meses, então uma anulação num mês pode mudar os meses seguintes.
- Cada mês do motorista guarda `anulados` (quantidade) para o Histórico.

### Tela (aba Motorista)

- Tabela de eventos ganha uma caixa de seleção por linha (e "selecionar todos" no cabeçalho). Linha anulada aparece riscada, com selo do motivo e quem anulou; não tem caixa de seleção, tem "Desfazer".
- Com picos selecionados aparece a barra **Anular N picos**: motivo (lista), observação, prévia do efeito e **Confirmar anulação**.
- Prévia: contagem por faixa antes → depois e a situação do mês antes → depois (ex.: "Seco 90–95: 36 → 33 · Advertência → Dentro da tolerância"). Se mudar meses seguintes, avisa: "Também muda: Outubro 2026 (suspensão por 3 advertências deixa de existir)".
- Só quem pode gravar (`store.canWrite`) vê caixas, barra e "Desfazer".

## 2. Aba Histórico

Nova aba entre **Motorista** e **Cadastro de motoristas**.

- Tabela: uma linha por motorista (exceto "sem motorista identificado"), uma coluna por mês importado (mais recente à direita), e no fim **Acumulado** (adv. · susp.) e **Contrato** (Ativo / Término em mês).
- Célula do mês: selo da situação (Advertência ×N, Suspensão ×N, Término, Dentro da tolerância) ou vazio quando não houve evento. Com anulação, um marcador com o número de picos anulados.
- Em célula com penalidade, dois pontos de envio: **M** (motorista) e **RH**. Verde = enviado, rosa = pendente, âmbar = retificar, cinza = bloqueado (cadastro inativo). Título com data e quem enviou.
- Busca por nome, placa ou código. Filtros: Todos, Com pendência, Com penalidade, Com anulação, Término.
- Clicar no nome abre a aba Motorista naquele motorista e mês (o mês mais recente com evento).
- Em telas estreitas, a tabela fica dentro de uma caixa com rolagem horizontal; a coluna do nome fica fixa.

### Mudanças na aba Motorista

- Abre qualquer motorista com eventos em algum mês, mesmo sem eventos no mês escolhido no topo; nesse caso mostra "Sem eventos em <mês>" e o histórico.
- "Histórico disciplinar" mostra todos os meses importados (não só até o escolhido), com os pontos M/RH e as anulações do mês.

## 3. Pendências de envio

### Assinatura da penalidade

A chave `pen` de `comInfo()` (`pen:<mes>:<faixas>:s<susp>[:t]`) é a assinatura da penalidade do mês. Todo registro de envio passa a guardar `sig` (a assinatura no momento do envio). Registros antigos sem `sig`: WhatsApp de penalidade usa a própria `chave`; RH usa a `chave` sem o prefixo `rh:`.

### Estado por canal (motorista e RH), por motorista e mês

Seja `atual` a assinatura de agora (ou `nenhuma` se não há penalidade) e `ultimo` o envio mais recente daquele canal no mês (penalidade, retificação ou "fora do painel"):

| Situação | Estado |
| --- | --- |
| cadastro inativo | bloqueado (não conta como pendência) |
| há penalidade e nenhum envio | pendente |
| `ultimo.sig` = `atual` | enviado |
| `ultimo.sig` ≠ `atual` | retificar |
| sem penalidade e nenhum envio | nada a enviar |

O alerta preventivo e o resumo do mês continuam como hoje e não entram nas pendências.

### Alerta no topo

Faixa abaixo do cabeçalho, só quando há pendências: "**N pendências de envio** · X ao motorista · Y ao RH · Z retificações · **Ver**". Conta todos os meses. "Ver" abre o Histórico com o filtro Com pendência.

### Marcar como enviado (fora do painel)

No quadro de WhatsApp da aba Motorista, botão **Marcar como enviado (fora do painel)** quando o estado é pendente. Grava um registro `tipo:'pen'`, `via:'manual'`, com `sig`. O RH já tem "Marcar como enviado".

### Retificação

- **RH:** o quadro E-mail ao RH, quando o estado é retificar, monta o e-mail de retificação.
  - Assunto: `Retificação · Infração de velocidade · <tipo atual ou "Penalidade cancelada"> · <NOME> · Código <cód> · <Mês>`.
  - Corpo: penalidade comunicada antes (de `ultimo`), penalidade correta agora, picos anulados com motivo e quem anulou, acumulado atualizado.
  - "Marcar como enviado" grava `tipo:'rhret'` com `sig` = `atual`.
- **Motorista:** quando o estado é retificar, o quadro de WhatsApp oferece o tipo **Retificação**.
  - Penalidade cancelada: só texto ("Olá, <nome>. Após revisão, a penalidade de excesso de velocidade de <mês> foi cancelada. …").
  - Penalidade ajustada: texto de ajuste + a imagem atual (o mesmo JPEG de penalidade, já recalculado).
  - Abrir a conversa registra `tipo:'ret'` com `sig` = `atual`.
- Enquanto um canal está em retificar, o envio normal de penalidade daquele canal não é pedido.
- Desfazer uma anulação já comunicada muda a assinatura de novo e gera outra retificação, pelo mesmo caminho.

### Coluna Envio da Visão geral

Continua só para o mês escolhido, usando o mesmo estado por canal (o ícone âmbar indica retificar).

## 4. Backup

O backup completo e a restauração passam a incluir `anulacoes`. Restaurar soma sem apagar, como hoje.

## 5. Testes (Playwright, dados fictícios)

1. Anular 3 picos de Seco 90–95 com 36 picos: contagem 33, advertência some, acumulado cai; desfazer volta ao estado anterior.
2. Cascata: anulação em setembro desfaz a suspensão por 3 advertências de outubro.
3. Pendências: penalidade sem envio = pendente nos dois canais; WhatsApp enviado + RH não = 1 pendência; inativo não conta; "fora do painel" limpa.
4. Retificação: penalidade enviada nos dois canais, anulação que cancela → 2 retificações; marcar RH e abrir WhatsApp → zero pendências.
5. Histórico: busca, filtros, pontos M/RH e abrir ficha de motorista sem eventos no mês escolhido.
6. Pasta: duas abas (dois dispositivos) — anulação feita numa aparece na outra após a leitura.
7. Backup: fazer backup, apagar anulação, restaurar → anulação volta.
8. Sem regressão: importar planilha, cadastro, comunicados e e-mail ao RH continuam funcionando.

## 6. Documentação

Atualizar README (uso diário e regras), guia completo (nova seção de anulação, Histórico e pendências, com prints fictícios) e manual rápido.
