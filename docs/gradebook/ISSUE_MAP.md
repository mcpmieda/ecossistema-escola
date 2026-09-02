# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Onda 16:** #325/#326/#327 + desbloqueio #332 → integração #328
- **Onda 17:** #335 PDF + #336 F9 → integração #337
- **Próxima onda:** #340, #341 e #342 → integração #343
- **Armazenamento físico atual:** Cloudflare D1 local/preview
- **Produção acadêmica:** sem D1 remoto, binding, migration remota ou ativação de consultas
- **Autoridade:** `imported-source`
- **Autorização acadêmica:** `gradebook.persistence.admin`, server-side

## Fases — estado funcional

| Fase | Issue | Estado após onda 17 | Próximo grande passo |
| --- | ---: | --- | --- |
| F0 Fundação | #183 | concluída | manutenção |
| F1 Fonte/importação | #184 | **concluída/validada 7/7** | manutenção |
| F2 Persistência | #185 | D1 local V1 + UoW/runtime | #340 durabilidade F7/F8; produção fechada |
| F3 Motor | #186 | núcleo/equivalência V1 | sem mudança de autoridade |
| F4 Auditoria | #187 | HTTP/UI local-preview + F9 | reports #342 |
| F5 Centrais | #188 | Operational Workspace hardened + lazy | manutenção |
| F6 Desempenho | #189 | HTTP/UI local-preview + lazy | reports #342; comparison segue fail-closed |
| F7 Conselho | #190 | V1 operacional + projeção oficial + histórico/CAS local | #340 durabilidade + #341 fechamento V2 |
| F8 Boletins | #191 | preview/emissão/lote/snapshot/reprint + PDF individual canônico | #340 durabilidade + #342 reports/batch artifacts |
| F9 Piloto/segurança | #192 | primeiro hardening institucional integrado | piloto/ativação continuam futuros e explícitos |

## F1

#184 está `completed`, F1 = **7/7**. Protocolo privado controlado, smoke autenticado e falha isolada passaram; arquivos reais modificados 0, dados identificáveis publicados 0, gates históricos antigos restantes 0.

## Ondas 13–15 — fundação das superfícies

- #293–#297: contratos amplos de Operational/Audit/Performance/Bulletins;
- #302–#306: implementação provider-independent e primeira composição;
- #314–#318: Audit HTTP/UI, fonte Performance, hardening Bulletin/Operational e integração da onda 15.

## Onda 16 — end-to-end F6/F7/F8

| Frente | Issue / PR | Entrega |
| --- | --- | --- |
| F6 | #325 / #329 | Performance Transport/HTTP/UI |
| F8 | #326 / #331 | Boletins preview/emissão/lote/snapshots/history/reprint |
| F7 | #327 / #330 | Council Workspace/Decision V1 |
| Fundação | #332 / #333 | projeção anual oficial upstream do Conselho |
| Integração | #328 / #334 | wiring central, runtime, docs |

Invariantes preservadas: cinco bridges únicos; Performance comparison fail-closed; Council sem recálculo no workspace; reprint Bulletin snapshot-only; produção antes do binding.

## Onda 17 — PDF canônico + F9

| Frente | Issue / PR | Entrega |
| --- | --- | --- |
| A | #335 / #338 | PDF oficial client-side/lazy somente de `BulletinSnapshotV1` |
| B | #336 / #339 | shell/5 superfícies lazy, isolamento, segurança/storage/a11y, zero requests automáticos na entrada |
| Integração | #337 | deep-link por área, testes combinados, docs/deploy |

Merges das frentes:

```text
#338 → 6fa35b845cfcb22f606a6aa50088695857eb85d5
#339 → 4d49ef3f9744934b97a2a3ff53a1971c0100a8e3
```

A #336 precisou ser recomposta sobre #338 porque apenas dois testes compartilhados colidiam. O head combinado foi revalidado no workflow `33590936931`: **100 arquivos / 819 testes** verdes.

### Bundle combinado

- baseline pós-#328: 820,68 kB / 235,71 kB gzip de JS inicial;
- entry combinado: 552,28 / 167,15 kB gzip;
- caminho inicial conservador com shared `alert`: 661,25 / 202,82 kB gzip;
- renderer PDF lazy: 9,71 / 3,81 kB gzip;
- bulletin page lazy: 31,34 / 8,20 kB gzip;
- warning >500 kB permanece no entry, registrado como limitação mensurada.

### Invariantes pós-onda 17

- exatamente um bridge Operational/Audit/Performance/Bulletins/Council;
- auth server-side, `gradebook.persistence.admin`, no-store;
- produção fail-closed antes de `GRADEBOOK_D1`;
- zero browser persistent storage acadêmico;
- zero requests acadêmicos automáticos ao entrar no Banco;
- rota + cinco superfícies lazy e isoladas;
- busca pode abrir uma área via `#/banco-de-notas?area=<id>` sem bridge/rota nova;
- PDF oficial: snapshot → renderer; reprint PDF snapshot histórico → renderer;
- nenhum fetch/cálculo acadêmico no renderer;
- PDF individual/raster; sem PDF batch nesta versão;
- snapshots e decisões ainda não possuem durabilidade cross-restart;
- Performance comparison continua `not-comparable` sem resolvedor oficial.

## Onda 18 — grandes passos

As três frentes podem começar após #337 concluída:

1. **#340 — Durabilidade F7/F8 / Codex Max**: migration/local D1 + repositories duráveis para snapshots e decisões, CAS, restart/reinstanciação; sem produção.
2. **#341 — Conselho V2 / Extra Alto**: fechamento explícito da turma, fotografia imutável, histórico de fechamento e votação numérica somente onde a semântica documentada for suficiente; desempate sem identidade oficial de diretor permanece fail-closed.
3. **#342 — Relatórios F8 / Extra Alto**: workspace de relatórios oficiais + artefatos PDF em lote bounded quando seguro, sem novo motor acadêmico.
4. **#343 — Integração / Extra Alto**: compõe as três frentes, verify/deploy/docs; bloqueada até todas ficarem verdes.

```text
#340 ─┐
#341 ─┼──> #343
#342 ─┘
```

## Limitações atuais

- snapshots de Boletins e decisões de Conselho: local/process-preview, sem durabilidade cross-restart até #340;
- PDF: individual e raster, não tagged/text-selectable; batch fica para #342 se seguro;
- Conselho: fechamento institucional/V2 pendente #341; identidade formal de diretor não pode ser inventada;
- comparabilidade de Performance: fail-closed;
- produção acadêmica: desativada; nenhum binding/migration remoto.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. sem merge/deploy/provisionamento/`PROJECT_STATE.yaml` em frente comum;
7. integração somente pela issue integradora.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
