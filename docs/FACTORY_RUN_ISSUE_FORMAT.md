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

## O que acontece nesta fase

Ao abrir/editar/reabrir uma issue válida:

1. o GitHub Actions valida o manifesto;
2. cria/aplica labels técnicas do Control Plane;
3. cria uma issue-filho para cada tarefa ainda inexistente;
4. reutiliza tarefas já materializadas quando o mesmo `run_id` + `task id` reaparece;
5. marca tarefas com human gate como `factory:human-required`;
6. comenta um resumo na issue pai.

Nesta fase nenhum provider externo é disparado automaticamente.

## Segurança

- máximo de 20 tarefas por Factory Run;
- IDs duplicados, dependências inexistentes e ciclos são rejeitados;
- providers e human gates são allowlisted;
- nenhuma credencial entra no manifesto;
- nenhum texto do manifesto é executado como shell;
- nenhuma tarefa materializada faz merge/deploy/ativação de produção;
- Banco de Notas permanece com sync desligado.

## Exemplo

Consulte `infra/factory/examples/banco-notas-pilot-issue.txt`.
