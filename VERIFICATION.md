# VERIFICATION — Centro de Administração HeroUI Native v2

## Resultado da fase

**100% do escopo técnico definido para esta fase foi concluído e revalidado após a reconstrução HeroUI Native v2.**

A candidata continua com `releaseState = validation`. Este fechamento técnico não autoriza produção oficial.

Ficam explicitamente adiados e fora do cálculo desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

## Candidata e domínio

Commit executável:

`d852007ea12ee9a0c55328103e39bc67e888009a`

Domínio de validação:

`https://admin.escolaieda.com`

Perfil visual validado:

- HeroUI React v3;
- `@heroui/react 3.2.4`;
- `@heroui/styles 3.2.4`;
- Motion Profile: `expressive`;
- Ambient Surface Profile: `ambient-constellation`;
- Constellation Intensity: `strong`;
- Living states: required/ativos;
- partículas em microescala de screen-space;
- `prefers-reduced-motion` com fallback estático.

## Reconstrução nativa v2

A Native v1 eliminou facades shadcn/Radix. A auditoria seguinte encontrou anatomias manuais que ainda reproduziam padrões da interface anterior.

PR #41 substituiu essas anatomias diretamente por componentes HeroUI v3:

- `Breadcrumbs` na topbar;
- `ListBox` na navegação e coleções de módulos;
- `ScrollShadow`, `Surface`, `Alert` e `Chip` na sidebar;
- `SearchField`, `Kbd`, `Popover` e `ListBox` na busca;
- `Avatar` + `Dropdown` no perfil/logout;
- `Table` compound nos sinais, integração, auditoria, configurações e migrações;
- `ProgressBar` na cobertura operacional;
- `Drawer` nos overlays mobile.

Gate de limpeza confirmado:

- `src/components/ui` ausente;
- zero `@/components/ui/`;
- zero `@radix-ui/`;
- zero `nav-link-living`;
- zero `<kbd>` manual;
- nenhuma alteração funcional em BFF, Entra, Graph, SharePoint ou contratos.

O diff final do PR #41 contém somente 9 arquivos em `src/`, todos de apresentação/estilo.

## Ambient Constellation v2

A primitive foi recalibrada contra a referência pública atual do modal HeroUI Pro.

Baseline visual:

- gradiente `#E9E9FF → #CCE5F1`;
- glow `#5DD0E7 → #7300FF`;
- duas camadas independentes;
- ciclos ~`12s` e ~`15s`;
- movimentos opostos/defasados;
- deslocamento proporcional à superfície;
- partículas próprias, sem copiar o SVG oficial.

Implementação por primitive:

- `192` microestrelas;
- máximo nominal ~`1.45px`;
- glints raros;
- glow e partículas em planos separados;
- reduced-motion desliga loops espaciais.

No QA isolado da rota Operação:

- partículas simultâneas medidas: `576`;
- maior partícula medida: `1.375px`;
- zero partícula acima do limite de `1.5px`.

## CI da branch limpa

Commit final da candidata antes do squash:

`c6bd78076c6cbf6605578dbcf96517b8b62e77af`

Workflow `32843050061` — **success**:

- Validate GitHub Actions security: success;
- actionlint: pass;
- zizmor persona `pedantic`: pass;
- `npm ci`: pass;
- format: pass;
- lint: pass;
- typecheck: pass;
- semantic contract: pass;
- testes: pass;
- build Vite: pass.

## QA visual e temporal da candidata

Workflow `32842682376` — **success**.

O teste executou o App real da branch em Chrome. Somente os endpoints locais `/api/me` e `/api/platform/snapshot` foram interceptados para fornecer fixture descartável; nenhuma autenticação real, cookie do domínio ou bypass foi criado.

### Componentes nativos detectados

Na rota Operação foram confirmados no DOM/aplicação:

- Breadcrumbs;
- ListBox;
- SearchField;
- Dropdown aberto e conteúdo renderizado;
- Tables;
- ProgressBar;
- zero classe de navegação antiga.

### Cobertura visual

Capturas/validações incluíram:

- Operação desktop;
- Visão geral desktop;
- página planejada;
- Operação mobile;
- login desktop;
- login mobile;
- perfil/Dropdown aberto;
- reduced-motion.

### Prova temporal

A primitive real foi medida em dois instantes separados por ~3.5 s usando Chrome DevTools Protocol.

O gate exigiu simultaneamente:

- `animation.currentTime` avançando mais de 2.5 s;
- `transform` computado diferente entre os frames;
- animação realmente ativa no modo normal.

Reduced-motion exigiu:

- `animationName = none`;
- transform computado estático entre medições.

Artifact:

- id: `9561122170`;
- nome: `heroui-native-v2-visual-32842682376`;
- SHA-256: `11bcd69212921edcd5c65b22921747aa3946c47252cba9bf4f103ecfc9aeab6d`.

## Integração, CI, deploy e recovery

PR #41 foi integrado por squash em:

`d852007ea12ee9a0c55328103e39bc67e888009a`

Workflow de `main`: `32843374875` — **success**.

Resultado:

- Validate GitHub Actions security: success;
- Validate application: success;
- format/lint/typecheck/semantic/test/build: pass;
- Deploy Cloudflare Pages: success;
- Verify recovery after deploy: success;
- rebuild da fonte implantada: success;
- backup/restore descartável SharePoint: success;
- evidência redigida de recovery: success.

O recovery continua limitado ao round trip técnico documentado da área SharePoint e não declara disaster recovery integral do Microsoft 365.

## Smoke externo da versão implantada

O domínio publicado foi verificado em branch descartável, sem autenticação artificial.

Run `32843679300` — **success**.

Artifact:

- id: `9561473735`;
- nome: `heroui-native-v2-domain-smoke-32843679300`;
- SHA-256: `f8bd31d68d8d3ac73ac681250318d062f37f67bb54a21dcddd5c8f1afee6527c`.

### HTTP

Confirmado diretamente contra `https://admin.escolaieda.com`:

- raiz: `200`;
- `/api/me`: `401` sem sessão;
- `/api/platform/snapshot`: `401` sem sessão.

### Chrome no domínio oficial

Confirmado no bundle realmente publicado:

- login institucional renderizado;
- desktop e mobile;
- ausência de overflow horizontal no mobile;
- densidade de partículas acima do gate mínimo de `384`;
- maior partícula `≤ 1.5px`;
- nenhuma partícula acima do limite;
- movimento temporal real em dois frames separados por ~3.5 s;
- `playState = running` em modo normal;
- reduced-motion com `animationName = none` e transform estático.

Portanto, a assinatura Living/Ambient validada na fixture está presente também na versão publicada.

## Fundação preservada

Permanecem intactos:

- Microsoft Entra ID;
- BFF e sessão;
- groups/roles institucionais;
- capabilities server-side;
- grants administrativos fail closed;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática da identidade técnica;
- contratos modulares e semânticos;
- `releaseState = validation`.

## App Factory

A regra reutilizável foi fortalecida no PR #56 da App Factory e integrada no commit:

`c03960e694f46c4fb1bfb2a604c232c6e2817358`

O contrato agora exige:

- auditoria de anatomias manuais equivalentes ao design anterior;
- preferência por componentes HeroUI nativos quando existe capacidade equivalente;
- referência proporcional correta do Ambient Constellation;
- fonte única de CSS da primitive;
- QA temporal real e reduced-motion.

## Higiene final

- nenhum workflow temporário de QA integra `main`;
- nenhum harness de smoke integra `main`;
- `src/components/ui` continua removido;
- imports/dependências Radix/shadcn permanecem removidos;
- `main` é a fonte técnica de verdade;
- Native v1 e v0.9 permanecem apenas como histórico.

## Gate humano e aprovação

Não existe desenvolvimento técnico obrigatório pendente dentro do escopo desta candidata.

Permanece deliberadamente humano:

- inspeção das rotas internas com uma sessão real de `ADMINISTRADOR`;
- decisão de aceitação da experiência apresentada.

Não será criado bypass, cookie falso ou redução de segurança para automatizar esse gate.

A produção oficial permanece bloqueada até o comando exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior exige nova rodada de validação e invalida aprovação anterior.
