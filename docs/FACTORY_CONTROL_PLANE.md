# Factory Control Plane

Atualizado em 27 de agosto de 2026.

## Objetivo

Usar o GitHub como plano de controle durável para Factory Runs multiagente sem depender do computador que iniciou a operação e sem transformar prompts em shell arbitrário.

Princípio central:

> Nenhuma Factory Run depende do computador que a iniciou para preservar estado, autoridade ou resultado aproveitável.

## Arquitetura atual

```text
Factory Run issue
  -> manifesto tipado e imutável
  -> integration branch factory/<run_id>
  -> issues-filho tipadas
  -> seleção do provider
       ├─ Jules REST API
       ├─ Antigravity durável
       └─ OpenCode/Ollama durável
  -> worker branch / PR
  -> validação de escopo e SHA
  -> CI obrigatório workflow_dispatch
  -> squash merge somente na integration branch
  -> liberação de dependências
  -> CI consolidado
  -> PR final draft para o target
  -> decisão humana final
```

Codex não participa do roteamento automático.

O Control Plane nunca:

- faz merge do PR final no target;
- ativa produção;
- habilita Banco de Notas sync;
- amplia permissões do executor;
- entrega secrets a providers locais.

## Estado comprovado

A Factory Run `jules-api-pilot-002` comprovou em execução real:

- Jules pela REST API;
- dois workers paralelos;
- task dependente;
- branches e PRs isolados;
- retomada de `factory:ci` depois de restart;
- ausência de sessão duplicada;
- CI por `workflow_dispatch` e SHA exato;
- squash merge somente na integration branch;
- CI final consolidado;
- PR final #93 em draft;
- produção pulada.

O PR #93 permanece no gate humano e não é mesclado automaticamente.

## Manifesto

O contrato aceita entre 1 e 20 tasks e `max_parallel` de 1–3.

Providers automáticos reconhecidos:

- `opencode_ollama`;
- `jules`;
- `antigravity`.

Provider manual reconhecido:

- `manual` somente com human gate.

Cada task declara:

- ID estável;
- título e papel;
- dependências;
- escopos de escrita;
- capacidades;
- providers preferidos;
- human gates.

O manifesto recebe marcador SHA-256 bot-authored. Alteração posterior é rejeitada em modo fail-closed.

## Roteamento

A política baseline é:

1. OpenCode/Ollama quando saudável;
2. Jules;
3. Antigravity;
4. Codex somente por decisão excepcional e manual.

O health local refina a seleção entre providers duráveis:

- `healthy` antes de `degraded`;
- `unavailable` e `unknown` não recebem task;
- health tem validade máxima de 10 minutos;
- fallback Jules ocorre somente quando declarado na task.

Labels de provider:

- `factory:provider:opencode-ollama`;
- `factory:provider:jules`;
- `factory:provider:antigravity`.

## Jules API-first

`JULES_API_KEY` fica somente em GitHub Actions secret.

O runner:

1. localiza a fonte GitHub autorizada;
2. cria sessão `AUTO_CREATE_PR`;
3. persiste apenas o identificador não secreto;
4. aceita exatamente um PR do mesmo repositório;
5. revalida base, paths e head;
6. sincroniza a integration branch;
7. dispara `ci.yml` por `workflow_dispatch`;
8. seleciona CI pelo SHA exato;
9. faz squash merge somente para `factory/<run_id>`;
10. libera dependentes por marcador bot-authored;
11. cria PR final draft;
12. para no gate humano.

Tasks Antigravity/OpenCode são ignoradas pelo processamento de sessões Jules. Quando somente trabalho durável local resta, o runner retorna `awaiting-durable-provider` em vez de ocupar um runner por horas.

## Providers duráveis

O gateway está em:

- `infra/factory/durable-provider-contract.mjs`;
- `infra/factory/durable-provider-gateway.mjs`;
- `scripts/durable_provider_agent.py` no repositório `mcpmieda/app-factory`.

Operações do workflow:

- `claim`;
- `heartbeat`;
- `result`;
- `health`.

O workflow só executa o gateway quando:

- evento é `workflow_dispatch`;
- ator é o proprietário do repositório;
- ref é `main`;
- checkout usa `main` com credenciais persistentes desabilitadas.

Detalhes operacionais: `docs/FACTORY_DURABLE_PROVIDERS.md`.

## Lease e recuperação

Uma lease vincula exatamente:

- run/task/issue;
- provider e executor;
- repositório;
- worker/integration/target branches;
- request SHA-256;
- manifesto SHA-256;
- emissão e expiração.

A lease só é confiável quando o comentário real foi criado por `github-actions[bot]`.

Reexecução:

- mesma lease ativa + mesmo executor/provider: reutiliza;
- lease expirada: novo executor pode receber takeover;
- duas leases ativas: conflito fail-closed;
- heartbeat não renova lease;
- resultado local permanece candidato até reconciliação bot-authored.

## Branches

```text
base_branch
  \
   factory/<run_id>
      ^ factory/<run_id>/<task_a>
      ^ factory/<run_id>/<task_b>
```

Jules normalmente cria a worker branch e o PR.

O gateway durável:

- cria branch estável por task;
- registra starting SHA;
- rejeita branch preexistente sem marcador confiável;
- valida provider commit contra o starting SHA;
- registra sync bot-authored;
- cria/reutiliza worker PR;
- integra somente na integration branch.

Ao final:

```text
factory/<run_id> -> PR final draft -> base_branch
```

O merge final permanece humano.

## Escopos

Workers automáticos nunca recebem autoridade sobre:

- `.github/**`;
- `infra/factory/**`;
- `infra/validation/**`.

Também são rejeitados:

- paths absolutos;
- traversal;
- barras invertidas;
- escopo pai que alcance área protegida;
- glob livre diferente de `/**` final;
- tasks paralelas com escopos sobrepostos.

O gateway revalida:

- changed paths informados pelo executor;
- diff real do provider SHA no GitHub;
- diff sincronizado contra a integration branch;
- changed paths do PR.

## CI

O CI obrigatório:

- usa somente `ci.yml`;
- é disparado por `workflow_dispatch`;
- precisa ter o head SHA exato;
- não é duplicado quando já existe para o mesmo SHA;
- precisa concluir `success`;
- é invalidado se o PR head mudar.

`ci.yml` continua autorizado a produção apenas no fluxo normal de `push` para `main`. `workflow_dispatch` em worker/integration branch pula produção.

## Evidência confiável

Marcadores confiáveis incluem:

- manifesto imutável;
- task materializada;
- sessão Jules;
- propriedade da worker branch;
- lease;
- health;
- heartbeat;
- sync;
- resultado;
- merge na integration branch.

Para serem confiáveis, precisam estar em comentário criado por `github-actions[bot]`.

Marcadores do gateway usam JSON canônico codificado em base64url, permitindo objetos aninhados sem parsing ambíguo.

## Human gates

Nunca são autoexecutados:

- `product_decision`;
- `destructive_operation`;
- `production_activation`;
- `privilege_change`;
- `legal_or_organizational_decision`.

Tasks com human gate não recebem provider automático.

## Permissões

As permissões são definidas por job:

- materialização: `contents:write`, `issues:write`;
- runner: `actions:write`, `contents:write`, `issues:write`, `pull-requests:write`;
- gateway durável: mesmas capacidades limitadas ao fluxo de worker/integration;
- validação de PR: somente `contents:read`.

A política de código proíbe merge no target. A permissão de token não substitui o gate lógico.

## Dependências externas conhecidas

### GitHub Actions criando PRs

A configuração **Allow GitHub Actions to create and approve pull requests** está desativada.

Consequências:

- o runner/gateway pode chegar até branch, lease, resultado e CI;
- criação autônoma de worker/final PR falha fechada;
- nenhum merge alternativo para `main` é tentado;
- habilitação administrativa é necessária para autonomia total;
- merge final continuará humano.

### CodeRabbit

A revisão automática foi informada como desabilitada enquanto o repositório tiver menos de dez estrelas. O contrato do Merge Train não deve fingir evidência inexistente.

### Executor local

Pilotos Antigravity e OpenCode/Ollama dependem de host/profile/modelo reais. Credenciais locais nunca devem ser enviadas a issue, workflow input ou conversa.

## Regras permanentes

- GitHub é fonte de verdade.
- Manifesto é imutável.
- `max_parallel` é 1–3.
- Tasks paralelas não sobrepõem escrita.
- Worker automático não toca Control Plane.
- Codex não é fallback automático.
- Secrets ficam em GitHub Actions ou profile local isolado.
- Prompt não vira shell.
- Target/main nunca recebe auto-merge.
- Produção e Banco de Notas sync permanecem fora da autoridade da Factory.

## Próxima homologação

1. integrar o gateway em `main` com CI e auditoria de segurança;
2. habilitar administrativamente criação de PRs por Actions;
3. executar piloto Antigravity em profile isolado;
4. executar piloto OpenCode/Ollama;
5. desligar o primeiro executor e retomar com um segundo depois da expiração;
6. conectar CodeRabbit/Semgrep/Sonar reais;
7. executar Merge Train multi-provider completo.

A Factory inteira só será declarada pronta depois dessas provas.
