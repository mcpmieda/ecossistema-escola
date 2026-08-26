# Formato de issue — Factory Run

Uma Factory Run é iniciada por uma issue criada/aberta/editada pelo proprietário do repositório cujo título começa com:

```text
[Factory Run]
```

O corpo contém um manifesto JSON entre:

```text
<!-- FACTORY_RUN_BEGIN -->
{ ... }
<!-- FACTORY_RUN_END -->
```

O conteúdo do manifesto é dado, não código: nenhum campo é executado como shell.

## Manifesto

Exemplo API-first:

```json
{
  "schema_version": 1,
  "run_id": "banco-conselho-001",
  "goal": "Implementar uma fase funcional do Banco de Notas em tarefas independentes.",
  "base_branch": "feat/banco-de-notas-foundation",
  "max_parallel": 3,
  "tasks": [
    {
      "id": "conselho-ui",
      "title": "Implementar a estrutura funcional do Conselho de Classe no escopo declarado",
      "role": "implementation",
      "depends_on": [],
      "paths": ["src/features/banco-notas/conselho/**"],
      "required_capabilities": ["repo_read", "repo_write"],
      "preferred_providers": ["jules"],
      "human_gates": []
    },
    {
      "id": "conselho-tests",
      "title": "Adicionar testes da implementação do Conselho de Classe",
      "role": "verification",
      "depends_on": ["conselho-ui"],
      "paths": ["tests/banco-notas/conselho/**"],
      "required_capabilities": ["repo_read", "repo_write", "review"],
      "preferred_providers": ["jules"],
      "human_gates": []
    }
  ]
}
```

## Campos de nível da Factory Run

- `schema_version`: atualmente `1`;
- `run_id`: identificador estável e único; somente letras, números, ponto, `_` e `-`;
- `goal`: objetivo consolidado da rodada;
- `base_branch`: branch que receberá o PR final; padrão `main`;
- `max_parallel`: 1 a 3;
- `tasks`: 1 a 20 tarefas.

O Control Plane deriva automaticamente `factory/<run_id>` como branch de integração isolada.

## Campos da tarefa

- `id`: slug estável e único dentro da rodada;
- `title`: instrução fechada da tarefa;
- `role`: papel da tarefa;
- `depends_on`: IDs que devem ser integrados antes dela;
- `paths`: escopos de escrita autorizados;
- `required_capabilities`: capacidades esperadas;
- `preferred_providers`: providers aceitos, atualmente `jules` para automação remota;
- `human_gates`: decisões que impedem execução automática.

## Escopos `paths`

Escopo de arquivo:

```text
src/features/example/model.ts
```

Escopo recursivo de diretório:

```text
src/features/example/**
```

Não são aceitos caminhos absolutos, `..`, `\\`, glob livre como `src/*.ts`, nem `.github/**`, `infra/factory/**` ou `infra/validation/**` em tarefa automática. As áreas reservadas podem aparecer apenas em tarefas protegidas por human gate, que não são enviadas automaticamente ao provider.

## Paralelismo

O Control Plane rejeita duas tarefas potencialmente simultâneas quando os escopos se sobrepõem. Uma sobreposição só é permitida quando `depends_on` força uma ordem sequencial explícita.

## Materialização e imutabilidade

Na primeira execução, o Control Plane valida o manifesto, grava um fingerprint SHA-256 do contrato em comentário técnico do `github-actions[bot]`, cria `factory/<run_id>` a partir de `base_branch`, cria uma issue-filho por tarefa e inicia o runner API-first.

Depois disso, o contrato da mesma Factory Run é imutável. Uma edição que altere o manifesto normalizado é rejeitada fail-closed. Reexecutar a mesma issue sem alterar o contrato é idempotente e não reinicia tarefa já concluída.

## Execução Jules API-first

Para tarefas automáticas sem dependências, o estado inicial é `factory:task` + `factory:provider:jules` + `factory:ready`. O runner cria uma sessão pela Jules REST API usando a branch `factory/<run_id>` como ponto de partida e respeita `max_parallel`.

Durante a execução podem aparecer `factory:running`, `factory:ci`, `factory:merged`, `factory:failed` e `factory:dispatch:jules-api`. A label simples `jules` é apenas compatibilidade legada e não é usada pelo fluxo API-first.

## Dependências

Uma tarefa com `depends_on` começa em `factory:waiting`. Ela só é liberada quando todas as predecessoras possuem evidência emitida pelo próprio Factory runner de que o Jules retornou um PR do mesmo repositório, a base é a branch de integração esperada, os arquivos ficaram dentro dos escopos declarados, o CI obrigatório passou e o PR foi realmente integrado em `factory/<run_id>`.

Comentários externos não contam como evidência.

## Resultado final

Depois de todas as tarefas automáticas, o CI roda novamente sobre `factory/<run_id>` e o Control Plane abre ou reutiliza um PR final em **draft** para `base_branch`, aplica `factory:final` e encerra em `human-final-gate`. O Control Plane não faz merge desse PR final.

## Human gates

Valores permitidos: `product_decision`, `destructive_operation`, `production_activation`, `privilege_change` e `legal_or_organizational_decision`. Tarefas com qualquer human gate permanecem fora da execução automática.

## Segurança

- somente o proprietário do repositório pode iniciar a Factory Run executável;
- manifesto imutável após materialização;
- até 20 tarefas e 3 workers paralelos;
- dependências inexistentes, ciclos e sobreposição paralela são rejeitados;
- providers e human gates são allowlisted;
- Jules API key nunca entra no manifesto;
- session IDs não são secrets, mas seus marcadores só são aceitos quando publicados por `github-actions[bot]`;
- comentários externos não podem fabricar conclusão;
- arquivos fora de `paths` fazem a tarefa falhar antes do CI/merge;
- nenhum worker automático altera o próprio Control Plane/GitHub Actions;
- Codex não é fallback automático;
- merge final e produção permanecem humanos;
- Banco de Notas continua com sync desligado salvo autorização específica.

## Banco de Notas em desenvolvimento

Para trabalhar em paralelo com o PR #52 sem tocar em `main`, use a branch atual do Banco como `base_branch`. A fábrica cria sua própria branch isolada e entrega um PR final de volta para essa branch, mantendo o PR #52 draft e separado da infraestrutura do Control Plane.
