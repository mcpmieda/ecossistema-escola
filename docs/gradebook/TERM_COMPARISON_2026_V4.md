# Comparação descritiva de trimestres em 2026 — #649 / PR #650

## Decisão e limite

O Banco de Notas opera somente no ano letivo 2026 nesta etapa. Não existe criação, seleção, preferência nem comparação entre anos letivos no produto ativo. As colunas `ano`/`ano_letivo` continuam no schema como chaves de integridade e isolamento; esta entrega não executa DDL/DML de produção nem reinterpreta histórico.

A comparação V4 é exclusivamente descritiva e dentro de 2026. O usuário escolhe explicitamente T1 como referência para T2, ou T1/T2 como referência para T3. T1 e Visão geral não oferecem comparação. Avaliações por slot não são comparadas, porque instrumentos de trimestres diferentes não recebem equivalência inventada.

## Regra de comparação

Para o mesmo aluno, turma, componente, lente, modo e recorte de situações, Resultado, Quantitativo ou Qualitativo compara:

`percentual = valor / máximo oficial positivo × 100`

O resultado é `higher | equal | lower`, definido por comparação racional exata (`valor atual × máximo de referência` contra `valor de referência × máximo atual`). A diferença exibida é o percentual atual menos o percentual de referência, em pontos percentuais. Igualdade produz exatamente zero. Zero acadêmico é comparável; percentuais acima de 100% são preservados.

Somente duas leituras completas, aplicáveis e com máximo oficial positivo são comparáveis. Situação excluída do recorte analítico, parcial, não registrada, N/C, recuperação pendente, não aplicável, indisponível ou sem máximo positivo resulta em `unavailable`, com motivo explícito. Não há tolerância, ranking, limiar de tendência nem declaração de melhora/piora pedagógica.

## Contrato e execução

`shared/gradebook-contracts/performance/performance-term-comparison-v4.ts` define `transportVersion: 4`, operação `term-comparison`, referência anterior explícita, lentes permitidas, alinhamento das linhas/colunas e grupos `higher/equal/lower/unavailable`. A resposta preserva a análise V3 do trimestre atual e acrescenta somente a observação comparativa. Sua autoridade é `descriptive-observation`; a matriz continua `calculated-preview`, não emissão oficial.

O handler autenticado existente chama `createPerformanceTermComparisonV4`. O serviço abre uma transação PostgreSQL `REPEATABLE READ, READ ONLY`, carrega uma vez os fatos limitados da turma e projeta atual e referência em memória pelo mesmo núcleo. Mantém até seis instruções incluindo `SET`, sem consulta por aluno/componente e sem escrita. Limites V2/V3 de 150 alunos, 40 ofertas e 1.000 pares continuam.

O cliente valida o escopo e a resposta, usa `no-store`, cancela respostas antigas e mantém filtros apenas em memória. A interface mostra contagens e matriz de diferenças com os dois percentuais, além do aviso de que os termos são descritivos. Selecionar Avaliações remove a comparação.

## Ano fixo e importação

`CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1` centraliza 2026 nos contratos ativos. Centrais V2, Desempenho V2/V3/V4 e importação canônica V9 recusam outro ano antes da leitura ou persistência. O shell exibe 2026 como contexto fixo; não consulta catálogo, não grava `sessionStorage` e não monta seletor. A superfície, cliente, contrato, serviço e testes de criação de ano foram removidos. O bootstrap V2 antigo permanece apenas compatibilidade de transporte e, quando chamado, expõe no máximo o registro 2026.

Importar a Relação 2026 ainda pode materializar o registro estrutural 2026 quando ausente para satisfazer as FKs do mesmo fluxo autorizado. Isso não é uma função de criação de novos anos e nenhum outro ano passa pela validação V9. Dados atualmente presentes no banco podem ser usados como massa de teste, sem serem tratados como evidência oficial.

## Evidência e pendência

Testes PostgreSQL/PGlite provam snapshot único, zero/N-C/parcial, máximos diferentes, igualdade exata, referências T2→T1 e T3→T1/T2, bloqueio de Avaliações/Visão geral/ano externo, contrato forjado e dispatch HTTP. Testes React/jsdom provam seleção explícita, limpeza ao entrar em Avaliações, ausência do seletor anual e descarte de respostas atrasadas. Eles não substituem validação visual.

A validação visual final de FINAL-1/FINAL-2 permanece adiada para uma única sessão com o responsável. Ela será anunciada imediatamente antes de começar. Merge/deploy desta entrega seguem BN-DEC-023 depois de `npm run verify`, CI verde e revisão do diff; isso não encerra por si só #633/#634 nem o aceite acadêmico #347.
