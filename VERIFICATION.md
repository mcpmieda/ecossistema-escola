# VERIFICATION — Centro de Administração HeroUI Native v2

## Estado da verificação

A baseline HeroUI Native v2 permanece publicada em validação controlada. O PR #43 adiciona hardening de interação, performance e acessibilidade e foi validado em Chrome real antes da integração em `main`.

`releaseState = validation`.

Produção oficial não está autorizada.

## Candidata de hardening

PR:

`#43 — HeroUI Native v2 — hardening de interação, performance e acessibilidade`

Baseline de `main` antes do merge do hardening:

`d852007ea12ee9a0c55328103e39bc67e888009a`

Commit funcional que eliminou a última exceção do Drawer mobile:

`8c790be33614d297cd557aa5aaccd36d334b4003`

Domínio de validação:

`https://admin.escolaieda.com`

## Fundação preservada

O diff do hardening permanece concentrado em apresentação e estilo. Não há mudança intencional em:

- Entra ID;
- sessão/BFF;
- capabilities e grants server-side;
- grupos/roles;
- Graph;
- SharePoint;
- Cloudflare;
- recovery;
- contratos de dados;
- regras de negócio.

## Correções funcionais verificadas

### Navegação

- sidebar usa links semânticos `a[href="#/..."]`;
- não existe reload completo para mudar área da plataforma;
- seleção usa background/foreground, sem barra vertical residual;
- Drawer mobile fecha no próprio clique do link;
- listener global de `hashchange` foi removido de `SidebarContent`.

### Busca

- resultados usam `Button` HeroUI real em lista semântica;
- clique desktop navega e fecha o Popover;
- clique mobile navega e fecha o Drawer;
- `Ctrl/Cmd + K` abre a busca desktop;
- `Escape` fecha a busca;
- fechamento explícito ocorre na mesma interação de navegação.

### Overlays

- Drawers usam uma única fonte de estado com `useOverlayState` no root;
- não há combinação de trigger interno + `onPress` + `isOpen/onOpenChange` concorrentes;
- diagnóstico final não registra recuperação React `#520` nem console error.

## QA final em Chrome real

Workflow:

`32853049680` — **success**

Artifact:

- id: `9565058830`;
- nome: `ui-hardening-browser-qa-v5`;
- SHA-256: `cb61407ade0d1556f419ac075aa39699d45d16477f9a0a87d9865226a5fb8aab`.

O teste usa o bundle real da branch e clique físico via Chrome DevTools Protocol. Somente `/api/me` e `/api/platform/snapshot` locais recebem fixture descartável. Não existe autenticação artificial no domínio publicado.

### Rotas desktop

Medianas de três ciclos:

- Operação: `104 ms`;
- Publicações: `151 ms`;
- Páginas: `105 ms`;
- Sistemas: `110 ms`;
- Auditoria: `116 ms`;
- Configurações: `63 ms`;
- Visão geral: `87 ms`.

Maior mediana: `151 ms`.

Gate: `≤ 350 ms` — **pass**.

### Busca desktop

- abertura: `151 ms`;
- navegação: `145 ms`;
- Ctrl/Cmd+K: **pass**;
- Escape: **pass**;
- fechamento após navegação: **pass**.

### Mobile

- navegação oculta antes do Drawer: **pass**;
- Drawer abriu: **pass**;
- clique físico em Operação + mudança de rota + fechamento: `217 ms`;
- Drawer fechou: **pass**;
- busca mobile até Configurações: `145 ms`.

Gate de interação mobile: `≤ 500 ms` — **pass**.

## Performance

Medido durante a bateria final:

- partículas ambientais simultâneas: máximo `384`;
- animações ambientais contínuas: máximo `6`;
- nós DOM nas amostras de rota: máximo `759`;
- long tasks: `79 ms`, `56 ms`, `59 ms`;
- maior long task: `79 ms`;
- filtros nos filhos da constelação: `0`;
- backdrop-filter da topbar: `none`;
- backdrop-filter da sidebar: `none`;
- transição da navegação: `90 ms`;
- heap JS final: `13,162,048` bytes.

Todos os gates definidos pelo harness final passaram.

O Vite ainda emite warning de chunk JS acima de `500 kB` minificado. Esse warning não bloqueia a rodada porque as interações montadas passaram com margem. Code splitting deve ser avaliado separadamente com métrica de carregamento inicial.

## Acessibilidade

- contraste `#365B86` sobre azul-claro: `5.35:1`;
- contraste `#365B86` sobre azul-gelo: `6.24:1`;
- antigo tom de baixo contraste detectado no DOM: `0` nós;
- animações ambientais com reduced-motion: `0`.

Gate WCAG AA para texto normal: **pass** nos pares medidos.

## Runtime e concorrência

O diagnóstico anterior reproduziu React minificado `#520` durante fechamento do Drawer por `hashchange` concorrente com atualização da rota.

Após a correção, workflow:

`32853049698` — **success**

Artifact:

- id: `9565051694`;
- nome: `mobile-overlay-runtime-diagnostic`;
- SHA-256: `234f5ccd1bc2ae330638905f3e6e96cca71a7ace74e8eae8eb59487a3e862d8c`.

Resultado final após abrir Drawer → clicar Operação → estabilizar:

- rota `#/operacao`;
- shell presente;
- eventos de runtime: `[]`;
- eventos de console: `[]`.

## Inspeção visual final

Capturas verificadas manualmente no artifact `9565058830`:

### Desktop

- item ativo sem barra vertical;
- paleta azul/ciano, sem roxo legado;
- Ambient Constellation discreto;
- hierarquia e conteúdo preservados.

### Mobile

- cabeçalho e controles sem sobreposição;
- Configurações legível;
- tabelas mantêm rolagem interna quando necessária;
- nenhum defeito visual evidente decorrente do hardening.

## Higiene antes do merge

Os workflows temporários usados para QA/diagnóstico devem estar ausentes do diff final do PR. O CI definitivo precisa ser executado novamente após documentação e limpeza.

O merge técnico só é aceitável se:

- application validation estiver verde;
- actionlint estiver verde;
- zizmor estiver verde;
- não houver review thread bloqueante;
- PR estiver mergeável.

Após merge, a nova `main` ainda precisa de deploy/recovery e smoke anônimo do domínio publicado.

## Gate humano e aprovação

Mesmo com os gates técnicos aprovados, a produção oficial permanece bloqueada.

A autorização de produção exige o comando humano exato:

`APROVADO PARA PRODUÇÃO`

Deploy de validação, merge técnico ou smoke não substituem esse comando.

## Evidência detalhada

Ver:

`docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`
