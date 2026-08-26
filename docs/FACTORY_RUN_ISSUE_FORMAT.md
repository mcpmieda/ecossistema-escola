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

O workflow `Factory Control Plane` valida o manifesto antes de qualquer materialização. A materialização só é permitida quando o ator do evento é o proprietário do repositório.

## O que acontece

Ao abrir/editar/reabrir uma issue válida:

1. o GitHub Actions valida o manifesto e o ator;
2. cria/aplica labels técnicas do Control Plane;
3. cria uma issue-filho para cada tarefa ainda inexistente;
4. reutiliza tarefas já materializadas quando o mesmo `run_id` + `task id` reaparece;
5. reconcilia labels ausentes em tarefas reutilizadas;
6. marca tarefas com human gate como `factory:human-required`;
7. marca tarefas dependentes como `factory:waiting`;
8. para uma tarefa-raiz sem human gate que liste `jules` em `preferred_providers`, cria a issue com `factory:provider:jules` e adiciona a label exata `jules` em uma operação separada;
9. comenta um resumo na issue pai.

A label `jules` é uma solicitação de execução ao GitHub App do Jules. Ela não prova que o worker iniciou ou concluiu a tarefa. O repositório precisa estar previamente autorizado no Jules.

## Dependências

Tarefas dependentes começam com `factory:waiting`. Depois de cada PR mesclado, o workflow `Factory Reconciliation` verifica as tarefas em espera.

Uma predecessora só conta como concluída quando a issue materializada contém um link de PR publicado por `google-labs-jules[bot]`, o PR está mesclado na branch padrão e todos os arquivos alterados permanecem dentro dos `paths` declarados pela predecessora.

Quando todas as predecessoras satisfazem essas condições, a tarefa dependente deixa `factory:waiting` e:

- recebe `factory:provider:jules` + `jules` quando Jules foi explicitamente preferido; ou
- recebe `factory:ready` quando ainda não há provider remoto aplicável.

Fechar issue manualmente, inserir um link por comentário humano ou mesclar um PR com arquivos fora do escopo não libera a dependência.

## Segurança

- somente o proprietário do repositório pode disparar a materialização da Factory Run;
- máximo de 20 tarefas por Factory Run;
- IDs duplicados, dependências inexistentes e ciclos são rejeitados;
- providers e human gates são allowlisted;
- Jules só é solicitado quando foi explicitamente listado pela tarefa;
- nenhuma credencial ou API key do Jules entra no manifesto;
- nenhum texto do manifesto é executado como shell;
- nenhuma tarefa materializada ou reconciliada faz merge/deploy/ativação de produção;
- um trigger de provider não concede autoridade de merge ou produção;
- reconciliação é fail-closed quando falta evidência confiável;
- Codex não é fallback automático;
- Banco de Notas permanece com sync desligado.

## Exemplo

Consulte `infra/factory/examples/banco-notas-pilot-issue.txt`.
