# Banco de Notas — Handoff

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

## Ponto exato de retomada

A fundação está consolidada. O D1 remoto de homologação está validado até a migration `0007`; analyzer e serializer OOXML são reais; o GitHub Control Plane comprovou `banco-notas-readiness` no Microsoft 365; o ciclo D1 → Graph do modelo docente está implementado e verde em CI.

O próximo bloqueio não é mais "conseguir autenticar o GitHub no Microsoft 365". Agora é operacional: resolver o parent/pasta de homologação dentro da biblioteca institucional escolhida e executar o primeiro round-trip real do adapter runtime sem tocar produção ou habilitar sync.

Checkpoint operacional: `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`.

Evidência deste bloco: `docs/BANCO_NOTAS_M365_READINESS_E_D1_GRAPH_LIFECYCLE_2026-08-26.md`.

## D1 remoto

Database exclusivo: `banco-notas-homologation`.

Evidência mais recente do bloco de identidade:

- workflow `Banco de Notas D1 homologation`;
- run `32981705701` — **success**;
- commit validado: `2467240b53bf3bbc5996905ba940b544cb35f266`;
- CI correspondente `32981711631` — **success**;
- migrations `0001`–`0007` comprovadas;
- produção skipped;
- sync final desligado.

A `0007` protege o futuro sync com identidade institucional e Entra OID.

## Importação XLSX e modelo genérico

O analyzer e o serializer OOXML XLSX são concretos. Não retomar a partir da hipótese antiga de que faltam.

```text
XLSX legado
→ analyzer OOXML real
→ LegacyIntermediateModel
→ relationship resolution
→ TransformationPlan
→ GenericModelInstance
→ apresentação canônica
→ XLSX OOXML novo
```

O produto definitivo continua sendo um **modelo genérico limpo**, independente de professor, turma, aba, disciplina ou célula privada.

XLSB permanece fail-closed.

## Golden masters

Os **golden masters privados externos** continuam somente como evidência privada de homologação/regressão. Não são template oficial, seed, fixture pública, fallback, runtime, dado D1 ou arquivo de distribuição.

Nunca introduzir regra de produção dependente de arquivo/pessoa específica.

## Microsoft 365 / GitHub Control Plane

A integração criada no ecossistema foi reaproveitada e já elimina a necessidade de uma infraestrutura administrativa paralela para o Banco.

Workflow `M365 operations`:

- run `33003875460` / `#3` — **success**;
- operação `banco-notas-readiness`;
- GitHub OIDC → Entra workload federation — success;
- audience — válida;
- `Sites.Selected` — presente;
- acesso ao site — válido;
- `13` listas e `4` drives visíveis;
- D1 confirmado como fonte estruturada/transacional;
- SharePoint/OneDrive confirmados como boundary de arquivos;
- `syncActivation=not-performed`;
- `writeOperation=false`.

Essa evidência é read-only. Ela valida o canal operacional GitHub → Microsoft 365, não o round-trip do runtime Graph do Banco.

## SharePoint / OneDrive

No site `CENTROADMIN` foram confirmadas:

- `Documentos`;
- `ARQUIVOS_PLATAFORMA`;
- `SNAPSHOTS_PLATAFORMA`;
- `RELATORIOS_PLATAFORMA`.

`ARQUIVOS_PLATAFORMA` é o candidato institucional para os modelos/arquivos do Banco.

Não hardcodar o ID descoberto. O adapter continua recebendo `BANCO_NOTAS_GRAPH_DRIVE_ID` e `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID` por configuração e deve falhar fechado se estiverem ausentes.

Ainda não criar pasta nem gravar arquivo até o round-trip de homologação ser executado conscientemente.

## Ciclo D1 → Graph

Novos componentes principais:

- `server/banco-notas/d1-teacher-model-repository.ts`;
- `server/banco-notas/teacher-model-share-service.ts`;
- `server/banco-notas/teacher-model-graph.ts`;
- `server/banco-notas/teacher-model-graph-gateway.ts`;
- `tests/banco-notas-teacher-model-share-service.test.ts`;
- `tests/banco-notas-teacher-model-graph.test.ts`;
- `tests/banco-notas-teacher-model-graph-roundtrip.test.ts`.

Fluxo:

```text
validated no D1
→ professor ativo + Entra OID + homologation + sync=false
→ ready_to_share
→ hash local validado antes do upload
→ Graph store/share
→ metadata/download
→ hash dos bytes baixados
→ reanálise OOXML
→ shared + drive_item_id
```

Garantias:

- versão e mappings entram atomicamente no D1;
- retry idempotente do mesmo modelo;
- candidato precisa bater com hash/definitionVersion/mappingVersion persistidos;
- hash local divergente não chama Graph `store`;
- compartilhamento exige sign-in e valida Entra OID do destinatário;
- falha após upload executa revoke/delete quando aplicável;
- falha mantém o modelo `ready_to_share`;
- sucesso só é registrado após download, hash e reanálise.

## CI

Baseline do bloco de código:

- head `9959c6f143339c25e15fad7f50755339d4e47242`;
- run `33005219880` / `#762` — **success**;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **294/294 em 54 arquivos**;
- build — success;
- Actions security — success;
- deploy/recovery de produção — skipped.

O warning de bundle acima de 500 kB continua não bloqueador.

## Entra / add-in

O validador bearer Entra é fail-closed para assinatura, issuer, tenant, audience, scope e lifetime.

A migration `0007` e o authorizer D1 exigem ownership `teacherModelId ↔ teacher ↔ entraObjectId`.

O endpoint público continua bloqueado enquanto `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` não possuírem valores reais e homologados. Não inventar valores para avançar teste.

## Grade-events

`D1GradeEventStore` usa um único `D1Database.batch()` para evento + snapshot e possui prova local de rollback quando a segunda operação falha.

A prova remota por binding D1 real ainda depende de runtime Worker/Pages de homologação autorizado. Não ampliar permissões ou criar runtime temporário inseguro só para produzir evidência.

## Ordem recomendada de leitura

1. `AGENTS.md` e `.app-factory.json`;
2. `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`;
3. `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
4. `docs/BANCO_NOTAS_M365_READINESS_E_D1_GRAPH_LIFECYCLE_2026-08-26.md`;
5. `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`;
6. `server/banco-notas/d1-teacher-model-repository.ts`;
7. `server/banco-notas/teacher-model-share-service.ts`;
8. `server/banco-notas/teacher-model-graph.ts`;
9. `server/banco-notas/teacher-model-graph-gateway.ts`;
10. migrations `0001`–`0007`.

## Decisões que não podem regredir

- D1 é a fonte estruturada/transacional;
- SharePoint/OneDrive são arquivos/modelos;
- Graph é backend-only;
- sync nasce e permanece desligado;
- zero é diferente de ausência;
- fontes não se misturam silenciosamente;
- layout/mappings são versionados;
- `studentPosition` é canônico;
- `_BancoNotas` é aba interna reservada;
- analyzer/serializer não criam segunda regra paralela de células;
- XLSB continua fail-closed;
- golden masters privados não entram no produto;
- PR #52 permanece open + draft;
- não fazer merge ou deploy de produção sem autorização humana explícita.

## Próxima sequência segura

1. resolver/provisionar o parent item/pasta de homologação em `ARQUIVOS_PLATAFORMA` sem hardcode e sem ampliar privilégios;
2. executar o primeiro round-trip operacional Graph/SharePoint com arquivo sintético e limpeza garantida;
3. homologar audience/scope Entra reais antes de liberar add-in;
4. comprovar binding D1 real quando houver runtime homologado autorizado;
5. continuar módulos funcionais e QA navegável;
6. release somente após homologação end-to-end e decisão humana explícita.
