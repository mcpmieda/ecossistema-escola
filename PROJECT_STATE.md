# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração atingiu **100% do escopo técnico definido para esta fase** e a candidata visual vigente foi reconstruída como **HeroUI Native v1**.

- fonte técnica de verdade: `main`;
- commit executável da candidata HeroUI Native v1: `0746241f385db158dfaaa36102d0a662e6488262`;
- domínio de validação: `https://admin.escolaieda.com`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- Motion Profile: `expressive`;
- Ambient Surface Profile: `ambient-constellation`;
- Constellation Intensity: `strong`;
- acesso da candidata: restrito às capabilities administrativas existentes;
- release state: `validation`;
- produção oficial: **não autorizada**.

O deploy no ambiente oficial de validação não equivale à liberação oficial. A inspeção autenticada do administrador e a decisão de aprovação continuam sendo gates humanos.

## Escopo fechado desta fase

Por decisão de produto, permanecem adiados e fora do cálculo de 100% desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Notificações/pendências também não receberam implementação artificial: ainda não existe fonte autoritativa e regra institucional suficientes para criar comportamento real sem inventar produto.

## Fundação funcional preservada

A reconstrução HeroUI Native v1 não substituiu nem reduziu:

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

## HeroUI Native v1

A revisão da candidata HeroUI v0.9 identificou que a apresentação ainda preservava a anatomia do design system anterior por meio de oito facades em `src/components/ui`.

O PR #39 reconstruiu a camada visual em vez de adicionar outra camada por cima dela.

### Limpeza estrutural

Foram removidos integralmente:

- `src/components/ui/avatar.tsx`;
- `src/components/ui/badge.tsx`;
- `src/components/ui/button.tsx`;
- `src/components/ui/card.tsx`;
- `src/components/ui/input.tsx`;
- `src/components/ui/separator.tsx`;
- `src/components/ui/skeleton.tsx`;
- `src/components/ui/table.tsx`.

Não existem imports residuais `@/components/ui/` na camada de apresentação.

`App`, navegação, busca, apresentação, páginas e Operação usam diretamente primitives/compound components do HeroUI v3, incluindo `Surface`, `Alert`, `Chip`, `Avatar`, `Button`, `Drawer`, `Spinner`, `Skeleton`, `ScrollShadow`, `Card.*` e `Table.*`.

### Living UI

A candidata passou a usar motion como parte nativa da experiência:

- transição de entrada entre rotas;
- stagger curto em superfícies e cards;
- navegação com estado ativo animado;
- page headers vivos;
- auroras/glows lentos em superfícies com espaço visual;
- loading com Spinner HeroUI, halo, órbita e skeletons;
- empty/planned/onboarding com atmosfera contínua;
- feedback de interação sem alterar layout;
- conteúdo denso mantido em ilhas limpas;
- `prefers-reduced-motion` remove loops espaciais e preserva a composição estática.

## Ambient Constellation final

A primitive atual usa **96 microestrelas por instância**, distribuídas em duas camadas de 48.

Características validadas:

- maior partícula medida: `1.34375px`;
- partículas limitadas em screen-space, sem blobs/círculos proporcionais à viewport;
- camadas assíncronas com ciclos aproximados de `12s` e `15s`;
- drift proporcional à superfície, em vez de amplitude fixa de ~20px em telas grandes;
- tema claro com estrelas azul/violeta derivadas dos tokens HeroUI;
- glints pontuais de baixa dominância;
- aurora global lenta no shell e deriva luminosa em living surfaces;
- reduced-motion com campo estático e loops removidos.

No login publicado existem três instâncias constelares simultâneas, por isso o smoke do domínio mede `288` partículas no DOM.

## Prova temporal real

Um falso-positivo foi encontrado no primeiro harness temporal: ele comparava strings que incluíam nomes diferentes de atributos, o que poderia indicar diferença mesmo com matrizes iguais.

O gate foi descartado e substituído por leitura real do Chrome via DevTools Protocol, usando `getAnimations()`, `animation.currentTime` e `getComputedStyle(...).transform` sobre a primitive real.

Workflow temporal corrigido: `32836354978` — **success**.

Artifact:

- id: `9558774401`;
- nome: `heroui-native-temporal-proof-32836354978`;
- SHA-256: `3c1136d945fdd0162d2db7fe078eac4f4fcebfe432383ecd0847877b23728ab3`.

Medição normal em ~3,5 s reais:

- `currentTime`: ~`150ms` → ~`3666ms`;
- `transform`: `matrix(... -31.7448, 15.5067)` → `matrix(... 13.2702, -13.2426)`;
- `playState`: `running` nos dois instantes;
- partículas: `96`;
- maior partícula: `1.34375px`.

Medição com reduced-motion:

- `animationName = none`;
- `currentTime = null`;
- matriz permaneceu estática;
- composição constelar continuou presente.

A App Factory também recebeu `ui/heroui/TEMPORAL_MOTION_QA.md` para impedir recorrência desse tipo de falso-positivo.

## Gates técnicos da branch limpa

Workflow `32836490110`:

- Validate GitHub Actions security: **success**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**.

O diff final ficou restrito à apresentação/estilos e à remoção dos facades antigos; não houve mudança em BFF, Entra, Graph, SharePoint, capabilities ou contratos funcionais.

## Integração, deploy e recovery

PR #39 foi integrado por squash.

Commit executável da candidata:

`0746241f385db158dfaaa36102d0a662e6488262`

Workflow de `main`: `32836667012`.

Resultado:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- Deploy Cloudflare Pages: **success**;
- Verify recovery after deploy: **success**;
- rebuild da fonte implantada: **success**;
- round trip descartável de backup/restore SharePoint: **success**;
- evidência redigida de recovery publicada: **success**.

O recovery permanece limitado ao escopo técnico documentado e não é apresentado como disaster recovery integral do tenant Microsoft 365.

## Smoke do domínio oficial

O smoke pós-deploy foi executado em branch descartável, sem incorporar o harness à `main`.

Run válido: `32837232635` — **success**.

Artifact:

- id: `9559084801`;
- nome: `heroui-native-domain-smoke-32837232635`;
- SHA-256: `b4c1cb2ff3d9c2ea7495f4d1da04cfceba4c68eb83ac35aab4c2656a62f2aa76`.

No domínio real foram confirmados:

- raiz = `200`;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão;
- login renderizado em Chrome real desktop e mobile;
- bloqueio anônimo preservado;
- `288` microestrelas nas três instâncias do login;
- maior partícula = `1.34375px`;
- movimento publicado executando em tempo real.

Prova temporal no domínio:

- `currentTime`: `0` → ~`3483ms`;
- `transform`: `matrix(... -31.2113, 23.5669)` → `matrix(... 9.85039, -16.9392)`;
- `playState = running`.

O branch de smoke foi realinhado novamente ao `main` após a coleta das evidências.

## Higiene

- nenhum workflow temporário de visual QA permanece na árvore efetiva da candidata;
- `src/components/ui` foi removido;
- não há imports residuais da facade anterior;
- o branch de smoke foi limpo após uso;
- o estado executável continua derivado de `main`;
- a App Factory agora contém contrato de redesign HeroUI nativo e política de integridade da prova temporal.

## Marco atual

**A candidata HeroUI Native v1 está tecnicamente implantada e validada para inspeção autenticada.**

Isso não significa publicação regular para usuários nem aprovação oficial de produção. `releaseState` continua `validation`.

A inspeção das rotas internas deve ser feita com uma sessão real de `ADMINISTRADOR`; não será criado bypass, cookie falso ou redução de segurança para automatizar esse gate.

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior à candidata exige nova validação e torna uma aprovação anterior obsoleta.

## Referências internas

- arquitetura: `ARCHITECTURE.md`;
- redesign atual: `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- histórico v0.9: `docs/REDESIGN_HEROUI_V0.9.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
