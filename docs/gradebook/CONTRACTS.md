# Contratos — vigência, compatibilidade e lacunas

Base: BN-DEC-022, #613 e programa #182. O [índice anterior completo](history/pre-final-1/CONTRACTS.md) é preservado; seus estados pertencem à época/modelo anteriores. Este documento não altera arquivos de contrato compartilhado.

## Caminho relacional vigente

| Fronteira | Referência | Situação |
| --- | --- | --- |
| Importação | `shared/gradebook-contracts/imports/import-persistence-transport-v9.ts` | externo V9; homologado #613 |
| Diagnósticos | `shared/gradebook-contracts/imports/import-diagnostics-v1.ts` | contexto humano e evidência atual #629; PR #636 reforça atomicidade sem mudar formato |
| Serviço incremental | `server/gradebook/application/import/import-relational-service-v11.ts` | interno V10/V9, não nova versão HTTP |
| Cálculo simplificado | `src/gradebook-domain/calculations/simplified/` | núcleo em milésimos |
| Projeção oferta/aluno | `server/gradebook/application/results/relational-academic-projection-v1.ts` | aplicação interna; lote limitado na #636 |
| Projeção anual | `server/gradebook/application/results/relational-student-annual-projection-v1.ts` | turma atual, decisão humana separada; não transporte UI |

A comparação relacional usa `match | mismatch | unavailable`; a reconciliação histórica V2 usa `match | expected-difference | mismatch | not-comparable`. Não são enumerações intercambiáveis. Nunca tratar indisponibilidade como correspondência.

A observação de diagnósticos V1 pode ser vazia. A #636 passa a enviar esse vazio e substituir o conjunto em transação; notas não fazem limpeza paralela. V1 não informa ordem cronológica entre abas, portanto a regra é última observação confirmada pelo servidor. Não cria histórico de resolvidos nem altera histórico acadêmico.

## Consumidores que exigem adaptação

OperationalWorkspace, AuditWorkspace antigo, Desempenho, Boletins, Relatórios e Conselho V1/V2 ainda dependem da geração anterior nas fontes/durabilidade. Provider novo não converte seus contratos. Ver [mapa](CONSUMER_MAP.md).

Preservar interpretação histórica, ano explícito, identidade server-side, concorrência, idempotência, histórico acadêmico, emissão/reimpressão e decisão humana. Não fabricar campos, tabelas ou IDs apenas para preencher formatos obsoletos. Toda mudança em `shared/` exige issue `[BN][CONTRATO]`. A PR #636 não modifica contratos compartilhados.

## Desempenho — fonte funcional

`PAINEL DESEMPENHO`, 29/08/2026: §§2–6 contexto/matriz/Recuperação/situação; §§7–14 lentes/investigação; §§15–19 leitura/segurança/frescor/HeroUI; §20 aceite. Execução #634.

Metas de §16.1: payload inicial até 500 KB compactados; backend inicial p95 até 600 ms aquecido; detalhe p95 até 400 ms; matriz utilizável até 2 s no cenário documentado. Não são medições realizadas nem licença para inventar regras/métricas.

## Conselho — única parte preservada do documento antigo

`APENAS CONSELHO`, 23/08/2026, sobretudo §12.9 pp.23–24: turma/aluno/discussão/decisão, evidências em camadas, não elegíveis, votação opcional, diretor só no desempate, falta nas condições definidas, edição histórica e fechamento. Execução #635.

Códigos atuais 1/2/3 não representam toda a distinção documental entre reprovações. Voto/desempate/sessão não estão inteiramente no schema. O documento admite edição e V2 antigo bloqueia alterações após fechamento: conciliar reabertura/durabilidade por decisão contratual, não silenciosamente. Conselho anterior desconhecido e identidade de diretor exigem tratamento explícito; ADMINISTRADOR não implica diretor. O restante desse documento não governa importação, armazenamento, retenção ou Desempenho.

## Recuperação e schema

A baseline `migrations/gradebook-simplified/` foi reconstruída do catálogo e o replay/drift tem teste próprio com as tabelas completas, constraints, índices, funções e triggers. O teste sintético de projeção não é teste de reconstrução; essas verificações são separadas. A #636 inclui ambas sem executar DDL produtivo. Restore dos dados e recursos externos continua pendente. Snapshots/votos/configurações ausentes só recebem extensão mínima após contrato/autorização.
