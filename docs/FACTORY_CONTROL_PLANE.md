# Factory Control Plane

## Objetivo

Usar o GitHub como plano de controle para iniciar, acompanhar e auditar Factory Runs multiagente sem depender do computador que iniciou a operação e sem transformar prompts em shell arbitrário.

O fluxo alvo é:

```text
ChatGPT / PowerShell
  -> GitHub
  -> Factory Run
  -> child tasks tipadas
  -> workers isolados
  -> branches/PRs
  -> CI/revisão
  -> integração controlada
```

## Estado atual

O Control Plane materializa Factory Runs em issues-filho e possui o primeiro adaptador remoto: Jules via integração oficial do GitHub por label.

O Banco de Notas continua em sua branch/PR atual. Esta fundação não escreve em `feat/banco-de-notas-foundation`, não retira draft, não ativa sync e não faz deploy de produção.

## Jules — primeira wave remota

O Control Plane não armazena API key do Jules. Para uma tarefa elegível, aplica a label exata `jules`, que funciona como solicitação ao GitHub App do Jules quando o repositório já está autorizado no serviço.

Uma tarefa recebe o trigger `jules` somente quando todas as condições abaixo são verdadeiras:

- não possui `human_gates`;
- não depende de outra tarefa (`depends_on` vazio);
- lista `jules` explicitamente em `preferred_providers`.

As labels usadas são:

- `factory:task`: issue-filho da Factory Run;
- `factory:provider:jules`: seleção interna do provider;
- `jules`: trigger externo oficial;
- `factory:waiting`: tarefa que possui dependências e ainda não pode ser enviada a provider;
- `factory:human-required`: tarefa que depende de decisão humana.

Aplicar a label é registrado como `trigger-requested`, não como execução concluída. O Jules ainda precisa ter acesso ao repositório pelo seu GitHub App. Ausência dessa autorização não provoca fallback inseguro nem uso automático de Codex.

Nesta fase somente a primeira wave pronta é enviada. A liberação automática das tarefas dependentes ficará para a fase de reconciliation, depois que houver evidência verificável de conclusão das predecessoras.

## Regras permanentes

- GitHub é a fonte de verdade para estado durável da execução.
- Cada worker deve trabalhar em branch/PR isolado.
- Tarefas paralelas não podem compartilhar escopo de escrita conhecido.
- Produção, privilégios, operações destrutivas e decisões reais de produto exigem decisão humana.
- Codex não é worker automático de volume.
- Providers externos são adaptadores substituíveis.
- Secrets de providers ficam em mecanismo próprio e nunca no manifesto da Factory Run, issue body, logs ou artifacts.
- Nenhuma operação aceita `command`, `script`, `shell`, URL/endpoint arbitrário ou outro executor livre.
- Um trigger de provider nunca concede autoridade para merge, deploy ou ativação de produção.

## Continuidade entre computadores

O computador do trabalho ou de casa pode iniciar operações pelo mesmo repositório. Uma Factory Run não pode depender do computador inicial para preservar estado.

Workers locais são capacidade oportunística. Workers remotos e GitHub Actions continuam independentes do PC local.

## Fases

1. contrato e validação de Factory Run — concluído;
2. criação segura de parent/child issues — concluído;
3. provider Jules, primeira wave — implementado nesta fase;
4. reconciliation de dependências e resultados;
5. provider Antigravity;
6. provider OpenCode/Ollama local;
7. merge train, status e telemetria de execução.
