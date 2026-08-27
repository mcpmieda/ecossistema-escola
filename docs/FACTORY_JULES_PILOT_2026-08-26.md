# Evidência — piloto Jules multiagente — 26/08/2026

## Objetivo

Comprovar execução remota paralela e reconciliação de dependências antes de usar a Factory em módulos reais do Banco de Notas.

Nenhuma tarefa do piloto alterou aplicação, Banco de Notas, infraestrutura de produção ou sincronização.

## Factory Run

- parent: issue #64;
- run: `jules-worker-pilot-001`;
- worker A: issue #65;
- worker B: issue #66;
- verificação dependente: issue #67.

## Paralelismo comprovado

Depois da autorização do GitHub App do Jules, as labels `jules` de #65 e #66 foram reemitidas. O login oficial `google-labs-jules[bot]` confirmou duas tarefas remotas distintas em paralelo.

Resultados:

- #65 -> PR #69 -> somente `docs/factory-pilot/JULES_WORKER_A.md`;
- #66 -> PR #70 -> somente `docs/factory-pilot/JULES_WORKER_B.md`.

Os dois PRs passaram pelos gates obrigatórios antes de integração.

## Reconciliação

A issue #67 iniciou como `factory:waiting` com dependências `pilot-a` e `pilot-b`.

Após somente o primeiro predecessor, permaneceu bloqueada. Depois que os dois resultados estavam integrados com evidência válida, o workflow de reconciliação removeu `factory:waiting` e liberou a etapa seguinte.

Resultado dependente:

- #67 -> Jules -> PR #71 -> somente `docs/factory-pilot/JULES_WORKER_VERIFICATION.md`;
- CI completo verde;
- integração concluída.

## Descobertas do piloto

### 1. Trigger por label não é suficiente para automação total

Quando a label `jules` foi aplicada pelo ator humano/conector autorizado, o GitHub App respondeu. Quando a mesma label foi emitida pelo `github-actions[bot]`, o Jules não iniciou de forma confiável.

Decisão: novas Factory Runs usam a Jules REST API. A label fica apenas como compatibilidade legada.

### 2. PR criado por integração não garante novo CI `pull_request`

PRs gerados pelo Jules não dispararam o CI principal de forma confiável no primeiro evento. O piloto precisou reemitir o evento do PR para obter os checks.

Decisão: o runner v2 dispara explicitamente o workflow fixo `ci.yml` via `workflow_dispatch` para cada SHA de worker e novamente para a branch de integração consolidada.

### 3. Branch protection strict exige atualização contra a base

Depois que o PR #69 entrou, o PR #70 ficou atrás da base e os checks anteriores não bastaram para merge. A branch do segundo worker precisou incorporar a base atual e rodar CI novamente.

Decisão: o runner v2 sincroniza cada worker contra `factory/<run_id>` antes do CI e só integra se a branch de integração não mudou durante a validação.

## Arquitetura resultante

```text
Factory Run
  -> factory/<run_id>
  -> Jules API sessions (1..3)
  -> worker PRs
  -> path-scope verification
  -> sync with integration branch
  -> mandatory CI
  -> squash into factory/<run_id>
  -> dependent wave
  -> consolidated CI
  -> final draft PR
  -> human final gate
```

## Segurança comprovada/preservada

- nenhum merge automático na branch alvo;
- nenhum deploy de produção pelo worker;
- nenhuma ativação de sync;
- nenhum aumento de privilégios;
- PRs fora do escopo devem falhar antes de CI/merge;
- Codex não é fallback automático;
- GitHub permanece fonte de verdade durável.
