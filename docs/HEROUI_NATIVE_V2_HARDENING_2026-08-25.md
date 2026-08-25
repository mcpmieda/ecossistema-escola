# HeroUI Native v2 — hardening de interação, performance e acessibilidade

Data: 2026-08-25

## Objetivo

Esta rodada corrige regressões de interação e reduz custo visual contínuo da candidata HeroUI Native v2 sem alterar autenticação, autorização, dados, integrações ou regras de negócio.

Escopo técnico restrito à apresentação:

- navegação desktop/mobile;
- busca desktop/mobile;
- estado dos Drawers HeroUI;
- Ambient Constellation;
- contraste;
- transições e filtros de superfície.

`releaseState` permanece `validation`.

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
- `hashchange` permanece apenas como proteção secundária.

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
- partículas ambientais reduzidas para o gate atual de `384` simultâneas no cenário mais denso testado;
- no máximo `6` animações ambientais contínuas simultâneas no cenário medido;
- glow e glints deixaram de manter loops independentes;
- filtros contínuos nos filhos da constelação: `0`;
- `backdrop-filter` da topbar/sidebar: `none`;
- transição da navegação: `90ms`;
- reduced-motion remove todas as animações ambientais contínuas.

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

| Rota | Mediana |
| --- | ---: |
| Operação | 104 ms |
| Publicações | 151 ms |
| Páginas | 105 ms |
| Sistemas | 110 ms |
| Auditoria | 116 ms |
| Configurações | 63 ms |
| Visão geral | 87 ms |

Maior mediana: `151 ms`, abaixo do gate de `350 ms`.

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

- `browserErrors`: `[]`;
- `failures`: `[]`;
- status final: `PASS`.

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

## Inspeção visual das evidências finais

As capturas do artifact final foram inspecionadas:

- `desktop-overview.png`: sem barra vertical residual, sem roxo, partículas discretas, hierarquia visual preservada;
- `mobile-configuracoes.png`: controles sem sobreposição, cabeçalho e conteúdo legíveis, sem regressão visível de layout.

## Limites e observações

O build Vite ainda emite aviso de chunk JavaScript acima de `500 kB` minificado. Na bateria de interação já montada, as medianas de rota ficaram entre `63–151 ms`, portanto o aviso não representa um bloqueio desta rodada. Code splitting deve ser tratado como otimização de carregamento inicial em uma etapa própria, com métrica de first load antes/depois.

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

A integração técnica deste hardening em `main` pode ser usada para validação controlada no domínio oficial. Isso não equivale a liberação oficial.

A produção oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`
