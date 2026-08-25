# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração permanece em **validação controlada** no domínio:

`https://admin.escolaieda.com`

- fonte técnica executável atual em `main`: HeroUI Native v2 com hardening de interação, performance e acessibilidade;
- commit integrado do hardening: `f79939c55021a021da23d55ce49d1357923f892a`;
- PR integrado: `#43 — HeroUI Native v2 — hardening de interação, performance e acessibilidade`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- release state: `validation`;
- produção oficial: **não autorizada**.

Implantação no domínio oficial continua sendo ambiente de validação e não equivale à liberação oficial para usuários.

## Escopo funcional desta fase

O escopo técnico definido para a fase permanece fechado. Continuam deliberadamente adiados e fora do cálculo:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Não foi criado comportamento artificial para fontes de dados ou regras institucionais ainda inexistentes.

## Fundação preservada

A Native v2 e seu hardening ficaram restritos à camada de apresentação. Permanecem intactos:

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

## HeroUI Native v2

A Native v1 removeu facades/dependências shadcn/Radix. A Native v2 reconstruiu anatomias da interface diretamente com HeroUI v3, incluindo Breadcrumbs, SearchField, Kbd, Popover, Dropdown, Table, ProgressBar, Drawer, ScrollShadow, Surface, Alert e Chip.

A auditoria posterior encontrou regressões de interação e custo visual que não exigiam retorno às anatomias antigas. O PR #43 corrigiu essas regressões sem reconstruir a infraestrutura nem alterar a camada funcional.

### Decisões consolidadas no hardening

- navegação lateral usa links semânticos nativos para mudança de rota;
- busca usa Buttons HeroUI em lista semântica para executar ações;
- `ListBox` deixa de ser usado como mecanismo de navegação dentro de Popover/Drawer;
- cada Drawer possui uma única fonte de estado com `useOverlayState` no root;
- busca fecha explicitamente na mesma interação que altera a rota;
- Drawer mobile fecha no clique do link, sem listener global de `hashchange` concorrendo com a atualização da rota;
- barra vertical residual de seleção removida;
- roxo legado removido em favor da família azul/ciano;
- contraste recalibrado;
- filtros e animações ambientais contínuas reduzidos.

## Ambient Constellation após hardening

A implementação preserva a referência proporcional HeroUI sem copiar assets oficiais.

No cenário mais denso medido pelo QA final:

- `384` partículas simultâneas;
- máximo de `6` animações ambientais contínuas;
- filtros contínuos nos filhos da constelação: `0`;
- `prefers-reduced-motion` reduz animações ambientais contínuas a `0`;
- partículas permanecem em microescala;
- glow e glints não mantêm loops independentes.

## QA funcional final antes do merge

Workflow `32853049680` — **success**.

Artifact:

- id: `9565058830`;
- nome: `ui-hardening-browser-qa-v5`;
- SHA-256: `cb61407ade0d1556f419ac075aa39699d45d16477f9a0a87d9865226a5fb8aab`.

Resultados principais em Chrome real com clique físico:

- maior mediana entre as sete rotas desktop: `151 ms`;
- busca desktop: `151 ms` para abrir e `145 ms` para navegar;
- `Ctrl/Cmd + K`: aprovado;
- `Escape`: aprovado;
- navegação mobile + fechamento do Drawer: `217 ms`;
- busca mobile: `145 ms`;
- maior long task observada: `79 ms`;
- máximo de nós DOM nas amostras de rota: `759`;
- contraste medido: `5.35:1` e `6.24:1`;
- erros de browser: `0`;
- failures: `0`.

A fixture intercepta somente `/api/me` e `/api/platform/snapshot` locais. Nenhum cookie falso, bypass do domínio ou redução de segurança é utilizado.

## Diagnóstico do Drawer mobile

Antes da correção final, o QA isolou uma recuperação React `#520` durante renderização concorrente ao fechar o Drawer pelo listener `hashchange` enquanto a rota também era atualizada.

Após mover o fechamento para o próprio clique do link, o diagnóstico foi repetido:

- workflow `32853049698`: **success**;
- artifact `9565051694`;
- SHA-256 `234f5ccd1bc2ae330638905f3e6e96cca71a7ace74e8eae8eb59487a3e862d8c`;
- exceções de runtime: `0`;
- eventos de console: `0`;
- shell permaneceu montado e a rota final foi `#/operacao`.

## Integração, deploy e recovery

O PR #43 foi integrado por squash em `main` no commit:

`f79939c55021a021da23d55ce49d1357923f892a`

Workflow de `main` `32854416111` — **success** em todos os jobs:

- `Validate GitHub Actions security` — actionlint e zizmor verdes;
- `Validate application` — install, formatting, lint, typecheck, contrato semântico, testes e build verdes;
- `Deploy production` — deploy Cloudflare Pages concluído;
- `Verify recovery after deploy` — rebuild do source publicado e round trip descartável de backup/restore SharePoint concluídos.

Esse deploy é implantação controlada para validação, não autorização oficial de produção.

## Smoke externo do domínio publicado

Workflow definitivo `32855103697` — **success**.

Artifact:

- id: `9565851123`;
- nome: `heroui-native-v2-hardening-domain-smoke`;
- SHA-256: `d9d7117a488b726f1866feea9bbc0e4b0b0fdfec601a5949ff5c8d6af314df32`.

O smoke confirmou no domínio real:

- JS e CSS publicados correspondem exatamente ao build da `main` do hardening;
- `/api/me` retorna `401` sem sessão;
- `/api/platform/snapshot` retorna `401` sem sessão;
- login desktop `1440×900` renderiza a ação institucional sem overflow;
- login mobile `390×844` renderiza sem overflow;
- `#/sistemas` continua exibindo login sem sessão e não expõe navegação administrativa nem menu de perfil;
- erros de browser: `0`.

A primeira tentativa de smoke (`32854876204`) falhou apenas por um seletor incorreto do harness, que procurava `<a href="/auth/login">` embora o produto use `Button` HeroUI com `onPress`. O harness foi corrigido para modelar a aplicação real antes de qualquer mudança no produto. O run definitivo acima passou sem alteração de runtime.

## Evidência visual

As capturas finais foram inspecionadas:

- QA autenticado isolado: sem barra vertical residual, sem roxo e com Ambient Constellation discreto;
- domínio real desktop: login íntegro, partículas em microescala e sem UI protegida;
- domínio real mobile: layout proporcional, sem overflow e sem exposição de shell administrativo.

## Build e otimização futura

O Vite ainda alerta para chunk JavaScript acima de `500 kB` minificado. A bateria de interação montada não mostrou lentidão sustentada: medianas de rota ficaram entre `63–151 ms`.

Code splitting permanece uma otimização futura de carregamento inicial e deve ser decidido com métricas específicas de first load, não apenas pelo warning do bundler.

## App Factory

As lições reutilizáveis do hardening já foram incorporadas à App Factory no PR `#57 — HeroUI — endurecer overlays, navegação e QA de interação`, integrado em `main` no commit:

`21d12063b1064bb5f9ccefd8b0f450f318ab9af4`

O contrato novo cobre:

- semântica correta de link, ação e seleção dentro de overlays;
- uma única fonte de estado para overlay controlado;
- fechamento do overlay na mesma interação que navega;
- QA com ponteiro real e hit-testing após animação;
- erros de runtime não tratados como gate browser-neutral, usando CDP apenas como adaptador quando aplicável;
- múltiplas amostras/mediana com thresholds derivados do SLO/baseline e de protocolo reproduzível, não números universais;
- diagnóstico de falha do harness antes de alterar o produto;
- smoke no domínio oficial sem autenticação artificial.

Todos os oito workflows do head final do PR #57 passaram antes do squash merge.

## Próximo gate

Os gates técnicos desta rodada foram concluídos. O estado permanece deliberadamente:

`releaseState = validation`

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Sem esse comando, o domínio oficial continua sendo apenas a candidata publicada para validação controlada. Qualquer alteração material posterior exige nova validação proporcional ao risco.

## Referências internas

- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`;
- histórico Native v1: `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- histórico v0.9: `docs/REDESIGN_HEROUI_V0.9.md`;
- arquitetura: `ARCHITECTURE.md`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
