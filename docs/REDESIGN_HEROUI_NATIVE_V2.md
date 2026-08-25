# REDESIGN_HEROUI_NATIVE_V2 — Centro de Administração

## Objetivo

HeroUI Native v2 fecha a segunda etapa de reconstrução visual do Centro de Administração.

A Native v1 eliminou facades e dependências visuais herdadas de shadcn/Radix. A Native v2 elimina o que ainda restava em nível de **anatomia de interface**: estruturas manuais que continuavam reproduzindo padrões do layout anterior mesmo sem dependências antigas.

O objetivo não foi alterar produto, autenticação, dados ou integrações. Foi reconstruir a apresentação diretamente com a anatomia HeroUI v3 e tornar o perfil Living/Ambient perceptível e verificável.

## Candidata

- PR: `#41 — HeroUI Native v2 — shell e páginas 100% nativos`;
- commit final da branch limpa: `c6bd78076c6cbf6605578dbcf96517b8b62e77af`;
- commit promovido para `main`: `d852007ea12ee9a0c55328103e39bc67e888009a`;
- domínio: `https://admin.escolaieda.com`;
- `releaseState`: `validation`.

A promoção para `main` constitui implantação para validação e **não** autorização de produção oficial.

## Escopo de reconstrução

### Shell

- breadcrumb manual substituído por `Breadcrumbs` HeroUI;
- navegação lateral reconstruída com `ListBox`, `ScrollShadow`, `Surface`, `Alert` e `Chip`;
- perfil/logout concentrados em `Avatar` + `Dropdown`;
- mobile preserva `Drawer` HeroUI;
- topbar e superfícies usam semântica HeroUI em vez de reproduzir a árvore anterior.

### Busca

A busca passou de composição manual para:

- `SearchField`;
- `Kbd`;
- `Popover`;
- `ListBox`.

O atalho Ctrl/Cmd+K, filtragem e comportamento funcional foram preservados.

### Conteúdo

- coleções de módulos → `ListBox`;
- sinais operacionais → `Table` compound;
- cobertura de health check → `ProgressBar`;
- migrações → `Table` compound;
- demais tabelas continuam usando a composição HeroUI;
- estados planejados, vazios e loading mantêm Living UI sem transformar conteúdo denso em decoração contínua.

## Limpeza comprovada

O gate final exige e confirmou:

- ausência de `src/components/ui`;
- ausência de imports `@/components/ui/`;
- ausência de `@radix-ui/`;
- ausência da classe `nav-link-living`;
- ausência de `<kbd>` manual;
- uso direto de primitives/compound components HeroUI.

O diff funcional do PR #41 ficou restrito a 9 arquivos de apresentação/estilo:

- `src/App.tsx`;
- `src/components/ambient-constellation.css`;
- `src/components/ambient-constellation.tsx`;
- `src/platform/navigation.tsx`;
- `src/platform/operations-page.tsx`;
- `src/platform/pages.tsx`;
- `src/platform/presentation.tsx`;
- `src/platform/search.tsx`;
- `src/styles.css`.

Nenhum arquivo de `functions`, `infra` ou `shared` foi alterado.

## Ambient Constellation

### Referência

A recalibração usa como referência o código público atual do modal HeroUI Pro.

Características observadas e reaplicadas por proporção:

- base `#E9E9FF → #CCE5F1`;
- glow `#5DD0E7 → #7300FF`;
- duas camadas de estrelas;
- ciclos de aproximadamente `12s` e `15s`;
- movimento em direções opostas;
- partículas muito pequenas;
- campo com overscan e recorte;
- movimento perceptível sem aumentar o tamanho das partículas.

A implementação local gera suas próprias partículas. O SVG oficial não é copiado.

### Implementação v2

Cada primitive gera:

- `192` microestrelas;
- tamanhos limitados a aproximadamente `0.5–1.45px`;
- glints raros;
- dois planos de deriva;
- glow separado da camada de partículas.

O aumento de presença foi feito por densidade, contraste e amplitude proporcional — não por círculos maiores.

### Reduced motion

Com `prefers-reduced-motion: reduce`:

- loops espaciais são removidos;
- `animationName = none` na prova de navegador;
- transform permanece estático;
- a composição continua legível.

## Living UI

Perfil final:

```text
Motion Profile: expressive
Ambient Surface Profile: ambient-constellation
Constellation Intensity: strong
Living states: required
```

Aplicado em:

- entrada de rotas;
- navegação ativa;
- drawers/overlays;
- headers;
- loading;
- empty/planned states;
- superfícies com espaço visual;
- feedback de interação.

Texto, tabelas e regiões densas não recebem animação contínua.

## Evidências técnicas

### CI final da candidata

Workflow `32843050061` — success.

Passaram:

- actionlint;
- zizmor `pedantic`;
- npm ci;
- Prettier;
- ESLint;
- TypeScript;
- contrato semântico;
- testes;
- build Vite.

### QA visual/temporal isolado

Workflow `32842682376` — success.

O teste executou o próprio App da branch em Chrome com fixture descartável somente nos endpoints locais. Não houve bypass do domínio.

Cobertura:

- Operação desktop/mobile;
- Visão geral;
- página planejada;
- login desktop/mobile;
- Dropdown de perfil realmente aberto;
- componentes nativos no DOM;
- prova temporal da constelação;
- reduced-motion.

Na rota Operação:

- `576` partículas simultâneas;
- maior partícula `1.375px`;
- zero classe de navegação antiga.

Artifact:

- `9561122170`;
- SHA-256 `11bcd69212921edcd5c65b22921747aa3946c47252cba9bf4f103ecfc9aeab6d`.

### Main, deploy e recovery

Workflow `32843374875` — success.

Passaram:

- CI de aplicação;
- segurança de workflows;
- deploy Cloudflare Pages;
- rebuild pós-deploy;
- backup/restore descartável SharePoint;
- evidência redigida de recovery.

### Smoke do domínio publicado

Workflow `32843679300` — success.

Sem autenticação artificial, foram confirmados:

- `/` = `200`;
- `/api/me` = `401`;
- `/api/platform/snapshot` = `401`;
- login desktop/mobile em Chrome real;
- sem overflow horizontal no mobile;
- densidade publicada acima do gate mínimo de `384` partículas;
- nenhuma partícula acima de `1.5px`;
- movimento real em dois instantes separados por ~3.5 s;
- `playState = running`;
- reduced-motion estático.

Artifact:

- `9561473735`;
- SHA-256 `f8bd31d68d8d3ac73ac681250318d062f37f67bb54a21dcddd5c8f1afee6527c`.

## Fundação preservada

A v2 não altera:

- Entra ID;
- sessão/BFF;
- capabilities;
- roles/grupos;
- Graph;
- SharePoint;
- automações institucionais;
- Cloudflare;
- contratos semânticos e modulares;
- regras de negócio.

## App Factory

A revisão gerou novo endurecimento no contrato HeroUI da App Factory.

PR `#56` foi integrado no commit:

`c03960e694f46c4fb1bfb2a604c232c6e2817358`

A Factory passa a tratar como falha de redesign nativo não apenas dependências/facades antigos, mas também anatomias manuais equivalentes quando existe componente HeroUI adequado.

## Estado final

HeroUI Native v2 está:

- implementado;
- tecnicamente validado;
- implantado no domínio de validação;
- com recovery técnico revalidado;
- com smoke da versão publicada concluído;
- pronto para inspeção autenticada humana.

Produção oficial continua bloqueada.

O comando necessário para iniciar a liberação oficial permanece exatamente:

`APROVADO PARA PRODUÇÃO`
