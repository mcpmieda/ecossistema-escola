# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração permanece em **validação controlada** no domínio:

`https://admin.escolaieda.com`

- fonte técnica executável atual em `main`: HeroUI Native v2;
- baseline publicada antes do hardening atual: `d852007ea12ee9a0c55328103e39bc67e888009a`;
- candidata de hardening: PR `#43 — HeroUI Native v2 — hardening de interação, performance e acessibilidade`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- release state: `validation`;
- produção oficial: **não autorizada**.

Implantação no domínio oficial continua sendo ambiente de validação e não equivale à liberação oficial para usuários.

## Escopo funcional desta fase

O escopo técnico definido para a fase atual permanece fechado. Continuam deliberadamente adiados e fora do cálculo:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Não foi criado comportamento artificial para fontes de dados ou regras institucionais ainda inexistentes.

## Fundação preservada

A Native v2 e o hardening do PR #43 continuam restritos à camada de apresentação. Permanecem intactos:

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

A auditoria posterior encontrou regressões de interação e custo visual que não exigiam retorno às anatomias antigas. O PR #43 endurece essa implementação.

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

## QA final do PR #43

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

## Evidência visual

As capturas finais do artifact `9565058830` foram inspecionadas:

- desktop: sem barra vertical residual, sem roxo e com Ambient Constellation discreto;
- mobile: controles sem sobreposição e conteúdo legível em Configurações.

## Build e otimização futura

O Vite ainda alerta para chunk JavaScript acima de `500 kB` minificado. A bateria de interação montada não mostrou lentidão sustentada: medianas de rota ficaram entre `63–151 ms`.

Code splitting permanece uma otimização futura de carregamento inicial e deve ser decidido com métricas específicas de first load, não apenas pelo warning do bundler.

## App Factory

A App Factory já contém os gates da HeroUI Native v2. As novas lições do PR #43 devem ser incorporadas após a integração técnica desta candidata, especialmente:

- não usar componente de seleção como substituto automático de navegação em overlays;
- uma única fonte de estado para Drawer/Popover controlado;
- fechamento de overlay na mesma interação de navegação quando possível;
- QA de ponteiro real, runtime exceptions e mediana de múltiplas amostras.

## Próximos gates

1. concluir CI limpo do PR #43 sem workflows temporários;
2. revisar mergeabilidade e threads;
3. integrar tecnicamente em `main` se não houver bloqueios;
4. validar deploy/recovery da nova `main`;
5. executar smoke real anônimo no domínio publicado;
6. manter `releaseState = validation` até decisão humana.

A liberação oficial permanece condicionada ao comando exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior exige nova validação.

## Referências internas

- redesign Native v2: `docs/REDESIGN_HEROUI_NATIVE_V2.md`;
- hardening Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`;
- histórico Native v1: `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- histórico v0.9: `docs/REDESIGN_HEROUI_V0.9.md`;
- arquitetura: `ARCHITECTURE.md`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
