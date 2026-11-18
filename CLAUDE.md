# Infrações de Velocidade · instruções do projeto

## Este projeto

- Código-fonte: `src/painel.html` (um arquivo, JS numa IIFE). Build: `python3 tools/build.py` gera `Infrações de velocidade.html` (arquivo único, com logos, fontes e versão embutidas). Rode o build depois de cada mudança e faça commit do HTML gerado.
- Testes: `python3 tools/build.py && node tools/test/painel.test.js [filtro]` (Playwright em `/opt/node-tools/node_modules/playwright`; a pasta do SharePoint é simulada com OPFS em `http://localhost:8765`). Todos passam antes de cada merge.
- Prints e manuais: `tools/manual/prints-padrao.js`, `tools/manual/prints-historico.js`, `tools/manual/rapido/build.py`, `tools/manual/completo/build.py`.
- Testes, prints e exemplos usam só dados fictícios; nunca dados reais de motoristas.
- PR e merge para `main` só quando o responsável pedir. Nenhum identificador de modelo em commits ou PRs.
- Contexto técnico e decisões: `docs/HANDOFF.md`.
- O painel segue o Padrão de Sistemas Tóliman (abaixo): pasta `Sistema`, login, histórico, presença, backups e design. O "registro" do bloqueio é a ficha do motorista na aba Motorista.

## Padrão de acesso e dados (obrigatório em todo sistema novo da Tóliman / Grupo Dínamo)

Todo sistema segue o login e o armazenamento de dados do painel Telemetria → Rodopar (repositório kallorvan/Automatiza-o-Telemetria: `src/index.html`, `#dlgEntrada`, e `src/app.js`, seções "Pasta do SharePoint" e "Usuários, senhas e histórico"). Não invente outro formato de tela, outro jeito de guardar dados, nem outras regras.

Tela
- Visual: o layout padrão Grupo Dínamo / Tóliman (skill "layout padrão", artefato Layout Base). Só tema claro. Tokens: --ink, --navy, --navy3, --accent #E4536C, --plum, --steel, --line, --paper. Fontes: Barlow Condensed (títulos, caixa alta), IBM Plex Sans (texto), IBM Plex Mono (rótulos e números).
- Janela modal (`<dialog>`), `Esc` não fecha. Fundo `--g-noite` (azul-marinho com brilhos vermelho, lilás e amarelo) com listras diagonais leves.
- Cores da logo: --accent #E4536C (vermelho), --ouro #F5CE7A (amarelo), --lilas #A275B4 (lilás). Faixa de 6px no topo em degradê contínuo `--g-logo` (vermelho → amarelo → lilás).
- Janela com raio de 18px, borda de 1,5px em degradê `--g-borda`, sombra profunda, logo no cabeçalho e título com degradê no texto `--g-titulo`.
- Cabeçalho: linha em Mono caixa alta "Empresa · Nome do sistema" e abaixo o título do sistema em Barlow Condensed, caixa alta, 28px.
- Botão principal em `--g-cta` com brilho vermelho suave; campos com raio de 10px; foco com borda em degradê `--g-foco` e halo lilás.
- Telas do sistema: linha `--g-logo` de 3px no pé do cabeçalho, aba ativa sublinhada em `--g-foco`, faixa de título `--g-noite` com período, título e ações, cartões de números com faixa `--g-logo` e número em degradê azul-marinho → roxo, barras de valor em `--g-logo`, linha escolhida da tabela com fundo rosado. Selos de situação em cor sólida. Degradê só nesses elementos; o resto continua liso. CSS completo na página do padrão (seções Componentes do sistema e Efeitos de gradiente).

Telas e fluxo: navegador sem suporte, conectar a pasta, autorizar a pasta, primeiro acesso, entrar, trocar a senha provisória e sessão bloqueada.

Regras
- Usuários em `usuarios/<login>.json` na pasta do SharePoint; senha só como hash PBKDF2-SHA256 (150 mil iterações, sal de 16 bytes). Mínimo de 6 caracteres.
- Primeira pessoa numa pasta vazia vira administradora. Só administradores cadastram usuários e redefinem senhas. Sempre há pelo menos um administrador ativo.
- Senha provisória exige troca na primeira entrada, e a nova precisa ser diferente.
- 20 minutos sem uso bloqueia a sessão e pede a senha de novo.
- Histórico em `historico/AAAA-MM_<id do navegador>.json` (entradas, senhas erradas, trocas, bloqueios). Só administradores consultam.
- Credenciais de serviços externos vêm de variáveis de ambiente e nunca vão para o repositório.

Dados (pasta do SharePoint)
- Nenhum dado de trabalho fica só no navegador. O sistema é um HTML único na pasta Sistema do canal no Teams, aberto pelo atalho do OneDrive, e grava na mesma pasta pela File System Access API (Chrome e Edge). O navegador guarda uma cópia para funcionar sem internet.
- Estrutura: `dados/<id do navegador>.json`, `backups/<Sistema>_dados_AAAA-MM-DD_<nome>.json`, `presenca/<id do navegador>.json`, `usuarios/<login>.json`, `historico/AAAA-MM_<id do navegador>.json`.
- Cada navegador grava só os próprios arquivos, nunca o arquivo de outra pessoa, cerca de 2 s depois de cada alteração, mais um backup por dia.
- Ciclo de 20 s (e ao voltar para a aba): ler os arquivos dos colegas que mudaram (`lastModified`), juntar, conferir o bloqueio e gravar a presença. Arquivo que não abre como JSON ainda está chegando: tentar no ciclo seguinte.
- Junção: por registro vale o `atualizadoEm` mais novo; exclusões ficam marcadas com a data e não voltam; cadastros são somados; configurações ficam com o `alteradoEm` mais novo; contadores ficam com o maior.
- Bloqueio por registro: quem abriu primeiro fica com ele; liberado ao trocar de registro, ao fechar (3 min sem presença) ou com 20 min parado. Mostrar "Aguardando chegar pelo OneDrive…" com "Abrir assim mesmo" quando a versão do colega ainda não chegou.
- O arquivo de dados tem o mesmo formato do backup (`versao`, `geradoEm`, `origem`, `usuario`…), e "Recuperar um backup" usa as mesmas regras de junção.
- Teste automatizado com duas pessoas na mesma pasta, como `tests/pasta-sharepoint.mjs`, simulando a pasta com uma pasta temporária.
- Continuidade: o README traz o preparo do computador e o passo a passo de férias. O sistema tem sempre pelo menos dois administradores.
- Dados reais (planilhas, backups) nunca vão para o repositório.

Projeto e entrega
- Estrutura: `src/` (index.html, app.js, fonts, img), `build.py`, `Nome-do-Sistema.html` gerado, `tests/*.mjs` (Playwright), `exemplos/` fictícios, `docs/manual/`, `README.md`, `HANDOFF.md`.
- `build.py` gera um HTML único com scripts, fontes e imagens embutidos, e troca `__VERSAO__` por `vAAAA.MM.DD`. Rode depois de cada mudança e faça commit do HTML gerado.
- A versão aparece no rodapé. Atualizar = substituir o HTML na pasta Sistema e apertar F5.
- Todo arquivo de dados tem `versao`; uma versão nova sempre lê os arquivos das anteriores.
- Testes passam antes de cada merge; merge para `main` só quando o responsável pedir.
- README para quem opera (uso, preparo do computador, férias). HANDOFF para quem continua (estrutura, decisões, pendências). Manual em PDF gerado por script com dados de exemplo.
- Exportações: `<sistema>_<conteúdo>_AAAA-MM-DD_a_AAAA-MM-DD.<ext>`, sem acentos nem espaços.

Segurança e manutenção
- Só a equipe do sistema tem edição na pasta Sistema do SharePoint; essa é a proteção real dos dados.
- Credenciais de serviços externos só em variáveis de ambiente; nunca no código, na pasta ou no git.
- Dados pessoais de motoristas ficam só na pasta do canal; exemplos e prints usam dados fictícios.
- Backups: diários por 60 dias, depois só a primeira cópia de cada mês. Cada navegador limpa só os backups do próprio usuário, uma vez por dia. O histórico não é apagado.
- Ao conectar, conferir se a pasta se chama "Sistema" e tem a estrutura esperada (ou está vazia); senão, avisar com "Escolher outra pasta" e "Usar esta pasta".

Design (componentes)
- Toda tela de sistema usa os componentes da seção "Componentes do sistema" da página do padrão, com o CSS de referência (classes `s-`): cabeçalho `.s-cab` com linha da logo, abas `.s-abas`, faixa de título `.s-faixa-titulo`, botões `.s-btn` (primario, perigo, vidro, pequeno), campos `.s-campo`, mensagens `.s-msg` (ok, aviso, erro, info), selos `.s-selo`, situação `.s-situacao`, números `.s-kpi`, tabela `.s-tabela`, confirmação `.s-dialogo`, aviso rápido `.s-aviso` e estado vazio `.s-vazio`.
- Um botão principal por área; texto do botão diz a ação; confirmação só para o que apaga ou não tem volta.
- Verde certo, amarelo atenção, vermelho corrigir, sempre com texto. Números em formato brasileiro, à direita nas tabelas.
- Sem emoji. Foco visível, campos com rótulo, tudo pelo teclado. Sem rolagem lateral da página.
- Escalas: raio 10/12/14/16/18px; sombras --s1/--s2/--s3; botão 38px, campo 42px.
- Sistema com login e dados segue esta página; painel ou relatório de leitura segue o Layout Base. Os dois usam os mesmos tokens e fontes.

Textos: reutilize as mensagens do painel ao pé da letra (você, frases curtas, dizer o que fazer). A referência completa está na página "Padrão de Sistemas Tóliman".
