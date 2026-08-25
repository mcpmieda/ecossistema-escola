# Centro de Administração v0.9 — HeroUI

## Decisão de produto

O Centro de Administração adota **HeroUI React v3 como design system principal e transversal**.

A escolha explícita de HeroUI substitui o baseline visual administrativo anterior baseado em shadcn/ui. BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais permanecem preservados.

## Perfil visual registrado

- Design system: `HeroUI React v3`
- Versão validada: `@heroui/react 3.2.4` + `@heroui/styles 3.2.4`
- Professional UI Profile: `professional-default`
- Density: `comfortable`
- Surface: `layered + immersive`
- Emphasis: `bold` em síntese/hero e `balanced` em dados densos
- Motion Profile: `expressive`
- Ambient Surface Profile: `ambient-constellation`
- Constellation Intensity: `strong`
- Particle scale: `micro, screen-space bounded`
- Dense content: clean islands; constellation remains in shell/header/perimeter
- Reduced motion: static constellation fallback

## Migração HeroUI v0.9

PR #35 implantou a migração visual transversal.

Commit inicial da candidata HeroUI em `main`:

`ff4dba8b22e3c4ef8f42d8968872ee0d98d3ba65`

Workflow `32826760272`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**.

A migração incluiu shell, login, cards, botões, chips, avatar, drawer, inputs, skeleton/loading, tabelas e superfícies HeroUI, mantendo contratos funcionais e infraestrutura existentes.

## Correção proporcional do Ambient Constellation

### Problema identificado

A primeira primitive usava SVG `viewBox="0 0 100 100"` preenchendo superfícies grandes, com círculos cujo raio escalava junto com a área. Em viewport real, isso produzia círculos/bolhas claramente visíveis.

A causa era de **escala geométrica**, não de intensidade ou velocidade.

### Referência oficial auditada

A implementação pública atual do banner/modal HeroUI Pro foi usada como referência proporcional de comportamento, sem copiar SVG ou assets proprietários.

Baseline observado:

- área visual compacta com campo de estrelas muito maior que o recorte;
- campo reduzido antes do clipping;
- overscan aproximado da ordem de `1.3×` largura e `1.7×` altura;
- partículas minúsculas e de baixa dominância;
- duas camadas assíncronas;
- ciclos aproximados de `12s` e `15s`;
- drift visual pequeno em relação à superfície.

### Implementação corrigida

PR #36 incorporou a calibração final.

Candidata final:

`main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`

A primitive final usa:

- 28 partículas na camada A;
- 28 partículas na camada B;
- tamanhos entre aproximadamente `0.6px` e `1.3px` no desktop;
- redução adicional no mobile;
- opacidades variadas e baixa dominância;
- overscan aproximado `1.36× × 1.78×`;
- drift `12s` e `15s` em direções opostas;
- amplitude aproximada `20px` desktop e `12px` mobile;
- animação somente dos grupos;
- glow estático;
- tonalização discreta no shell claro;
- `prefers-reduced-motion` com campo estático.

## App Factory atualizada

PR #54 da App Factory consolidou a calibração como regra reutilizável.

A política agora determina:

- microestrelas em screen-space;
- `strong` por densidade, glow, área e profundidade — não por tamanho;
- limites de partícula em pixels visuais;
- overscan/crop proporcional;
- drift lento e assíncrono;
- proibição explícita do anti-padrão `viewBox 100×100` com raios proporcionais em grandes superfícies;
- QA visual real obrigatório para mudanças materiais desse efeito.

## QA visual da build calibrada

Workflow temporário: `32828658258` — **success**.

Artifact:

- id: `9555899769`;
- SHA-256: `1ed2260d306b141d903c707809f24d60b1e4031b14cc35923ec847f532afee66`.

Chrome real capturou:

- login desktop `1440×900`;
- login mobile `390×844`;
- overview desktop com fixture administrativa isolada;
- overview mobile;
- overview desktop com `prefers-reduced-motion`.

O DOM renderizado confirmou maior dimensão de partícula `≤ 1.3px` no desktop.

A inspeção visual confirmou:

- eliminação dos círculos grandes;
- leitura como microestrelas/poeira luminosa;
- conteúdo permanecendo como foco principal;
- áreas densas limpas;
- ausência de ampliação de partículas no mobile;
- identidade constelar preservada em reduced-motion sem drift.

O harness foi removido antes do merge.

## Revalidação técnica e implantação final

Workflow definitivo: `32829296147` sobre `main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`.

Resultado:

- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**.

Artifact de recovery:

- `9556184489`;
- SHA-256 `d11dc3f9b82d1598251a942065458ff22b176a0b2e96a1c6129d9bb8a8cf10a7`.

## Smoke no domínio oficial

PR descartável #37 foi usado exclusivamente como harness e fechado **sem merge**.

Run `32829585427`: **success**.

Artifact:

- `9556213823`;
- SHA-256 `61b3161328b95407a2a677a7d31ef34ff5ba748e5378d021d1b66f92efcca221`.

No domínio `https://admin.escolaieda.com` foram confirmados:

- raiz servida;
- candidata atual servida pelo Cloudflare Pages;
- `/api/me` = `401` anonimamente;
- `/api/platform/snapshot` = `401` anonimamente;
- login desktop e mobile em Chrome real;
- CTA institucional para `/auth/login`;
- rota `/#/sistemas` protegida sem sessão;
- ausência do retorno dos círculos grandes na versão efetivamente publicada para validação.

## Regras vigentes do redesign

1. HeroUI domina a linguagem visual do Centro.
2. Não misturar shadcn/ReUI por variedade estética.
3. Preservar BFF, Entra, sessão, capabilities, Graph, SharePoint, recovery e contratos.
4. `ambient-constellation` permanece assinatura visual recorrente.
5. `strong` significa densidade, área, profundidade e glow, nunca partículas grandes.
6. Partículas permanecem em microescala controlada em screen-space.
7. Dados densos ficam em ilhas limpas; constelação permanece no shell/perímetro.
8. `prefers-reduced-motion` remove drift e preserva composição estática.
9. Zero strobe/flashing; blur grande permanece estático.
10. Browser QA real é obrigatório para alterações visuais materiais.

## Escopo preservado

Continuam adiados e fora do bloqueio desta fase:

- integração funcional do primeiro sistema independente;
- construção de Publicações;
- construção de Páginas.

## Gate restante para produção oficial

Todos os gates técnicos da v0.9 foram concluídos, inclusive deploy, recovery e smoke externo da versão calibrada.

Permanece deliberadamente humano:

- inspeção autenticada das rotas internas usando sessão real de `ADMINISTRADOR`;
- decisão de aceitação da experiência apresentada.

Não será criado bypass, cookie falso ou redução de segurança para automatizar esse gate.

`releaseState` permanece `validation`.

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`
