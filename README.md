# Infrações de Velocidade · Grupo Dínamo

Painel HTML que lê as planilhas "Infrações de Velocidade" da telemetria (seco e chuva) e calcula, por motorista, as penalidades do mês e a reincidência acumulada.

## Uso diário

- **Importar planilhas**: envie a planilha do dia. Os eventos novos são somados ao mês; eventos já salvos (mesma data/hora, motorista, placa e velocidade) são ignorados.
- **Cadastro de motoristas**: nome (igual ao da telemetria), matrícula e celular. Pode ser importado da planilha do RH (coluna A = nome, F = matrícula, K = celular, primeira aba); quem já existe tem matrícula e celular atualizados.
- **Comunicado por WhatsApp** (aba Motorista ou botão "Enviar" na visão geral): gera uma imagem JPEG (1080×1420) com o layout do painel, para penalidade, alerta preventivo (a partir de 80% da tolerância) ou resumo do mês. Baixe ou copie a imagem e abra a conversa (`wa.me`, com um texto curto) para anexá-la; abrir a conversa registra o envio; um comunicado de penalidade ou alerta já registrado deixa de aparecer como pendente até surgir uma penalidade nova no mês.
- **E-mail ao RH** (aba Motorista ou botão "Abrir" na coluna Comunicado): para advertência, suspensão e término. O painel monta para, cópia, assunto e mensagem para copiar e colar no e-mail; "Marcar como enviado" tira a pendência. O e-mail do RH fica em Cadastro de motoristas → E-mail do RH.
- No artefato do claude.ai, cadastro, e-mail do RH e registro de comunicados só podem ser lidos por quem tem acesso de Contribuidor ou acima.

- `src/painel.html` — código-fonte do painel (logos entram no build).
- `assets/` — logos Grupo Dínamo / Tóliman e ícone.
- `tools/build.py` — gera `index.html` (abre direto no navegador; dados ficam salvos no próprio navegador) e `dist/artefato.html` (versão publicada no claude.ai; dados ficam no banco compartilhado do artefato).

## Regras aplicadas

| Condição | Faixa | Tolerância/mês | Acima da tolerância |
|---|---|---|---|
| Seco | 87–89 km/h | pré-infração | só informativo |
| Seco | 90–95 km/h | 35 picos | perda de pontuação + 1 advertência |
| Seco | 96–99 km/h | 5 picos | perda de pontuação + 1 advertência |
| Seco | ≥ 100 km/h | nenhuma | perda de pontuação + 1 suspensão por pico |
| Chuva | > 70 km/h por mais de 1 min | 5 picos | perda de pontuação + 1 advertência |
| Chuva | > 70 km/h por até 1 min | não conta | só informativo |

3 advertências acumuladas = 1 suspensão; 3 suspensões acumuladas = término do contrato. Eventos com motorista "SEM MOTORISTA" aparecem no painel, mas não geram penalidade.
