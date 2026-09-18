# Google Antigravity — execução sob demanda

Esta integração disponibiliza o Google Antigravity como **executor secundário**, sem App Factory e sem execução automática.

## Princípio

O agente líder continua responsável por arquitetura, regras de negócio, contratos e integração transversal conforme `AGENTS.md`.

Antigravity recebe apenas tarefas delimitadas. O comando de execução não concede autoridade de merge, deploy, produção, secrets ou infraestrutura.

## Acionamento

Uma issue só pode ser enviada ao Antigravity quando:

1. foi criada pelo proprietário do repositório;
2. contém um handoff estruturado entre os marcadores abaixo;
3. o proprietário comenta exatamente `/antigravity` na issue.

Comentários comuns não acionam o agente. PRs não acionam o agente.

### Handoff obrigatório

```md
<!-- AGENT_HANDOFF_BEGIN -->
{
  "schema_version": 1,
  "leader": "GPT-5.6 Sol",
  "goal": "Descreva o resultado concreto esperado.",
  "allowed_paths": [
    "src/exemplo/**",
    "tests/exemplo/**"
  ],
  "preserve": [
    "Contrato X permanece a fonte de verdade.",
    "Não alterar comportamento Y."
  ],
  "do_not": [
    "Não criar regra de negócio no frontend.",
    "Não alterar contratos compartilhados."
  ],
  "validate": [
    "npm run verify"
  ]
}
<!-- AGENT_HANDOFF_END -->
```

O workflow rejeita a tarefa antes de chamar o Google se o handoff estiver ausente ou inválido.

## Limites técnicos da integração

- Modelo inicial fixado em `gemini-3.8-flash`.
- SDK fixado em `google-antigravity==0.1.17`.
- Máximo por execução: 12 chamadas de modelo, 80 chamadas de ferramenta e 60.000 tokens totais.
- Subagentes e ferramentas Web ficam desativados.
- O agente pode ler/criar/editar somente no workspace.
- Comandos de terminal são limitados aos comandos declarados em `validate` e executados com sandbox solicitado.
- O agente não recebe `GITHUB_TOKEN`.
- `GEMINI_API_KEY` é removida do ambiente antes da execução de comandos do agente.
- Mudanças em `.github/**`, `AGENTS.md`, `infra/agents/**`, `.env*` e `docs/gradebook/PROJECT_STATE.yaml` são bloqueadas para o executor.
- Depois da execução, o workflow confere todos os arquivos modificados contra `allowed_paths`. Qualquer desvio falha fechado e não é publicado.

## Publicação

Quando houver alterações válidas:

1. o workflow cria um commit em uma branch `antigravity/issue-<número>-<run>`;
2. envia a branch ao GitHub;
3. tenta abrir um PR em **draft** contra `main`;
4. nunca faz merge nem deploy.

Se a configuração do GitHub impedir que `GITHUB_TOKEN` crie pull requests, a branch permanece publicada e a issue recebe um comentário; o PR pode ser aberto posteriormente por uma autoridade conectada.

Quando não houver alteração, a issue recebe somente o resumo da execução.

## Credencial

O workflow espera um Repository Secret:

`GEMINI_API_KEY`

A chave deve ser criada no Google AI Studio/Gemini API e armazenada somente em GitHub Actions Secrets. Nunca coloque a chave em issue, comentário, arquivo, commit ou variável pública.

O Antigravity Agent está disponível no free tier da Gemini API com cota gratuita e rate limit próprios. A cota pode mudar; a integração também impõe o orçamento local acima para reduzir consumo inesperado.
