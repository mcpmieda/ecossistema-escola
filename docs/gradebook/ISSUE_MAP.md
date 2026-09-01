# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração concluída pela onda atual:** [#306](https://github.com/mcpmieda/ecossistema-escola/issues/306) / PR #319
- **Próxima integração planejada:** [#318](https://github.com/mcpmieda/ecossistema-escola/issues/318)
- **Sessão temporária histórica:** [#273](https://github.com/mcpmieda/ecossistema-escola/issues/273), sem fila paralela nova
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Ondas concluídas:** primeira à décima quarta
- **Próxima onda:** #314, #315, #316 e #317 em paralelo após a liberação da #306; integração #318 depois das quatro
- **Armazenamento aprovado:** Cloudflare D1, conforme #200
- **Produção:** nenhum D1 acadêmico, binding ou migration remota provisionado
- **Saúde e limites:** #220 planejada no Centro de Administração

## Fases

| Fase                           |                                                             Issue | Estado após onda 14                                           | Progresso objetivo | Resultado esperado no site             |
| ------------------------------ | ----------------------------------------------------------------: | -------------------------------------------------------------- | -----------------: | -------------------------------------- |
| F0 — Fundação e coordenação    | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada                                                      |                7/7 | Base para agentes                      |
| F1 — Fonte e importação        | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final privada pendente                               |                6/7 | Importação confiável e rastreável      |
| F2 — Modelo e persistência     | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Persistência local V1 completa e composta                      |                6/6 | Dados disponíveis após recarregar      |
| F3 — Motor nativo              | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Núcleo e equivalência V1 completos                             |                7/7 | Comparação fonte × cálculo nativo      |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Workspace interno composto; UI/HTTP local-preview em #314      |                7/8 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais       | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Operational Workspace local-preview integrado; hardening #317  |                8/9 | Aluno, turma, professor e componente   |
| F6 — Desempenho                | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Read model provider-independent; fonte física em lote #315     |                1/6 | Matriz analítica da turma              |
| F7 — Conselho                  | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada; elegibilidade integrada                             |                0/7 | Fluxo operacional do Conselho          |
| F8 — Boletins e relatórios     | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Emissão provider-independent; hardening/snapshots locais #316  |                1/6 | Prévia, PDF, versões e relatórios      |
| F9 — Piloto e produção         | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal                                          |                0/7 | Operação institucional validada        |

## Ondas fundacionais e contratuais anteriores

As ondas 1–12 estabeleceram fonte, contratos, motor nativo, equivalência, persistência D1 local, UoW, read models operacionais e pesquisa acadêmica autorizada. As referências de merge permanecem em `PROJECT_STATE.yaml`.

### Décima terceira onda — contratos amplos

| Frente |                                                             Issue | Entrega contratual                                               | PR / merge          |
| :----: | ----------------------------------------------------------------: | ---------------------------------------------------------------- | ------------------- |
| A | [#293](https://github.com/mcpmieda/ecossistema-escola/issues/293) | Experiência operacional F5: ano, navegação, pesquisa e estados   | #298 / `8452199` |
| B | [#294](https://github.com/mcpmieda/ecossistema-escola/issues/294) | Workspace F4: lotes, ocorrências, reconciliações e resolução     | #301 / `a78e410` |
| C | [#295](https://github.com/mcpmieda/ecossistema-escola/issues/295) | Desempenho F6: matriz, quatro lentes, cobertura e comparabilidade | #299 / `706426b` |
| D | [#296](https://github.com/mcpmieda/ecossistema-escola/issues/296) | F8: `BulletinModelV1`, emissão, snapshots e reimpressão           | #300 / `e7b9298` |

A #297/PR #309 integrou e testou os quatro contratos conjuntamente, preservando ano explícito, autorização no servidor, ausência sem zero fabricado, paginação opaca e `authorityMode: imported-source`.

## Décima quarta onda — implementações

| Frente | Issue | Implementação | PR / merge |
| :----: | ----: | ------------ | ---------- |
| A | [#302](https://github.com/mcpmieda/ecossistema-escola/issues/302) | F5: transporte, bridge local/preview, catálogo de anos e HeroUI | #312 / `af67eae` |
| B | [#303](https://github.com/mcpmieda/ecossistema-escola/issues/303) | F4: Audit Workspace + read-source D1 | #313 / `b488a88` |
| C | [#304](https://github.com/mcpmieda/ecossistema-escola/issues/304) | F6: read model provider-independent de Desempenho | #310 / `e919e18` |
| D | [#305](https://github.com/mcpmieda/ecossistema-escola/issues/305) | F8: emissão provider-independent de Boletins | #311 / `292cf17` |

A #306/PR #319 faz apenas a composição segura prevista:

- mantém o bridge único de #302;
- liga #303 internamente a `GradebookD1RuntimeV1`, mesma UoW/autorização, sem HTTP/UI;
- não cria adapter físico/runtime/endpoint para #304;
- não cria PDF, endpoint ou snapshot remoto para #305;
- mantém produção fail-closed antes do binding, `gradebook.persistence.admin` e `imported-source`.

## Próxima onda — hardening e fontes físicas

As quatro issues abaixo são pré-criadas como `[BLOQUEADA]` pela #306 e ficam `[PRONTA]` somente após deploy/smokes da integração.

| Frente |                                                             Issue | Implementação | Executor | Integração |
| :----: | ----------------------------------------------------------------: | ------------ | -------- | ---------- |
| A | [#314](https://github.com/mcpmieda/ecossistema-escola/issues/314) | F4: Audit Workspace HeroUI + HTTP local/preview | **Extra Alto** | #318 |
| B | [#315](https://github.com/mcpmieda/ecossistema-escola/issues/315) | F6: fonte física D1 em lote sem N+1 | **GPT-5.6 Sol, esforço máximo** | #318 |
| C | [#316](https://github.com/mcpmieda/ecossistema-escola/issues/316) | F8: hardening/materialização agregada e snapshots locais | **GPT-5.6 Sol, esforço máximo** | #318 |
| D | [#317](https://github.com/mcpmieda/ecossistema-escola/issues/317) | F5: evolução/hardening do Operational Workspace | **Extra Alto** | #318 |

A [#318](https://github.com/mcpmieda/ecossistema-escola/issues/318) integra as quatro depois de PRs verdes e SHAs fixados.

## Dependências principais

```text
#293 ─┬─ #294 ─┬─ #295 ─┬─ #296
      └────────┴────────┴──────> #297
                                   ↓
#302 ─┬─ #303 ─┬─ #304 ─┬─ #305
      └────────┴────────┴──────> #306
                                   ↓
#314 ─┬─ #315 ─┬─ #316 ─┬─ #317
      └────────┴────────┴──────> #318
```

## Estado do D1 e das superfícies

Integrado localmente:

- migrations 0001–0003, 21 tabelas;
- leitura/escrita completa e UoW única;
- promoção atômica com CAS/savepoints/rollback;
- runtime local/preview, runner e autorização administrativa;
- quatro read models operacionais e pesquisa acadêmica;
- Operational Workspace com um único bridge local/preview;
- Audit Workspace composto internamente no runtime;
- read model de Desempenho provider-independent;
- emissão de Boletins provider-independent e snapshots por porta/local de teste.

Não integrado em produção:

- banco ou binding D1 remoto;
- migrations remotas;
- persistência ou consulta acadêmica do site;
- Audit Workspace HTTP/UI;
- fonte física/runtime/endpoint/UI de Desempenho;
- PDF/endpoint/persistência remota de Boletins;
- backup/rollout acadêmico;
- métricas reais de Saúde e limites.

## Gates manuais

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes do fechamento definitivo da F1;
- concluir smoke autenticado do hash completo, etapa transitória e falha isolada.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar um agente

1. entregue somente uma issue marcada `[PRONTA]`;
2. use o executor indicado;
3. exija leitura de `AGENTS.md`, documentação e contratos;
4. execute diretamente, sem App Factory ou agentes auxiliares;
5. mantenha uma branch e um PR por issue;
6. execute `npm run verify` e registre o handoff;
7. não faça merge, deploy, provisionamento ou alteração de `PROJECT_STATE.yaml`.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```