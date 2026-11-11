# Infrações de Velocidade · Grupo Dínamo

Painel HTML que lê as planilhas "Infrações de Velocidade" da telemetria (seco e chuva) e calcula, por motorista, as penalidades do mês e a reincidência acumulada.

## Manual

Passo a passo com os prints das telas: [`docs/Manual de uso - Infrações de velocidade.pdf`](<docs/Manual de uso - Infrações de velocidade.pdf>). Os prints usam dados fictícios.

- Versão curta, sem prints: [`docs/Manual rápido - Infrações de velocidade.pdf`](<docs/Manual rápido - Infrações de velocidade.pdf>). Fonte no layout Tóliman em `tools/manual/rapido/` (`python3 tools/manual/rapido/build.py`).
- Primeiro acesso pela equipe do Teams (atalho no OneDrive, abrir no navegador, conectar a pasta): [`docs/Guia de acesso à pasta da equipe no Teams.pdf`](<docs/Guia de acesso à pasta da equipe no Teams.pdf>).
- Contexto técnico e pendências para quem continuar o projeto: [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Uso diário

- **Importar planilhas**: envie a planilha do dia. Os eventos novos são somados ao mês; eventos já salvos (mesma data/hora, motorista, placa e velocidade) são ignorados.
- **Cadastro de motoristas**: importado do PDF "Cadastro de Motoristas - Detalhado" (ativos e inativos), lendo Código, Nome do Motorista, Celular e Situação de cada página. O código identifica o motorista; o nome da telemetria é ligado ao cadastro pelo nome (igual, ou abreviado/sem "de/da"), preferindo o cadastro ativo quando há mais de um. Só celular com DDD + 9 dígitos é usado no WhatsApp.
- **Comunicado por WhatsApp** (aba Motorista ou botão "Enviar" na visão geral): gera uma imagem JPEG (1080×1420) com o layout do painel, para penalidade, alerta preventivo (a partir de 80% da tolerância) ou resumo do mês. Baixe ou copie a imagem e abra a conversa (`wa.me`, com um texto curto) para anexá-la; abrir a conversa registra o envio; um comunicado de penalidade ou alerta já registrado deixa de aparecer como pendente até surgir uma penalidade nova no mês.
- **E-mail ao RH** (aba Motorista ou botão "Abrir" na coluna Comunicado): para advertência, suspensão e término. O painel monta para, cópia, assunto e mensagem para copiar e colar no e-mail; "Marcar como enviado" tira a pendência. O e-mail do RH fica em Cadastro de motoristas → E-mail do RH.
- **Motoristas inativos**: envio por WhatsApp e e-mail ao RH bloqueado enquanto o cadastro estiver inativo.
- **Pasta da equipe (Teams/SharePoint)**: abra o `Infrações de velocidade.html` da pasta sincronizada no Chrome ou Edge. Na primeira vez, informe seu nome e clique em "Conectar pasta", escolhendo a pasta onde está o arquivo. O painel cria nela a pasta `Dados do painel` e grava tudo lá:
  - `dados/<computador>.json`: cada computador grava só o próprio arquivo, com a versão mais recente dos registros que mudou. O painel lê os arquivos de todos a cada 8 segundos e junta: vale a versão mais recente de cada registro, e os eventos de um mês importado por duas pessoas ao mesmo tempo são somados sem duplicar. Como ninguém grava no arquivo de outro, o OneDrive não cria cópias em conflito.
  - `online/<computador>.json`: sinal de presença, renovado a cada 30 segundos. O topo do painel mostra quem está usando agora (online nos últimos 2,5 minutos); "trocar" muda o seu nome.
  - `backups/`: um backup completo automático por dia, guardando os 30 mais recentes.
  - O que estava só no navegador antes de conectar é levado para a pasta na primeira conexão, sem passar por cima do que já está lá. Ao reabrir, o navegador pode pedir para "Reconectar pasta" (um clique). Firefox e Safari não gravam em pasta: nesses o painel avisa e guarda só no navegador.
- **Backup completo** (aba Importar planilhas): um .json com todos os meses, cadastro, envios e e-mail do RH. Com a pasta conectada, é feito sozinho todo dia em `Dados do painel/backups` (o botão grava outro na mesma pasta). Sem a pasta, o arquivo é baixado e o painel avisa quando um mês fecha sem backup ou o último tem 7 dias ou mais. "Restaurar backup" traz tudo de volta sem apagar o que já está no painel.
- No artefato do claude.ai, cadastro, e-mail do RH e registro de comunicados só podem ser lidos por quem tem acesso de Contribuidor ou acima.

- `src/painel.html` — código-fonte do painel (logos entram no build).
- `assets/` — logos Grupo Dínamo / Tóliman e ícone.
- `tools/build.py` — gera `Infrações de velocidade.html` (abre direto no navegador; dados ficam salvos no próprio navegador) e `dist/artefato.html` (versão publicada no claude.ai; dados ficam no banco compartilhado do artefato).

## Regras aplicadas

| Condição | Faixa | Tolerância/mês | Acima da tolerância |
|---|---|---|---|
| Seco | 87–89 km/h | pré-infração | só informativo |
| Seco | 90–95 km/h | 35 picos | perda de pontuação + 1 advertência |
| Seco | 96–99 km/h | 5 picos | perda de pontuação + 1 advertência |
| Seco | ≥ 100 km/h | nenhuma | perda de pontuação + 1 suspensão por pico |
| Chuva | > 70 km/h por mais de 1 min | 20 picos | perda de pontuação + 1 advertência |
| Chuva | > 70 km/h por até 1 min | não conta | só informativo |

3 advertências acumuladas = 1 suspensão; 3 suspensões acumuladas = término do contrato. Eventos com motorista "SEM MOTORISTA" aparecem no painel, mas não geram penalidade.
