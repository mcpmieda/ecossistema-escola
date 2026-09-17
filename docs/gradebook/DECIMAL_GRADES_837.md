# Nota decimal 0,1 — #837 / BN-DEC-032

## Decisão do responsável

Em 17/09/2026, às 13:35 UTC, o responsável determinou que **0,1 é nota numérica normal e participa de somas e médias**. Nos instrumentos granulares, **vazio observado = Não fez** e **zero numérico = Tirou zero** permanecem como na BN-DEC-031. Não confundir fonte indisponível, fórmula sem cache e campo não observado com ausência confirmada.

Esta decisão substitui a convenção de marcador 0,1 das BN-DEC-022/031 no produtor ativo. Contratos V1–V4, intérpretes legados, fixtures e documentação histórica continuam descrevendo as evidências de suas épocas; não são a regra para uma nova importação V9. Não reescrever snapshots ou relatórios emitidos.

## Implementação e limites

- `spreadsheet-recognizer.ts`: nova leitura de 0,1 é manual/positivo ou fórmula com valor 0,1; não gera `official-zero`. O tipo antigo permanece interpretável para evidência histórica.
- `canonical-import-v9.ts`: usa o escalar bruto observado, incluindo texto decimal `0,1`/`0.1`, para produzir **100 milésimos**. Um `NoteValue` antigo normalizado como zero não substitui o novo valor observado. Fórmula com cache numérico 0,1 mantém 100; fórmula sem cache/erro continua indisponível.
- O mesmo valor decimal é preservado em AM/REC/U. Os estados e a convenção separada de zero/vazio desses campos não são ampliados pela presente mudança; os rótulos Não fez/Tirou zero continuam exclusivos das notas granulares.
- `parserVersion` acrescenta `:decimal-grades-v1` ao produtor V9 observado. O formato externo V9 já representa todos os estados necessários; não há novo endpoint, campo, schema, DML direto ou dependência.
- O diagnóstico aplica a 0,1 a mesma precisão e o mesmo aviso de máximo dos outros números. Textos do importador/inspector não ensinam mais a convenção antiga.
- Núcleo, pesos 45/55, máximos 30/30/40, arredondamento, recuperação, autoridade imported-source e política de publicação são preservados. Por exemplo, `0,1 + 0,1 = 0,2` no total bruto; o arredondamento final vigente continua sendo uma operação posterior distinta.

## Dados que já foram importados

**Não existe conversão automática de zeros antigos para 0,1.** Quando a importação anterior perdeu essa diferença, só uma nova leitura das planilhas permite recuperar o valor correto. Reimportar a mesma fonte com o novo produtor compara os valores atuais, registra deltas reais e continua idempotente. Fórmula indisponível não apaga o valor já conhecido. Históricos e boletins emitidos permanecem intactos; o Portal respeita os controles existentes de atualização/publicação, sem republicação forçada nesta entrega.

Atualizar a página antes de reimportar evita executar o JavaScript da regra anterior em uma aba antiga.

## Verificações internas

Fixtures exclusivamente sintéticas cobrem número manual, texto com vírgula/ponto, cache de fórmula, zero, vazio, indisponível, precisão e máximo; soma bruta e analytics; reconhecimento → V9 → importador V11 → banco descartável → detalhe BN e projeção do Portal; reimportação a partir de valor antigo, histórico e replay idempotente. Nenhum dado real de aluno é usado.

Resultados efetivos de CI, SHA, revisão, merge e deploy são registrados na issue/PR, não inferidos da existência deste documento. Validação manual no navegador sob responsabilidade do usuário.
