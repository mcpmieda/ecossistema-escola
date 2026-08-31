# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado operacional detalhado e legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml).

## Visão geral

- **Issue principal:** [#182 — Programa de construção do Banco de Notas](../../issues/182)
- **Coordenação da onda:** [#203 — Integração da primeira onda](../../issues/203)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Fase atual:** F0 concluída; primeira onda de desenvolvimento pronta.
- **Agentes que podem começar agora:** 3, cada um em uma issue independente.
- **Decisão humana pendente, sem bloquear a primeira onda:** [#200 — armazenamento físico](../../issues/200).

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](../../issues/183) | Publicada | 7/7 | Sem mudança funcional; base para agentes |
| F1 — Fonte e importação | [#184](../../issues/184) | Em construção parcial | 1/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](../../issues/185) | Planejada | 0/6 | Lotes/dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](../../issues/186) | Planejada | 0/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](../../issues/187) | Planejada | 0/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](../../issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](../../issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](../../issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](../../issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](../../issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Primeira onda — pronta para agentes

As três issues abaixo escrevem em áreas diferentes e podem ser executadas em paralelo:

1. [#193 — Congelar `SourceContractV1` e os tipos da origem](../../issues/193)
   - Fase: F1.
   - Caminhos: `shared/gradebook-contracts/source/**` e testes próprios.
   - Não altera o site.

2. [#194 — Congelar contratos das entidades acadêmicas V1](../../issues/194)
   - Fase: F2.
   - Caminhos: `shared/gradebook-contracts/entities/**` e testes próprios.
   - Não escolhe nem provisiona banco.

3. [#195 — Modularizar o importador atual sem regressão](../../issues/195)
   - Fase: F1.
   - Caminhos: `src/features/gradebook/import/**`, arquivos atuais do importador e testes próprios.
   - Deve preservar o comportamento publicado.

O integrador acompanha esses três trabalhos em [#203](../../issues/203), revisa contratos, faz merges, verifica o deploy e libera a próxima onda. Essa issue não deve ser atribuída a um agente de implementação comum.

## Próxima onda — bloqueada de forma explícita

| Issue | Liberação necessária |
|---:|---|
| [#196 — contratos de lançamentos/resultados](../../issues/196) | #193 + #194 |
| [#197 — contratos de lote/reconciliação/Auditoria](../../issues/197) | #193 + #194 + #196 |
| [#198 — fixtures sintéticas e validação real](../../issues/198) | #193; integração final considera #195 |
| [#199 — manifesto SHA-256/proveniência](../../issues/199) | #193 + #195 + #197 |
| [#201 — interpretação semântica nativa](../../issues/201) | #193 + #194 + #196 |

## Decisão pendente

[#200 — Escolher o armazenamento físico da base acadêmica](../../issues/200) não bloqueia contratos nem a modularização inicial. Ela deve ser resolvida antes de migrations e persistência concreta. A recomendação registrada é Cloudflare D1, mas nenhum recurso será criado sem confirmação explícita.

## Dependências principais

```text
#193 SourceContractV1 ─┬─> #196 Resultados V1 ─┬─> #197 Lote/Auditoria V1 ─> #199 Manifesto
                       │                       └─> F4 Reconciliação/Auditoria
                       ├─> #198 Fixtures
                       └─> #201 Semântica nativa

#194 Entidades V1 ─────┴─> #196 Resultados V1 ─> F3 Motor / F5 Centrais / F6 Desempenho

#195 Modularização ───────> #198 Testes finais do módulo / #199 Manifesto

#200 Decisão de armazenamento ─> persistência física da F2

#203 Integrador ──────────> revisão, merge, deploy, estado e liberação da próxima onda
```

## Como iniciar um agente

Entregue ao agente somente uma issue marcada `[PRONTA]` e instrua-o a:

1. ler `AGENTS.md` e `docs/gradebook/`;
2. trabalhar apenas nos caminhos declarados;
3. criar branch curta e PR para `main`;
4. executar `npm run verify`;
5. publicar o handoff na própria issue;
6. não fazer merge, deploy ou alterar `PROJECT_STATE.yaml`.

O integrador revisa contratos, faz o merge, acompanha o deploy e atualiza este mapa.

## Critério de publicação

Uma entrega funcional independente segue:

```text
issue → branch → PR → validação → merge na main → Cloudflare Pages → verificação → Publicada
```

Uma entrega interna pode ser integrada sem mudar visualmente o site, desde que preserve a produção e libere com segurança a próxima onda. Recursos incompletos não devem aparecer como disponíveis.

## Pesquisas rápidas no GitHub

- Issues do programa: `is:issue is:open [BN]`
- Prontas: `is:issue is:open [BN] [PRONTA]`
- Bloqueadas: `is:issue is:open [BN] [BLOQUEADA]`
- Decisões: `is:issue is:open [BN] [DECISÃO]`
