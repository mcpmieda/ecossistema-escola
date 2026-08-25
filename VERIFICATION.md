# VERIFICATION — Centro de Administração HeroUI Native v1

## Resultado da fase

**100% do escopo técnico definido para esta fase foi concluído e revalidado após a reconstrução HeroUI Native v1.**

A candidata continua com `releaseState = validation`. Este fechamento técnico não autoriza produção oficial.

Itens explicitamente adiados e fora do cálculo desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

## Candidata e domínio

Commit executável da candidata HeroUI Native v1:

`0746241f385db158dfaaa36102d0a662e6488262`

Domínio de validação:

`https://admin.escolaieda.com`

Design system validado:

- HeroUI React v3;
- `@heroui/react 3.2.4`;
- `@heroui/styles 3.2.4`;
- Motion Profile: `expressive`;
- Ambient Surface Profile: `ambient-constellation`;
- Constellation Intensity: `strong`;
- Living states: ativos;
- partículas em microescala de screen-space;
- `prefers-reduced-motion` com fallback estático.

## Reconstrução nativa

A revisão da v0.9 encontrou uma camada de compatibilidade que preservava APIs e anatomia shadcn/Radix em cima do HeroUI.

PR #39 eliminou essa camada e reconstruiu a apresentação diretamente com HeroUI v3.

Verificações de limpeza:

- diretório `src/components/ui` removido;
- oito facades antigos removidos;
- zero imports `@/components/ui/` na apresentação;
- `Card.*` e `Table.*` compound usados diretamente;
- `Surface`, `Alert`, `Chip`, `Avatar`, `Button`, `Drawer`, `Spinner`, `Skeleton` e `ScrollShadow` usados diretamente quando aplicáveis;
- nenhuma mudança material em BFF, Entra, Graph, SharePoint, capabilities ou contratos funcionais.

## Living UI

Foram validados:

- entrada de rotas com fade/deslocamento curto;
- stagger de superfícies;
- navegação ativa animada;
- page headers vivos;
- aurora e glows lentos no shell e superfícies adequadas;
- loading com Spinner, halo/órbita e skeletons;
- estados empty/planned com atmosfera contínua;
- conteúdo denso isolado em superfícies limpas;
- reduced-motion removendo loops espaciais.

## Ambient Constellation

Implementação final por primitive:

- camada A: `48` microestrelas;
- camada B: `48` microestrelas;
- total: `96`;
- maior dimensão medida: `1.34375px`;
- ciclos aproximados de `12s` e `15s`;
- drift relativo/proporcional à superfície;
- estrelas azul/violeta no tema claro derivadas do tema;
- glints pontuais sem flashing;
- aurora global e deriva luminosa lenta separadas do conteúdo denso.

No login publicado há três instâncias simultâneas, totalizando `288` partículas renderizadas.

## Prova temporal — integridade corrigida

O primeiro harness de comparação temporal foi rejeitado após a identificação de um falso-positivo possível: ele comparava strings completas de atributos cujos próprios nomes eram diferentes.

A evidência válida usa Chrome DevTools Protocol e mede a primitive real em dois instantes separados por ~3,5 s reais.

Run: `32836354978` — **success**.

Artifact:

- id: `9558774401`;
- nome: `heroui-native-temporal-proof-32836354978`;
- SHA-256: `3c1136d945fdd0162d2db7fe078eac4f4fcebfe432383ecd0847877b23728ab3`.

### Movimento normal

Primeira leitura:

- `currentTime ≈ 150.061ms`;
- `transform = matrix(1, 0, 0, 1, -31.7448, 15.5067)`;
- `playState = running`.

Segunda leitura:

- `currentTime ≈ 3666.423ms`;
- `transform = matrix(1, 0, 0, 1, 13.2702, -13.2426)`;
- `playState = running`.

A diferença comprova execução natural do loop, não apenas presença de CSS.

### Reduced motion

- `animationName = none`;
- `currentTime = null`;
- matriz computada permaneceu estática;
- partículas continuaram presentes;
- maior partícula permaneceu `1.34375px`.

A App Factory recebeu `ui/heroui/TEMPORAL_MOTION_QA.md` para tornar essa integridade de evidência reutilizável.

## CI da branch limpa

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

## Integração, CI, deploy e recovery

PR #39 foi integrado por squash no commit executável:

`0746241f385db158dfaaa36102d0a662e6488262`

Workflow de `main`: `32836667012`.

Resultado:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**;
- Deploy Cloudflare Pages: **success**;
- Verify recovery after deploy: **success**;
- rebuild da fonte implantada: **success**;
- backup/restore descartável SharePoint: **success**;
- publicação de evidência redigida: **success**.

O recovery continua limitado ao round trip técnico documentado da área SharePoint e não declara disaster recovery integral do Microsoft 365.

## QA visual da candidata

Foram capturadas em Chrome real, usando os próprios componentes da candidata:

- login desktop;
- login mobile;
- overview desktop;
- overview mobile;
- Sistemas;
- página planejada;
- loading;
- reduced-motion.

A inspeção confirmou:

- linguagem visual distinta da v0.9 adaptada;
- ausência dos facades antigos;
- microestrelas visíveis sem virar círculos grandes;
- maior presença no tema claro;
- living surfaces perceptíveis;
- loading/empty/planned não permanecendo visualmente mortos;
- mobile com atmosfera controlada;
- conteúdo denso dominante e legível.

Os harnesses usados para QA foram removidos antes da integração da candidata.

## Smoke externo da versão implantada

O smoke foi executado em branch descartável e depois o branch foi realinhado ao `main`.

Run válido: `32837232635` — **success**.

Artifact:

- id: `9559084801`;
- nome: `heroui-native-domain-smoke-32837232635`;
- SHA-256: `b4c1cb2ff3d9c2ea7495f4d1da04cfceba4c68eb83ac35aab4c2656a62f2aa76`.

### HTTP

- raiz: `200`;
- `/api/me`: `401` sem sessão;
- `/api/platform/snapshot`: `401` sem sessão.

### Chrome no domínio oficial

Confirmados:

- login institucional renderizado;
- desktop e mobile capturados;
- bloqueio anônimo preservado;
- `288` partículas nas três primitives do login;
- maior partícula: `1.34375px`;
- motion realmente executando no bundle publicado.

Prova temporal do domínio:

Primeira leitura:

- `currentTime = 0`;
- `transform = matrix(1, 0, 0, 1, -31.2113, 23.5669)`;
- `playState = running`.

Segunda leitura:

- `currentTime ≈ 3483.181ms`;
- `transform = matrix(1, 0, 0, 1, 9.85039, -16.9392)`;
- `playState = running`.

Portanto, o movimento medido na fixture também está presente na versão efetivamente publicada para validação.

## Autorização e fronteiras

A fase mantém:

- Entra ID como identidade institucional;
- groups/roles como entrada de identidade;
- capabilities como autorização efetiva do Centro;
- grants administrativos fail closed;
- recorte server-side do snapshot;
- endpoints administrativos negados anonimamente;
- módulos integrados disponíveis apenas com contrato compatível e capabilities suficientes;
- nenhuma sessão falsa ou bypass introduzidos para QA.

## Higiene final

- nenhum workflow temporário de browser/temporal QA permanece na árvore da candidata;
- branch de smoke realinhado ao `main` após uso;
- `src/components/ui` removido;
- imports legados removidos;
- `main` continua fonte técnica de verdade;
- documentação v0.9 permanece somente como histórico.

## Fundação preservada

Permanecem intactos:

- Microsoft Entra ID;
- BFF e sessão;
- grupos e roles institucionais;
- automação cargo → grupos;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática de identidade técnica;
- contratos modulares e semânticos;
- `releaseState = validation`.

## Gate humano e aprovação

Não existe trabalho de desenvolvimento obrigatório pendente dentro do escopo técnico desta candidata.

Permanece deliberadamente humano:

- inspeção autenticada das telas internas usando sessão real de `ADMINISTRADOR`;
- decisão de aceitação da experiência apresentada.

Não será criado bypass, cookie falso ou redução de segurança para automatizar esse gate.

A produção oficial permanece bloqueada até o comando exato:

`APROVADO PARA PRODUÇÃO`

Uma mudança material após este fechamento exige nova rodada de validação e torna qualquer aprovação anterior obsoleta.
