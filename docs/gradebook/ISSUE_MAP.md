# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração concluída pela onda atual:** [#297 — décima terceira onda](https://github.com/mcpmieda/ecossistema-escola/issues/297)
- **Próxima integração planejada:** [#306](https://github.com/mcpmieda/ecossistema-escola/issues/306)
- **Sessão temporária histórica:** [#273](https://github.com/mcpmieda/ecossistema-escola/issues/273), sem fila paralela nova
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Ondas contratuais/fundacionais concluídas:** primeira à décima terceira
- **Próxima onda:** #302, #303, #304 e #305 em paralelo depois da liberação da #297; integração #306 depois das quatro
- **Armazenamento aprovado:** Cloudflare D1, conforme #200
- **Produção:** nenhum D1 acadêmico, binding ou migration remota provisionado
- **Saúde e limites:** #220 planejada no Centro de Administração

## Fases

| Fase                           |                                                             Issue | Estado                                                        | Progresso objetivo | Resultado esperado no site             |
| ------------------------------ | ----------------------------------------------------------------: | ------------------------------------------------------------- | -----------------: | -------------------------------------- |
| F0 — Fundação e coordenação    | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada                                                     |                7/7 | Base para agentes                      |
| F1 — Fonte e importação        | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final privada pendente                              |                6/7 | Importação confiável e rastreável      |
| F2 — Modelo e persistência     | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Persistência local V1 completa e composta                     |                6/6 | Dados disponíveis após recarregar      |
| F3 — Motor nativo              | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Núcleo e equivalência V1 completos                            |                7/7 | Comparação fonte × cálculo nativo      |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Contrato de workspace integrado; implementação local #303     |                6/7 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais       | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Contrato operacional integrado; experiência local #302        |                7/8 | Aluno, turma, professor e componente   |
| F6 — Desempenho                | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Contrato V1 integrado; read model executável #304             |                0/6 | Matriz analítica da turma              |
| F7 — Conselho                  | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada; elegibilidade integrada                            |                0/7 | Fluxo operacional do Conselho          |
| F8 — Boletins e relatórios     | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Contrato V1 integrado; emissão provider-independent #305      |                0/6 | Prévia, PDF, versões e relatórios      |
| F9 — Piloto e produção         | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal                                         |                0/7 | Operação institucional validada        |

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

|                                                             Issue | Entrega                                      | PR/merge         |
| ----------------------------------------------------------------: | -------------------------------------------- | ---------------- |
| [#278](https://github.com/mcpmieda/ecossistema-escola/issues/278) | Read model local da Central do Aluno         | #283 / `1e79af0` |
| [#279](https://github.com/mcpmieda/ecossistema-escola/issues/279) | Read model local da Central da Turma         | #284 / `5483fe5` |
| [#280](https://github.com/mcpmieda/ecossistema-escola/issues/280) | Read models locais de Professor e Componente | #285 / `3dd300f` |
| [#281](https://github.com/mcpmieda/ecossistema-escola/issues/281) | Fachada única, integração e próxima onda     | #289             |

## Décima segunda onda integrada

|                                                             Issue | Entrega                                                             | PR/merge          |
| ----------------------------------------------------------------: | ------------------------------------------------------------------- | ----------------- |
| [#286](https://github.com/mcpmieda/ecossistema-escola/issues/286) | Contrato V1 da pesquisa global acadêmica autorizada                 | #290 / `d9640db`  |
| [#287](https://github.com/mcpmieda/ecossistema-escola/issues/287) | Read model local da pesquisa sobre `AcademicEntityRepositoryV1`     | #291 / `9e17abb`  |
| [#288](https://github.com/mcpmieda/ecossistema-escola/issues/288) | Fachada operacional, runtime autorizado, verificação e próxima onda | #292              |

A pesquisa foi composta na mesma fachada dos quatro centros e só é obtida por `GradebookD1RuntimeV1.operationalReadModels()` depois da autorização opaca existente. Produção continua bloqueada antes do binding e não existe endpoint ou UI acadêmica nesta onda.

## Décima terceira onda integrada — contratos amplos

| Frente |                                                             Issue | Entrega contratual                                               | PR / merge          |
| :----: | ----------------------------------------------------------------: | ---------------------------------------------------------------- | ------------------- |
| A | [#293](https://github.com/mcpmieda/ecossistema-escola/issues/293) | Experiência operacional F5: ano, navegação, pesquisa e estados   | #298 / `8452199` |
| B | [#294](https://github.com/mcpmieda/ecossistema-escola/issues/294) | Workspace F4: lotes, ocorrências, reconciliações e resolução     | #301 / `a78e410` |
| C | [#295](https://github.com/mcpmieda/ecossistema-escola/issues/295) | Desempenho F6: matriz, quatro lentes, cobertura e comparabilidade | #299 / `706426b` |
| D | [#296](https://github.com/mcpmieda/ecossistema-escola/issues/296) | F8: `BulletinModelV1`, emissão, snapshots e reimpressão           | #300 / `e7b9298` |

A #297 integra e testa os quatro contratos conjuntamente. A compatibilidade preserva ano explícito, autorização no servidor, ausência sem zero fabricado, paginação opaca, `authorityMode: imported-source` e ausência de regra acadêmica concorrente. A correção final do PR #300 torna `imported-source` invariável também em todas as projeções internas do Boletim.

## Próxima onda — implementações grandes

As quatro issues abaixo foram criadas pela #297 e possuem caminhos reservados disjuntos. O título da issue determina se já está executável: o integrador as mantém `[BLOQUEADA]` até concluir merge, deploy e smokes da #297 e então as libera como `[PRONTA]`.

| Frente |                                                             Issue | Implementação | Executor | Integração |
| :----: | ----------------------------------------------------------------: | ------------ | -------- | ---------- |
| A | [#302](https://github.com/mcpmieda/ecossistema-escola/issues/302) | F5: experiência local/preview das Centrais, ano, pesquisa e HeroUI | **Extra Alto** | #306 |
| B | [#303](https://github.com/mcpmieda/ecossistema-escola/issues/303) | F4: workspace local/preview de Auditoria/revisão | **Codex GPT-5.6 Sol, esforço max** | #306 |
| C | [#304](https://github.com/mcpmieda/ecossistema-escola/issues/304) | F6: read model provider-independent de Desempenho | **Codex GPT-5.6 Sol, esforço max** | #306 |
| D | [#305](https://github.com/mcpmieda/ecossistema-escola/issues/305) | F8: emissão provider-independent de Boletins | **Codex GPT-5.6 Sol, esforço max** | #306 |

A [#306](https://github.com/mcpmieda/ecossistema-escola/issues/306) integra as quatro implementações depois de PRs verdes e SHAs fixados.

Não transformar essas frentes em microissues. Separar somente quando houver conflito real de caminho, contrato, persistência, renderização ou decisão arquitetural.

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
                                   ↓
#302 ─┬─ #303 ─┬─ #304 ─┬─ #305
      └────────┴────────┴──────> #306
```

## Estado do D1

Integrado localmente:

- migrations 0001–0003;
- 21 tabelas;
- leitura/escrita de contexto, entidades, fonte, lotes, registros, associações e Auditoria;
- uma única `PersistenceUnitOfWorkV1` local/preview;
- promoção atômica com CAS, savepoints e rollback;
- runtime local/preview, runner e autorização administrativa;
- quatro read models operacionais e pesquisa acadêmica pela mesma fachada;
- contratos V1 de experiência operacional, workspace de Auditoria, Desempenho e Boletins.

Não integrado em produção:

- banco ou binding remoto;
- migrations remotas;
- persistência ou consulta acadêmica do site;
- experiência operacional das Centrais consumindo os novos contratos;
- workspace funcional de Auditoria/revisão;
- matriz executável de Desempenho;
- emissão executável/PDF/persistência de snapshots;
- backup/rollout;
- métricas reais de Saúde e limites.

## Gates manuais

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes do fechamento definitivo da F1;
- concluir smoke autenticado do hash completo, etapa transitória e falha isolada.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar um agente

1. entregue somente uma issue marcada `[PRONTA]`;
2. use o executor indicado na tabela;
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