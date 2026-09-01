# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração concluída:** [#264 — nona onda](https://github.com/mcpmieda/ecossistema-escola/issues/264)
- **Integração atual:** [#272 — décima onda](https://github.com/mcpmieda/ecossistema-escola/issues/272)
- **Sessão temporária serial:** [#273](https://github.com/mcpmieda/ecossistema-escola/issues/273)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Ondas concluídas:** primeira à nona.
- **Onda atual:** #269, #270 e #271; integração #272.
- **Armazenamento aprovado:** Cloudflare D1, conforme #200.
- **Produção:** nenhum D1 acadêmico, binding ou migration remota provisionado.
- **Saúde e limites:** #220 planejada no Centro de Administração.

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final pendente | 6/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Runtime/contexto local integrados | 5/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Núcleo e equivalência V1 completos | 7/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Núcleo/runtime local completos | 6/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Contexto 2026 integrado; centrais planejadas | 1/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada; elegibilidade integrada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Nona onda integrada

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#261](https://github.com/mcpmieda/ecossistema-escola/issues/261) | Runtime local/preview, capability administrativa, runner e rotas `no-store` | #268 / `44bde4d` |
| [#262](https://github.com/mcpmieda/ecossistema-escola/issues/262) | Contexto 2026 único e ano/configuração versionados localmente | #267 / `4584af4` |
| [#263](https://github.com/mcpmieda/ecossistema-escola/issues/263) | Equivalência anual explicável, sem trocar autoridade | #266 / `94535a9` |

## Décima onda — pronta

| Ordem serial | Issue | Entrega | Agente recomendado |
|---:|---:|---|---|
| 1 | [#269](https://github.com/mcpmieda/ecossistema-escola/issues/269) | Repositório D1 local de oito entidades acadêmicas | **Codex** |
| 2 | [#270](https://github.com/mcpmieda/ecossistema-escola/issues/270) | Repositório D1 local de lotes e versões por fonte lógica | **Codex** |
| 3 | [#271](https://github.com/mcpmieda/ecossistema-escola/issues/271) | Repositório D1 local de ocorrências e reconciliações | **Codex** |
| 4 | [#272](https://github.com/mcpmieda/ecossistema-escola/issues/272) | Composição, integração, verificação e próxima onda | **Pro**; Codex High somente pela #273 |

As implementações têm caminhos disjuntos. A #272 fará a composição final com o `academic-year` da #262, operações de fonte existentes, registros acadêmicos e associações já integrados.

## Sessão temporária #273

A #273 preserva o processo oficial, mas permite uma única sessão do Codex 5.6 High executar a fila em série:

```text
#269 → #270 → #271 → #272
```

Cada issue mantém branch, PR, `npm run verify` e handoff próprios. A integração mantém revisão, merges, PR de estado, deploy e criação da onda seguinte. Hard stops interrompem antes de recursos remotos, dados reais, mudança de autoridade, migration destrutiva ou decisão humana nova.

## Dependências principais

```text
#261 + #262 + #263 ──> integração #264
                              ↓
#269 + #270 + #271 ──> integração #272
                              ↓
                     décima primeira onda
```

## Estado do D1

Integrado localmente:

- migrations 0001–0003;
- 21 tabelas;
- leitura/escrita de contexto, fonte, registros e associações;
- promoção atômica com CAS, savepoints e rollback;
- runtime local/preview, runner e autorização administrativa.

Não integrado em produção:

- banco ou binding remoto;
- migrations remotas;
- persistência acadêmica do site;
- backup/rollout;
- métricas reais de Saúde e limites.

## Gates manuais

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes do fechamento definitivo da F1;
- concluir smoke autenticado do hash completo, etapa transitória e falha isolada.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Como iniciar um agente

No fluxo comum:

1. entregue somente uma issue marcada `[PRONTA]`;
2. use o agente indicado na tabela;
3. exija leitura de `AGENTS.md`, documentação e contratos;
4. execute diretamente, sem App Factory ou agentes auxiliares;
5. mantenha uma branch e um PR por issue;
6. execute `npm run verify` e registre o handoff;
7. não faça merge, deploy, provisionamento ou alteração de `PROJECT_STATE.yaml`.

Na sessão temporária, entregue uma única vez a issue #273 ao Codex 5.6 High.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```
