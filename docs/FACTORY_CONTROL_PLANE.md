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
  -> reconciliação de dependências
  -> integração controlada
```

## Estado atual

O Control Plane materializa Factory Runs em issues-filho, possui o primeiro adaptador remoto via Jules e reconcilia dependências depois de PRs mesclados.

O Banco de Notas continua em sua branch/PR atual. Esta fundação não escreve em `feat/banco-de-notas-foundation`, não retira draft, não ativa sync e não faz deploy de produção.

## Jules — primeira wave remota

O Control Plane não armazena API key do Jules. Para uma tarefa elegível, aplica a label exata `jules`, que funciona como solicitação ao GitHub App do Jules quando o repositório já está autorizado no serviço.

Uma tarefa recebe o trigger `jules` somente quando todas as condições abaixo são verdadeiras:

- a Factory Run foi aberta/editada pelo proprietário do repositório;
- não possui `human_gates`;
- não depende de outra tarefa (`depends_on` vazio); ou suas dependências foram reconciliadas com evidência válida;
- lista `jules` explicitamente em `preferred_providers`.

As labels usadas são:

- `factory:task`: issue-filho da Factory Run;
- `factory:provider:jules`: seleção interna do provider;
- `jules`: trigger externo oficial;
- `factory:waiting`: tarefa que ainda aguarda dependências;
- `factory:ready`: dependências confirmadas, mas sem provider remoto disponível/selecionado;
- `factory:human-required`: tarefa que depende de decisão humana.

A issue-filho é criada primeiro e a label `jules` é adicionada em seguida, produzindo um evento explícito de rotulagem para o GitHub App. Aplicar a label é registrado como `trigger-requested`, não como execução concluída. O Jules ainda precisa ter acesso ao repositório pelo seu GitHub App. Ausência dessa autorização não provoca fallback inseguro nem uso automático de Codex.

## Reconciliação de dependências

O workflow `Factory Reconciliation` roda quando qualquer PR é efetivamente mesclado. Ele varre somente issues abertas com `factory:waiting` e trabalha em modo fail-closed.

Uma dependência é considerada concluída apenas quando:

1. a issue da tarefa foi materializada por `github-actions[bot]` e contém o marcador imutável de `run_id` + `task id`;
2. existe comentário do login oficial `google-labs-jules[bot]` na issue com link para um PR do mesmo repositório;
3. o PR está realmente mesclado na branch padrão do repositório;
4. o PR alterou pelo menos um arquivo;
5. todos os arquivos alterados estão dentro dos `paths` declarados pela tarefa predecessora.

Se qualquer condição falhar, a tarefa dependente permanece em `factory:waiting`.

Quando todas as dependências são comprovadas:

- se a tarefa prefere Jules, `factory:waiting` é removida e o trigger `jules` é emitido em evento de label separado;
- se não há provider remoto suportado/selecionado, a tarefa passa para `factory:ready`;
- nenhuma reconciliação concede merge, deploy, produção ou mudança de privilégio.

Essa política evita liberar uma etapa apenas porque uma issue foi fechada, um comentário humano alegou conclusão ou um PR alterou arquivos fora do escopo previsto.

## Regras permanentes

- GitHub é a fonte de verdade para estado durável da execução.
- Factory Runs capazes de materializar ou disparar providers só são aceitas do proprietário do repositório.
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
3. provider Jules, primeira wave — concluído no Control Plane;
4. reconciliation de dependências e resultados — implementado nesta fase;
5. provider Antigravity;
6. provider OpenCode/Ollama local;
7. merge train, status e telemetria de execução.
