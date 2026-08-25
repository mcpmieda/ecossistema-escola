# Centro de Administração v0.9 — HeroUI

> **ARQUIVO HISTÓRICO — SUPERADO PELA HEROUI NATIVE V1**
>
> A referência visual vigente é `docs/REDESIGN_HEROUI_NATIVE_V1.md`.

## Finalidade deste arquivo

Este documento preserva o marco histórico da primeira migração transversal do Centro para HeroUI React v3. Ele **não descreve mais a implementação visual atual** e não deve ser usado como baseline para novos trabalhos.

A v0.9 foi importante por:

- substituir o baseline shadcn como intenção de design system;
- introduzir HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- introduzir `ambient-constellation`;
- eliminar a regressão inicial de partículas que escalavam para círculos grandes;
- preservar BFF, Entra, Graph, SharePoint, capabilities e contratos funcionais durante a migração.

## Por que foi superada

A revisão posterior identificou que a v0.9 ainda mantinha oito facades em `src/components/ui` que traduziam APIs antigas para HeroUI, preservando anatomia shadcn/Radix como:

- `CardHeader` / `CardContent`;
- `Badge`;
- variantes legadas de `Button`;
- `asChild`;
- tabela compatível com a API antiga.

Também foi identificado que o movimento do Ambient Constellation, embora tecnicamente presente, podia ficar pouco perceptível em superfícies grandes quando a amplitude era tratada como valor fixo pequeno.

Esses pontos motivaram a reconstrução **HeroUI Native v1**, que:

- removeu integralmente `src/components/ui`;
- passou a usar primitives e compound components HeroUI diretamente;
- elevou o Motion Profile para `expressive`;
- implementou Living UI em shell, rotas, loading, empty/planned e superfícies estáticas;
- passou a usar drift proporcional do campo constelar;
- introduziu prova temporal real via Chrome DevTools Protocol.

## Evidências históricas v0.9

Primeira migração HeroUI:

- PR #35;
- commit `ff4dba8b22e3c4ef8f42d8968872ee0d98d3ba65`;
- workflow `32826760272` — CI, deploy e recovery: success.

Correção de microescala:

- PR #36;
- candidata histórica `dd665205d0bbc37bcfbc6f423de02ec5e0e03527`;
- workflow `32829296147` — CI, deploy e recovery: success;
- smoke histórico `32829585427` — success.

Essas evidências continuam válidas como histórico, mas não representam a candidata atual.

## Referência atual

Usar obrigatoriamente:

- `docs/REDESIGN_HEROUI_NATIVE_V1.md`;
- `PROJECT_STATE.md`;
- `VERIFICATION.md`.

`releaseState` continua `validation` e a produção oficial permanece condicionada à frase humana exata:

`APROVADO PARA PRODUÇÃO`
