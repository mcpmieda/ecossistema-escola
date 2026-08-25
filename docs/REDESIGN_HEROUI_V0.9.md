# Centro de Administração v0.9 — HeroUI

## Decisão de produto

A partir desta versão, o Centro de Administração adota **HeroUI React v3 como design system principal e transversal**.

A escolha explícita de HeroUI substitui o default administrativo anterior baseado em shadcn/ui. O redesign deve parecer um produto HeroUI completo, não um sistema anterior com componentes trocados pontualmente.

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

## Implementação HeroUI v0.9

A migração transversal foi implantada em `main` por meio do PR #35, commit:

`ff4dba8b22e3c4ef8f42d8968872ee0d98d3ba65`

Workflow de implantação: `32826760272`.

Nesse run ficaram verdes:

- Validate GitHub Actions security;
- Validate application;
- deploy Cloudflare Pages;
- recovery pós-deploy.

A aplicação preservou BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais.

## Correção proporcional do Ambient Constellation

### Problema encontrado na inspeção visual

A primeira primitive usava SVG `viewBox="0 0 100 100"` preenchendo superfícies grandes, com círculos de raio entre aproximadamente `0.8` e `1.8` unidades. Como a geometria preenchida escalava com a superfície, os pontos se transformavam visualmente em círculos grandes e claramente perceptíveis.

O problema era de **escala**, não de intensidade ou velocidade.

### Referência oficial auditada

Foi auditada a implementação pública atual do banner/modal HeroUI Pro no repositório oficial `heroui-inc/heroui`.

Parâmetros usados como referência proporcional:

- card: `288px` de largura;
- área visual: `180px` de altura;
- `FloatingStars`: aproximadamente `760.706 × 637.702px`;
- campo centralizado em `scale-50` antes do recorte;
- overscan efetivo aproximado: `1.32×` largura e `1.77×` altura;
- partículas majoritariamente minúsculas e de baixa opacidade;
- duas camadas assíncronas;
- drift A: `12s`;
- drift B: `15s`;
- deslocamento percebido próximo de `20px` após a escala.

Nenhum SVG, asset ou template proprietário foi copiado para o Centro. A primitive continua própria.

### Implementação corrigida

Branch de calibração:

`test/heroui-v0.9-constellation-scale`

A correção substituiu o SVG proporcional à viewport por grupos de micro-partículas com tamanho final controlado em CSS pixels:

- 28 partículas na camada A;
- 28 partículas na camada B;
- tamanhos entre `0.6px` e `1.3px` no desktop;
- redução adicional no mobile;
- opacidades variadas, com predominância de baixa intensidade;
- overscan aproximado de `1.36×` em largura e `1.78×` em altura;
- drift `12s` e `15s` em sentidos opostos;
- amplitude visual `20px` desktop e `12px` mobile;
- somente os grupos são animados;
- glow permanece estático;
- shell claro usa leve tonalização dos micro-pontos para que a assinatura não desapareça sobre o fundo claro;
- `prefers-reduced-motion` congela o campo em composição estática.

## QA visual da calibração

Workflow temporário de inspeção: `32828658258`.

Resultado: **success**.

Artifact de evidência:

- id: `9555899769`;
- nome: `visual-qa-constellation-32828658258`;
- SHA-256: `1ed2260d306b141d903c707809f24d60b1e4031b14cc35923ec847f532afee66`.

Chrome real capturou:

- login desktop `1440×900`;
- login mobile `390×844`;
- overview desktop com fixture administrativa isolada;
- overview mobile;
- overview desktop com `prefers-reduced-motion`.

O DOM renderizado também foi verificado para confirmar:

- pelo menos 56 partículas por primitive analisada;
- maior dimensão de partícula `≤ 1.3px` no desktop;
- nenhum retorno ao modelo proporcional à viewport.

A inspeção das capturas confirmou:

- nenhum círculo grande/bolha decorativa permanece;
- os pontos do painel visual do login leem como microestrelas/poeira luminosa;
- o shell mantém assinatura discreta sem competir com conteúdo;
- tabelas/cards e áreas densas permanecem limpos;
- o mobile não amplia as partículas;
- reduced motion mantém a composição e remove o drift.

## Revalidação técnica da correção

Workflow da branch após a calibração: `32828659178`.

Gates concluídos com sucesso:

- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**.

O workflow temporário de QA visual deve ser removido antes do merge para não permanecer como código operacional sem função contínua.

## Regras do redesign

1. HeroUI deve dominar shell, cards, botões, chips, avatar, drawer, inputs, skeleton/loading, tabelas e superfícies.
2. Não misturar shadcn/ReUI para estética ou conveniência.
3. Preservar integralmente BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais.
4. Nenhum efeito visual pode ampliar privilégios, alterar regras institucionais ou criar escrita nova.
5. `ambient-constellation` deve ser visível no shell, login, cabeçalhos, overview, espera/vazio/erro e painéis especiais.
6. Intensidade `strong` vem de densidade, área, profundidade e glow — nunca de círculos grandes.
7. Partículas devem permanecer em microescala controlada em screen-space.
8. Tabelas e leitura densa ficam em ilhas limpas, com a assinatura constelar no perímetro/cabeçalho.
9. `prefers-reduced-motion` deve desligar drift/parallax e preservar composição estática.
10. Não usar flashing/strobe; não animar blur continuamente; priorizar `transform` e `opacity`.
11. Browser QA real continua obrigatório em alterações visuais materiais.

## Referências da App Factory aplicadas

- `ui/UI_POLICY.md`
- `ui/PROFESSIONAL_UI_PROFILE.md`
- `ui/MOTION_POLICY.md`
- `ui/AMBIENT_CONSTELLATION_PROFILE.md`
- `ui/heroui/README.md`
- `skills/ui-builder/SKILL.md`

A App Factory foi atualizada pelo PR #54 para registrar a calibração proporcional e impedir a recorrência do erro de escala.

## Escopo preservado

Continuam adiados e fora do bloqueio desta fase:

- integração funcional do primeiro sistema independente;
- construção de Publicações;
- construção de Páginas.

## Gate restante para produção oficial

A candidata continua com `releaseState = validation`.

Após o merge da correção e o deploy da mesma `main`, ainda devem ser confirmados no domínio oficial:

- smoke externo;
- login desktop/mobile servido pelo domínio;
- proteção anônima de `/api/me` e `/api/platform/snapshot`;
- inspeção autenticada do responsável;
- decisão humana sobre a experiência apresentada.

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`
