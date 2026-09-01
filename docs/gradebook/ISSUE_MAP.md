# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração concluída:** [#288 — décima segunda onda](https://github.com/mcpmieda/ecossistema-escola/issues/288)
- **Integração planejada:** [#297 — décima terceira onda](https://github.com/mcpmieda/ecossistema-escola/issues/297)
- **Sessão temporária histórica:** [#273](https://github.com/mcpmieda/ecossistema-escola/issues/273), sem fila paralela nova
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Ondas concluídas:** primeira à décima segunda
- **Onda atual:** #293, #294, #295 e #296 em paralelo; integração #297 depois das quatro
- **Armazenamento aprovado:** Cloudflare D1, conforme #200
- **Produção:** nenhum D1 acadêmico, binding ou migration remota provisionado
- **Saúde e limites:** #220 planejada no Centro de Administração

## Fases

| Fase                           |                                                             Issue | Estado                                                       | Progresso objetivo | Resultado esperado no site             |
| ------------------------------ | ----------------------------------------------------------------: | ------------------------------------------------------------ | -----------------: | -------------------------------------- |
| F0 — Fundação e coordenação    | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada                                                    |                7/7 | Base para agentes                      |
| F1 — Fonte e importação        | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final privada pendente                             |                6/7 | Importação confiável e rastreável      |
| F2 — Modelo e persistência     | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Persistência local V1 completa e composta                    |                6/6 | Dados disponíveis após recarregar      |
| F3 — Motor nativo              | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Núcleo e equivalência V1 completos                           |                7/7 | Comparação fonte × cálculo nativo      |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Núcleo/runtime local completos; contrato de workspace #294   |                6/7 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais       | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Read models e pesquisa locais completos; contrato de UI #293 |                7/8 | Aluno, turma, professor e componente   |
| F6 — Desempenho                | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Contrato amplo #295 pronto para iniciar                      |                0/6 | Matriz analítica da turma              |
| F7 — Conselho                  | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada; elegibilidade integrada                           |                0/7 | Fluxo operacional do Conselho          |
| F8 — Boletins e relatórios     | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Contrato amplo #296 pronto para iniciar                      |                0/6 | Prévia, PDF, versões e relatórios      |
| F9 — Piloto e produção         | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal                                        |                0/7 | Operação institucional validada        |

## Nona onda integrada

|                                                             Issue | Resultado                                                                   | PR/merge         |
| ----------------------------------------------------------------: | --------------------------------------------------------------------------- | ---------------- |
| [#261](https://github.com/mcpmieda/ecossistema-escola/issues/261) | Runtime local/preview, capability administrativa, runner e rotas `no-store` | #268 / `44bde4d` |
| [#262](https://github.com/mcpmieda/ecossistema-escola/issues/262) | Contexto 2026 único e ano/configuração versionados localmente               | #267 / `4584af4` |
| [#263](https://github.com/mcpmieda/ecossistema-escola/issues/263) | Equivalência anual explicável, sem trocar autoridade                        | #266 / `94535a9` |

## Décima onda integrada

|                                                             Issue | Entrega                                                  | PR/merge         |
| ----------------------------------------------------------------: | -------------------------------------------------------- | ---------------- |
| [#269](https://github.com/mcpmieda/ecossistema-escola/issues/269) | Repositório D1 local de oito entidades acadêmicas        | #275 / `57e7a98` |
| [#270](https://github.com/mcpmieda/ecossistema-escola/issues/270) | Repositório D1 local de lotes e versões por fonte lógica | #276 / `2f5ed83` |
| [#271](https://github.com/mcpmieda/ecossistema-escola/issues/271) | Repositório D1 local de ocorrências e reconciliações     | #277 / `79a2426` |
| [#272](https://github.com/mcpmieda/ecossistema-escola/issues/272) | UoW integral, integração e próxima onda                  | integração       |

## Décima primeira onda integrada

|                                                             Issue | Entrega                                      | PR/merge          |
| ----------------------------------------------------------------: | -------------------------------------------- | ----------------- |
| [#278](https://github.com/mcpmieda/ecossistema-escola/issues/278) | Read model local da Central do Aluno         | #283 / `1e79af0` |
| [#279](https://github.com/mcpmieda/ecossistema-escola/issues/279) | Read model local da Central da Turma         | #284 / `5483fe5` |
| [#280](https://github.com/mcpmieda/ecossistema-escola/issues/280) | Read models locais de Professor e Componente | #285 / `3dd300f` |
| [#281](https://github.com/mcpmieda/ecossistema-escola/issues/281) | Fachada única, integração e próxima onda     | #289             |

## Décima segunda onda integrada

|                                                             Issue | Entrega                                                            | PR/merge           |
| ----------------------------------------------------------------: | ------------------------------------------------------------------ | ------------------ |
| [#286](https://github.com/mcpmieda/ecossistema-escola/issues/286) | Contrato V1 da pesquisa global acadêmica autorizada                | #290 / `d9640db` |
| [#287](https://github.com/mcpmieda/ecossistema-escola/issues/287) | Read model local da pesquisa sobre `AcademicEntityRepositoryV1`    | #291 / `9e17abb` |
| [#288](https://github.com/mcpmieda/ecossistema-escola/issues/288) | Fachada operacional, runtime autorizado, verificação e próxima onda | #292             |

A pesquisa foi composta na mesma fachada dos quatro centros e só é obtida por `GradebookD1RuntimeV1.operationalReadModels()` depois da autorização opaca existente. Produção continua bloqueada antes do binding e não existe endpoint ou UI acadêmica nesta onda.

## Décima terceira onda — contratos amplos e paralelos

| Frente |                                                             Issue | Entrega contratual                                              | Agente | Dependência |
| :----: | ----------------------------------------------------------------: | ---------------------------------------------------------------- | ------ | ----------- |
|   A    | [#293](https://github.com/mcpmieda/ecossistema-escola/issues/293) | Experiência operacional F5: ano, navegação, pesquisa e estados  | **Pro** | #288        |
|   B    | [#294](https://github.com/mcpmieda/ecossistema-escola/issues/294) | Workspace F4: lotes, ocorrências, reconciliações e resolução    | **Pro** | #288        |
|   C    | [#295](https://github.com/mcpmieda/ecossistema-escola/issues/295) | Desempenho F6: matriz, quatro lentes, cobertura e comparabilidade | **Pro** | #288        |
|   D    | [#296](https://github.com/mcpmieda/ecossistema-escola/issues/296) | F8: `BulletinModelV1`, emissão, snapshots e reimpressão          | **Pro** | #288        |

Os caminhos de contrato e teste são disjuntos. Nenhuma issue edita `CONTRACTS.md`, `PROJECT_STATE.yaml`, UI, runtime ou contratos das outras frentes. Portanto, #293–#296 podem executar em paralelo depois da #288 integrada.

A [#297](https://github.com/mcpmieda/ecossistema-escola/issues/297) integra os quatro PRs, valida compatibilidade, atualiza a memória canônica e cria a onda de implementação seguinte. Ela não altera os contratos durante a integração.

## Bloqueios das implementações maiores

| Frente | Dependência ausente | Decisão necessária | Caminho conflitante | Menor próxima tarefa segura |
| ------ | ------------------- | ------------------ | ------------------ | --------------------------- |
| F5 UI | contrato servidor ↔ React | estados, ano e intenção de navegação sem rota acadêmica inventada | `src/platform/**` concentra shell/pesquisa/página | #293 |
| F4 workspace | contrato de lista/detalhe/resolução | superfície sem escrita ou promoção paralela | executor, repositórios e UI devem ficar separados | #294 |
| F6 Desempenho | `ClassPerformanceReadModelV1` congelado | lentes, cobertura e comparabilidade | UI não pode definir semântica/cálculo | #295 |
| F8 Boletins | `BulletinModelV1` e emissão versionada | mesma fonte para prévia/PDF e reimpressão | templates não calculam nem definem snapshot | #296 |

## Dependências principais

```text
#261 + #262 + #263 ──> #264
                         ↓
#269 + #270 + #271 ──> #272
                         ↓
#278 + #279 + #280 ──> #281
                         ↓
#286 ──> #287 ──> #288
                         ↓
#293 ─┬─ #294 ─┬─ #295 ─┬─ #296
      └────────┴────────┴──────> #297
```

## Estado do D1

Integrado localmente:

- migrations 0001–0003;
- 21 tabelas;
- leitura/escrita de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- uma única `PersistenceUnitOfWorkV1` local/preview;
- promoção atômica com CAS, savepoints e rollback;
- runtime local/preview, runner e autorização administrativa;
- quatro read models operacionais e pesquisa acadêmica pela mesma fachada.

Não integrado em produção:

- banco ou binding remoto;
- migrations remotas;
- persistência ou consulta acadêmica do site;
- backup/rollout;
- métricas reais de Saúde e limites.

## Gates manuais

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes do fechamento definitivo da F1;
- concluir smoke autenticado do hash completo, etapa transitória e falha isolada.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar um agente

1. entregue somente uma issue marcada `[PRONTA]`;
2. use o agente indicado na tabela;
3. exija leitura de `AGENTS.md`, documentação e contratos;
4. execute diretamente, sem App Factory ou agentes auxiliares;
5. mantenha uma branch e um PR por issue;
6. execute `npm run verify` e registre o handoff;
7. não faça merge, deploy, provisionamento ou alteração de `PROJECT_STATE.yaml`.

Não use a #273 como orquestrador paralelo.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```