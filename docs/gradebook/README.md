# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates, ensaios e protocolo F9;
- [Issue #406](https://github.com/mcpmieda/ecossistema-escola/issues/406) — próximo gate: piloto integral privado da escola inteira.

## Estado atual — schema produtivo 5/27

A onda 23 executou produção controlada de forma estritamente sequencial:

- #380 — D1 acadêmico produtivo e binding `GRADEBOOK_D1` confirmados, com gate server-side fail-closed;
- #381 — migrations canônicas 0001–0004 aplicadas remotamente, schema version 4 / 25 tabelas e zero pendência;
- #382 — cinco smokes produtivos com corpus exclusivamente sintético, snapshot/reprint duráveis e recovery validado;
- #383 — consolidação canônica, sem novo acesso D1, migration, smoke acadêmico ou mudança de autoridade.

A onda 24 revisou o escopo na #394, integrou a durabilidade cross-restart da sessão institucional V2 na #395 / PR #398, aplicou exclusivamente a migration 0005 pela #399 e concluiu o smoke produtivo/recovery na #400. O estado remoto atual é schema version 5 / 27 tabelas / zero pendência, com resíduo sintético zero e production gate OFF.

O SHA usado no smoke final da onda 23 foi `2fdefa87f186e84ed40637437d4b0199baff82c6`; o smoke Council V2 da #400 validou o SHA `345103e0ede97f34115c0fc21ecba668e9dc7def`. Ao final de ambas as janelas, o corpus sintético foi restaurado para **zero raízes residuais** e o production gate voltou a **OFF**.

O readiness V1 permanece histórico e continua descrevendo o estado pré-produção `prepared-for-manual-authorization`. A partir desta integração, `controlled-production-readiness-v2.ts` representa o estado autorizado pós-onda 23: **`production-infrastructure-smoke-validated-awaiting-private-pilot`**.

## Invariantes ativos

- `authorityMode: imported-source`;
- D1 acadêmico produtivo e binding `GRADEBOOK_D1`: presentes;
- migrations remotas: 0001–0005, schema version 5 / 27 tabelas, zero pendência;
- production gate: OFF entre janelas autorizadas;
- produção acadêmica real: não iniciada;
- piloto real: não iniciado;
- corpus sintético residual do smoke: zero;
- `native-engine`: não ativo;
- somente dados sintéticos no repositório/CI.

## Readiness F9

O V1 continua congelado como memória da preparação anterior e não é enfraquecido para aceitar binding/migrations. O V2 preserva a evidência pós-onda 23. A #400 comprovou em produção a durabilidade cross-restart da sessão V2, voto, fechamento, snapshot, histórico, CAS e guards pós-close, com recovery para resíduo zero.

Limites restantes antes do piloto:

- `reconciliation_v2.case_store` ainda é provider-independent/process-local;
- write administrativo da configuração de comparação continua `not-integrated-hard-stop`.

A sessão/reunião institucional do Conselho V2 usa D1 no runtime central, a 0005 está aplicada em produção e o smoke/recovery desse caminho foi concluído pela #400. Nenhum piloto real começou.

A #384 foi integrada pela PR #393 e publicou a BN-DEC-020. O primeiro piloto real continua definido como escola inteira, privado/controlado e sob `imported-source` durante a validação.

## Estado funcional

- **F1:** concluída e validada 7/7; fidelidade prospectiva V2 preservada;
- **F2:** D1 produtivo provisionado, schema 5/27 aplicado e gate final OFF;
- **F3:** motor V1 comparativo; autoridade continua importada;
- **F4/F5/F6:** concluídas, com write da configuração de comparação ainda bloqueado;
- **F7/F8:** durabilidade D1 integrada e smoke-validada; Boletins/snapshot/reprint e sessão V2 recuperáveis em produção;
- **F9:** infraestrutura e sessão V2 produtivas smoke-validadas; #406 é o gate separado do piloto privado real.

## Próximo gate

`#399 schema 5/27 concluído → #400 smoke Conselho V2/recovery verde → #406 piloto privado integral → #347 autoridade nativa`

A #400 terminou com recovery para resíduo zero e gate OFF. O piloto integral continua separado na #406 e não foi iniciado por esta integração.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes públicos sem dados → gate manual
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
