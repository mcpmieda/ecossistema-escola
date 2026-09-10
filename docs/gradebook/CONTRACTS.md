# Contratos — vigência, compatibilidade e lacunas

Base: BN-DEC-022, #613 e programa #182. O [índice anterior completo](history/pre-final-1/CONTRACTS.md) é preservado; seus estados de integração pertencem ao modelo/época anteriores. Este documento não altera arquivos de contrato compartilhado.

## Caminho relacional vigente

| Fronteira | Referência no repositório | Situação |
| --- | --- | --- |
| Persistência de importação | `shared/gradebook-contracts/imports/import-persistence-transport-v9.ts` | externo V9; homologado #613 |
| Diagnósticos | `shared/gradebook-contracts/imports/import-diagnostics-v1.ts` | contexto humano; somente evidências atuais #629 |
| Serviço incremental | `server/gradebook/application/import/import-relational-service-v11.ts` | interno sobre V10/V9; não é versão nova de HTTP |
| Cálculo simplificado | `src/gradebook-domain/calculations/simplified/` | núcleo inteiro em milésimos e estados próprios |
| Projeção por oferta/aluno | `server/gradebook/application/results/relational-academic-projection-v1.ts` | aplicação interna; lote adicionado na PR #636 |
| Projeção anual | `server/gradebook/application/results/relational-student-annual-projection-v1.ts` | turma corrente; decisão humana separada; não é transporte de UI |

A representação relacional de comparação usa `match | mismatch | unavailable`. A reconciliação V2 histórica usa `match | expected-difference | mismatch | not-comparable`. Não são enumerações intercambiáveis: `unavailable` não deve ser renomeado como `match`, e adequação a consumidores exige contrato explícito.

## Consumidores existentes que exigem adaptação

`OperationalWorkspace V1`, `AuditWorkspace V1`, `ClassPerformanceReadModelV1`, `BulletinModelV1`, Relatórios e Conselho V1/V2 têm consumidores integrados, porém a fonte/durabilidade ainda depende da geração antiga. Trocar provider não converte esses contratos nem prova o aceite de suas autoridades. Ver `CONSUMER_MAP.md`.

Preservar interpretação de registros V1 e invariantes úteis: ano explícito, identidade server-side, concorrência, idempotência, histórico acadêmico, emissão/reimpressão imutáveis e separação das decisões humanas. Não preservar tabelas/IDs artificiais só para satisfazer um contrato obsoleto.

Qualquer mudança em `shared/` começa por issue `[BN][CONTRATO]` própria. Não fabricar campos faltantes. Identificar limites, versões, compatibilidade e testes de consumo antes de ligar endpoints. A PR #636 não modifica contratos compartilhados.

## Desempenho — fonte funcional preservada

Documento `PAINEL DESEMPENHO`, 29/08/2026: §§2–6 contexto/matriz/Recuperação/situação, §§7–14 lentes e investigação, §§15–19 leitura/segurança/frescor/HeroUI, §20 aceite. Execução #634.

Os objetivos de §16.1 são payload inicial até 500 KB compactados, backend inicial p95 até 600 ms aquecido, detalhes p95 até 400 ms e matriz utilizável até 2 s no cenário documentado. Não são resultados já medidos nem autorização para inferir fórmulas ou métricas.

## Conselho — única parte preservada do documento antigo

Documento `APENAS CONSELHO`, 23/08/2026, especialmente §12.9 pp.23–24: fluxo turma/aluno/discussão/decisão, evidências em camadas, não elegíveis, votação numérica opcional, diretor só no desempate, reprovação por falta nas condições definidas, edição histórica e fechamento. Execução #635.

Lacunas explícitas: códigos relacionais 1/2/3 não representam toda a distinção documental entre reprovações; voto/desempate e sessão/fechamento não estão no schema mínimo atual. O documento admite edição; o V2 antigo rejeita alterações após fechamento. A conciliação exige decisão contratual sobre reabertura/durabilidade, não escolha silenciosa. Conselho anterior desconhecido e identidade formal de diretor também precisam de tratamento explícito, sem inferência pelo papel ADMINISTRADOR.

O restante do documento antigo não é base para reconstruir importador, armazenamento, retenção de Auditoria ou Desempenho.

## Recuperação e schema

A migration da reconstrução existe no histórico produtivo, mas a baseline completa reproduzível/testada em Git e seu drift contra o catálogo ainda são pendência da #633. O teste sintético de projeção não é teste de reconstrução do schema produtivo. Lacunas de snapshots/votos/configuração só recebem extensão mínima após contrato e autorização aplicáveis.
