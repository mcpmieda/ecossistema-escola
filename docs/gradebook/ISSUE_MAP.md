# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#210 — segunda onda](https://github.com/mcpmieda/ecossistema-escola/issues/210)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #196 e #198, simultaneamente.
- **Primeira onda:** integrada e publicada.
- **Decisão pendente que não bloqueia a onda atual:** [#200 — armazenamento físico](https://github.com/mcpmieda/ecossistema-escola/issues/200).

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Em construção | 3/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 1/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Planejada | 0/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Planejada | 0/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Onda 1 — concluída

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#193](https://github.com/mcpmieda/ecossistema-escola/issues/193) | Esquema `SourceContractV1` integrado; validação definitiva segue em #198 | #207 / `83d7bf4` |
| [#194](https://github.com/mcpmieda/ecossistema-escola/issues/194) | Entidades acadêmicas V1 congeladas | #208 / `466717b` |
| [#195](https://github.com/mcpmieda/ecossistema-escola/issues/195) | Importador separado em módulos sem mudança intencional de comportamento | #209 / `17ba8b1` |

O conjunto foi publicado no Cloudflare Pages pelo run `33416970939`.

## Onda 2 — pronta para agentes

As duas issues abaixo escrevem em áreas diferentes e podem ser executadas ao mesmo tempo:

1. [#196 — contratos de lançamentos e resultados](https://github.com/mcpmieda/ecossistema-escola/issues/196)
   - Caminhos: `shared/gradebook-contracts/results/**` e testes próprios.
   - Não implementa cálculos nem altera UI.

2. [#198 — fixtures sintéticas e validação da fonte](https://github.com/mcpmieda/ecossistema-escola/issues/198)
   - Caminhos: fixtures/testes do Banco e protocolo de validação real.
   - Nunca adiciona dados reais ao Git.

O integrador acompanha os dois trabalhos em [#210](https://github.com/mcpmieda/ecossistema-escola/issues/210).

## Próxima onda — bloqueada de forma explícita

| Issue | Liberação necessária |
|---:|---|
| [#197 — lote/reconciliação/Auditoria](https://github.com/mcpmieda/ecossistema-escola/issues/197) | #196 integrada |
| [#201 — semântica nativa das células](https://github.com/mcpmieda/ecossistema-escola/issues/201) | #196 integrada |
| [#199 — manifesto SHA-256/proveniência](https://github.com/mcpmieda/ecossistema-escola/issues/199) | #197 integrada; #195 já concluída |

## Dependências principais

```text
#193 + #194 ──> #196 ──> #197 e #201, simultaneamente
#193 + #195 ──> #198
#197 + #195 ──> #199

Onda 1 ──> integração #203 ──> Onda 2
Onda 2 ──> integração #210 ──> Onda 3
```

## Decisão pendente

[#200](https://github.com/mcpmieda/ecossistema-escola/issues/200) deve ser respondida antes de migrations e persistência concreta. A recomendação registrada é Cloudflare D1, mas nenhum recurso será provisionado sem confirmação explícita.

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
