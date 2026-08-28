# Factory Control Plane

Atualizado em 27 de agosto de 2026.

## Objetivo

Usar o GitHub como plano de controle durável para Factory Runs multiagente sem depender do computador que iniciou a operação e sem transformar prompts em shell arbitrário.

Princípio central:

> Nenhuma Factory Run depende do computador que a iniciou para preservar estado, autoridade ou resultado aproveitável.

## Estado executivo

A arquitetura principal está operacional e já foi comprovada em execução real.

Comprovado:

- manifesto tipado e imutável com fingerprint bot-authored;
- integration branch isolada por run;
- tasks-filho tipadas e dependências explícitas;
- Jules REST API-first;
- OpenCode/Ollama em runner hospedado pelo GitHub para o perfil create-only homologado;
- dois providers reais executando tasks independentes na mesma Factory Run;
- paralelismo e liberação de task dependente;
- leases duráveis, heartbeat, resultado e takeover entre executores após expiração;
- recuperação sem depender de cache, stdout, sessão local ou computador iniciador;
- validação de escopo e SHA contra o estado real do GitHub;
- CI por `workflow_dispatch` e SHA exato;
- squash merge somente na integration branch;
- criação autônoma de worker/final PR pelo GitHub Actions;
- PR final sempre draft e human-only;
- Merge Train confiável integrado em `main`, executado a partir do Control Plane de `main`, não do código candidato.

Ainda pendente para a visão completa:

- homologação operacional do Antigravity em runner efêmero dedicado;
- prova live final do Merge Train confiável com Semgrep + Sonar + CodeRabbit no mesmo worker SHA; a Factory Run `merge-train-homologation-001` está em execução;
- configuração externa do Sonar, caso a homologação confirme que as variáveis/secret ainda não estão disponíveis.

## Arquitetura atual

```text
Factory Run issue
  -> manifesto tipado e imutável
  -> integration branch factory/<run_id>
  -> issues-filho tipadas
  -> seleção do provider
       ├─ Jules REST API
       ├─ OpenCode/Ollama durável / hosted create-only
       └─ Antigravity durável
  -> worker branch / PR
  -> validação de escopo e SHA
  -> CI obrigatório workflow_dispatch no SHA exato
  -> Merge Train confiável quando o SHA pertence a worker PR
       ├─ Semgrep
       ├─ Sonar
       └─ CodeRabbit
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
- entrega secrets a providers locais;
- aceita evidência do próprio provider como autoridade final.

## Provas reais concluídas

### Jules API-first

A Factory Run `jules-api-pilot-002` comprovou:

- Jules pela REST API;
- dois workers paralelos;
- task dependente;
- branches e PRs isolados;
- retomada de `factory:ci` depois de restart;
- ausência de sessão duplicada;
- CI por `workflow_dispatch` e SHA exato;
- squash merge somente na integration branch;
- CI final consolidado;
- gate humano final.

O antigo PR final #93 foi posteriormente mesclado por decisão humana, não pela Factory.

### Takeover durável

A prova cross-executor demonstrou que uma task pode passar de executor A para executor B depois da expiração da lease sem depender de estado local do primeiro executor.

A semântica preservada é:

- lease ativa não pode ser tomada por outro executor;
- heartbeat não estende autoridade implicitamente;
- depois da expiração uma nova lease pode ser emitida;
- executor antigo perde autoridade;
- GitHub continua sendo a fonte durável de verdade.

### OpenCode/Ollama hosted

O executor hospedado em GitHub Actions está integrado para a classe de task deliberadamente estreita já homologada:

- um único arquivo exato e ainda inexistente;
- create-only;
- sem shell para o provider;
- runtime OpenCode/Ollama pinado;
- profile isolado;
- provider sem `GITHUB_TOKEN`;
- publicação Git feita pela camada confiável;
- lease/request/manifest revalidados antes e depois da execução.

A primeira prova live chegou a `write + commit + push + exact-SHA CI`; um fixture Markdown falhou somente por newline final e foi mantido como falha, sem relaxar o validador.

A homologação substituta em `.txt` foi concluída na Factory Run `multi-provider-hosted-pilot-002`.

### Multi-provider real

A Factory Run `multi-provider-hosted-pilot-002` (#112) comprovou a visão multi-provider no mesmo grafo:

- Jules e OpenCode/Ollama como workers independentes;
- execução paralela com `max_parallel=2`;
- cada worker limitado ao próprio path;
- integração isolada;
- task Jules de verificação liberada somente depois dos dois predecessores;
- CI consolidado da integração `33134149253` concluído com sucesso;
- PR final #120 criado automaticamente como draft;
- merge em `main` não executado pela Factory;
- produção não ativada;
- nenhum trabalho de Banco de Notas;
- nenhum Codex.

O PR #120 permanece o gate humano da prova e não deve ser auto-merged.

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

1. OpenCode/Ollama quando saudável e a task cabe no capability profile disponível;
2. Jules;
3. Antigravity;
4. Codex somente por decisão excepcional e manual.

O health refina a seleção entre providers duráveis:

- `healthy` antes de `degraded`;
- `unavailable` e `unknown` não recebem task;
- health tem validade máxima;
- fallback Jules ocorre somente quando declarado na task.

Labels de provider:

- `factory:provider:opencode-ollama`;
- `factory:provider:jules`;
- `factory:provider:antigravity`.

## Jules API-first

`JULES_API_KEY` fica somente em GitHub Actions secret.

O runner:

1. localiza a fonte GitHub autorizada;
2. cria ou recupera a sessão Jules;
3. persiste apenas o identificador não secreto;
4. aceita exatamente um PR compatível com a task;
5. revalida base, paths e head;
6. dispara `ci.yml` por `workflow_dispatch`;
7. seleciona CI pelo SHA exato;
8. integra somente em `factory/<run_id>`;
9. libera dependentes por estado durável do GitHub;
10. cria PR final draft;
11. para no gate humano.

Tasks Antigravity/OpenCode não são tratadas como sessões Jules.

## Providers duráveis

O gateway está em:

- `infra/factory/durable-provider-contract.mjs`;
- `infra/factory/durable-provider-gateway.mjs`;
- `infra/factory/hosted-opencode-executor.mjs` para o perfil hosted create-only;
- `scripts/durable_provider_agent.py` no repositório `mcpmieda/app-factory`.

Operações duráveis:

- `claim`;
- `heartbeat`;
- `result`;
- `health`.

O gateway confiável é executado a partir de `main`. Credenciais de provider não são aceitas em issues ou inputs públicos.

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

- mesma lease ativa + mesmo executor/provider: reutiliza quando permitido;
- lease expirada: novo executor pode receber takeover;
- duas leases ativas: conflito fail-closed;
- heartbeat não renova lease;
- resultado do provider permanece candidato até reconciliação bot-authored;
- branch/PR/CI/merge já concluídos são reconciliados a partir do GitHub em vez de depender de memória local.

## Branches

A integration branch é:

```text
factory/<run_id>
```

Workers duráveis usam branch estável irmã, por exemplo:

```text
factory/<run_id>-<task_id>
```

Jules pode usar a branch criada pela própria sessão, sempre validada contra a task e a integration branch.

O gateway durável:

- cria/reutiliza branch apenas com evidência de propriedade confiável;
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

## CI e Merge Train

O CI obrigatório:

- usa `ci.yml`;
- é disparado por `workflow_dispatch`;
- precisa estar associado ao head SHA exato;
- não é duplicado quando já existe evidência compatível;
- precisa concluir `success`;
- é invalidado se o PR head mudar;
- pula produção em worker/integration branch.

Desde o PR #118, o Merge Train é parte obrigatória do `workflow_dispatch` para um Factory worker PR.

### Autoridade confiável

O worker não decide a própria aprovação:

1. o SHA candidato é checkout somente como dado;
2. `candidate/.github/workflows/ci.yml` deve ser byte-identical ao `ci.yml` confiável de `main`;
3. o código do Merge Train é carregado de checkout separado de `main`;
4. Semgrep e Sonar são despachados a partir do workflow confiável de `main` com `expected_sha` e `pr_number`;
5. CodeRabbit recebe request confiável vinculado ao SHA;
6. toda evidência aceita precisa apontar para o mesmo SHA atual do PR;
7. ausência, staleness, falha, rate-limit ou findings relevantes bloqueiam em modo fail-closed.

### Semgrep

A revisão Semgrep:

- usa versão pinada;
- analisa o SHA candidato;
- remove `.semgrepignore` fornecido pelo candidato;
- restaura a política confiável de ignore;
- desabilita suppressions inline `nosemgrep` do candidato;
- persiste evidência bot-authored vinculada ao SHA.

### CodeRabbit

A revisão manual via `@coderabbitai review` foi comprovada no repositório mesmo quando a revisão automática não é iniciada por causa do número de estrelas.

O Merge Train aceita somente review real do bot:

- posterior ao request confiável;
- vinculado ao mesmo `commit_id`/SHA;
- sem comentários acionáveis aceitos como pendentes;
- sem skip/rate-limit tratado como sucesso.

### Sonar

O workflow Sonar existe e é fail-closed. Requer configuração externa válida:

- `SONAR_PROJECT_KEY`;
- `SONAR_ORGANIZATION`;
- `SONAR_TOKEN`.

A Factory Run `merge-train-homologation-001` (#123) está sendo usada para provar o caminho live completo e confirmar se essa configuração externa já está disponível.

## Evidência confiável

Marcadores confiáveis incluem:

- manifesto imutável;
- task materializada;
- sessão Jules;
- propriedade da worker branch;
- lease;
- health;
- heartbeat;
- resultado;
- sync;
- reviewer evidence;
- Merge Train evidence;
- merge na integration branch.

Para serem autoridade do Control Plane, precisam vir de `github-actions[bot]` ou de uma fonte externa explicitamente validada pelo código confiável.

Marcadores estruturados usam payload canônico/validado para evitar parsing ambíguo.

## Human gates

Nunca são autoexecutados:

- `product_decision`;
- `destructive_operation`;
- `production_activation`;
- `privilege_change`;
- `legal_or_organizational_decision`.

Tasks com human gate não recebem provider automático.

O PR final da Factory Run também é sempre um gate humano, mesmo quando todas as tasks não possuem human gate individual.

## Permissões e PRs automáticos

As permissões são definidas por job e limitadas à função daquele job.

A criação de PRs pelo GitHub Actions está operacional: a Factory multi-provider v2 criou autonomamente o PR final draft #120. Isso não concede autoridade para mesclá-lo em `main`.

A política de código e os contratos continuam proibindo merge automático no target. A permissão do token não substitui esse gate lógico.

## Dependência externa restante: Antigravity

O Antigravity permanece sem homologação live porque requer infraestrutura fora do GitHub-hosted path atual:

- runner Linux x64 dedicado e efêmero;
- labels de runner esperadas pelo piloto;
- `agy`, Git e Python instalados;
- profile autenticado dedicado fora do worktree;
- nenhuma credencial de publicação Git entregue ao provider;
- destruição/reprovisionamento do runner depois da execução.

A ausência dessa infraestrutura deve continuar bloqueando em modo fail-closed, sem fallback silencioso e sem pedir secrets em issue, workflow input ou conversa.

## Regras permanentes

- GitHub é fonte de verdade.
- Manifesto é imutável.
- `max_parallel` é 1–3.
- Tasks paralelas não sobrepõem escrita.
- Worker automático não toca Control Plane.
- Codex não é fallback automático.
- Secrets ficam em GitHub Actions ou profile isolado apropriado.
- Prompt não vira shell arbitrário.
- Target/main nunca recebe auto-merge da Factory.
- Produção e Banco de Notas sync permanecem fora da autoridade da Factory.
- Falha de reviewer não pode ser convertida em sucesso por relaxamento de validação.

## Próximos gates

1. concluir `merge-train-homologation-001` e registrar a evidência real de Semgrep + Sonar + CodeRabbit no mesmo SHA;
2. se Sonar falhar por configuração ausente, provisionar somente as variáveis/secret necessários e repetir a mesma classe de prova sem enfraquecer o gate;
3. provisionar o runner/profile efêmero do Antigravity e concluir sua homologação live;
4. atualizar a declaração de readiness depois dessas provas.

Para o caminho Jules + GitHub Control Plane + OpenCode/Ollama hosted create-only + paralelismo + dependências + recuperação durável + gate humano final, a arquitetura já está operacional.