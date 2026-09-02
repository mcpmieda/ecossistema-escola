# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Onda 18:** #340 + #341 + #342 → #343 / PR #352
- **Onda 19:** #353 + #354 + #355 → #356 / PR #362
- **Próximo ciclo:** #360 → #361
- **Armazenamento:** Cloudflare D1 local/preview, migrations 0001–0004 / 25 tabelas
- **Produção acadêmica:** sem D1 remoto, binding ou migration remota; consultas/persistência continuam desativadas
- **Autoridade ativa:** `imported-source`
- **Autoridade-alvo futura:** `native-engine`, separada em #347/F9
- **Autorização acadêmica:** `gradebook.persistence.admin`, server-side

## Fases após onda 19

| Fase | Issue | Estado | Próximo grande passo |
| --- | ---: | --- | --- |
| F0 Fundação | #183 | concluída | manutenção |
| F1 Fonte/importação | #184 | **concluída/validada 7/7** | manutenção |
| F2 Persistência | #185 | D1 local + durabilidade Bulletin/Council | produção somente por gate F9 |
| F3 Motor | #186 | V1 concluída, comparativa | futura autoridade via #347/F9 |
| F4 Auditoria | #187 | revisão autoritativa 7/7 concluída | fechar após #356 publicada |
| F5 Centrais | #188 | cadastro/confirmação docente + atribuições anuais concluídos | fechar após #356 publicada |
| F6 Desempenho | #189 | gráficos oficiais entregues; comparação proporcional bloqueada | decisão canônica de semântica |
| F7 Conselho | #190 | V2 institucional + decisões duráveis local/preview | gates residuais próprios |
| F8 Boletins/Relatórios | #191 | snapshots duráveis + PDF individual/batch + reports | produção em F9 |
| F9 Piloto/segurança | #192 | hardening integrado; readiness/piloto/produção/autoridade pendentes | #360 → #361 |

## Onda 19

| Frente | Issue / PR | Entrega |
| --- | --- | --- |
| F4 | #353 / #357 | revisão rastreável dos sete bullets do ROADMAP; nenhuma regra/taxonomia nova |
| F5 | #354 / #358 | Professor e atribuições anuais no bridge Operational existente, CAS e ano explícito |
| F6 | #355 / #359 | dois gráficos sobre percentual oficial importado; comparison permanece fail-closed |
| Integração | #356 / #362 | montagem F5 na superfície lazy, regressões combinadas, docs e publicação |

Merges das frentes:

```text
#357 → 1ca4db62c073073de3e251628eb658213cdcd77e
#358 → f7e4bd069b73d551362676789a4c87e157b3975d
#359 → 149efde8387d120a1f68225d095772dd16850e9f
```

### Invariantes pós-onda 19

- exatamente um bridge Operational/Audit/Performance/Bulletins/Reports/Council;
- auth server-side + `no-store`;
- produção fail-closed antes de `GRADEBOOK_D1`;
- zero browser persistent storage acadêmico;
- F5 usa a superfície Operational lazy existente e só ativa manutenção por ação humana;
- F6 gráficos usam somente `term-result.percentage.imported` e não criam agregações;
- F6 comparison continua `not-comparable` com `comparison-semantics-not-integrated`;
- nenhuma migration/schema na onda 19;
- `authorityMode` continua `imported-source`.

## F6 — hard stop remanescente

A #355 confirmou que a documentação/contratos atuais não autorizam escolher `basis`, `current`, `reference` ou tolerância para a comparação proporcional. Portanto #189 **não deve ser fechada por checklist**. Gráficos estão entregues; resta somente uma decisão canônica de semântica antes de implementar a comparação.

## Próximo ciclo — F9 readiness

1. **#360 / Extra Alto:** readiness, rollback/recuperação, protocolo privado de piloto e ensaios sintéticos, sem provisionamento ou ativação produtiva.
2. **#361 / Extra Alto:** integração/publicação inerte dessa preparação; o gate de piloto/produção continua manual.

A #347 permanece separada: nenhuma troca de autoridade ocorre até readiness/piloto, versionamento/vigência e autorização explícita.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. sem merge/deploy/provisionamento/`PROJECT_STATE.yaml` em frente comum;
7. integração somente pela issue integradora.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
