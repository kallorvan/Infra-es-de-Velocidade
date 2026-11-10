# Handoff · Painel Infrações de Velocidade

Estado em 09/11/2026. Leia isto antes de continuar o projeto numa conversa nova.

## O que é

Painel HTML de um arquivo só (Grupo Dínamo / Tóliman Transportes) que lê as planilhas de telemetria de excesso de velocidade (seco e chuva), aplica as regras disciplinares por motorista e mês, e gera os comunicados ao motorista (imagem JPEG pelo WhatsApp) e ao RH (texto de e-mail para copiar).

- **Dono:** Eduardo (Laudino). Fala português e prefere ser entrevistado antes de qualquer suposição. Pede PR + merge explicitamente quando quer.
- **Visual:** segue o artefato "Produtividade de Motoristas · Grupo Dínamo" (cores, logos). Para páginas novas, existe a skill `anthropic-skills:layout-padrao`.
- **Onde roda:** o `Infrações de velocidade.html` fica na pasta da equipe do Teams **Infrações de velocidade** (SharePoint). Cada pessoa adiciona o atalho no OneDrive e abre o arquivo no Chrome ou Edge.

## Arquivos

| Caminho | Conteúdo |
| --- | --- |
| `src/painel.html` | Código-fonte único (HTML/CSS/JS). Edite aqui. |
| `tools/build.py` | Injeta logos/favicon de `assets/` e gera `Infrações de velocidade.html` (entregável) e `dist/artefato.html` (fragmento para claude.ai; `dist/` está no .gitignore). Rode depois de toda mudança. |
| `Infrações de velocidade.html` | Entregável gerado. É o arquivo que o usuário coloca na pasta da equipe; mande-o pelo chat depois de cada mudança. |
| `docs/Manual de uso - Infrações de velocidade.pdf` | Manual (10 páginas, prints com dados fictícios). |
| `docs/Guia de acesso à pasta da equipe no Teams.pdf` | Passo a passo: Teams › Arquivos › Adicionar atalho ao OneDrive › abrir no navegador › conectar a pasta. |
| `tools/manual/gerar_ficticios.py` | Gera os dados fictícios dos prints (backup JSON, planilhas do dia, PDF do cadastro). |
| `tools/manual/prints.js` | Playwright: tira os 12 prints do manual (ver "Prints do manual"). |
| `README.md` | Resumo de uso e regras. |

## Regras de negócio (constantes `REGRAS`, `PRE`, `ADV_P_SUS`, `SUS_P_TER`, `CHUVA_MIN_S`)

| Condição | Faixa | Tolerância/mês | Acima da tolerância |
| --- | --- | --- | --- |
| Seco | 87–89 km/h | pré-infração | só informativo |
| Seco | 90–95 km/h | 35 picos | perda de pontuação + 1 advertência |
| Seco | 96–99 km/h | 5 picos | perda de pontuação + 1 advertência |
| Seco | ≥ 100 km/h | nenhuma | 1 suspensão por pico |
| Chuva | > 70 km/h por mais de 1 min | 20 picos | perda de pontuação + 1 advertência |

- O acumulado soma todos os meses importados: 3 advertências viram 1 suspensão, e 3 suspensões levam ao término do contrato.
- Na chuva, picos de até 1 min aparecem no painel mas não contam.

## Funcionalidades

- **Importação diária de .xlsx** (SheetJS 0.18.5, cdnjs): agrupa por mês+condição (`AAAA-MM_seco|chuva`) e soma só eventos novos. Dedup por `data|motorista|placa|velocidade` (`mesclar()`).
- **Cadastro de motoristas** pelo PDF "Cadastro de Motoristas - Detalhado" (pdf.js 3.11.174, carregado sob demanda), com campos Código, Nome do Motorista, Celular e Situação.
  - Id do motorista: `c<código>`. Celular válido = DDD + 9 dígitos começando com 9, guardado como `55…`.
  - Ligação telemetria→cadastro por nome (`casaNome`: abreviações e partículas), preferindo o cadastro ativo.
- **Comunicados:**
  - WhatsApp: imagem JPEG 1080×1420 desenhada em canvas, com link `wa.me`. Tipos: penalidade, alerta preventivo (≥ 80% da tolerância) e resumo.
  - E-mail ao RH: para advertência, suspensão e término, com cópia rica (linhas que geraram advertência em negrito).
  - Os envios ficam registrados. Motorista inativo fica com o envio bloqueado.
- **Backup completo (.json)** no formato `infracoes-velocidade-completo`, nome `backup-completo-infracoes-velocidade-AAAA-MM-DD_HHhMM.json`. A restauração soma ao que já existe e também aceita o formato mensal antigo `infracoes-velocidade-backup`.

## Armazenamento (objeto `store`, modos)

- **`pasta`** (atual, uso normal). Usa a File System Access API (Chrome/Edge). No primeiro uso a pessoa informa o nome e clica em "Conectar pasta"; o painel cria `Dados do painel/` na pasta escolhida.
  - `dados/<dispositivo>.json`: cada computador grava só o próprio arquivo, com `{cols:{col:{id:{t, b}}}}` (`b:null` marca exclusão).
    - `fundir()` junta os arquivos de todos: vale o maior `t` por registro.
    - Nos meses, une os eventos de todas as versões vivas (sem duplicar); a exclusão vence as versões mais antigas.
    - Escrita com debounce de 300 ms. Leitura (poll) a cada 8 s e ao focar a janela.
  - `online/<dispositivo>.json`: presença renovada a cada 30 s; conta como online por 150 s. O topo mostra os nomes, com "trocar" para mudar o próprio.
  - `backups/`: backup completo automático 1×/dia, guardando os 30 mais recentes. O botão manual também grava aqui.
  - O handle da pasta fica na IndexedDB (`infra-vel`/`kv`/`pasta`). Ao reabrir, se o navegador pedir permissão de novo, aparece "Reconectar pasta".
  - Chaves no localStorage: `infra-vel-dispositivo`, `infra-vel-usuario`, `infra-vel-migrado-<disp>`.
  - Na primeira conexão, os dados que estavam no localStorage vão para a pasta com `t=1` (o que já está na pasta prevalece).
- **`local`**: fallback sem pasta conectada, ou em Firefox/Safari. Grava no localStorage (`infra-vel-<col>-v1`, meses em `infra-vel-meses-v1`). Mostra o aviso para conectar a pasta e os lembretes de backup (fechamento do mês e 7 dias).
- **`db` / `semdb`**: quando aberto como artefato do claude.ai (banco compartilhado do artefato). Não é mais usado.
  - O artefato antigo está em https://claude.ai/artifact/PYW71pQuu9gwHSEZKNkCvG, com os dados reais do usuário de set/out. Foi oferecido apagá-lo e o usuário não respondeu.

## Documentos no claude.ai

- **Manual (Claude Docs):** https://claude.ai/artifact/UohuwoongUKf5vX2RZYmL1
  - doc `e12c2bb1-65e0-4b0e-a36d-5e8ab4701096`, aba `da28d0ae-a8c2`, corpo `26071660-448d`, rev 18.
  - Prints como blobs do doc. Para exportar: `export` em PDF A4 com `pictures:"fit"`; o resultado vai para um arquivo de tool-results (JSON com `bytes_b64`).
- **Guia de acesso:** https://claude.ai/artifact/CGqeDjQiSiwtyQMNBw3ucR
  - doc `5b4aa888-7549-4564-a69d-2dbd4750e986`, aba `3fdcb927-70bd`, corpo `c8280f0b-e423`. Só texto, sem prints do Teams.

## Prints do manual (sempre com dados fictícios, nunca dados reais de motoristas)

1. Numa pasta de trabalho `S`:
   - Baixe as bibliotecas: `npm pack xlsx@0.18.5` (copie `package/dist/xlsx.full.min.js` para `S/xlsx.js`) e `npm pack pdfjs-dist@3.11.174` (extraia em `S/pdfjs/`).
   - Crie `S/prints/`.
2. Em `S`, rode `python3 <repo>/tools/manual/gerar_ficticios.py` (cria `S/fict/`).
3. Rode `S=<pasta> node <repo>/tools/manual/prints.js` (Playwright em `/opt/node-tools/node_modules/playwright`).
   - O HTML é servido por rota em `http://localhost:8765/painel.html`, e a pasta da equipe é simulada com OPFS através do gancho de teste `window.__escolherPasta`.
   - **Problema conhecido:** o Chromium do ambiente de testes cai ao ler da IndexedDB um handle OPFS salvo. Por isso a segunda aba ("Bruno Lima") troca o nome da base IndexedDB no script.
   - Não dá para testar aqui o fluxo real de reabrir com o handle salvo de uma pasta do OneDrive; ele precisa ser conferido no computador do usuário.
4. Suba os prints no doc (Artifact `asset:true` na URL do doc, depois `create` blob) e troque as imagens.

## Pendências e próximos passos

- [ ] Confirmar com o usuário o primeiro uso real na pasta do OneDrive: conectar, reabrir (o pedido de "Reconectar pasta" funciona?), sincronização entre duas pessoas e presença online.
- [ ] Se a pasta do HTML no Teams não estiver direto em "Arquivos" (por exemplo, numa subpasta "Sistema"), ajustar o passo 1 do guia e o post.
- [ ] Decidir se o artefato antigo do claude.ai (modo `db`) deve ser apagado.
- O post de divulgação (JPEG 1080×1920 "Infrações de Velocidade mudou de lugar!") foi entregue no chat e não está no repositório. O assunto e a descrição para o Teams também foram passados no chat.
- Post "Como acessar o painel" (JPEG 1080×1920, 3 passos: Teams › atalho no OneDrive › nome e Conectar pasta): `docs/posts/Post - Acesso ao painel pelo Teams.jpg`, fonte em `docs/posts/post-acesso-teams.html` (print com Playwright em 1080×1920). O passo 1 supõe o arquivo direto em Arquivos do canal Geral.

## Fluxo de trabalho combinado

1. Edite `src/painel.html` e rode `python3 tools/build.py`.
2. Teste com Playwright (dados fictícios em OPFS).
3. Faça commit na branch de desenvolvimento e mande o `Infrações de velocidade.html` atualizado pelo chat.
4. Abra PR e faça o merge na `main` só quando o usuário pedir.
5. Quando a regra ou a tela mudar, atualize o README e o manual (doc + PDF em `docs/`).
