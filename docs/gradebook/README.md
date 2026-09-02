# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates, ensaios e protocolo F9;
- [Issue #383](https://github.com/mcpmieda/ecossistema-escola/issues/383) — integração/fechamento da onda 23.

## Estado atual — onda 23 concluída

A onda 23 executou produção controlada de forma estritamente sequencial:

- #380 — D1 acadêmico produtivo e binding `GRADEBOOK_D1` confirmados, com gate server-side fail-closed;
- #381 — migrations canônicas 0001–0004 aplicadas remotamente, schema version 4 / 25 tabelas e zero pendência;
- #382 — cinco smokes produtivos com corpus exclusivamente sintético, snapshot/reprint duráveis e recovery validado;
- #383 — consolidação canônica, sem novo acesso D1, migration, smoke acadêmico ou mudança de autoridade.

O SHA usado no smoke final foi `2fdefa87f186e84ed40637437d4b0199baff82c6`. Ao final da janela, o corpus sintético foi restaurado para **zero raízes residuais** e o production gate voltou a **OFF**.

O readiness V1 permanece histórico e continua descrevendo o estado pré-produção `prepared-for-manual-authorization`. A partir desta integração, `controlled-production-readiness-v2.ts` representa o estado autorizado pós-onda 23: **`production-infrastructure-smoke-validated-awaiting-private-pilot`**.

## Invariantes ativos

- `authorityMode: imported-source`;
- D1 acadêmico produtivo e binding `GRADEBOOK_D1`: presentes;
- migrations remotas: 0001–0004, schema version 4 / 25 tabelas, zero pendência;
- production gate: OFF entre janelas autorizadas;
- produção acadêmica real: não iniciada;
- piloto real: não iniciado;
- corpus sintético residual do smoke: zero;
- `native-engine`: não ativo;
- somente dados sintéticos no repositório/CI.

## Readiness F9

O V1 continua congelado como memória da preparação anterior e não é enfraquecido para aceitar binding/migrations. O V2 distingue infraestrutura produtiva autorizada e smoke-validada de piloto real e autoridade nativa. Depois da onda 23 restam dois gates independentes: piloto privado real e mudança de autoridade pela trilha própria.

Limitações conhecidas a revisar antes do piloto, sem solução inventada nesta integração:

- `reconciliation_v2.case_store` ainda é provider-independent/process-local;
- sessão/reunião institucional do Conselho V2 ainda é process-local e sem durabilidade cross-restart;
- write administrativo da configuração de comparação continua `not-integrated-hard-stop`.

A #384 / PR #385 ainda não está integrada à `main` nesta consolidação; portanto BN-DEC-019 continua a decisão canônica vigente. A direção da #384 só deve ser consumida depois de integração própria.

## Estado funcional

- **F1:** concluída e validada 7/7; fidelidade prospectiva V2 preservada;
- **F2:** D1 produtivo provisionado, schema 4/25 aplicado e gate final OFF;
- **F3:** motor V1 comparativo; autoridade continua importada;
- **F4/F5/F6:** concluídas, com write da configuração de comparação ainda bloqueado;
- **F7/F8:** durabilidade D1 integrada; Boletins/snapshot/reprint validados no smoke produtivo;
- **F9:** infraestrutura produtiva smoke-validada, aguardando piloto privado real.

## Próximo gate

`onda 23 concluída → onda 24 piloto privado real → #347 autoridade nativa`

A onda 24 deve começar por revisão explícita de escopo contra as limitações conhecidas, manter `imported-source` durante a validação e não abrir o gate com dados reais sem autorização própria.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes públicos sem dados → gate manual
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
