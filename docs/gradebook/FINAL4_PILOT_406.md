# Piloto integral FINAL-4 — #406

Data do fechamento: 11/09/2026 (America/Sao_Paulo).

## Escopo e autoridade

O piloto combina duas evidências privadas complementares, sem publicar dado acadêmico identificável:

- o corpus canônico de 2026 já exercitado na #406, com uma Relação e 18 fontes de notas, incluindo reimportação integral idêntica;
- a massa descartável de 2025 autorizada pelo responsável, com uma Relação e 19 fontes de notas, usada para percorrer T1–T3, Recuperação, R/R e fechamento anual.

Os arquivos de 2025 e todos os registros associados são massa de teste, não registros oficiais. A autoridade dos consumidores permanece `imported-source`; o motor nativo continua descritivo e não substitui AM/U importadas. A seleção global mantém 2025 e 2026 isolados, inclusive identidade de aluno por ano. Comparação existe apenas entre trimestres do mesmo ano.

## Matriz sanitizada

| Requisito | Caso exercitado | Resultado | Evidência publicada |
| --- | --- | --- | --- |
| Relação antes das notas | Materialização automática de 2025 e carga das 19 fontes seguintes | Aprovado; novo ano apareceu no seletor global | #676 / PR #678 |
| Isolamento anual | Troca global 2025 ↔ 2026 em consumidores e IDs anuais distintos | Aprovado; nenhum recorte interanual foi oferecido | #676 / PR #678 |
| Reimportação idêntica | Segunda passagem integral do corpus canônico de 2026 | Aprovado; 19/19 sem mudança acadêmica | #406, comentário 5640854919 |
| Movimentações | Situações da Relação, inclusive origem histórica exata | Aprovado; `ESTAVA NO <turma>` veio exclusivamente da Relação | #677 / PRs #681–#683 |
| Desempenho | T1–T3/anual, regular/recuperação, ranking, drill-down, matriz e viewport 390×844 | Aprovado; sem corte de barras ou overflow da página | #677 / PRs #681–#683 |
| Regra terminal R/R | R/R em qualquer componente, inclusive junto de componentes em curso | Aprovado; resultado atual `REPROVADO` e sem Conselho | #676, #679 e #684 |
| Conselho humano | Sessão, decisão, votos favoráveis/contrários, empate, fechamento, reabertura e novo fechamento | Aprovado; empate permaneceu “decisão fora do sistema”, sem voto de minerva registrado | #648 / PR #653 e piloto privado |
| Conselho × R/R | População anual com estudantes terminais R/R | Aprovado; R/R não entrou na fila elegível | #676 e piloto privado |
| Boletim anual | Prévia, emissão individual, lote idempotente e prontidão terminal R/R | Aprovado; AM oficial continuou obrigatória e cálculo descritivo incompleto não bloqueou o terminal | #684 / PR #685 |
| Histórico e PDF | Snapshot, reimpressão histórica e download do PDF oficial | Aprovado; reimpressão não releu nota atual e o PDF foi preparado | #684 / PR #685 |
| Relatórios | Resultados, composição, recuperação, Conselho e Auditoria | Aprovado; Recuperação passou a exibir R/R como reprovação automática | #656 e #684 / PR #685 |
| Auditoria | Diagnósticos atuais, filtros e trilha humana append-only | Aprovado; sem correção automática ou PII em evidência pública | #674 / PR #675 |
| Concorrência e recuperação local | CAS, contenção, restart e restauração PostgreSQL descartável | Aprovado | #662 / PR #663 |
| Auth, origem e cache | 401/403, capability, origem oficial e `no-store` | Aprovado por suítes HTTP e smokes autenticados | `docs/gradebook/TEST_MATRIX.md` |
| Qualidade do head | `npm run verify`, CI, revisão, merge por SHA e deploy oficial | Aprovado em `main@fedba0f` | PR #685; deploy 34666713254 |

## Percurso anual humano

A massa 2025 foi usada como um operador usaria o produto: importação, troca global de ano, leituras de turma e componente, Recuperação, identificação de R/R, sessão de Conselho, votos, empate, decisão registrada fora do sistema, fechamento, reabertura justificada, segundo fechamento, boletins, lote, reimpressão, PDF, cinco famílias de relatório e Auditoria.

Uma candidata legítima ao Conselho foi produzida somente por entradas adicionais descartáveis de cenário. A primeira fotografia fechou com empate de 2 a 2. Após reabertura, uma segunda fotografia preservou a decisão revisada e votos de 1 a 3. O sistema não criou nem registrou voto de diretor. Estudantes R/R permaneceram automaticamente reprovados e fora da deliberação.

## Limitações aceitas

- Backup/restore gerenciado externo, RPO e RTO continuam ausentes e foram explicitamente adiados pelo responsável. As provas locais descartáveis não devem ser apresentadas como essa garantia.
- O ano oficial em operação é 2026 e continua naturalmente em curso enquanto não houver T3 oficial. O piloto 2025 prova o fluxo do software, não homologa resultados acadêmicos oficiais de 2025 ou antecipa resultados de 2026.
- O programa não ativa `native-engine`, não altera regra acadêmica, não inventa nota ausente e não registra desempate do diretor.

Com essas limitações explícitas, não restou bloqueador funcional conhecido no percurso integral relacional. Novas divergências observadas durante a operação devem voltar à fase responsável com reprodução e teste de regressão.
