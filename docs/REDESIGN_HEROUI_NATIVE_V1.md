# Centro de Administração — HeroUI Native v1

## Status

**Candidata técnica implantada para validação.**

- Design system: HeroUI React v3
- `@heroui/react`: `3.2.4`
- `@heroui/styles`: `3.2.4`
- Motion Profile: `expressive`
- Ambient Surface Profile: `ambient-constellation`
- Constellation Intensity: `strong`
- Living states: required
- Release state: `validation`
- Produção oficial: **não autorizada**

Este documento substitui `REDESIGN_HEROUI_V0.9.md` como referência visual vigente. A v0.9 permanece como histórico da primeira migração e da regressão que motivou a reconstrução nativa.

## Objetivo da reconstrução

A v0.9 adotou HeroUI, mas conservou parte relevante da anatomia anterior através de facades compatíveis com shadcn/Radix. Isso fazia a interface parecer uma adaptação do sistema anterior em vez de um produto desenhado de origem com HeroUI.

A Native v1 corrige isso com uma regra simples:

> preservar a fundação funcional; reconstruir a camada de apresentação.

Assim, autenticação, autorização, dados, contratos e infraestrutura permanecem, enquanto shell, superfícies, navegação, tabelas, cards, estados e motion são compostos diretamente com HeroUI.

## Limpeza estrutural

Foram removidos:

- `src/components/ui/avatar.tsx`;
- `src/components/ui/badge.tsx`;
- `src/components/ui/button.tsx`;
- `src/components/ui/card.tsx`;
- `src/components/ui/input.tsx`;
- `src/components/ui/separator.tsx`;
- `src/components/ui/skeleton.tsx`;
- `src/components/ui/table.tsx`.

Esses arquivos mantinham APIs do design system anterior, como `CardHeader`, `CardContent`, `Badge`, variantes legadas de `Button` e `asChild`.

A candidata final não possui imports `@/components/ui/`.

## Composição HeroUI direta

A camada de apresentação passou a usar diretamente primitives e compound components do HeroUI, entre eles:

- `Surface`;
- `Alert`;
- `Chip`;
- `Avatar`;
- `Button`;
- `Drawer`;
- `Input`;
- `Spinner`;
- `Skeleton`;
- `ScrollShadow`;
- `Card.Header`, `Card.Content`, `Card.Title`, etc.;
- `Table.ScrollContainer`, `Table.Content`, `Table.Header`, `Table.Column`, `Table.Body`, `Table.Row`, `Table.Cell`.

Componentes locais permanecem apenas quando representam um padrão real do produto, como `AmbientConstellation`.

## Shell e login

O shell deixou de reproduzir o layout anterior com componentes apenas remapeados.

A Native v1 usa:

- superfície global HeroUI;
- sidebar com hierarquia e active state próprios;
- barra superior translúcida;
- atmosfera constelar no perímetro;
- transição de conteúdo por rota;
- desktop e mobile tratados como composições próprias.

O login combina:

- superfície institucional imersiva;
- painel de autenticação HeroUI;
- constelação visível;
- glows e profundidade;
- composição mobile simplificada sem perder identidade.

## Living UI

A solicitação de páginas vivas elevou o perfil para `expressive`.

### Navegação

- entrada de rota com fade + deslocamento curto;
- indicador ativo vivo na sidebar;
- microinterações em itens de navegação;
- drawers e busca usando comportamento HeroUI.

### Superfícies estáticas

- page headers com atmosfera;
- aurora lenta no shell;
- deriva luminosa em living surfaces;
- constelação no perímetro e zonas de respiro;
- conteúdo principal permanece estável e legível.

### Loading

- `Spinner` HeroUI;
- halo e órbita;
- constelação visível;
- skeletons com stagger;
- mensagem estável de progresso.

### Empty / planned

- composição central viva;
- halo/órbita lenta;
- constelação perceptível;
- entrada em camadas;
- sem loops agressivos.

### Reduced motion

Quando `prefers-reduced-motion: reduce` está ativo:

- loops espaciais são removidos;
- animações ambientais ficam estáticas;
- identidade visual permanece;
- nenhum feedback funcional depende de motion.

## Ambient Constellation

### Estrutura

Cada primitive possui:

- 48 microestrelas na camada A;
- 48 microestrelas na camada B;
- total de 96 partículas;
- tamanho máximo gerado ≤ `1.35px`;
- ciclos próximos de `12s` e `15s`;
- drift em direções opostas/defasadas;
- movimento realizado no grupo, não em centenas de nós individuais.

### Escala

A v0.9 corrigiu o problema de círculos grandes, mas ainda usava amplitude fixa pequena demais para shells amplos.

Na Native v1:

- tamanho da partícula permanece em screen-space;
- amplitude do **grupo** é proporcional à superfície;
- shell grande recebe deslocamento perceptível sem aumentar estrelas;
- tema claro usa azul/violeta para evitar microestrelas brancas invisíveis sobre superfícies claras.

### Profundidade adicional

A primitive recebeu uma camada CSS complementar com:

- glints pontuais;
- aurora global lenta;
- deriva luminosa em living surfaces;
- reduced-motion completo.

## QA temporal correto

A primeira tentativa de QA temporal continha um falso-positivo possível porque comparava strings completas de atributos com nomes diferentes.

Essa evidência foi rejeitada.

A prova válida usa Chrome DevTools Protocol e mede, na mesma primitive:

- `animation.currentTime`;
- `getComputedStyle(...).transform`;
- `playState`;
- contagem de partículas;
- tamanho visual máximo.

Run `32836354978`: **success**.

### Movimento normal

Em ~3,5 s reais:

- relógio: ~`150ms` → ~`3666ms`;
- transform: `matrix(... -31.7448, 15.5067)` → `matrix(... 13.2702, -13.2426)`;
- play state: `running`;
- partículas: `96`;
- max particle: `1.34375px`.

### Reduced motion

- `animationName = none`;
- `currentTime = null`;
- matriz estática;
- composição preservada.

## QA visual

Chrome real foi usado para inspecionar:

- login desktop;
- login mobile;
- overview desktop;
- overview mobile;
- Sistemas;
- página planejada;
- loading;
- reduced-motion.

Critérios observados:

- ausência de aparência de facade shadcn;
- constelação perceptível em grandes superfícies;
- partículas microscópicas, sem blobs;
- motion presente sem competir com leitura;
- estados estáticos com sensação de continuidade;
- layout mobile estável;
- superfícies densas limpas.

## Gates técnicos

Branch limpa — workflow `32836490110`:

- actionlint: pass;
- zizmor: pass;
- format: pass;
- lint: pass;
- typecheck: pass;
- semantic contract: pass;
- testes: pass;
- build: pass.

PR #39 foi integrado por squash no commit:

`0746241f385db158dfaaa36102d0a662e6488262`

## Deploy e recovery

Workflow de `main`: `32836667012`.

- Validate application: success;
- Validate GitHub Actions security: success;
- Deploy Cloudflare Pages: success;
- Verify recovery after deploy: success;
- rebuild da fonte implantada: success;
- round trip descartável SharePoint: success.

O termo `Deploy production` é o nome técnico do job do ambiente Cloudflare; não representa a aprovação oficial definida pelo protocolo do produto.

## Smoke do domínio oficial

Run `32837232635`: **success**.

Artifact `9559084801` — SHA-256:

`b4c1cb2ff3d9c2ea7495f4d1da04cfceba4c68eb83ac35aab4c2656a62f2aa76`

Confirmado em `https://admin.escolaieda.com`:

- raiz `200`;
- `/api/me` `401` sem sessão;
- `/api/platform/snapshot` `401` sem sessão;
- login desktop/mobile renderizado;
- bloqueio anônimo preservado;
- 288 partículas nas três primitives do login;
- maior partícula `1.34375px`;
- animação real em execução.

Prova de motion publicada em ~3,5 s:

- `currentTime`: `0` → ~`3483ms`;
- transform: `matrix(... -31.2113, 23.5669)` → `matrix(... 9.85039, -16.9392)`;
- play state: `running`.

## Fundação preservada

Nenhuma reconstrução foi feita em:

- BFF;
- sessão;
- Entra ID;
- Graph;
- SharePoint;
- capabilities;
- grupos;
- contratos funcionais;
- recovery;
- CI/CD permanente;
- domínio e infraestrutura Cloudflare.

## Governança da App Factory

A App Factory foi atualizada para registrar duas regras permanentes:

1. redesign explícito HeroUI deve reconstruir a árvore de apresentação, e não manter facades do design system anterior;
2. motion considerado requisito deve ser provado por valores temporais reais, não apenas pela presença de CSS ou por comparação de strings inadequadas.

Referências:

- `ui/heroui/HEROUI_NATIVE_REDESIGN_CONTRACT.md`;
- `ui/heroui/TEMPORAL_MOTION_QA.md`;
- `ui/MOTION_POLICY.md`;
- `ui/AMBIENT_CONSTELLATION_PROFILE.md`.

## Gate restante

A candidata está tecnicamente pronta para inspeção autenticada.

Permanece obrigatório usar sessão real de `ADMINISTRADOR` para avaliar as rotas internas no domínio publicado. Nenhum bypass será criado para automatizar isso.

`releaseState` permanece `validation`.

A produção oficial somente pode ser autorizada pelo comando humano exato:

`APROVADO PARA PRODUÇÃO`
