# Auditoria relacional atual V2 — #658

## Escopo e base factual

A #658/PR #659 parte de `main@3d762d7412fe0a5760680566ae6739f4d10c1172`, depois da integração e publicação de Relatórios V2 pela #656/PR #657 no deploy 264 (`34577894561`). A branch é `feat/bn-current-audit-v2-658`.

O objetivo é retirar do caminho ativo a composição híbrida que misturava os diagnósticos relacionais atuais com o Audit Workspace V1. O V1 apresentava entidades e estados da geração anterior e oferecia correção determinística, embora a decisão vigente da #613 determine que a Auditoria apenas detecta, explica e sugere, sem corrigir automaticamente.

## Fonte e semântica

A superfície ativa consulta apenas `GET /api/gradebook/import-diagnostics` para o ano fixo 2026. A fonte é `gradebook.importacao_diagnostico`, já mantida como fotografia corrente por arquivo/ano: uma nova observação confirmada substitui o conjunto anterior, inclusive por um conjunto vazio, na mesma transação. Portanto:

- a lista representa achados atuais, não um histórico de tratamento;
- corrigir a planilha e reimportar faz o achado sair da fotografia corrente;
- nenhuma ação da tela altera planilha, nota, cadastro, decisão ou diagnóstico;
- nenhum botão de reconhecer, resolver, descartar ou corrigir é exposto;
- a orientação apresentada é sugestão humana e não comando de escrita.

A decisão mais recente da #613 também exige não apagar automaticamente uma futura trilha mínima de ações humanas quando o problema corrente desaparecer. Essa durabilidade ainda não possui contrato nem relações próprias. A #658 não inventa esse histórico e não altera schema; sua contratação e eventual DDL permanecem uma entrega separada e explícita.

## Interface e isolamento

`GradebookAuditSurface` monta somente `RelationalCurrentAuditPageV2`. A página usa componentes HeroUI, cabeçalho compacto, estado fixo de 2026, KPIs identificados como contagens carregadas na sessão, filtros estáveis por gravidade, paginação limitada e uma timeline dos achados. Os detalhes técnicos ficam recolhidos e o texto principal usa linguagem escolar.

Na entrega original #658, `AuditWorkspacePage`, `ImportDiagnosticsAuditPanelV1` e `/api/gradebook/audit-workspace` permaneceram apenas para investigação de dependências. A #664 comprovou que esses entrypoints não possuíam consumidor ativo e os retirou. O núcleo Audit Workspace V1, seu contrato e source D1 continuam preservados porque Relatórios V1 ainda os usa internamente; eles não são fallback da superfície atual. Detalhes em [retirada seletiva #664](LEGACY_AUDIT_RETIREMENT_664.md).

## Limites e gates

A #658 não modifica contrato compartilhado, endpoint, schema, dados, importação, regras acadêmicas, autoridade oficial, binding ou segredo. A consulta exige a autorização existente, usa `no-store`, descarta requests obsoletos e falha fechada. Testes usam somente massas sintéticas/de teste.

Integração e publicação exigem testes direcionados, `npm run verify`, CI do head final, revisão do diff, merge/deploy conforme BN-DEC-023 e smoke autenticado somente leitura. A validação visual única de FINAL-1/2/3 permanece separada e será anunciada previamente ao responsável.
