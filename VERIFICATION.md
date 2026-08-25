# VERIFICATION — Centro de Administração HeroUI Native v2

## Estado da verificação

O hardening HeroUI Native v2 foi integrado em `main`, implantado no domínio oficial de validação e verificado após o deploy.

`releaseState = validation`.

Produção oficial não está autorizada.

## Integração técnica

PR:

`#43 — HeroUI Native v2 — hardening de interação, performance e acessibilidade`

Commit integrado em `main`:

`f79939c55021a021da23d55ce49d1357923f892a`

Domínio de validação:

`https://admin.escolaieda.com`

## Fundação preservada

O hardening permaneceu concentrado em apresentação e estilo. Não houve mudança intencional em:

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
- listener global de `hashchange` foi removido de `SidebarContent` como caminho primário de fechamento.

### Busca

- resultados usam `Button` HeroUI real em lista semântica;
- clique desktop navega e fecha o Popover;
- clique mobile navega e fecha o Drawer;
- `Ctrl/Cmd + K` abre a busca desktop;
- `Escape` fecha a busca;
- fechamento explícito ocorre na mesma interação de navegação.

### Overlays

- Drawers usam uma única fonte de estado com `useOverlayState` no root;
- não há combinação concorrente de trigger interno + `onPress` + `isOpen/onOpenChange` para o mesmo overlay;
- diagnóstico final não registra recuperação React `#520` nem console error.

## QA final em Chrome real antes do merge

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

Maior mediana observada: `151 ms`.

O threshold usado nesta rodada pertence ao harness e ao ambiente dessa candidata; não deve ser tratado como número universal para outros produtos/runners.

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

Todos os gates definidos pelo harness da candidata passaram.

O Vite ainda emite warning de chunk JS acima de `500 kB` minificado. Esse warning não bloqueou a rodada porque as interações medidas passaram com margem. Code splitting deve ser avaliado separadamente com métrica de carregamento inicial.

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

## CI limpo, merge, deploy e recovery

O diff final do PR #43 não manteve os workflows temporários de QA.

CI limpo do PR: `32854113320` — **success**.

O PR foi integrado por squash em `main` no commit `f79939c55021a021da23d55ce49d1357923f892a`.

Workflow da nova `main`:

`32854416111` — **success**

Jobs concluídos com sucesso:

- `Validate GitHub Actions security` — actionlint + zizmor;
- `Validate application` — formatting, lint, typecheck, contrato semântico, testes e build;
- `Deploy production` — Cloudflare Pages;
- `Verify recovery after deploy` — rebuild do source publicado + round trip descartável de backup/restore SharePoint.

## Smoke anônimo do domínio publicado

Workflow definitivo:

`32855103697` — **success**

Artifact:

- id: `9565851123`;
- nome: `heroui-native-v2-hardening-domain-smoke`;
- SHA-256: `d9d7117a488b726f1866feea9bbc0e4b0b0fdfec601a5949ff5c8d6af314df32`.

Resultados:

- bundle JS publicado = bundle JS do build da `main`;
- bundle CSS publicado = bundle CSS do build da `main`;
- `/api/me` sem sessão: HTTP `401`;
- `/api/platform/snapshot` sem sessão: HTTP `401`;
- desktop `1440×900`: login presente, UI administrativa ausente, sem overflow horizontal;
- mobile `390×844`: login presente, UI administrativa ausente, sem overflow horizontal;
- `#/sistemas` sem sessão: continua no login, sem `.platform-nav` e sem menu de perfil;
- browser errors: `[]`.

### Falso negativo do primeiro smoke

O run `32854876204` falhou porque o harness procurava `a[href*="/auth/login"]`. A aplicação real usa `Button` HeroUI com `onPress={() => window.location.assign('/auth/login')}` e a classe `.platform-shell` também é legítima no login.

O diagnóstico confirmou que o bundle publicado e os `401` já estavam corretos. O harness foi então corrigido para verificar a ação real `Entrar com conta institucional` e usar `.platform-nav`/menu de perfil como sinais de UI administrativa protegida. O run definitivo `32855103697` passou sem qualquer alteração de runtime.

Isso fica registrado como regra de evidência: antes de alterar o produto por falha automatizada, confirmar que o harness modela a anatomia real da interface.

## Inspeção visual final

Capturas verificadas manualmente:

### QA autenticado isolado

- item ativo sem barra vertical;
- paleta azul/ciano, sem roxo legado;
- Ambient Constellation discreto;
- hierarquia e conteúdo preservados;
- mobile sem sobreposição.

### Domínio real anônimo

- desktop: login íntegro e proporcional;
- mobile: login íntegro, sem overflow;
- partículas permanecem em microescala;
- nenhuma UI administrativa protegida aparece sem sessão.

## App Factory

As lições reutilizáveis foram transferidas para `mcpmieda/app-factory` no PR `#57 — HeroUI — endurecer overlays, navegação e QA de interação`, integrado no commit:

`21d12063b1064bb5f9ccefd8b0f450f318ab9af4`

O contrato da Factory agora exige, quando aplicável:

- semântica correta de link/ação/seleção;
- fonte única de estado por overlay;
- fechamento na mesma interação que navega;
- ponteiro real + hit-testing para overlays animados;
- gate browser-neutral para erros de runtime não tratados, usando CDP apenas como adaptador;
- medição de performance por múltiplas amostras e mediana, com thresholds derivados do SLO/baseline e protocolo reproduzível;
- diagnóstico do harness antes de mudar o produto;
- smoke oficial sem autenticação artificial.

Os oito workflows do head final do PR #57 passaram antes do merge.

## Gate humano e aprovação

Todos os gates técnicos desta rodada estão concluídos. Ainda assim, a produção oficial permanece bloqueada.

A autorização de produção exige o comando humano exato:

`APROVADO PARA PRODUÇÃO`

Deploy de validação, merge técnico ou smoke não substituem esse comando.

## Evidência detalhada

Ver:

`docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`
