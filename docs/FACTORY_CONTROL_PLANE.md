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

## Estado inicial

A primeira fase do Control Plane é provider-neutral. Ela prepara contratos e gatilhos do GitHub antes de conectar Jules, Antigravity ou OpenCode/Ollama.

O Banco de Notas continua em sua branch/PR atual. Esta fundação não escreve em `feat/banco-de-notas-foundation`, não retira draft, não ativa sync e não faz deploy de produção.

## Regras permanentes

- GitHub é a fonte de verdade para estado durável da execução.
- Cada worker deve trabalhar em branch/PR isolado.
- Tarefas paralelas não podem compartilhar escopo de escrita conhecido.
- Produção, privilégios, operações destrutivas e decisões reais de produto exigem decisão humana.
- Codex não é worker automático de volume.
- Providers externos são adaptadores substituíveis.
- Secrets de providers ficam em mecanismo próprio e nunca no manifesto da Factory Run, issue body, logs ou artifacts.
- Nenhuma operação aceita `command`, `script`, `shell`, URL/endpoint arbitrário ou outro executor livre.

## Continuidade entre computadores

O computador do trabalho ou de casa pode iniciar operações pelo mesmo repositório. Uma Factory Run não pode depender do computador inicial para preservar estado.

Workers locais são capacidade oportunística. Workers remotos e GitHub Actions continuam independentes do PC local.

## Fases

1. contrato e validação de Factory Run;
2. criação segura de parent/child issues;
3. provider Jules;
4. provider Antigravity;
5. provider OpenCode/Ollama local;
6. reconciliation/merge train;
7. status e telemetria de execução.
