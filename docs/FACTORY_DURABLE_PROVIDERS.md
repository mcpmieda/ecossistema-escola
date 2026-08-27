# Factory — Antigravity e OpenCode/Ollama duráveis

Atualizado em 27 de agosto de 2026.

## Objetivo

Conectar executores Antigravity e OpenCode/Ollama ao Factory Control Plane sem tornar o computador local fonte de verdade.

O executor pode desaparecer, reiniciar ou ser substituído. O estado aproveitável permanece em:

- manifesto imutável da Factory Run;
- issue tipada da task;
- comentários e labels emitidos por `github-actions[bot]`;
- lease ativa;
- worker branch;
- commits e SHA remoto;
- PR para a integration branch;
- CI;
- marcador de merge.

Cache, stdout, diretório local e sessão do provider não são evidência suficiente.

## Arquitetura

```text
Factory Run issue
  -> materialização no GitHub
  -> task pronta
  -> workflow_dispatch: claim
  -> health sanitizado
  -> lease bot-authored
  -> executor isolado baixa o contrato
  -> Antigravity ou OpenCode/Ollama
  -> commit/push somente na worker branch
  -> workflow_dispatch: result
  -> revalidação GitHub/escopo/SHA
  -> sync confiável com integration branch
  -> worker PR
  -> ci.yml workflow_dispatch no SHA exato
  -> squash merge somente na integration branch
  -> runner libera dependentes
  -> PR final draft e humano
```

## Providers automáticos

O contrato aceita:

- `opencode_ollama`;
- `jules`;
- `antigravity`.

Codex não é provider automático.

A ordem baseline é:

1. OpenCode/Ollama saudável;
2. Jules;
3. Antigravity;
4. Codex somente por decisão excepcional e manual.

No `claim`, a seleção local considera health real:

- `healthy` antes de `degraded`;
- dentro do mesmo estado, OpenCode/Ollama antes de Antigravity;
- `unavailable` e `unknown` não recebem task;
- ausência de provider local utilizável pode liberar fallback Jules quando ele estiver declarado no manifesto.

## Manifesto

Uma task local pode declarar somente o provider desejado:

```json
{
  "id": "local-worker",
  "title": "Criar a documentação do piloto local",
  "role": "implementation",
  "depends_on": [],
  "paths": ["docs/factory-local-pilot/**"],
  "required_capabilities": ["reasoning", "repo_read", "repo_write"],
  "preferred_providers": ["opencode_ollama"],
  "human_gates": []
}
```

Para fallback remoto:

```json
{
  "preferred_providers": ["opencode_ollama", "jules"]
}
```

Antigravity pode ser homologado de forma isolada com:

```json
{
  "preferred_providers": ["antigravity"]
}
```

`max_parallel` continua limitado a 1–3.

## Worker branch

O Control Plane cria uma branch estável:

```text
factory/<run_id>/<task_id>
```

A branch começa no head da integration branch e recebe um marcador de propriedade emitido pelo bot.

Se a branch já existir:

- o marcador confiável precisa existir e apontar para a mesma integration branch;
- branch preexistente sem marcador é rejeitada;
- takeover depois de lease expirada reutiliza a mesma branch e o estado remoto;
- duas leases ativas para a mesma task são rejeitadas.

## Health

O payload de `claim` ou `health` usa somente informação sanitizada:

```json
{
  "providers": [
    {
      "provider_id": "opencode_ollama",
      "status": "healthy",
      "observed_at": "2026-08-27T12:00:00Z",
      "reason": "OpenCode, Ollama e modelo local disponíveis.",
      "details": {
        "model": "ollama/qwen3-coder"
      }
    }
  ]
}
```

Regras:

- uma ou duas observações;
- apenas providers duráveis;
- timestamp com timezone;
- idade máxima de 10 minutos;
- tolerância futura máxima de 120 segundos;
- `details` é sanitizado;
- token, API key, password, authorization, cookie e credencial em URL são redigidos.

Nenhum secret pode ser colocado no input do workflow.

## Claim

No workflow **Factory Control Plane**, executar `workflow_dispatch` em `main` com:

- `operation`: `claim`;
- `issue_number`: número da issue-filho;
- `worker_id`: ID estável do executor;
- `payload`: health JSON;
- `ttl_seconds`: 60–21.600.

O gateway:

1. exige dispatch do proprietário;
2. exige código de `main`;
3. confirma que a issue foi criada por `github-actions[bot]`;
4. confirma o parent e o manifesto imutável;
5. confirma task sem human gate;
6. persiste health sanitizado;
7. reutiliza lease ativa somente para o mesmo executor/provider;
8. cria/reutiliza worker branch confiável;
9. emite lease em comentário bot-authored;
10. transiciona a task para `factory:running`.

O JSON interno do campo `actor` não é suficiente. A autoria real do comentário precisa ser `github-actions[bot]`.

## Lease

A lease vincula:

- run e task;
- issue;
- provider;
- executor;
- repositório;
- worker/integration/target branches;
- SHA-256 do request portátil;
- SHA-256 do manifesto;
- emissão e expiração.

O request inclui:

- objetivo e título da task;
- escopos;
- branches;
- timeout;
- remote.

O caminho do worktree local é excluído do hash. Outro executor pode materializar a mesma task em diretório diferente.

Heartbeat não renova a lease.

## Executor local

O executor utiliza a CLI integrada em `mcpmieda/app-factory`:

```text
python scripts/durable_provider_agent.py fingerprint provider-task.json factory-run.json
python scripts/durable_provider_agent.py validate provider-task.json factory-run.json lease.json --worker-id executor-01
python scripts/durable_provider_agent.py heartbeat lease.json --phase running
python scripts/durable_provider_agent.py run provider-task.json factory-run.json lease.json --worker-id executor-01 --publish --profile-home <profile-isolado>
```

O `provider-task.json` usa o request da lease e adiciona somente o `worktree` absoluto local.

O profile:

- fica fora do worktree;
- não é o profile normal do usuário;
- contém somente autenticação/configuração necessária ao provider;
- nunca é enviado ao GitHub.

`run` exige `--publish`. Trabalho apenas local não representa conclusão.

## Heartbeat

Enviar via `workflow_dispatch`:

- `operation`: `heartbeat`;
- mesma issue;
- mesmo `worker_id`;
- payload produzido pela CLI.

Fases:

- `claimed`;
- `preparing`;
- `running`;
- `publishing`;
- `completed`;
- `failed`.

O gateway verifica:

- lease confiável;
- identidade exata;
- timestamp dentro da janela;
- métricas numéricas;
- head SHA, quando informado, igual ao GitHub.

## Resultado

Enviar via `workflow_dispatch`:

- `operation`: `result`;
- mesma issue;
- mesmo executor;
- payload produzido pela CLI.

Para `success`, o gateway exige:

1. lease confiável;
2. resultado observado antes da expiração;
3. branch exata;
4. commit SHA igual ao remote SHA;
5. push confirmado;
6. changed paths declarados;
7. branch GitHub no SHA esperado ou em SHA de sync bot-authored;
8. provider SHA descendente do starting SHA;
9. nenhum merge commit criado pelo provider;
10. diff GitHub exatamente igual aos `changed_paths` do resultado;
11. arquivos no escopo imutável.

Depois:

- integration branch é sincronizada na worker branch pelo Control Plane;
- o novo sync SHA recebe marcador confiável;
- worker PR é criado/reutilizado;
- `ci.yml` é disparado por `workflow_dispatch`;
- CI é localizado pelo SHA exato;
- head do PR é revalidado;
- squash merge ocorre somente para a integration branch;
- task recebe apenas `factory:merged` e é fechada;
- dependentes são reconciliados pelo runner.

## Recovery

Casos tratados:

- claim repetido durante lease ativa: reutiliza a mesma lease;
- lease expirada: novo executor pode receber nova lease;
- branch já sincronizada: exige marcador `SYNC` bot-authored;
- CI já verde para o SHA: não duplica dispatch;
- PR já aberto: reutiliza;
- PR já mesclado antes do comentário final: recupera CI/merge e finaliza a issue;
- resultado reenviado depois de `factory:merged`: confirma marcador/PR e não duplica merge;
- runner reiniciado: estado continua em issues, branches, PRs e Actions.

## Guardrails permanentes

O executor nunca recebe autoridade para:

- escrever `.github`, `infra/factory` ou `infra/validation`;
- fazer merge em `main` ou no target;
- criar PR final pronto para merge automático;
- ativar produção;
- habilitar Banco de Notas sync;
- ampliar permissões;
- acessar secrets do GitHub Actions;
- escolher Codex automaticamente.

O gateway usa `main` como código confiável e aceita dispatch somente do proprietário.

## Dependências externas

### Permissão de criação de PRs

O repositório atualmente não permite que GitHub Actions crie/aprove pull requests. Enquanto a opção administrativa **Allow GitHub Actions to create and approve pull requests** permanecer desativada:

- claim, lease, branch, health e heartbeat funcionam;
- o resultado permanece durável na worker branch;
- a criação automática do worker PR falha fechada;
- nenhum merge alternativo para o target é tentado.

Habilitar essa permissão é necessário para homologação totalmente autônoma. O PR final continuará draft e humano.

### Host local

A homologação live depende de um executor real com:

- Antigravity autenticado em profile isolado; ou
- OpenCode, Ollama e um modelo local instalados;
- Git configurado para publicar somente a worker branch;
- conectividade com GitHub.

Nenhuma credencial local deve ser enviada à conversa, issue ou workflow input.

## Estado atual

Implementado e testado:

- contrato multi-provider;
- seleção por health;
- lease bot-authored;
- takeover;
- marcadores base64url;
- hashes compatíveis Node/Python;
- heartbeat;
- resultado por SHA remoto;
- sync confiável;
- CI exato;
- merge somente na integration branch;
- retomada do runner.

Pendente de prova live:

- Antigravity real;
- OpenCode/Ollama real;
- troca entre dois executores;
- criação automática de worker PR após habilitação administrativa;
- Merge Train com CodeRabbit/Semgrep/Sonar reais.
