# Formato de issue — Factory Run

Uma Factory Run é iniciada por uma issue cujo título começa com:

```text
[Factory Run]
```

O corpo deve conter exatamente um manifesto JSON entre os marcadores:

```text
<!-- FACTORY_RUN_BEGIN -->
{ ... }
<!-- FACTORY_RUN_END -->
```

O workflow `Factory Control Plane` valida o manifesto antes de qualquer materialização.

## O que acontece

Ao abrir/editar/reabrir uma issue válida:

1. o GitHub Actions valida o manifesto;
2. cria/aplica labels técnicas do Control Plane;
3. cria uma issue-filho para cada tarefa ainda inexistente;
4. reutiliza tarefas já materializadas quando o mesmo `run_id` + `task id` reaparece;
5. reconcilia labels ausentes em tarefas reutilizadas;
6. marca tarefas com human gate como `factory:human-required`;
7. marca tarefas dependentes como `factory:waiting`;
8. para uma tarefa-raiz sem human gate que liste `jules` em `preferred_providers`, aplica `factory:provider:jules` e a label exata `jules`;
9. comenta um resumo na issue pai.

A label `jules` é uma solicitação de execução ao GitHub App do Jules. Ela não prova que o worker iniciou ou concluiu a tarefa. O repositório precisa estar previamente autorizado no Jules.

Tarefas dependentes nunca recebem `jules` nesta fase. Elas permanecem em `factory:waiting` até a futura etapa de reconciliation confirmar a conclusão das predecessoras.

## Segurança

- máximo de 20 tarefas por Factory Run;
- IDs duplicados, dependências inexistentes e ciclos são rejeitados;
- providers e human gates são allowlisted;
- Jules só é solicitado quando foi explicitamente listado pela tarefa;
- nenhuma credencial ou API key do Jules entra no manifesto;
- nenhum texto do manifesto é executado como shell;
- nenhuma tarefa materializada faz merge/deploy/ativação de produção;
- um trigger de provider não concede autoridade de merge ou produção;
- Codex não é fallback automático;
- Banco de Notas permanece com sync desligado.

## Exemplo

Consulte `infra/factory/examples/banco-notas-pilot-issue.txt`.
