# Painel Infrações de Velocidade no Padrão de Sistemas Tóliman

Data: 18/11/2026 · referência: artefato "Padrão de Sistemas Tóliman" (https://claude.ai/artifact/NiiyT3so8rej7pLiy84L5M)

## Intenção

Deixar o painel igual aos demais sistemas da Tóliman: mesmo design, mesma tela de login e o mesmo jeito de guardar os dados na pasta do SharePoint. O serviço continua quando alguém sai de férias. Pedido do usuário: "padrão completo".

## Metas

1. Design do padrão: classes `s-` e efeitos de gradiente, só no tema claro.
2. Login com usuário e senha, guardados na pasta. A primeira pessoa vira administradora; existe senha provisória; a sessão bloqueia após 20 minutos parada; as entradas vão para um histórico.
3. Dados na pasta **Sistema**, nas subpastas `dados/`, `backups/`, `presenca/`, `usuarios/` e `historico/`, com o ciclo, a junção, a presença e o bloqueio de registro do padrão.
4. Versão `vAAAA.MM.DD` no rodapé, aviso de pasta errada, limpeza de backups (60 dias e depois um por mês) e nomes de exportação do padrão.
5. README com o preparo do computador e o passo a passo de férias, `CLAUDE.md` com a instrução do padrão, testes de login e de duas pessoas na mesma pasta.

## Fora do escopo

- Mudar regras de penalidade, comunicados, anulação ou Histórico.
- Reorganizar o repositório na estrutura `src/index.html + app.js + tests/*.mjs`. Ficam `src/painel.html`, `tools/build.py` e `tools/test/`. O padrão é cumprido em comportamento, não em nomes de pasta.
- Renomear o arquivo `Infrações de velocidade.html`. Post, manuais e o atalho da equipe usam esse nome.
- Modo escuro.

## Anti-metas

- Perder ou duplicar dados que já estão na pasta "Dados do painel".
- Travar a equipe por causa do login: precisa haver como recuperar o acesso. Outro administrador redefine a senha, e o painel pede pelo menos dois administradores.

## Restrições

- O painel é um HTML único, que abre sem internet e funciona no Chrome ou no Edge (File System Access API).
- Uma versão nova lê todos os arquivos das versões anteriores: `dados/*.json` no formato 1, `backup-completo-*.json` e o `online/` antigo.
- Testes e prints usam só dados fictícios.

## Abordagens consideradas

1. **Reescrever o painel do zero sobre o código de referência do padrão** (app.js, `#dlgEntrada`). Tudo fica idêntico ao padrão, mas o risco é alto: os 37 cenários de teste e as regras de negócio teriam de ser portados.
2. **Encaixar o padrão no painel atual** (escolhida). Entram a tela de entrada, os usuários, o histórico, a presença, o bloqueio, a versão e a limpeza sobre o `store`/`pasta` que já existem, e o CSS é trocado pelo do padrão. Aproveita a sincronização que já funciona, que é a mesma ideia do padrão (um arquivo por navegador e a versão mais nova de cada registro).
3. **Só o visual agora, login depois.** Foi descartada porque o usuário pediu o padrão completo.

## Decisões (do responsável pelo projeto, avisadas ao usuário)

### Pasta e migração
- `PASTA_NOME = 'Sistema'`. A pessoa conecta a própria pasta Sistema, onde está o HTML.
- **Migração:** no Teams, renomear a pasta "Dados do painel" para **Sistema** e mover o HTML para dentro dela. `dados/` e `backups/` continuam valendo.
- **Pasta errada:** se a pasta escolhida não se chama "Sistema" ou não tem a estrutura esperada (`usuarios`, `dados` ou `historico`, ou está vazia), aparece o aviso padrão com "Escolher outra pasta" e "Usar esta pasta".
- **Pasta antiga:** se a pessoa conectar a pasta do canal (a que contém "Dados do painel"), o painel avisa que a pasta mudou e explica a renomeação.
- O antigo `online/` deixa de ser lido. Ele só mostrava quem estava online.

### Arquivo de dados
- O painel grava `dados/<id do navegador>.json` com `{versao:2, geradoEm, origem, usuario, cols}`, mantendo `cols` (o formato da junção atual) e acrescentando os campos do padrão. Os arquivos `versao:1` (com `dispositivo` e `atualizadoEm`) continuam sendo lidos. O id do navegador é o `infra-vel-dispositivo` que já existe.
- A gravação acontece cerca de 2 s depois de cada alteração (hoje são 300 ms) e também ao esconder ou fechar a aba.
- O ciclo roda a cada 20 s (hoje são 8 s) e ao voltar para a aba: ler os colegas, juntar, conferir o bloqueio e gravar a presença.

### Backups
- Formato `backups/Infracoes-de-Velocidade_dados_AAAA-MM-DD_<login>.json`, um por pessoa por dia, com o mesmo conteúdo do backup completo atual.
- Limpeza uma vez por dia, só dos backups do próprio usuário: tudo dos últimos 60 dias e, antes disso, a primeira cópia de cada mês.
- Os `backup-completo-*` antigos não são apagados. "Restaurar backup" aceita os dois formatos.

### Usuários, senhas e histórico
- `usuarios/<login>.json`: `{versao:1, login, nome, admin, ativo, trocarSenha, senha:{alg,iter,sal,hash}, criadoEm, criadoPor, alteradoEm, alteradoPor}`. O login é o nome sem acento, em minúsculas, com hífen. A senha usa PBKDF2-SHA256 com 150 mil iterações e sal de 16 bytes; o mínimo é 6 caracteres.
- **Entrada:** janela `<dialog id="dlgEntrada">` que o Esc não fecha. Modos: sem suporte, conectar a pasta, autorizar a pasta, primeiro acesso, entrar (lista de usuários ativos, já com o último escolhido), trocar a senha provisória e sessão bloqueada. Os textos são os do padrão, ao pé da letra, com "Telemetria" trocado pelo nome do canal: "pasta Sistema do canal Infrações de velocidade".
- O nome do usuário logado substitui o campo "Seu nome" de hoje e alimenta `anuladoPor`, `enviadoPor` e a presença.
- **Bloqueio por inatividade:** depois de 20 minutos sem uso, a tela pede só a senha, com "Entrar com outro usuário".
- **Nova aba "Configurações"**, a última.
  - Todos veem "Minha senha" (trocar a própria senha).
  - Administradores veem "Usuários e senhas": cadastrar (nome, administrador sim ou não, senha provisória), redefinir senha (gera provisória), ativar ou desativar e tornar ou deixar de ser administrador.
  - Administradores também veem "Histórico de acessos", com o mês atual e o anterior, lidos de todos os arquivos `historico/`.
  - Regras: o único administrador ativo não pode se desativar nem perder o perfil. Se houver só um administrador, aparece "Cadastre um segundo administrador".
- **Histórico:** `historico/AAAA-MM_<id do navegador>.json`, com uma lista de `{em, tipo, login, nome, detalhe}`. Tipos: entrada, senha-errada, troca-senha, bloqueio, usuario-criado, senha-redefinida, usuario-alterado. Nunca é apagado.
- Usuário desativado não aparece na lista. Se estiver com a sessão aberta, sai no próximo desbloqueio ou no ciclo.

### Presença e bloqueio de registro
- `presenca/<id>.json`: `{origem, usuario, visto, saiu, registro, desde, versoes}`. O colega conta como online se foi visto há menos de 3 minutos.
- **Registro = a ficha do motorista** na aba Motorista (`registro = 'mot:'+slug(nome)`). Quem abriu primeiro fica com ela. Os outros veem a `s-msg aviso` "A ficha de [motorista] está em uso por [nome] desde [hora]…" (texto do padrão adaptado), e as ações de gravar dessa ficha ficam desativadas: anular, desfazer, WhatsApp, fora do painel, Outlook e marcar RH.
- O registro é liberado quando a pessoa troca de aba ou de motorista, fecha o painel ou fica 20 minutos parada (a sessão bloqueia).
- **Aguardando:** `versoes[registro]` guarda a hora da última alteração daquela ficha. Se o colega alterou e o arquivo dele ainda não chegou, aparece "Aguardando chegar pelo OneDrive…" com o botão "Abrir assim mesmo".
- O topo mostra quem está online, como hoje, e a `s-situacao` "SharePoint: salvo em HH:MM", "SharePoint: clique para reconectar" ou "SharePoint: não foi possível salvar".

### Sem pasta
- O painel fica fechado até conectar a pasta e entrar. O modo "só neste navegador" deixa de existir para uso normal. Os dados do localStorage continuam sendo levados para a pasta na primeira conexão, como hoje.
- Exceção só para testes: com `window.__teste && window.__semLogin`, o painel abre no modo local sem login, para os 37 cenários atuais continuarem rodando.

### Design
- Entram os tokens `--ouro`, `--lilas` e `--g-*`, e o CSS de componentes do padrão (`ds-css`, escalas, sombras).
- **Cabeçalho:** `.s-cab` com a logo, "Gestão de Frota" e o título "Infrações de velocidade". À direita: mês, situação do SharePoint, quem está online e o usuário (avatar, nome e Sair).
- **Abas:** `.s-abas`, com a aba ativa sublinhada em degradê.
- **Faixa de título** `.s-faixa-titulo` no topo de cada aba: mês em uso, título da aba e ação principal (por exemplo, Importar planilha).
- **Restante:** `.btn` com visual de `.s-btn` (`.btn.ghost` = branco; o principal de cada área em `primario`), campos como `.s-campo`, `.msg` como `.s-msg`, selos de situação como `.s-selo` (cor sólida, sem degradê), KPIs da Visão geral como `.s-kpi` e tabelas com o cabeçalho e a linha escolhida do padrão.
- Imagens de comunicado (canvas), e-mail e posts não mudam.
- O rodapé mostra "Versão vAAAA.MM.DD". `build.py` troca `__VERSAO__` pela data do build.

### Exportações
- Nomes: `infracoes-velocidade_<conteudo>_<inicio>_a_<fim>.<ext>`, sem acento e sem espaço.
  - Picos: `infracoes-velocidade_picos-<motorista>_2026-09-01_a_2026-09-30.jpg`.
  - Imagem completa: `…_comunicado-completo-<motorista>_…jpg`.
  - Backup manual: `…_backup_<dia>.json`.
  - E-mail: `…_email-rh-<motorista>_….eml`.

### Documentação
- README: uso, preparo do computador, migração da pasta e férias (os três passos do padrão).
- `CLAUDE.md` na raiz com o texto "Instrução para os próximos projetos" do padrão.
- HANDOFF atualizado.
- Manual rápido e guia completo: seções "Primeiro acesso" (pasta Sistema e login) e "Usuários e senhas", com prints novos fictícios.

## Testes

- Os 37 atuais continuam passando, com `__semLogin`.
- **Login (novos):** primeiro acesso cria o administrador com senha só em hash; senha errada mostra "Senha incorreta." e vai para o histórico; senha provisória obriga a troca e não aceita a mesma senha; após o tempo parado (relógio simulado) a sessão bloqueia e pede só a senha; o usuário desativado some da lista; o único administrador não pode se desativar; o Esc não fecha.
- **Pasta com duas pessoas:** A altera e B vê após o ciclo; nenhuma grava o arquivo da outra; a ficha aberta por A aparece "em uso por" para B e é liberada quando A sai; o backup do dia fica com o nome do usuário; a limpeza mantém 60 dias e um por mês; um arquivo v1 é lido; a pasta com outro nome mostra o aviso.
- Versão no rodapé; nomes das exportações.

## Fica para quem implementar

- O tempo de bloqueio e de ciclo em teste, por meio de constantes que o hook de teste consegue reduzir.
- O layout exato da aba Configurações dentro do padrão.
- Como ligar `__escolherPasta` (OPFS) aos testes novos, reaproveitando `tools/test`.
