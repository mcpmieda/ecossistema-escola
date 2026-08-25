# Centro de Administração v0.9 — Direção HeroUI

## Decisão de produto

A partir desta versão, o Centro de Administração adota **HeroUI React v3 como design system principal e transversal**.

A escolha explícita de HeroUI substitui o default administrativo anterior baseado em shadcn/ui. O redesign deve parecer um produto HeroUI completo, não um sistema anterior com componentes trocados pontualmente.

## Perfil visual registrado

- Design system: `HeroUI React v3`
- Professional UI Profile: `professional-default`
- Density: `comfortable`
- Surface: `layered + immersive`
- Emphasis: `bold` em síntese/hero e `balanced` em dados densos
- Motion Profile: `expressive`
- Ambient Surface Profile: `ambient-constellation`
- Constellation Intensity: `strong`
- Dense content: clean islands; constellation remains in shell/header/perimeter
- Reduced motion: static constellation fallback

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

## Release

`releaseState` permanece `validation`. O redesign não autoriza produção oficial.
