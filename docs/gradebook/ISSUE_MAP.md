# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Onda 19:** #353 + #354 + #355 → #356 / PR #362
- **Onda 20:** #360 / PR #363 → #361
- **Onda 21:** #365 / PR #368 + #366 / PR #369 → #367 / PR #370
- **Onda 22:** #349 / PR #375 → #371 / PR #376 → (#372 / PR #377 + #373 / PR #378) → #374 / PR #379
- **Onda 23:** #380 → #381 → #382 → #383
- **Armazenamento:** Cloudflare D1 local/preview + produção; migrations 0001–0004 / 25 tabelas
- **Produção acadêmica:** recurso/binding/schema presentes e smoke-validados; gate final OFF, operação real ainda não iniciada
- **Autoridade ativa:** `imported-source`
- **Autoridade-alvo futura:** `native-engine`, separada em #347/F9
- **Autorização acadêmica:** `gradebook.persistence.admin`, server-side

## Fases após onda 22

| Fase                   | Issue | Estado                                                          | Próximo grande passo                     |
| ---------------------- | ----: | --------------------------------------------------------------- | ---------------------------------------- |
| F0 Fundação            |  #183 | concluída                                                       | manutenção                               |
| F1 Fonte/importação    |  #184 | **7/7 histórico + fidelidade V2 integrada**                     | manutenção                               |
| F2 Persistência        |  #185 | D1 produtivo + schema 4/25; gate final OFF                       | piloto somente por autorização própria    |
| F3 Motor               |  #186 | V1 concluída, comparativa                                       | futura autoridade via #347/F9            |
| F4 Auditoria           |  #187 | revisão 7/7 + investigação/correção determinística integrada    | produção/piloto por gates próprios       |
| F5 Centrais            |  #188 | cadastro/confirmação docente + atribuições anuais concluídos    | manutenção                               |
| F6 Desempenho          |  #189 | **concluída: gráficos + comparação proporcional profile-aware**  | manutenção; write config ainda bloqueado |
| F7 Conselho            |  #190 | V2 institucional + decisões duráveis local/preview              | gates residuais próprios                 |
| F8 Boletins/Relatórios |  #191 | snapshots duráveis + PDF individual/batch + reports             | produção somente por autorização própria |
| F9 Piloto/segurança    |  #192 | infraestrutura produtiva smoke-validada; gate final OFF          | piloto → autoridade                      |

## Onda 20 — F9 readiness

| Frente     | Issue / PR  | Entrega                                                                                        |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Readiness  | #360 / #363 | manifesto puro, evidências, hard stops, ensaios sintéticos e runbook de piloto/rollback futuro |
| Integração | #361        | regressão transversal, estado canônico e publicação inerte                                     |

Merge da frente:

```text
#363 → 000a6988565419d9c1f2c638e929af4e0dff1491
```

### Resultado integrado

- preparação completa resulta somente em `prepared-for-manual-authorization`;
- cinco ações produtivas/institucionais continuam bloqueadas por autorização própria;
- ensaios usam somente dados sintéticos e D1 em memória/local;
- plano de smoke futuro é declarativo e não executa rede/migration;
- produção continua fail-closed antes do binding;
- `authorityMode` continua `imported-source`;
- nenhum recurso, secret, binding, migration remota ou piloto real foi criado/executado.

## Gates manuais após a publicação

1. recurso e binding produtivos;
2. migration remota;
3. smoke acadêmico produtivo;
4. piloto privado real;
5. autoridade nativa, pela trilha separada #347.

Nenhum desses gates é consequência automática da #361. Nova execução exige autorização própria e escopo explícito.

## Onda 21 — fidelidade das avaliações trimestrais

| Frente        | Issue / PR  | Entrega                                                                                   |
| ------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Contrato V2   | #365 / #368 | definições R/S e AA:AJ prospectivas, identidade estável e compatibilidade V1             |
| Implementação | #366 / #369 | reconhecimento, materialização, versionamento, D1, Desempenho e consumidores compatíveis |
| Integração    | #367 / #370 | regressão transversal, readiness e memória canônica                                      |

Merges das frentes:

```text
#368 → 7b59a226b557153d6e3094b64f268ce5e9373cc3
#369 → 70748d527f0ebf11803dab748a6d5d5dbe6c082a
```

### Resultado integrado

- `SourceContractV1` e snapshots V1 permanecem históricos, sem reinterpretação;
- R/S são avaliações quantitativas genéricas e S não implica `simulation`;
- definições incompletas ficam fail-closed, sem máximo zero ou GradeEntry órfão;
- T/Z/AK/AM/AN, motor 2026, autoridade importada e resultados oficiais permanecem inalterados;
- Desempenho, Centrais, Boletins e Relatórios aceitam componentes V2 sem métrica ou motor novo;
- readiness retorna a `prepared-for-manual-authorization` com todos os gates produtivos fechados.

## Onda 22 — decisão, comparação e correção determinística

| Frente                  | Issue / PR  | Entrega                                                                                  |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Decisão normativa       | #349 / #375 | BN-DEC-019 consolidada                                                                   |
| Contratos compartilhados | #371 / #376 | comparação proporcional V2 e reconciliação determinística V2                            |
| Desempenho              | #372 / #377 | comparação profile-aware, referência explícita e configuração server-side               |
| Auditoria               | #373 / #378 | investigação, stop e correção determinística pelo planner/executor oficiais              |
| Integração              | #374 / #379 | regressão, documentação, publicação e retorno aos gates produtivos                       |

Merges das frentes:

```text
#375 → a49b05de243353d1aea9452d0cdc108c75a1221a
#376 → 92c0760ff8735e11f94ba61c148f8b789d53929d
#377 → da73b8cabc30fd5479c00683c36cef481076b286
#378 → 9cc998225c612722fcbe2ebc64bbf35d2d9dbd1b
```

### Resultado integrado

- 24/30 e 32/40 são proporcionalmente iguais por percentual oficial, sem hard-code ou tolerância;
- configuração default habilitada e estado server-side desabilitado são explícitos; escrita administrativa continua `not-integrated-hard-stop`;
- mismatch não presume culpado e possível impacto acadêmico produz `stop` fail-closed;
- correção automática exige prova unívoca e usa append-only/CAS/transação/rollback oficiais;
- planilha original, decisões de Conselho, snapshots e histórico não são reescritos;
- produção acadêmica, piloto real e `native-engine` continuam desativados.

Próxima ordem histórica após a onda 22: `onda 23 produção controlada → onda 24 piloto real → #347 autoridade nativa`.

## Onda 23 — produção controlada

| Etapa | Issue | Evidência sanitizada |
| --- | ---: | --- |
| Recurso/binding | #380 | D1 produtivo e `GRADEBOOK_D1` presentes; gate OFF |
| Migrations | #381 | 4/4, schema version 4, 25 tabelas, pendentes 0 |
| Smoke | #382 | 5 passos verdes; snapshot/reprint/recovery; resíduo sintético final 0 |
| Integração | #383 | readiness V2 + memória canônica, sem nova operação remota |

Estado consolidado: `production-infrastructure-smoke-validated-awaiting-private-pilot`. O SHA usado no smoke final foi `2fdefa87f186e84ed40637437d4b0199baff82c6`; o production gate terminou OFF e `authorityMode` continua `imported-source`.

Limitações conhecidas para revisão de escopo na onda 24: case store de reconciliação V2 process-local, sessão/reunião do Conselho V2 process-local e write da configuração de comparação ainda não integrado. A integração #383 não cria solução por conveniência.

A #384 / PR #385 segue sem merge nesta consolidação e, portanto, não altera ainda a decisão canônica em `DECISIONS.md`.

Próxima ordem: `onda 23 concluída → onda 24 piloto privado real → #347 autoridade nativa`.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. não executar merge/deploy/provisionamento fora da autoridade expressa;
7. nunca antecipar #347.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
