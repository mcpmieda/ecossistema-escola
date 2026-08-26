# Factory Control Plane

## Objetivo

Usar o GitHub como plano de controle durável para iniciar, acompanhar e auditar Factory Runs multiagente sem depender do computador que iniciou a operação e sem transformar prompts em shell arbitrário.

Fluxo atual:

```text
ChatGPT / PowerShell
  -> issue [Factory Run]
  -> GitHub Actions
  -> manifesto tipado e imutável
  -> branch isolada factory/<run_id>
  -> issues-filho tipadas
  -> Jules REST API (até 3 sessões paralelas)
  -> PRs dos workers para a branch isolada
  -> validação de escopo
  -> CI obrigatório
  -> integração serial na branch isolada
  -> próximas dependências
  -> CI consolidado
  -> PR final draft para a branch alvo
  -> decisão humana final
```

O runner nunca faz merge do PR consolidado na branch alvo e nunca ativa produção.

## Estado

A fundação do Control Plane está operacional e o piloto remoto legado foi comprovado de ponta a ponta em 26/08/2026:

- Factory Run #64;
- dois workers Jules executados em paralelo;
- PRs #69 e #70 isolados por arquivo e integrados após CI;
- tarefa dependente #67 liberada somente após as duas predecessoras;
- PR #71 de verificação final integrado após CI;
- nenhuma ativação de produção ou sync do Banco de Notas.

O piloto mostrou duas limitações do trigger simples por label: labels emitidas por `github-actions[bot]` não iniciam o GitHub App do Jules de forma confiável e PRs criados pela integração não garantem um novo evento de CI por `pull_request`. A arquitetura v2 elimina essa dependência usando a Jules REST API e `workflow_dispatch` explícito do CI.

## Jules — modo API-first

Novas Factory Runs usam `JULES_API_KEY` armazenada exclusivamente como GitHub Actions secret. A chave não pode aparecer em manifesto, issue, comentário, log, artifact, código ou documentação.

O runner:

1. localiza a fonte GitHub já autorizada no Jules;
2. aguarda a branch `factory/<run_id>` ficar visível no Jules;
3. cria sessões com `automationMode=AUTO_CREATE_PR` e `requirePlanApproval=false`;
4. limita o paralelismo a `max_parallel`, atualmente de 1 a 3;
5. persiste somente o identificador não secreto da sessão em comentário de auditoria do `github-actions[bot]`;
6. aceita exatamente um PR de saída do mesmo repositório;
7. rejeita qualquer arquivo fora dos `paths` declarados;
8. atualiza o worker contra a branch de integração antes do CI;
9. dispara o workflow fixo `ci.yml` explicitamente na branch candidata;
10. só integra o worker na branch `factory/<run_id>` após CI verde;
11. libera tarefas dependentes somente por evidência de integração emitida pelo próprio Factory runner;
12. executa CI consolidado na branch de integração;
13. cria um PR final em draft para `base_branch`;
14. para no gate humano final.

A label `jules` permanece apenas para compatibilidade com Factory Runs antigas. Ela não é o mecanismo primário do v2.

## Isolamento de branches

Cada Factory Run possui uma branch própria:

```text
base_branch
  \
   factory/<run_id>
      ^ worker A PR
      ^ worker B PR
      ^ worker C PR
```

Workers nunca recebem autoridade de merge na branch alvo. O runner pode fazer squash merge somente dos PRs validados para `factory/<run_id>`.

Ao final:

```text
factory/<run_id> -> PR draft -> base_branch
```

O merge desse PR final permanece humano.

Isso permite inclusive trabalhar sobre uma feature em andamento. Para o Banco de Notas, uma Factory Run pode usar, por exemplo:

```json
{
  "base_branch": "feat/banco-de-notas-foundation"
}
```

Nesse caso, a fábrica não toca em `main` nem faz merge direto no PR #52. Ela entrega um PR consolidado para a própria branch do Banco.

## Contrato e imutabilidade

O manifesto é normalizado e recebe um SHA-256 de contrato. Após a primeira materialização, qualquer mudança no contrato da mesma Factory Run é rejeitada em modo fail-closed.

Reexecuções com o mesmo manifesto são idempotentes: reaproveitam a branch e as issues já existentes sem recolocar uma tarefa concluída em estado `ready`.

## Paralelismo seguro

`max_parallel` aceita somente 1, 2 ou 3.

Duas tarefas capazes de rodar simultaneamente não podem ter escopos de escrita sobrepostos. Sobreposição é permitida somente quando o grafo de dependências torna a execução explicitamente sequencial.

Exemplo válido:

```text
A -> src/model/**
B -> src/ui/**
```

Exemplo rejeitado para execução paralela:

```text
A -> src/model/**
B -> src/model/student.ts
```

## Escopos reservados

Workers automáticos não podem receber escopo sobre as áreas que controlam a própria fábrica ou a segurança do GitHub:

- `.github/**`;
- `infra/factory/**`;
- `infra/validation/**`.

Mudanças nessas áreas exigem uma tarefa com human gate e não são entregues automaticamente ao Jules.

O contrato também rejeita path traversal, caminhos absolutos, barras invertidas e globs livres. O único glob aceito é `/**` ao final de um diretório.

## Evidência confiável

A fábrica não confia em texto livre de usuários para liberar dependências.

São aceitos apenas:

- issue-filho criada por `github-actions[bot]` com marcador estável de `run_id` + `task_id`;
- marcador de sessão Jules publicado por `github-actions[bot]`;
- saída de PR retornada diretamente pela Jules REST API;
- PR do mesmo repositório e com base esperada;
- arquivos do PR integralmente dentro dos escopos declarados;
- CI obrigatório verde para o SHA atual;
- marcador de merge emitido por `github-actions[bot]` depois do merge real na branch isolada.

Comentários externos não podem fabricar evidência de sessão ou de integração.

## Human gates

Continuam reservados para decisões que não podem ser delegadas automaticamente:

- `product_decision`;
- `destructive_operation`;
- `production_activation`;
- `privilege_change`;
- `legal_or_organizational_decision`.

Uma tarefa com human gate não é enviada a provider remoto pelo runner.

## Regras permanentes

- GitHub é a fonte de verdade para o estado durável da execução.
- Factory Runs executáveis só são aceitas quando o evento vem do proprietário do repositório.
- O manifesto fica imutável depois da materialização.
- Cada worker trabalha em PR isolado.
- Tarefas paralelas não compartilham escopo de escrita.
- Jules é o provider remoto ativo do v2; providers futuros só entram depois de adaptador e testes próprios.
- Codex nunca é fallback automático de volume.
- Secrets ficam somente no mecanismo de secrets do GitHub Actions.
- Nenhum texto do manifesto é executado como `command`, `script` ou shell livre.
- Nenhum worker pode alterar o próprio Control Plane automaticamente.
- Produção, privilégios e operações destrutivas permanecem fora da autoridade dos providers.
- O Banco de Notas continua com `SyncEnabled` desligado até autorização específica.

## Continuidade entre computadores

O PC do trabalho ou de casa pode iniciar/acompanhar a mesma Factory Run. O estado persistente está em GitHub issues, labels, branches, PRs e Actions; o computador inicial pode ser desligado sem perder a execução remota.

Workers locais futuros serão capacidade adicional, não fonte de verdade.

## Próximas extensões

Depois da estabilização do Jules API-first:

1. adaptador Antigravity;
2. adaptador OpenCode/Ollama para capacidade local;
3. roteamento por custo/cota;
4. Semgrep e SonarQube como gates especializados, evitando revisores genéricos duplicados.
