# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Integração da onda 15:** #318 / PR #324
- **Onda 16:** #325, #326 e #327; desbloqueio #332; integração #328
- **Armazenamento físico aprovado:** Cloudflare D1 local/preview
- **Produção acadêmica:** sem D1 remoto, binding, migration remota ou ativação de consultas
- **Autoridade:** `imported-source`
- **Autorização acadêmica atual:** `gradebook.persistence.admin`, emitida/validada no servidor

## Fases — estado funcional atual

| Fase | Issue | Estado após onda 16 | Próximo grande passo |
| --- | ---: | --- | --- |
| F0 Fundação | #183 | concluída | manutenção |
| F1 Fonte/importação | #184 | **concluída e validada 7/7** | manutenção/novos formatos somente por demanda |
| F2 Persistência | #185 | D1 local V1 + UoW/runtime | produção continua fechada |
| F3 Motor | #186 | núcleo/equivalência V1 | sem mudança de autoridade |
| F4 Auditoria | #187 | Audit Workspace local/preview com HTTP/UI | hardening transversal posterior |
| F5 Centrais | #188 | Operational Workspace local/preview endurecido | acabamento/hardening posterior |
| F6 Desempenho | #189 | HTTP/UI end-to-end local/preview | hardening/validação operacional |
| F7 Conselho | #190 | projeção oficial + workspace/decisão/HTTP/UI local-preview | durabilidade futura somente se formalmente exigida |
| F8 Boletins | #191 | preview/emissão/lote/snapshots/histórico/reimpressão HTTP/UI | PDF/renderer como frente grande própria |
| F9 Piloto/segurança | #192 | requisitos transversais aplicados continuamente | frente grande agora justificada pela massa F4–F8 |

## F1 — gate histórico concluído

A #184 está `completed` e F1 chegou a **7/7**. O protocolo privado controlado, o smoke autenticado completo e a falha isolada passaram. Arquivos reais modificados: 0; dados identificáveis publicados: 0; gates históricos reais antigos restantes: 0.

Os marcadores `controlled-real-corpus-validation-not-yet-recorded` e `complete-manifest-failure-smoke-not-yet-recorded` foram satisfeitos. Não os tratar como pendência futura. Isso não remove políticas gerais de segurança ou futuros gates próprios de produção.

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

| Frente | Issue / PR | Entrega |
| :---: | --- | --- |
| A | #314 / #321 | Audit Workspace HeroUI + HTTP local/preview |
| B | #315 / #323 | fonte D1 de Desempenho, 6 queries, sem N+1 |
| C | #316 / #322 | materialização agregada + snapshots locais imutáveis/versionados |
| D | #317 / #320 | hardening/stale-response/year/pagination do Operational Workspace |
| Integração | #318 / #324 | compõe F6 internamente no runtime |

## Onda 16 — end-to-end F6/F7/F8

| Frente | Issue / PR | Entrega | Integração |
| :---: | --- | --- | ---: |
| 1 | #325 / #329 | Performance Transport V1, bridge e `PerformancePage` | #328 |
| 2 | #326 / #331 | Boletins: preview/emissão/lote/snapshots/histórico/reimpressão | #328 |
| 3 | #327 / #330 | Council Workspace/Decision V1, histórico/CAS e HeroUI | #328 |
| Fundação | #332 / #333 | projeção anual oficial upstream do Conselho | #328 |
| Integração | #328 | runtime/Functions/App, testes combinados e docs | — |

Merges das três frentes já preservados:

```text
#329  4d1932053d7d0c5d6083164e3662d653b7c4293e
#331  71dec5984124854d894e6f370018600456ea76f3
#330  d86fa40ac4b6127fce270052a4fa3a1af6827fe8
```

A fundação #332/PR #333 foi integrada depois do hard stop inicial da #328 para disponibilizar ao Conselho uma projeção oficial agregada sem recalcular elegibilidade no workspace.

### Invariantes congeladas pós-onda 16

- exatamente um bridge Operational, Audit, Performance, Boletins e Conselho;
- Performance: quatro lentes, regular/recovery, paginação independente e drill-down;
- Performance: comparação sem resolvedor oficial continua `not-comparable`;
- Performance: annual non-result continua `insufficient-data`;
- Performance: `recovery + result` usa `FinalRecoveryV1`; outras lentes recovery usam trimestre;
- raw source evidence não atravessa HTTP de Desempenho;
- Boletins: preview e emissão usam o mesmo `BulletinModelV1`;
- Boletins: lote isola bloqueados; snapshot histórico é imutável/versionado; reimpressão não relê academia atual;
- Conselho: 0/1/2/3+/insuficiente vêm da projeção #332, não do workspace;
- Conselho: T1/T2/T3 usam imported; REC usa imported somente quando unívoca;
- REC ausente é `not-applicable`; REC ambígua falha fechada como `insufficient-data`;
- decisão humana permanece separada do cálculo, com justificativa, histórico/CAS e ator/instante server-side;
- nenhuma votação, desempate, frequência, participante ou exceção nova;
- produção fail-closed antes de `GRADEBOOK_D1`.

## D1 e superfícies

### Local/preview

- migrations 0001–0003 / 21 tabelas, sem migration nova na onda 16;
- UoW única e promoção transacional CAS/savepoint/rollback;
- Operational Workspace HTTP/UI;
- Audit Workspace HTTP/UI;
- Desempenho HTTP/UI;
- Conselho HTTP/UI com projeção oficial upstream;
- Boletins HTTP/UI, snapshots locais e reimpressão histórica.

### Produção

Não existem D1 acadêmico remoto, binding/migration remota ou consulta/persistência acadêmica ativa. Os handlers/páginas presentes no código permanecem fail-closed quando o runtime acadêmico está em produção sem autorização própria.

## Limitações pós-onda

- Boletins: `PDF/renderização pendente por decisão arquitetural`;
- snapshots de Boletins: local/preview descartáveis, sem durabilidade cross-restart;
- decisões de Conselho: local/preview descartáveis, sem durabilidade cross-restart;
- comparabilidade de Desempenho: permanece fail-closed enquanto não houver semântica oficial integrada;
- produção acadêmica continua desativada.

## Próxima onda — regra de tamanho

Somente depois do fechamento/deploy/smokes da #328: criar **2 a 4 frentes grandes, verticalmente coerentes, mais uma integradora**. Priorizar:

1. PDF/renderer canônico de Boletins como uma decisão grande única;
2. F9/hardening institucional agora que F4–F8 possuem massa funcional visível;
3. acabamento operacional/UX das experiências expostas;
4. durabilidade futura de snapshots/decisões apenas quando formalmente necessária.

Não abrir cadeias de microissues.

## Dependências atuais

```text
#325 ─┬─ #326 ─┬─ #327
      └────────┴───────> #328
#332 ─────────────────> #328
```

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. sem merge/deploy/provisionamento/`PROJECT_STATE.yaml` em frente comum;
7. integração apenas pela issue integradora.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
