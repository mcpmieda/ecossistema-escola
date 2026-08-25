# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração atingiu **100% do escopo técnico definido para esta fase** e a candidata visual vigente foi promovida como **HeroUI Native v2**.

- fonte técnica de verdade: `main`;
- commit executável da candidata HeroUI Native v2: `d852007ea12ee9a0c55328103e39bc67e888009a`;
- domínio de validação: `https://admin.escolaieda.com`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- Motion Profile: `expressive`;
- Ambient Surface Profile: `ambient-constellation`;
- Constellation Intensity: `strong`;
- acesso: restrito às capabilities administrativas existentes;
- release state: `validation`;
- produção oficial: **não autorizada**.

O deploy no domínio oficial continua sendo **ambiente de validação**. Implantação técnica não equivale à liberação oficial para usuários.

## Escopo fechado desta fase

Por decisão de produto, permanecem adiados e fora do cálculo de 100%:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Não foi criado comportamento artificial para fontes de dados ou regras institucionais ainda inexistentes.

## Fundação funcional preservada

A reconstrução HeroUI Native v2 ficou restrita à camada de apresentação e não substituiu nem reduziu:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- autorização server-side por capabilities;
- grants administrativos fail closed;
- grupos e roles institucionais;
- automação cargo → grupos;
- Graph e permissões existentes;
- SharePoint `CENTROADMIN`;
- Cloudflare Pages;
- CI/CD permanente;
- recovery técnico pós-deploy;
- rotação automática da identidade técnica;
- contratos modulares e semânticos;
- regras institucionais e fontes de dados existentes.

O diff final do PR #41 contém somente 9 arquivos em `src/`, todos de apresentação/estilo. Não houve alteração em `functions`, `infra`, `shared`, autenticação, Graph ou SharePoint.

## HeroUI Native v2

A Native v1 removeu os facades de shadcn/Radix. A revisão seguinte identificou um segundo nível de legado: **anatomias manuais que ainda reproduziam padrões da interface anterior**, mesmo usando tokens HeroUI.

O PR #41 reconstruiu essas estruturas diretamente com componentes HeroUI v3.

### Substituições estruturais

- breadcrumb manual → `Breadcrumbs` HeroUI;
- sidebar baseada em links/classes próprias → `ListBox` + `ScrollShadow` + `Surface` + `Alert` + `Chip`;
- busca manual → `SearchField` + `Kbd` + `Popover` + `ListBox`;
- perfil e logout separados → `Avatar` + `Dropdown` HeroUI;
- coleções de módulos → `ListBox`;
- sinais operacionais → `Table` compound;
- cobertura de health check → `ProgressBar`;
- migrações → `Table` compound;
- mobile continua usando `Drawer` HeroUI.

O TypeScript, build e browser QA validaram essas APIs diretamente. Não são wrappers ou classes com nomes simulando HeroUI.

### Gate de limpeza

Confirmado na candidata:

- `src/components/ui` inexistente;
- zero imports `@/components/ui/`;
- zero `@radix-ui/`;
- zero classe residual `nav-link-living`;
- zero `<kbd>` manual;
- componentes compound HeroUI presentes diretamente na árvore de apresentação.

## Ambient Constellation Native v2

A referência foi recalibrada contra o código público atual do modal HeroUI Pro.

Características da referência preservadas por proporção percebida:

- gradiente base `#E9E9FF → #CCE5F1`;
- glow `#5DD0E7 → #7300FF`;
- duas camadas independentes;
- ciclos aproximados de `12s` e `15s`;
- deslocamento em sentidos opostos;
- partículas de microescala;
- movimento proporcional ao campo, sem ampliar o diâmetro das partículas.

A implementação local **não copia o SVG oficial**. As partículas são geradas deterministicamente pelo Centro.

Implementação atual por primitive:

- `192` microestrelas;
- maior tamanho nominal limitado a aproximadamente `1.45px`;
- glints raros;
- dois planos de movimento;
- glow/aurora separados das partículas;
- reduced-motion remove os loops e mantém a composição estática.

No QA isolado da rota Operação foram medidas `576` partículas simultaneamente e maior partícula de `1.375px`.

## Living UI

O perfil `expressive` permanece obrigatório e foi reforçado em:

- transição de entrada entre rotas;
- estados ativos da navegação;
- overlays e drawers HeroUI;
- page headers com constelação e luz ambiente;
- loading com Spinner/Skeleton e atmosfera contínua;
- empty/planned states vivos;
- superfícies operacionais com profundidade;
- feedback de interação sem deslocar conteúdo;
- conteúdo denso mantido em ilhas limpas;
- `prefers-reduced-motion` com fallback estático.

## CI da candidata limpa

Commit final da branch antes da promoção:

`c6bd78076c6cbf6605578dbcf96517b8b62e77af`

Workflow `32843050061` — **success**:

- actionlint: pass;
- zizmor persona `pedantic`: pass;
- `npm ci`: pass;
- format: pass;
- lint: pass;
- typecheck: pass;
- semantic contract: pass;
- testes: pass;
- build Vite: pass.

## QA visual e temporal isolado

Workflow `32842682376` — **success**.

O Chrome executou o próprio App da candidata com interceptação apenas dos endpoints locais `/api/me` e `/api/platform/snapshot`, usando dados descartáveis. Nenhuma sessão do domínio, cookie falso ou bypass de segurança foi criado.

Foram validados:

- Operação desktop;
- Visão geral desktop;
- página planejada;
- Operação mobile;
- login desktop/mobile;
- `Dropdown` de perfil aberto de fato;
- Breadcrumbs/ListBox/SearchField/Kbd/Table/ProgressBar renderizados;
- movimento real do Ambient Constellation por `getAnimations()` + transform computado;
- reduced-motion estático;
- ausência da navegação visual antiga.

Artifact visual:

- id: `9561122170`;
- nome: `heroui-native-v2-visual-32842682376`;
- SHA-256: `11bcd69212921edcd5c65b22921747aa3946c47252cba9bf4f103ecfc9aeab6d`.

## Integração, deploy e recovery

PR #41 foi promovido por squash para `main`.

Commit executável:

`d852007ea12ee9a0c55328103e39bc67e888009a`

Workflow de `main`: `32843374875` — **success**.

Resultado:

- Validate GitHub Actions security: success;
- Validate application: success;
- Deploy Cloudflare Pages: success;
- Verify recovery after deploy: success;
- rebuild da fonte implantada: success;
- backup/restore descartável SharePoint: success;
- evidência redigida de recovery: success.

O recovery permanece limitado ao round trip técnico documentado da área SharePoint e não declara disaster recovery integral do tenant Microsoft 365.

## Smoke do domínio publicado

O smoke foi executado em branch descartável contra `https://admin.escolaieda.com`, sem autenticação artificial.

Run `32843679300` — **success**.

Artifact:

- id: `9561473735`;
- nome: `heroui-native-v2-domain-smoke-32843679300`;
- SHA-256: `f8bd31d68d8d3ac73ac681250318d062f37f67bb54a21dcddd5c8f1afee6527c`.

Confirmado no domínio efetivamente publicado:

- raiz = `200`;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão;
- login renderizado em Chrome real desktop e mobile;
- ausência de overflow horizontal no mobile;
- densidade constelar publicada acima do gate mínimo de `384` partículas;
- nenhuma partícula acima de `1.5px`;
- movimento do campo comprovado em dois instantes separados por ~3.5s;
- `playState = running` no modo normal;
- reduced-motion publicado com `animationName = none` e transform estático.

## App Factory

O aprendizado desta revisão foi incorporado à App Factory pelo PR #56, integrado no commit:

`c03960e694f46c4fb1bfb2a604c232c6e2817358`

O contrato HeroUI agora exige também auditoria de **anatomias manuais equivalentes ao design anterior**, não apenas remoção de dependências e facades. Também registra a referência pública do modal Pro e a obrigação de prova temporal real.

## Higiene

- nenhum workflow temporário de QA integra `main`;
- nenhum arquivo de smoke integra `main`;
- `src/components/ui` continua removido;
- não há dependência Radix/shadcn;
- o estado executável deriva de `main`;
- documentos v0.9 e Native v1 permanecem como histórico;
- a App Factory contém os gates reutilizáveis da Native v2.

## Marco atual

**A candidata HeroUI Native v2 está tecnicamente implantada, recuperável dentro do escopo testado e validada para inspeção autenticada.**

Isso não significa liberação oficial para usuários. `releaseState` continua `validation`.

O único gate obrigatório restante para esta candidata é humano:

1. abrir `https://admin.escolaieda.com` com uma sessão real de `ADMINISTRADOR`;
2. inspecionar as rotas internas e a experiência visual;
3. decidir se a candidata está aprovada.

Não será criado bypass ou redução de segurança para automatizar essa inspeção.

A liberação oficial permanece condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior exige nova validação e invalida uma aprovação anterior.

## Referências internas

- arquitetura: `ARCHITECTURE.md`;
- redesign atual: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- histórico Native v1: `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- histórico v0.9: `docs/REDESIGN_HEROUI_V0.9.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
