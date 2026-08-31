# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#221 — quarta onda](https://github.com/mcpmieda/ecossistema-escola/issues/221)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #199, #218 e #219, simultaneamente.
- **Ondas concluídas:** primeira, segunda e terceira.
- **Armazenamento aprovado:** Cloudflare D1 pela [#200](https://github.com/mcpmieda/ecossistema-escola/issues/200).
- **Planejamento global futuro:** [#220 — Saúde e limites no Centro de Administração](https://github.com/mcpmieda/ecossistema-escola/issues/220).

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Em construção | 5/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 3/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Em construção | 1/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Em construção | 1/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Entregas concluídas

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#193](https://github.com/mcpmieda/ecossistema-escola/issues/193) | Esquema `SourceContractV1` | #207 / `83d7bf4` |
| [#194](https://github.com/mcpmieda/ecossistema-escola/issues/194) | Entidades acadêmicas V1 | #208 / `466717b` |
| [#195](https://github.com/mcpmieda/ecossistema-escola/issues/195) | Importador modularizado | #209 / `17ba8b1` |
| [#196](https://github.com/mcpmieda/ecossistema-escola/issues/196) | Lançamentos e resultados acadêmicos V1 | #212 / `6b8eb4c` |
| [#198](https://github.com/mcpmieda/ecossistema-escola/issues/198) | Fixtures sintéticas e protocolo privado | #213 / `32450ac` |
| [#197](https://github.com/mcpmieda/ecossistema-escola/issues/197) | Lote, manifesto, reconciliação e Auditoria V1 | #216 / `0f1ba62` |
| [#201](https://github.com/mcpmieda/ecossistema-escola/issues/201) | Interpretação semântica nativa das células | #217 / `9476f84` |
| [#200](https://github.com/mcpmieda/ecossistema-escola/issues/200) | Decisão: Cloudflare D1 | decisão concluída |

O código da terceira onda foi publicado pelo deploy `33424938206`.

## Onda 4 — pronta para agentes

As três issues abaixo escrevem em áreas separadas e podem ser executadas ao mesmo tempo:

1. [#199 — manifesto SHA-256 e proveniência](https://github.com/mcpmieda/ecossistema-escola/issues/199)
   - Feature de importação e testes próprios.
   - Resultado visível: hash/manifesto, etapas de progresso e diagnóstico por arquivo.
   - Não persiste nem envia bytes.

2. [#218 — arredondamento acadêmico nativo V1](https://github.com/mcpmieda/ecossistema-escola/issues/218)
   - Regra pura e testes próprios.
   - Cobre limites 0,24/0,25/0,74/0,75 e negativos simétricos.
   - Não compõe notas nem altera autoridade.

3. [#219 — portas de persistência e transação V1](https://github.com/mcpmieda/ecossistema-escola/issues/219)
   - Portas do domínio e testes de contrato.
   - Não cria D1, SQL, binding ou migrations.
   - Prepara transações, versionamento, idempotência e consultas paginadas.

O integrador acompanha as três entregas em [#221](https://github.com/mcpmieda/ecossistema-escola/issues/221).

## Próxima onda — dependências conhecidas

| Tarefa | Liberação necessária |
|---|---|
| Composição trimestral nativa | #218 integrada e issue pequena criada pela #221 |
| Esquema e migrations D1 | #219 integrada e issue própria criada pela #221 |
| Idempotência/versionamento persistente | #199 + #219 integradas |
| Recuperação paralela/final | composição trimestral e arredondamento integrados |

## Dependências principais

```text
#193 + #194 ──> #196 ──> #197 e #201
#197 + #195 ──> #199
#201 ─────────> #218
#200 + contratos ──> #219

Onda 1 ──> integração #203
Onda 2 ──> integração #210
Onda 3 ──> integração #214
Onda 4 ──> integração #221
```

## Decisões D1 e reimportação

- D1 é o armazenamento físico aprovado, acessado somente pelo backend.
- O domínio continua independente por portas.
- Nome do arquivo não é identidade permanente.
- Mesmo hash renomeado é o mesmo conteúdo.
- Arquivo atualizado gera comparação incremental; somente valores novos/alterados criam versões.
- Histórico anterior nunca é apagado.
- Nenhum banco/binding/migration de produção é criado sem issue própria.

## Gate manual da fonte

A #198 entregou a massa sintética e `REAL_DATA_VALIDATION.md`. A execução controlada com o corpus real continua pendente antes do fechamento definitivo da F1. Esse gate não bloqueia a onda 4 e não permite publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Saúde e limites

A #220 permanece **Planejada**. O painel ficará em `Centro de Administração → Configurações → Saúde e limites`, porque quotas e consumo pertencem ao ambiente inteiro. Ele só será liberado quando existirem D1/bindings e backend de métricas.

## Como iniciar um agente

Entregue ao agente somente uma issue marcada `[PRONTA]` e instrua-o a:

1. ler `AGENTS.md` e `docs/gradebook/`;
2. executar a tarefa diretamente, sem App Factory ou agentes auxiliares;
3. trabalhar apenas nos caminhos declarados;
4. criar branch curta e PR para `main`;
5. executar `npm run verify`;
6. publicar o handoff na própria issue;
7. não fazer merge, deploy ou alterar `PROJECT_STATE.yaml`.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```

Entregas internas podem não produzir mudança visual, mas devem preservar o site e liberar a próxima dependência de forma verificável.
