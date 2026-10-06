# Infrações de Velocidade · Grupo Dínamo

Painel HTML que lê as planilhas "Infrações de Velocidade" da telemetria (seco e chuva) e calcula, por motorista, as penalidades do mês e a reincidência acumulada.

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
