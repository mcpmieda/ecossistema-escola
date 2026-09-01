# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Integração da onda 15:** #318 / PR #324
- **Próxima onda:** #325, #326 e #327 em paralelo; integração #328
- **Armazenamento físico aprovado:** Cloudflare D1 local/preview
- **Produção acadêmica:** sem D1 remoto, binding, migration remota ou ativação de consultas
- **Autoridade:** `imported-source`
- **Autorização acadêmica atual:** `gradebook.persistence.admin`, emitida/validada no servidor

## Fases — estado funcional atual

| Fase | Issue | Estado após onda 15 | Próximo grande passo |
| --- | ---: | --- | --- |
| F0 Fundação | #183 | concluída | manutenção |
| F1 Fonte/importação | #184 | sintético completo; validação privada final pendente | validação real controlada |
| F2 Persistência | #185 | D1 local V1 + UoW/runtime | produção continua fechada |
| F3 Motor | #186 | núcleo/equivalência V1 | sem mudança de autoridade |
| F4 Auditoria | #187 | Audit Workspace local/preview com HTTP/UI | hardening transversal posterior |
| F5 Centrais | #188 | Operational Workspace local/preview endurecido | hardening transversal posterior |
| F6 Desempenho | #189 | fonte D1 + read model compostos internamente; sem HTTP/UI | #325 end-to-end |
| F7 Conselho | #190 | elegibilidade anual V1 integrada | #327 Conselho V1 |
| F8 Boletins | #191 | emissão + materialização agregada + snapshots locais; sem HTTP/UI/PDF | #326 end-to-end |
| F9 Piloto/segurança | #192 | requisitos transversais aplicados continuamente | frente grande reavaliada depois de F6/F7/F8 visíveis |

## Onda 13 — contratos amplos

| Issue | Entrega |
| ---: | --- |
| #293 | Operational Workspace V1 |
| #294 | Audit Workspace V1 |
| #295 | Class Performance V1 |
| #296 | Bulletin V1 |
| #297 | integração dos quatro contratos |

## Onda 14 — implementação provider-independent / primeira composição

| Issue / PR | Entrega |
| --- | --- |
| #302 / #312 | F5 transporte/bridge/UI local-preview |
| #303 / #313 | Audit Workspace + read-source D1 |
| #304 / #310 | read model de Desempenho |
| #305 / #311 | emissão de Boletins |
| #306 / #319 | Auditoria composta internamente; F6/F8 ainda não expostos |

## Onda 15 — superfícies e hardening

| Frente | Issue / PR | Entrega | Merge da frente |
| :---: | --- | --- | --- |
| A | #314 / #321 | Audit Workspace HeroUI + HTTP local/preview | `fd3fdc32d85227fa12a84477feaca0892e773816` |
| B | #315 / #323 | fonte D1 de Desempenho, 6 queries, sem N+1 | `a101819daef4791e5a1f5a5a64b554ab97d59263` |
| C | #316 / #322 | materialização agregada + snapshots locais imutáveis/versionados | `2875749517ea0c145d73c3dc1df9aa11a8dc18a3` |
| D | #317 / #320 | hardening/stale-response/year/pagination do Operational Workspace | `d7f984e8753e5ad102f8aeb6a135f4870b8298e6` |
| Integração | #318 / #324 | compõe F6 internamente no runtime, sem HTTP/UI | PR de integração |

### Invariantes congeladas na onda 15

- exatamente um `POST /api/gradebook/operational-workspace`;
- exatamente um `POST /api/gradebook/audit-workspace`;
- nenhum Performance/Bulletin HTTP na integração #318;
- Performance: comparação solicitada sem resolvedor oficial continua `not-comparable`;
- Performance: anual non-result continua `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`; outras lentes recovery usam trimestre;
- 6 queries em lote / zero N+1 na fonte física F6;
- Boletins: snapshot imutável/versionado; reimpressão não recalcula;
- F5: resposta obsoleta não substitui contexto novo; paginação deduplicada;
- produção fail-closed antes de `GRADEBOOK_D1`.

## Próxima onda — grandes frentes verticais

As issues foram pré-criadas bloqueadas pela #318 e passam a `[PRONTA]` somente após deploy/smokes finais. A própria issue é a autoridade do estado.

| Frente | Issue | Objetivo | Executor | Integração |
| :---: | ---: | --- | --- | ---: |
| 1 | #325 | Desempenho end-to-end local/preview | **Extra Alto** | #328 |
| 2 | #326 | Boletins end-to-end local/preview | **Extra Alto** | #328 |
| 3 | #327 | Conselho de Classe V1 sem regras novas | **Extra Alto** | #328 |
| Integração | #328 | wiring central, revisão, merge, deploy e estado | **Extra Alto** | — |

### #325 — F6 end-to-end

Transporte/HTTP, matriz HeroUI, quatro lentes, regular/recovery, paginação, detalhes aluno/célula, a11y/mobile e stale-response discard. Comparabilidade continua fail-closed até semântica oficial própria.

### #326 — F8 end-to-end

Seleção, preview, emissão, reimpressão, lote, snapshots históricos locais, HTTP/UI e mesma base canônica para futuro PDF. Como não há renderer PDF integrado hoje, a issue aceita **um único bloqueio explícito de PDF** se incluir renderer exigir decisão/runtime/biblioteca nova.

### #327 — F7 Conselho V1

Fila, elegibilidade, visão T1/T2/T3/REC, decisão humana separada do cálculo, justificativa, histórico e CAS. Não implementar votação, desempate, frequência, participantes ou exceções não formalizadas.

### F9

Não há quarta frente artificial nesta onda. Reavaliar #192 depois da integração #328, quando F6/F7/F8 adicionarem massa funcional visível. Segurança, no-store, sanitização, a11y e recuperação de falhas continuam critérios obrigatórios de todas as frentes.

## Dependências atuais

```text
#314 ─┬─ #315 ─┬─ #316 ─┬─ #317
      └────────┴────────┴──────> #318
                                   ↓
#325 ─┬─ #326 ─┬─ #327
      └────────┴───────────────> #328
```

## D1 e superfícies

### Local/preview

- migrations 0001–0003 / 21 tabelas;
- UoW única e promoção transacional CAS/savepoint/rollback;
- Operational Workspace HTTP/UI;
- Audit Workspace HTTP/UI;
- Desempenho físico + read model interno;
- Boletins provider-independent + snapshots locais.

### Produção

Não existem:

- D1 acadêmico remoto;
- binding/migration remota;
- consulta/persistência acadêmica ativa;
- Performance HTTP/UI;
- Boletins HTTP/UI/PDF;
- Conselho operacional.

## Gates manuais

- `REAL_DATA_VALIDATION.md` em ambiente privado;
- smoke autenticado somente quando houver autorização/ambiente apropriado.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. sem merge/deploy/provisionamento/`PROJECT_STATE.yaml` em frente comum;
7. integração apenas pela issue integradora.