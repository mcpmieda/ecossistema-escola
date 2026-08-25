# Centro de Administração v0.9 — HeroUI

## Decisão de produto

A partir desta versão, o Centro de Administração adota **HeroUI React v3 como design system principal e transversal**.

A escolha explícita de HeroUI substitui o default administrativo anterior baseado em shadcn/ui. O redesign deve parecer um produto HeroUI completo, não um sistema anterior com componentes trocados pontualmente.

## Perfil visual registrado

- Design system: `HeroUI React v3`
- Versão validada nesta candidata: `@heroui/react 3.2.4` + `@heroui/styles 3.2.4`
- Professional UI Profile: `professional-default`
- Density: `comfortable`
- Surface: `layered + immersive`
- Emphasis: `bold` em síntese/hero e `balanced` em dados densos
- Motion Profile: `expressive`
- Ambient Surface Profile: `ambient-constellation`
- Constellation Intensity: `strong`
- Dense content: clean islands; constellation remains in shell/header/perimeter
- Reduced motion: static constellation fallback

## Implementação concluída na candidata

Candidata técnica:

`test/heroui-v0.9@3988533c07e485063ad32c22e21a25d664db2a22`

Alterações consolidadas:

- HeroUI v3 instalado e lockfile regenerado;
- camada shadcn/Radix removida das dependências da aplicação;
- `components.json` e `Sheet` legado removidos;
- shell administrativo reconstruído com a linguagem HeroUI;
- login redesenhado como superfície HeroUI imersiva;
- navegação móvel e busca móvel migradas para `Drawer` HeroUI;
- cards, botões, chips, avatar, inputs, separator e skeleton migrados para HeroUI;
- tabelas mantêm HTML semântico e adotam a anatomia/classes oficiais HeroUI para conteúdo denso;
- primitive local `ambient-constellation` criada com duas camadas, glow difuso e drift assíncrono;
- constelação aplicada no shell, login, overview, erro/restrição e superfícies planejadas;
- `prefers-reduced-motion` congela a constelação em composição estática;
- `prefers-reduced-transparency` remove blur/transparência quando solicitado;
- tokens antigos `primary/content/muted-foreground/destructive` substituídos pela semântica HeroUI v3 (`accent`, `surface`, `muted`, `danger`);
- BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais preservados.

## Evidência técnica

Workflow da candidata: `32826309667`.

Gates concluídos com sucesso:

- Validate GitHub Actions security: **success**;
- actionlint: **pass**;
- zizmor: **pass**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**.

O diff `main...test/heroui-v0.9` permanece limitado a dependências e camada visual. Nenhum arquivo de infraestrutura, autenticação, autorização, BFF, SharePoint, Graph, recovery ou contrato compartilhado foi alterado.

## Regras do redesign

1. HeroUI deve dominar shell, cards, botões, chips, avatar, drawer, inputs, skeleton/loading, tabelas e superfícies.
2. Não misturar shadcn/ReUI para estética ou conveniência.
3. Remover a camada shadcn anterior quando a migração estiver comprovada e sem consumidores.
4. Preservar integralmente BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais.
5. Nenhum efeito visual pode ampliar privilégios, alterar regras institucionais ou criar escrita nova.
6. `ambient-constellation` deve ser visível no shell, login, cabeçalhos, overview, espera/vazio/erro e painéis especiais.
7. Tabelas e leitura densa ficam em ilhas limpas, com a assinatura constelar mantida no perímetro/cabeçalho.
8. Transições de rota, hover/press, loading e mudanças de estado devem comunicar continuidade e resposta.
9. Paralaxe deve ser leve e contextual, nunca requisito para compreender ou operar a interface.
10. `prefers-reduced-motion` deve desligar drift/parallax e preservar composição estática.
11. Não usar flashing/strobe; não animar blur continuamente; priorizar `transform` e `opacity`.
12. O redesign só fecha após browser QA real em desktop/mobile, teclado/foco, reduced motion, console e smoke externo do domínio.

## Referências da App Factory aplicadas

- `ui/UI_POLICY.md`
- `ui/PROFESSIONAL_UI_PROFILE.md`
- `ui/MOTION_POLICY.md`
- `ui/AMBIENT_CONSTELLATION_PROFILE.md`
- `ui/heroui/README.md`
- `skills/ui-builder/SKILL.md`

## Escopo preservado

Continuam adiados e fora do bloqueio desta fase:

- integração funcional do primeiro sistema independente;
- construção de Publicações;
- construção de Páginas.

O redesign alcança essas rotas apenas como superfícies planejadas/estados estáticos coerentes com a nova linguagem visual.

## Gate restante para produção oficial

A implementação e os gates técnicos da branch estão concluídos. Ainda faltam os gates que exigem a candidata servida e uma sessão real:

- browser QA no domínio de validação em desktop e mobile;
- inspeção autenticada do shell e das rotas internas;
- teclado/foco em navegação, busca e drawers;
- reduced motion com a composição constelar estática;
- console sem erros relevantes;
- smoke externo após deploy da candidata;
- decisão humana sobre a experiência apresentada.

`releaseState` permanece `validation`.

A produção oficial continua condicionada ao protocolo do repositório e ao comando humano exato:

`APROVADO PARA PRODUÇÃO`
