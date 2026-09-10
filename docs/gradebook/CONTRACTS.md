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
| Contexto/pesquisa/Centrais V2 | `shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2.ts` | contrato #639; implementação na PR #640, ainda não integrada/publicada |

Comparação relacional `match | mismatch | unavailable` e reconciliação histórica `match | expected-difference | mismatch | not-comparable` não são intercambiáveis. Nunca tratar indisponibilidade como correspondência.

Diagnósticos V1 admitem observação vazia. A #636 envia esse vazio e substitui o conjunto em transação, sem limpeza paralela pelas notas. Última observação confirmada pelo servidor; sem ordem cronológica entre abas nem histórico de resolvidos. Histórico acadêmico continua separado.

## Contexto e Centrais V2 — contrato #639

O mesmo endpoint operacional distingue `contractVersion: 2`. São exclusivamente consultas: anos cadastrados, contexto/contagens, pesquisa e detalhe de aluno/turma/professor/componente. Identidade inteira e ano explícito; nenhuma versão, lifecycle, data ou resultado acadêmico é fabricado. Vínculos atuais/históricos e ofertas vêm das tabelas atuais, sem carregar o runtime antigo.

Contrato inclui validação de entrada/saída, limites de página, busca literal e snapshot por requisição somente leitura/repeatable-read. O browser cancela/descarta respostas obsoletas, confere o contexto retornado e limpa informações quando perde autorização. Detalhes e limites em [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md).

V1 não foi alterado para simular equivalência. A interface de Centrais passa a V2 na #640; manutenção docente V1 deixa de ser montada ali até sua adaptação. Consumidores acadêmicos ainda V1 não passam automaticamente a usar V2. O seletor anual global entre todas as áreas e gestão de anos novos permanecem pendentes.

## Consumidores que exigem adaptação

AuditWorkspace antigo, Desempenho, Boletins, Relatórios e Conselho V1/V2 ainda dependem da geração anterior nas fontes/durabilidade. Provider novo não converte seus contratos. Ver [mapa](CONSUMER_MAP.md).

Preservar interpretação histórica, ano explícito, identidade server-side, concorrência, idempotência, histórico, emissão/reimpressão e decisão humana. Não fabricar campos/IDs apenas para formatos obsoletos. Toda mudança em `shared/` exige issue `[BN][CONTRATO]`: a #639 autoriza V2; a PR #636 não modifica contratos compartilhados.

## Desempenho — fonte funcional

`PAINEL DESEMPENHO`, 29/08/2026: §§2–6 contexto/matriz/Recuperação/situação; §§7–14 lentes/investigação; §§15–19 leitura/segurança/frescor/HeroUI; §20 aceite. Execução #634.

Metas de §16.1: payload inicial até 500 KB compactados; backend inicial p95 até 600 ms aquecido; detalhe p95 até 400 ms; matriz utilizável até 2 s no cenário documentado. Não são medições realizadas nem licença para inventar regras/métricas.

## Conselho — única parte preservada do documento antigo

`APENAS CONSELHO`, 23/08/2026, sobretudo §12.9 pp.23–24: turma/aluno/discussão/decisão, evidências em camadas, não elegíveis, votação opcional, diretor só no desempate, falta nas condições definidas, edição histórica e fechamento. Execução #635.

Códigos atuais 1/2/3 não representam toda a distinção documental entre reprovações. Voto/desempate/sessão não estão inteiramente no schema. O documento admite edição e V2 antigo bloqueia alterações após fechamento: conciliar reabertura/durabilidade por decisão contratual, não silenciosamente. Conselho anterior desconhecido e identidade de diretor exigem tratamento explícito; ADMINISTRADOR não implica diretor. O restante desse documento não governa importação, armazenamento, retenção ou Desempenho.

## Recuperação e schema

A baseline `migrations/gradebook-simplified/` foi reconstruída do catálogo e replay/drift tem teste próprio com tabelas completas, constraints, índices, funções e triggers. O teste sintético de projeção não é teste de reconstrução; são verificações separadas, integradas na #636 sem DDL produtivo. Restore dos dados/recursos externos continua pendente. Snapshots/votos/configurações ausentes só recebem extensão mínima após contrato/autorização.
