# HeroUI Native v2 — hardening de interação, performance e acessibilidade

Data: 2026-08-25

## Estado final da rodada

O hardening foi **integrado tecnicamente em `main`**, implantado no domínio oficial de validação e verificado após o deploy.

Commit integrado:

`f79939c55021a021da23d55ce49d1357923f892a`

PR:

`#43 — HeroUI Native v2 — hardening de interação, performance e acessibilidade`

`releaseState` permanece `validation`.

A integração e o deploy descritos neste documento não constituem liberação oficial para usuários.

## Objetivo

Esta rodada corrigiu regressões de interação e reduziu custo visual contínuo da HeroUI Native v2 sem alterar autenticação, autorização, dados, integrações ou regras de negócio.

Escopo técnico restrito à apresentação:

- navegação desktop/mobile;
- busca desktop/mobile;
- estado dos Drawers HeroUI;
- Ambient Constellation;
- contraste;
- transições e filtros de superfície.

## Causas encontradas

### 1. ListBox usado como mecanismo de navegação em overlays

A busca e a sidebar usavam `ListBox` em contextos de `Popover`/`Drawer`. O browser QA reproduziu cliques que eram consumidos pela composição de seleção antes de a navegação terminar.

Correção:

- resultados de busca passaram a usar `Button` HeroUI real em lista semântica;
- navegação lateral passou a usar links semânticos nativos `a[href="#/..."]`;
- componentes HeroUI continuam responsáveis pelas superfícies, feedback e overlays.

### 2. Drawer com duas fontes de estado

Os Drawers combinavam estado interno do trigger HeroUI com `onPress`, `isOpen` e `onOpenChange` externos.

Correção:

- cada Drawer passou a ter uma única fonte de estado no root com `useOverlayState`;
- Backdrop e trigger deixaram de manter controle paralelo.

### 3. Busca dependia de hashchange para fechar

A rota mudava corretamente, mas o Popover podia permanecer visível durante a transição.

Correção:

- `navigateFromSearch` altera a hash e fecha a busca explicitamente na mesma interação;
- listener de rota deixa de ser o mecanismo primário para concluir a interação.

### 4. Drawer mobile fechado por hashchange durante troca de rota

O browser QA isolou uma recuperação React durante renderização concorrente, erro minificado `#520`, quando a mudança de rota e o fechamento do Drawer eram disparados por listeners globais diferentes.

Correção:

- removido o listener `hashchange` de `SidebarContent`;
- o link fecha o Drawer no próprio `onClick` enquanto o navegador executa normalmente a navegação por hash;
- repetição do diagnóstico terminou sem exceções de runtime.

## Hardening visual e de performance

- barra vertical residual do item selecionado removida;
- roxo legado removido da interface em favor da família azul/ciano;
- contraste textual recalibrado;
- partículas ambientais reduzidas para `384` simultâneas no cenário mais denso medido;
- no máximo `6` animações ambientais contínuas simultâneas no cenário medido;
- glow e glints deixaram de manter loops independentes;
- filtros contínuos nos filhos da constelação: `0`;
- `backdrop-filter` da topbar/sidebar: `none`;
- transição da navegação: `90ms`;
- reduced-motion remove todas as animações ambientais contínuas.

Os thresholds de latência desta rodada pertencem ao harness e ao ambiente dessa candidata. Não devem ser reutilizados como números universais sem baseline/SLO e protocolo reproduzível no projeto de destino.

## QA final em Chrome real

Workflow:

`32853049680` — **success**

O teste executou o bundle real da branch em Chrome headless via DevTools Protocol. Somente `/api/me` e `/api/platform/snapshot` locais receberam fixture isolada e descartável. Não houve cookie falso, bypass do domínio ou redução de segurança.

Artifact:

- id: `9565058830`;
- nome: `ui-hardening-browser-qa-v5`;
- SHA-256: `cb61407ade0d1556f419ac075aa39699d45d16477f9a0a87d9865226a5fb8aab`.

### Navegação desktop

Mediana de três cliques físicos por rota:

| Rota          | Mediana |
| ------------- | ------: |
| Operação      |  104 ms |
| Publicações   |  151 ms |
| Páginas       |  105 ms |
| Sistemas      |  110 ms |
| Auditoria     |  116 ms |
| Configurações |   63 ms |
| Visão geral   |   87 ms |

Maior mediana: `151 ms`.

### Busca desktop

- abertura: `151 ms`;
- navegação: `145 ms`;
- `Ctrl/Cmd + K`: aprovado;
- `Escape`: aprovado;
- fechamento após navegação: aprovado.

### Mobile

- sidebar invisível antes de abrir o Drawer: confirmado;
- Drawer abriu: confirmado;
- clique físico em Operação + navegação + fechamento: `217 ms`;
- Drawer fechou: confirmado;
- busca mobile até Configurações: `145 ms`.

### Performance

- máximo de partículas simultâneas: `384`;
- máximo de animações ambientais contínuas: `6`;
- máximo de nós DOM nas amostras de rota: `759`;
- long tasks observadas: `79 ms`, `56 ms`, `59 ms`;
- maior long task: `79 ms`;
- child filters da constelação: `0`;
- backdrop da topbar: `none`;
- backdrop da sidebar: `none`;
- pseudo-elemento vertical de seleção: ausente;
- heap JS usado no fim da bateria: `13,162,048` bytes.

### Acessibilidade

- contraste `#365B86` sobre azul-claro: `5.35:1`;
- contraste `#365B86` sobre azul-gelo: `6.24:1`;
- nós usando o antigo tom de baixo contraste: `0`;
- animações ambientais com `prefers-reduced-motion: reduce`: `0`.

### Runtime

- erros de browser não tratados: `[]`;
- `console.error`: `[]`;
- failures do harness: `[]`;
- status final: `PASS`.

O uso de `Runtime.exceptionThrown` via CDP foi apenas o adaptador Chromium utilizado nessa rodada. A regra reutilizável transferida para a App Factory foi generalizada para **erros de runtime/página não tratados**, com hooks equivalentes em outros browsers/harnesses.

## Diagnóstico específico do Drawer mobile

Workflow:

`32853049698` — **success**

Artifact:

- id: `9565051694`;
- nome: `mobile-overlay-runtime-diagnostic`;
- SHA-256: `234f5ccd1bc2ae330638905f3e6e96cca71a7ace74e8eae8eb59487a3e862d8c`.

Após abrir o Drawer, clicar fisicamente em Operação e aguardar a estabilização:

- hash final: `#/operacao`;
- shell da plataforma presente: `1`;
- botão de menu presente: `1`;
- botões de busca presentes: `2` no DOM responsivo;
- exceções de runtime registradas: `0`;
- eventos de console registrados: `0`.

Isso confirma a eliminação da recuperação React `#520` observada antes da correção.

## CI limpo e integração

Depois de remover os workflows temporários de QA/diagnóstico do diff final, o CI definitivo do PR passou:

`32854113320` — **success**

O PR #43 foi então integrado por squash em `main` no commit:

`f79939c55021a021da23d55ce49d1357923f892a`

## Deploy e recovery da nova main

Workflow:

`32854416111` — **success**

Jobs aprovados:

- `Validate GitHub Actions security` — actionlint + zizmor;
- `Validate application` — install, formatting, lint, typecheck, contrato semântico, testes e build;
- `Deploy production` — Cloudflare Pages;
- `Verify recovery after deploy` — rebuild do source publicado e round trip descartável de backup/restore SharePoint.

A nomenclatura do job `Deploy production` pertence ao pipeline técnico. Pelo protocolo do projeto, esse deploy continua sendo uma implantação controlada para validação até autorização humana explícita.

## Smoke externo no domínio oficial

### Primeira tentativa: falso negativo do harness

Run:

`32854876204` — failure no passo de inspeção do login em Chrome.

Antes da falha, o mesmo run já confirmou:

- bundle publicado igual ao build da `main`;
- `/api/me = 401` sem sessão;
- `/api/platform/snapshot = 401` sem sessão.

A causa do failure não estava no produto. O harness procurava `a[href*="/auth/login"]`, mas a aplicação usa `Button` HeroUI com `onPress={() => window.location.assign('/auth/login')}`. Além disso, `.platform-shell` também é usada legitimamente no login e não serve como sinal de shell autenticado.

O harness foi corrigido antes de qualquer alteração no runtime.

### Smoke definitivo

Workflow:

`32855103697` — **success**

Artifact:

- id: `9565851123`;
- nome: `heroui-native-v2-hardening-domain-smoke`;
- SHA-256: `d9d7117a488b726f1866feea9bbc0e4b0b0fdfec601a5949ff5c8d6af314df32`.

Resultados:

- JS/CSS publicados correspondem ao build do hardening em `main`;
- `/api/me = 401` sem sessão;
- `/api/platform/snapshot = 401` sem sessão;
- desktop `1440×900`: login presente, sem navegação administrativa, sem menu de perfil e sem overflow horizontal;
- mobile `390×844`: login presente, sem navegação administrativa, sem menu de perfil e sem overflow horizontal;
- `#/sistemas` sem sessão continua preso ao login;
- browser errors: `[]`.

As screenshots `desktop-login.png` e `mobile-login.png` do artifact foram inspecionadas e não mostraram regressão visual evidente.

## Regra aprendida sobre QA

O falso negativo do primeiro smoke gerou uma regra formal que agora também está na App Factory:

- o harness deve modelar o elemento real da aplicação;
- `Button` com navegação por handler não deve ser testado como se fosse necessariamente `<a>`;
- classes compartilhadas entre login e shell autenticado não servem como prova de autorização;
- overlays animados devem ser testados por hit-testing/ponteiro real, não apenas por presença no DOM;
- antes de alterar o produto por falha automatizada, diagnosticar se o próprio harness é a causa.

## App Factory — transferência das lições

PR:

`mcpmieda/app-factory#57 — HeroUI — endurecer overlays, navegação e QA de interação`

Commit integrado:

`21d12063b1064bb5f9ccefd8b0f450f318ab9af4`

O contrato novo da Factory consolidou:

- semântica de link/ação/seleção em overlays;
- uma única fonte de estado por overlay controlado;
- fechamento na mesma interação que navega;
- QA com ponteiro real + hit-testing após animações;
- erros de runtime não tratados como gate browser-neutral;
- CDP como adaptador opcional, não requisito universal;
- múltiplas amostras e mediana com thresholds derivados de SLO/baseline e protocolo reproduzível;
- diagnóstico de falso positivo do harness;
- smoke oficial sem autenticação artificial.

Os oito workflows do head final do PR #57 passaram antes do squash merge. Duas observações da revisão independente foram incorporadas antes da integração: portabilidade browser-neutral dos runtime gates e remoção de thresholds universais de performance.

## Inspeção visual das evidências finais

As capturas do QA autenticado e do smoke real foram inspecionadas:

- sem barra vertical residual;
- sem roxo legado;
- Ambient Constellation discreto, com partículas em microescala;
- hierarquia visual preservada;
- controles mobile sem sobreposição;
- login real desktop/mobile sem overflow;
- nenhuma UI administrativa protegida exposta sem sessão.

## Limites e observações

O build Vite ainda emite aviso de chunk JavaScript acima de `500 kB` minificado. Na bateria de interação montada, as medianas de rota ficaram entre `63–151 ms`, portanto o aviso não foi bloqueante nesta rodada.

Code splitting deve ser tratado como otimização de carregamento inicial em uma etapa própria, com métrica de first load antes/depois.

## Segurança e fundação preservadas

Nenhuma alteração desta rodada modifica:

- Microsoft Entra ID;
- BFF/cookie HttpOnly;
- capabilities e grants server-side;
- Graph;
- SharePoint;
- Cloudflare;
- grupos/roles;
- contratos de dados;
- recovery;
- regras institucionais.

## Gate de liberação

Todos os gates técnicos desta rodada estão concluídos.

A produção oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Sem esse comando, `https://admin.escolaieda.com` permanece como candidata publicada para validação controlada.
