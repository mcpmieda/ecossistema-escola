# Contratos — vigência, compatibilidade e lacunas

Base: BN-DEC-022, #613 e programa #182. O [índice anterior completo](history/pre-final-1/CONTRACTS.md) é preservado; seus estados pertencem à época/modelo anteriores.

## Caminho relacional

| Fronteira | Referência | Situação |
| --- | --- | --- |
| Importação | `shared/gradebook-contracts/imports/import-persistence-transport-v9.ts` | externo V9; homologado #613 |
| Diagnósticos | `shared/gradebook-contracts/imports/import-diagnostics-v1.ts` | evidência atual #629; atomicidade reforçada na #636 integrada/publicada |
| Serviço incremental | `server/gradebook/application/import/import-relational-service-v11.ts` | interno V10/V9, sem nova versão HTTP |
| Cálculo simplificado | `src/gradebook-domain/calculations/simplified/` | núcleo em milésimos |
| Projeção oferta/aluno | `server/gradebook/application/results/relational-academic-projection-v1.ts` | aplicação interna; lote limitado na #636 |
| Projeção anual | `server/gradebook/application/results/relational-student-annual-projection-v1.ts` | turma atual, decisão humana separada; não transporte UI |
| Contexto/pesquisa/Centrais V2 | `shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2.ts` | contrato #639; implementação integrada na PR #640 |
| Desempenho relacional V2/V3/V4 | `shared/gradebook-contracts/performance/relational-performance-v2.ts`, `performance-analysis-v3.ts` e `performance-term-comparison-v4.ts` | matriz/lentes/detalhe integrados; comparação trimestral 2026 na #649/#650 |
| Conselho relacional V3 | `shared/gradebook-contracts/council/relational-council-v3.ts` | contrato #648; sessão/CAS/idempotência/votos/histórico/fotografias, com decisão humana explícita |

Comparação relacional `match | mismatch | unavailable` e reconciliação histórica `match | expected-difference | mismatch | not-comparable` não são intercambiáveis. Nunca tratar indisponibilidade como correspondência.

Diagnósticos V1 admitem observação vazia. A #636 envia esse vazio e substitui o conjunto em transação, sem limpeza paralela pelas notas. Última observação confirmada pelo servidor; sem ordem cronológica entre abas nem histórico de resolvidos. Histórico acadêmico continua separado.

## Contexto e Centrais V2 — contrato #639

O mesmo endpoint operacional distingue `contractVersion: 2`. São exclusivamente consultas: contexto/contagens, pesquisa e detalhe de aluno/turma/professor/componente em 2026. O bootstrap antigo permanece compatibilidade e retorna, no máximo, o registro 2026; não governa mais a interface. Identidade inteira e ano explícito; nenhuma versão, lifecycle, data ou resultado acadêmico é fabricado. Vínculos atuais/históricos e ofertas vêm das tabelas atuais, sem carregar o runtime antigo.

Contrato inclui validação de entrada/saída, limites de página, busca literal e snapshot por requisição somente leitura/repeatable-read. O browser cancela/descarta respostas obsoletas, confere o contexto retornado e limpa informações quando perde autorização. Detalhes e limites em [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md).

V1 não foi alterado para simular equivalência. A interface de Centrais passa a V2 na #640; manutenção docente V1 deixa de ser montada ali até sua adaptação. A #649 substitui o seletor da #646 por contexto fixo 2026. Contratos V1 recebem apenas o ID opaco cuja opção tenha rótulo único exatamente `2026`, sem converter provider, fonte ou durabilidade. A superfície/contrato/serviço de criação de anos foi removida; novos anos não são escopo pendente.

## Consumidores que exigem adaptação

AuditWorkspace antigo, Boletins e Relatórios ainda dependem da geração anterior nas fontes/durabilidade. O Conselho montado no shell usa V3 relacional; V1/V2 permanecem apenas como compatibilidade não montada. O contexto fixo 2026 não converte os demais contratos; apenas impede seleção divergente ou aproximada. Desempenho montado no shell usa a projeção relacional V2/V3/V4. Ver [mapa](CONSUMER_MAP.md), [Conselho V3](RELATIONAL_COUNCIL_V3.md), [contrato #646](FINAL2_SOURCE_DESKTOP_646.md) e [comparação #649](TERM_COMPARISON_2026_V4.md).

Preservar interpretação histórica, ano explícito, identidade server-side, concorrência, idempotência, histórico, emissão/reimpressão e decisão humana. Não fabricar campos/IDs apenas para formatos obsoletos. Toda mudança em `shared/` exige issue `[BN][CONTRATO]`: a #639 autoriza V2; a PR #636 não modifica contratos compartilhados.

## Desempenho — fonte funcional

`PAINEL DESEMPENHO`, 29/08/2026: §§2–6 contexto/matriz/Recuperação/situação; §§7–14 lentes/investigação; §§15–19 leitura/segurança/frescor/HeroUI; §20 aceite. Execução #634.

Metas de §16.1: payload inicial até 500 KB compactados; backend inicial p95 até 600 ms aquecido; detalhe p95 até 400 ms; matriz utilizável até 2 s no cenário documentado. Não são medições realizadas nem licença para inventar regras/métricas.

O campo V2 legado permanece `comparability-not-contracted` para não reinterpretar clientes anteriores. A operação V4 da #649 contrata separadamente apenas a comparação proporcional T2→T1 e T3→T1/T2 dentro de 2026, nas lentes Resultado/Quantitativo/Qualitativo e no mesmo snapshot. Não compara anos, slots de avaliação nem herda configuração do runtime antigo.

## Conselho — única parte preservada do documento antigo

`APENAS CONSELHO`, 23/08/2026, sobretudo §12.9 pp.23–24: turma/aluno/discussão/decisão, evidências em camadas, não elegíveis, votação opcional, edição histórica e fechamento. Execução #635; a conciliação vigente é a decisão explícita #648.

Os códigos são exatamente 1 `APROVADO PELO CONSELHO`, 2 `REPROVADO PELO CONSELHO` e 3 `REPROVADO POR FALTA`. Votos registram somente favoráveis/contrários e presentes é derivado. Diretor, desempate e voto de minerva ficam fora do sistema; ADMINISTRADOR não implica diretor. A sessão fecha para escrita, cria fotografia imutável e só volta a aceitar comandos depois de reabertura justificada. Conselho anterior foi retirado do caminho ativo, sem apagar colunas históricas. O restante do documento antigo não governa importação, armazenamento, retenção ou Desempenho.

## Recuperação e schema

A baseline `migrations/gradebook-simplified/` foi reconstruída do catálogo e replay/drift tem teste próprio com tabelas completas, constraints, índices, funções e triggers. O teste sintético de projeção não é teste de reconstrução; são verificações separadas, integradas na #636 sem DDL produtivo. Restore dos dados/recursos externos continua pendente. Snapshots/votos/configurações ausentes só recebem extensão mínima após contrato/autorização.
