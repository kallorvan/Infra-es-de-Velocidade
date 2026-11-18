# Painel no Padrão de Sistemas Tóliman: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o painel Infrações de Velocidade seguir o Padrão de Sistemas Tóliman: pasta Sistema, login com usuários e senhas, presença com bloqueio da ficha, backups do padrão, design `s-`, versão no rodapé e documentação.

**Architecture:** O padrão é encaixado no painel de arquivo único que já existe (`src/painel.html`, IIFE).
- Ficam como estão: o objeto `pasta`/`store`, a junção `fundir()` e os registros `{t,b}`.
- Entram três peças: um módulo de acesso (usuários, senhas, histórico e janela `#dlgEntrada`), a presença com registro e o CSS de componentes do padrão.
- `tools/build.py` embute a logo e as fontes e troca `__VERSAO__`.

**Tech Stack:** HTML, CSS e JS sem dependências; WebCrypto (PBKDF2); File System Access API; Playwright (`/opt/node-tools/node_modules/playwright`) com OPFS no lugar da pasta; Python 3 para o build.

**Spec:** `docs/superpowers/specs/2026-11-18-padrao-sistemas-toliman-design.md`, com a referência no artefato https://claude.ai/artifact/NiiyT3so8rej7pLiy84L5M (CSS `ds-css`, código de referência e textos padrão).

## Global Constraints

- `PASTA_NOME = 'Sistema'`. Subpastas: `dados`, `backups`, `presenca`, `usuarios`, `historico`.
- `NOME_SISTEMA = 'Infracoes-de-Velocidade'`: prefixo dos backups. Prefixo das exportações: `infracoes-velocidade`.
- Senha: PBKDF2-SHA256, `ITER_SENHA = 150000`, sal de 16 bytes, `MIN_SENHA = 6`. O texto da senha nunca é gravado.
- Tempos: `PARADO_MS = 20*60000`, `PULSO_MS = 20000`, `GRAVAR_MS = 2000`, `ONLINE_MS = 3*60000`, `BACKUP_DIAS = 60`. Em teste, `window.__tempos` pode substituir qualquer um deles, e é lido só quando `window.__teste` existe.
- Textos da seção "Textos padrão" do artefato, ao pé da letra, trocando "canal da Telemetria" por "canal Infrações de velocidade".
- Só tema claro. Sem emoji. Números no formato pt-BR. Foco visível. Sem rolagem lateral no celular.
- O arquivo de dados versão 1 (`{formato, versao:1, dispositivo, usuario, atualizadoEm, cols}`) continua sendo lido para sempre.
- Testes e prints só com dados fictícios. Commits terminam com as linhas Co-Authored-By e Claude-Session da sessão.
- Build e testes: `python3 tools/build.py && node tools/test/painel.test.js [filtro]`. A suíte inteira leva cerca de 4 min (use timeout de 500 s).

## Review Focus

1. **Pasta renomeada com dados antigos:** a "Dados do painel" vira "Sistema" com arquivos `dados/*.json` v1 e `backup-completo-*`. Tudo precisa aparecer, sem duplicar, e o primeiro a entrar cai em "Primeiro acesso", porque ainda não existe `usuarios/`. (Teste na Tarefa 1.)
2. **Arquivo de usuário pela metade ou corrompido em `usuarios/`** (OneDrive ainda baixando): a lista de entrada ignora o arquivo e não quebra. E não pode cair em "Primeiro acesso" quando há outros usuários válidos. (Teste na Tarefa 3.)
3. **Dois navegadores criam o primeiro acesso ao mesmo tempo:** os dois viram administradores e nenhum arquivo é sobrescrito, porque cada login é um arquivo diferente. Se for o mesmo login, "Criar acesso" relê `usuarios/` antes de gravar e recusa com "Já existe um usuário com este nome." (Teste na Tarefa 3.)
4. **Ficha em uso e o dono fecha a aba sem `pagehide`** (queda de energia): depois de 3 minutos sem presença, a ficha libera para o colega. (Teste na Tarefa 5, com `__tempos.ONLINE_MS` curto.)
5. **Sessão bloqueia no meio de uma ação de gravar** (barra de anulação aberta): ao desbloquear com a senha, o estado da tela continua, e nada é gravado enquanto a sessão está bloqueada. (Teste na Tarefa 3.)

---

### Task 1: Pasta Sistema, arquivo de dados v2, ciclo e aviso de pasta

**Files:**
- Modify: `src/painel.html`: constantes da pasta (por volta da linha 687), `store.conectarPasta`, `_ler`, `_marcar`, `_gravar`, `_visto`, `renderPasta`, `acaoPasta`.
- Test: `tools/test/painel.test.js`: helpers da pasta (linha ~404) e cenários `pasta:`.

**Interfaces:**
- Produces: `pasta.raiz` (handle da Sistema); `pasta.sub(nome) -> Promise<DirHandle>`; `avisoPasta(h) -> Promise<string>` ('' se a pasta está certa); `dadosArquivo() -> {versao:2, geradoEm, origem, usuario, cols}`; `lerDados(json) -> {cols, usuario}`, que aceita v1 e v2; `store.ciclo()` (ler, juntar, presença). A conexão passa a ser chamada pela janela de entrada (Tarefa 3) com `store.conectarPasta(h)`. A conexão não exige mais o nome: `pasta.usuario` vem da sessão.
- Os helpers de teste `limparOpfs(p)`, `prepPasta(p, disp, suf)` (que define `__escolherPasta` para o diretório OPFS `Sistema`) e `viaHttp` são usados pelas Tarefas 2–5.

- [ ] **Passo 1: Testes que falham.** Todos com `__semLogin` e conexão direta `__painel.store.conectarPasta()`. O hook passa a expor `store` e `pasta`.
  - `pasta: grava dados/<id>.json com versao 2, origem e usuario`. Depois de `store.put`, aguardar o `GRAVAR_MS` reduzido. O arquivo `Sistema/dados/pcana.json` tem `versao===2`, `origem==='pcana'`, `typeof geradoEm==='string'` e `cols.meses['2026-09-seco']`.
  - `pasta: lê arquivo versão 1 de outro navegador (pasta antiga renomeada)`. Criar `Sistema/dados/pcvelho.json` no formato v1 com um mês e `Sistema/backups/backup-completo-infracoes-velocidade-2026-11-01_10h00.json`; conectar. `A().mot.get('ANA TESTE').meses['2026-09'].b1===36`, e as subpastas `presenca`, `usuarios` e `historico` existem.
  - `pasta: pasta com outro nome mostra o aviso e Usar esta pasta segue`. Com `__escolherPasta` devolvendo o diretório `Outra` que contém `x.txt`, a conexão para e mostra o texto exato "A pasta escolhida se chama Outra. Os dados do sistema ficam na pasta Sistema do canal. Escolha a pasta Sistema ou, se for esta mesmo, clique em Usar esta pasta." com os botões `[data-pasta="outra"]` e `[data-pasta="usar"]`. Clicar em usar leva a `mode==='pasta'`.
  - `pasta: pasta do canal com "Dados do painel" pede a renomeação`. Diretório `Equipe` com a subpasta `Dados do painel/dados`: a mensagem contém "renomeie a pasta Dados do painel para Sistema" e nada é criado em `Equipe`.
  - Adaptar `pasta: anulação feita na aba A aparece na aba B` para a pasta `Sistema` e a conexão direta.
- [ ] **Passo 2:** rodar `node tools/test/painel.test.js pasta:`. Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
  - `PASTA_NOME='Sistema'`. `pasta.raiz` = a própria pasta escolhida. Subpastas criadas só depois de `avisoPasta` passar (ou de "Usar esta pasta").
  - `avisoPasta(h)`: se o nome é "Sistema" e a pasta tem estrutura (está vazia ou tem `usuarios`, `dados` ou `historico`), volta ''. Se contém a subpasta "Dados do painel", volta a mensagem de renomeação: "Esta é a pasta do canal. Os dados do painel agora ficam na pasta Sistema: no Teams, renomeie a pasta Dados do painel para Sistema, coloque este arquivo dentro dela e conecte a pasta Sistema." Nos demais casos, o texto padrão.
  - Gravar com `GRAVAR_MS`. Ciclo com `PULSO_MS`, ao focar e ao voltar a aba visível; grava ao esconder a aba.
  - A presença passa para `presenca/<id>.json` no formato do padrão `{origem, usuario, visto, saiu, registro, desde, versoes}`. O registro é preenchido na Tarefa 5. Online = `!saiu && agora - visto < ONLINE_MS`.
  - Sai a faixa "Conecte a pasta / Seu nome" de `renderPasta`, que a Tarefa 3 substitui pela janela. Ficam os avisos de falha ao gravar e ao ler.
  - Sai o botão "trocar" do nome em `renderOnline`.
- [ ] **Passo 4:** rodar `pasta:` e depois a suíte inteira. Esperado: PASS, com os 37 antigos passando.
- [ ] **Passo 5:** commit "Pasta Sistema, arquivo de dados v2 e aviso de pasta errada".

### Task 2: Backups do padrão e limpeza

**Files:**
- Modify: `src/painel.html`: `_backupDiario`, `nomeBackup`, `baixarBackupCompleto` (por volta da linha 2400) e a nota `#bkpc-nota`.
- Test: `tools/test/painel.test.js`.

**Interfaces:**
- Consumes: `pasta.sub('backups')`; `loginDe(nome) -> string` (Tarefa 3; até lá, `slug`).
- Produces: `nomeBackupDia(dia:'AAAA-MM-DD', login) -> 'Infracoes-de-Velocidade_dados_<dia>_<login>.json'`; `limparBackups(hojeISO)`.

- [ ] **Passo 1: Testes.**
  - `backup: cópia do dia com o nome do usuário`. Depois de conectar com o usuário "Ana Souza" e gravar, existe `Sistema/backups/Infracoes-de-Velocidade_dados_<hoje>_ana-souza.json`, com `meses` e `versao`.
  - `backup: limpeza mantém 60 dias e a primeira de cada mês, só do próprio usuário`. Semear arquivos: `…_2026-07-03_ana-souza.json`, `…_2026-07-20_ana-souza.json`, `…_2026-08-01_ana-souza.json`, `…_2026-10-01_ana-souza.json` (dentro de 60 dias de 2026-11-18), `…_2026-07-20_bruno-lima.json` e um `backup-completo-…`. Rodar `limparBackups('2026-11-18')`. Somem só `2026-07-20_ana-souza`; o resto fica. Uma segunda chamada no mesmo dia não lê a pasta (`infra-vel-limpeza` no localStorage).
  - Ajustar `backup leva e restaura anulações` se ele depender do nome.
- [ ] **Passo 2:** rodar `backup`. Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
  - Um backup por dia e por usuário, com o conteúdo `dadosCompletos()`.
  - Retenção pelo código de referência `limparBackups` (60 dias; antes disso, só a primeira cópia do mês). Remove só arquivos com sufixo `_<login>.json` e prefixo `Infracoes-de-Velocidade_dados_`. A retenção por quantidade (`BKP_GUARDAR`) sai.
  - O botão de backup manual baixa `infracoes-velocidade_backup_<dia>.json`, e na pasta grava o nome do dia.
  - A nota diz "Sistema › backups (uma cópia por dia de cada pessoa; depois de 60 dias, fica a primeira de cada mês)".
  - "Restaurar backup" continua aceitando os dois formatos, porque o conteúdo não muda.
- [ ] **Passo 4:** rodar `backup` e a suíte inteira. Esperado: PASS.
- [ ] **Passo 5:** commit.

### Task 3: Usuários, senhas, janela de entrada, histórico e bloqueio por inatividade

**Files:**
- Modify: `src/painel.html`: novo bloco "Acesso" depois do `store`, HTML `#dlgEntrada` antes do `<header>`, CSS da janela (do `txt-css` do artefato), init no fim (`store.init`).
- Test: `tools/test/painel.test.js`, com o runner passando a definir `window.__semLogin = true` em todos os testes.

**Interfaces:**
- Consumes: `store.conectarPasta(h)`, `avisoPasta`, `pasta.sub`.
- Produces:
  - `hashSenha(senha, sal?, iter?) -> Promise<{alg,iter,sal,hash}>`, `senhaConfere(u, senha) -> Promise<bool>`, `problemaSenha(nova, repetida) -> string`.
  - `loginDe(nome)`: `slug` sem acento, minúsculas, com hífen.
  - `acesso.usuarios() -> Promise<User[]>` (lê `usuarios/*.json` e ignora o que não abre como JSON); `acesso.gravarUsuario(u)`.
  - `acesso.registrar(tipo, detalhe?)` (acrescenta em `historico/AAAA-MM_<id>.json`).
  - `sessao = {login, nome, admin} | null`.
  - `mostrarEntrada(modo?, aviso?)`, `bloquearSessao()`, `sair()`.
  - `store.uid` e `pasta.usuario` = `sessao.nome`.
  - Hook de teste: `__painel.acesso`, `__painel.sessao()`, `__painel.bloquear()`.
  - Helper de teste `entrar(p, {disp, nome, senha, suf, primeiro})`.

- [ ] **Passo 1: Testes `login:`.** Cada um define `__semLogin=false` e usa `viaHttp` com OPFS limpo.
  - `login: painel fechado até entrar; Esc não fecha`. `#dlgEntrada` aberto (`open`), título "Conectar a pasta do SharePoint". `keyboard.press('Escape')` mantém aberto. `#v-geral` não é interativo: o dialog é modal.
  - `login: primeiro acesso cria administrador com senha só em hash`. Conectar e preencher "Ana Souza" / "segredo1" / "segredo1". `usuarios/ana-souza.json` tem `admin:true`, `ativo:true`, `trocarSenha:false`, `senha.alg==='PBKDF2-SHA256'`, `senha.iter===150000`, e o texto do arquivo não contém "segredo1". O dialog fecha. O topo mostra "Ana Souza". O histórico do mês tem `tipo:'entrada'`.
  - `login: senhas curtas e diferentes mostram a mensagem padrão`: "A senha precisa ter pelo menos 6 caracteres." e "As duas senhas não são iguais.".
  - `login: senha errada mostra "Senha incorreta." e vai para o histórico`, com `tipo:'senha-errada'` e o login.
  - `login: senha provisória obriga a troca e recusa a mesma`. Usuário semeado com `trocarSenha:true` e senha "provisoria1" (hash gerado no page por `__painel.acesso.hashSenha`). Entrar leva a "Crie a sua senha". A mesma senha dá "Escolha uma senha diferente da provisória.". Outra senha entra e grava `trocarSenha:false`.
  - `login: 20 min parado bloqueia e pede só a senha`. Com `__tempos.PARADO_MS=1500` e o verificador a cada 500 ms, aparece "Sessão bloqueada" com o texto padrão e o nome. A senha certa volta à tela sem perder `#anul-bar` aberto (Review Focus 5). Enquanto está bloqueado, `store.put` recusa com o código `bloqueado`.
  - `login: usuário desativado some da lista`, com `ativo:false`.
  - `login: arquivo pela metade em usuarios/ é ignorado`. `usuarios/x.json` com `{"login":` cortado: a lista mostra os válidos e o modo não é "primeiro".
  - `login: primeiro acesso com nome já existente é recusado`. Duas páginas: B grava `ana-souza` antes do submit de A, e A vê "Já existe um usuário com este nome.".
  - `login: navegador sem suporte`. Com `showDirectoryPicker` e `__escolherPasta` removidos, aparece o título "Navegador sem suporte" e o texto padrão.
- [ ] **Passo 2:** rodar `login:`. Esperado: FAIL.
- [ ] **Passo 3: Implementar**, seguindo o código de referência do artefato (`txt-js`, `txt-html`, `txt-css`).
  - Modos: `sem-suporte | pasta | reconectar | aviso-pasta | primeiro | login | trocar | bloqueada`, com os textos padrão.
  - O último usuário escolhido fica em `infra-vel-ultimo-usuario`. O foco vai para o primeiro campo.
  - Init: com `__semLogin`, mantém o modo local de hoje sem janela. Sem ele, `mostrarEntrada()` decide o modo.
  - Inatividade: eventos `pointerdown`, `pointermove`, `keydown` e `wheel`; verificação a cada 30 s (ou o valor de `__tempos`).
  - `store.put` e `store.del` recusam enquanto `sessaoBloqueada`.
  - Usuário desativado ou removido sai no próximo desbloqueio e no ciclo.
  - Topo: avatar com as iniciais, nome e o botão "Sair", que grava o histórico e mostra a entrada.
- [ ] **Passo 4:** rodar `login:` e a suíte inteira. Esperado: PASS.
- [ ] **Passo 5:** commit.

### Task 4: Aba Configurações (minha senha, usuários e senhas, histórico de acessos)

**Files:**
- Modify: `src/painel.html`: aba `#tab-cfg` e `#v-cfg` (a última), `setTab` com a lista nova, `renderCfg()`.
- Test: `tools/test/painel.test.js`.

**Interfaces:**
- Consumes: `acesso.*`, `sessao`, `hashSenha`, `problemaSenha`.
- Produces: `renderCfg()`; a aba aparece só no modo pasta com sessão.

- [ ] **Passo 1: Testes `config:`.**
  - `config: administrador cadastra colega com senha provisória`. Nome "Bruno Lima", senha provisória "inicio123" e Administrador desmarcado: `usuarios/bruno-lima.json` tem `trocarSenha:true`, `admin:false` e `criadoPor:'Ana Souza'`, e o histórico tem `usuario-criado`.
  - `config: redefinir senha gera provisória`: `trocarSenha` volta a true e o histórico tem `senha-redefinida`.
  - `config: único administrador não pode se desativar nem perder o perfil`. Os controles da própria linha ficam desativados, com o título "Cadastre outro administrador antes". Aparece a `s-msg aviso` "Cadastre um segundo administrador para não perder o acesso em férias ou se alguém esquecer a senha.". Com 2 administradores, o aviso some.
  - `config: usuário comum vê só Minha senha`. "Usuários e senhas" e "Histórico de acessos" ficam ocultos. Trocar a própria senha exige a senha atual e grava `troca-senha`.
  - `config: histórico de acessos lista o mês atual e o anterior de todos os navegadores`: duas páginas, e as linhas das duas aparecem, da mais recente para a mais antiga.
- [ ] **Passo 2:** rodar `config:`. Esperado: FAIL.
- [ ] **Passo 3: Implementar** com os componentes `s-campo`, `s-btn`, `s-tabela` e `s-selo`.
  - Colunas de usuários: Nome, Login, Perfil, Situação, Última alteração e Ações (Redefinir senha, Ativar/Desativar, Tornar administrador/Deixar de ser administrador).
  - Histórico com Quando, Pessoa, O que e Computador. Os tipos aparecem em texto: entrada → "Entrou", senha-errada → "Senha incorreta", troca-senha → "Trocou a senha", bloqueio → "Sessão bloqueada", usuario-criado → "Cadastrou usuário", senha-redefinida → "Redefiniu senha", usuario-alterado → "Alterou usuário".
- [ ] **Passo 4:** rodar `config:` e a suíte inteira. Esperado: PASS.
- [ ] **Passo 5:** commit.

### Task 5: Presença com registro e bloqueio da ficha do motorista

**Files:**
- Modify: `src/painel.html`: `_visto` (presença), `renderMot`, `setTab`, as ações de gravar da ficha (`anularSelecionados`, `desfazerAnulacao`, `registrarEnvio`, `marcarFora`, `marcarRH`, `abrirEmlRH`) e `_marcar` (para gravar `versoes`).
- Test: `tools/test/painel.test.js`.

**Interfaces:**
- Consumes: `pasta.colegas`, presença da Tarefa 1, `sessao`.
- Produces:
  - `registroAtual() -> 'mot:'+slug(nome) | ''`: só com a aba Motorista visível e um motorista escolhido.
  - `donoDoRegistro(id, desde) -> colega | null`, a regra do artefato.
  - `fichaLivre() -> bool`, para que todas as ações de gravar da ficha retornem cedo.
  - `#ficha-uso`, a `s-msg` acima da ficha.

- [ ] **Passo 1: Testes `ficha:`** (duas páginas, `PULSO_MS=500`, `ONLINE_MS=3000`).
  - `ficha: aberta por A aparece em uso para B e bloqueia anular e envios`. B abre a mesma ficha depois de A e vê o texto "A ficha de ANA TESTE está em uso por Ana Souza desde HH:MM. Escolha outro motorista ou aguarde: ela é liberada sozinha quando essa pessoa trocar de motorista, ficar 20 minutos sem mexer ou fechar o sistema.". As caixas `input[data-anul]` estão ocultas e `#com-wa`, `#rh-ok` e `#rh-eml` estão desativados.
  - `ficha: liberada quando A troca de motorista`: B volta a ter as ações.
  - `ficha: liberada 3 min sem presença (A fechou sem avisar)`. Fechar a página A sem `pagehide` (`page.close({runBeforeUnload:false})` depois de remover o handler pelo hook) e, depois de `ONLINE_MS`, B está livre.
  - `ficha: aguardando dados do colega com Abrir assim mesmo`. A anula com a gravação atrasada (`GRAVAR_MS=5000`) e a presença já com `versoes`. B vê "Aguardando chegar pelo OneDrive o que Ana Souza alterou nesta ficha. Costuma levar menos de um minuto." e o botão `[data-ficha="abrir"]`, que libera.
- [ ] **Passo 2:** rodar `ficha:`. Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
  - A presença guarda `registro` e `desde` (a hora em que a ficha foi aberta).
  - `versoes[registro]` = a hora da última alteração local que toca a ficha: anulação, comunicado, cadastro do motorista.
  - "Aguardando" compara `versoes` do colega com a `lastModified` já lida do arquivo dele.
  - A sessão bloqueada libera o registro.
- [ ] **Passo 4:** rodar `ficha:` e a suíte inteira. Esperado: PASS.
- [ ] **Passo 5:** commit.

### Task 6: Design do padrão, fontes, logo e versão

**Files:**
- Modify: `src/painel.html` (`<head>`, `<style>`, `<header>`, abas, faixas de título, rodapé); `tools/build.py`.
- Create: `assets/fonts/*.woff2` (Barlow Condensed 500/600/700, IBM Plex Sans 400/500/600/700, IBM Plex Mono 400/500/600, latin); `assets/logo.png` (copiado de `tools/manual/rapido/logo.png`).
- Test: `tools/test/painel.test.js`.

**Interfaces:**
- Produces:
  - `build.py` troca `%%LOGO%%` pela logo combinada, `%%FONTES%%` pelos `@font-face` em base64 e `__VERSAO__` por `'v'+date.today().strftime('%Y.%m.%d')`.
  - `#versao` no rodapé com o texto "Versão vAAAA.MM.DD".
  - `#dlgEntrada` usa `%%LOGO%%`.

- [ ] **Passo 1: Testes `design:`.**
  - `design: rodapé mostra a versão do build`: `#versao` tem o texto `^Versão v\d{4}\.\d{2}\.\d{2}$`, igual à data de hoje.
  - `design: cabeçalho e abas do padrão`. Existem `.s-cab`, `.s-abas`, e a aba ativa tem `aria-selected="true"` (ou `aria-current`) com o sublinhado (computed `::after` background-image contém `linear-gradient`). A família computada do `h1` da faixa contém "Barlow Condensed", e a do body, "IBM Plex Sans".
  - `design: sem rolagem lateral em 390px`: `scrollWidth <= clientWidth` em cada aba.
  - `design: funciona sem internet`: com todas as requisições externas abortadas (o runner já faz isso), `document.fonts.check('700 20px "Barlow Condensed"')` é true depois de `document.fonts.ready`.
- [ ] **Passo 2:** rodar `design:`. Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
  - Baixar os woff2 (Google Fonts, latin) para `assets/fonts/`. Se a rede bloquear, `npm pack @fontsource/barlow-condensed @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` e usar `files/*-latin-<peso>-normal.woff2`.
  - Tokens do Layout Base mais o `ds-css` do artefato (copiado inteiro).
  - As variáveis antigas (`--f-ui`, `--f-num`, `--coral`, `--muted`…) passam a apontar para os tokens novos, para que o CSS existente siga coerente.
  - Header → `.s-cab` mais `.s-abas` (os `button.tab` mantêm ids e `role=tab`).
  - `.s-faixa-titulo` no topo de cada aba, com o mês em uso, o título da aba e a ação principal: Visão geral → "Importar planilha" (vai para a aba Importar); Motorista → nenhuma; Histórico → nenhuma; Cadastro → "Salvar cadastro" fica no formulário; Importar → nenhuma; Regras → nenhuma; Configurações → nenhuma.
  - `.btn` com o visual de `.s-btn` e `.btn.ghost` branco; um principal por área com `.btn` (o principal de cada card). `.msg.err/.ok/.info` com o visual de `.s-msg`. `.st.*` com o visual de `.s-selo` (cores sólidas).
  - KPIs da Visão geral como `.s-kpi`; tabelas com o cabeçalho e o hover de `.s-tabela`.
  - O canvas dos comunicados não muda.
- [ ] **Passo 4:** rodar `design:` e a suíte inteira. Esperado: PASS. Conferir com print em 1280 e 390 px (dados fictícios).
- [ ] **Passo 5:** commit.

### Task 7: Nomes das exportações

**Files:**
- Modify: `src/painel.html` (`gerarImagem` → `comUi.arquivo`, `imagemRH`, `abrirEmlRH`, backup manual); os testes que conferem nomes (`RH: .eml…`).

**Interfaces:**
- Produces: `nomeExport(conteudo, ini, fim, ext)`, do código de referência (com `NOME_EXPORT='infracoes-velocidade'`); `periodoMes(mes) -> [ini, fim]`.

- [ ] **Passo 1: Testes.** O `.eml` baixa `infracoes-velocidade_email-rh-ana-teste_2026-09-01_a_2026-09-30.eml`, a imagem completa `infracoes-velocidade_comunicado-completo-ana-teste_2026-09-01_a_2026-09-30.jpg` e a imagem de picos `infracoes-velocidade_picos-ana-teste_2026-09-01_a_2026-09-30.jpg` (pelo `#com-dl`, `waitForEvent('download')`). O anexo dentro do `.eml` tem o mesmo nome da imagem completa.
- [ ] **Passo 2:** FAIL. **Passo 3:** implementar. **Passo 4:** PASS na suíte inteira. **Passo 5:** commit.

### Task 8: Documentação, manuais e CLAUDE.md

**Files:**
- Create: `CLAUDE.md`, com o texto "Instrução para os próximos projetos" do artefato e uma seção curta "Este projeto": `src/painel.html`, `tools/build.py`, testes, a regra de dados fictícios, merge só quando pedirem e nenhum identificador de modelo em commits.
- Modify:
  - `README.md`: uso, "Preparar o computador", "Migrar da pasta Dados do painel", "Férias e substituição" (os três passos do artefato), "Usuários e senhas".
  - `docs/HANDOFF.md`.
  - `tools/manual/rapido/manual.html` e `tools/manual/completo/guia.html`: Primeiro acesso, com a pasta Sistema e a janela de entrada; nova seção "Usuários e senhas"; os prints que mudaram.
  - `tools/manual/prints-historico.js`, para gerar os prints `00-entrada.jpg`, `17-usuarios.jpg` e regerar os de tela.
  - `docs/posts/post-acesso-teams.html` e o JPG: o passo de conectar a pasta passa a ser "pasta Sistema" mais o login.

- [ ] **Passo 1:** escrever os textos, regerar os prints com dados fictícios e os PDFs (`python3 tools/manual/rapido/build.py`, `python3 tools/manual/completo/build.py`).
- [ ] **Passo 2:** conferir os PDFs (páginas e prints visíveis) e rodar a suíte inteira. Esperado: tudo passando.
- [ ] **Passo 3:** commit e push para `claude/keen-ramanujan-ew6w9c`.

### Revisão final

- [ ] Revisão do branch inteiro por um revisor (lista de conferência do artefato, item a item). Corrigir o que for importante, com teste RED→GREEN, suíte verde e push.
