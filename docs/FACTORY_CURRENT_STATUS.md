# App Factory — estado operacional atual

Atualizado em 27 de agosto de 2026.

Este arquivo é o snapshot curto de estado. Em caso de divergência com seções históricas de `FACTORY_CONTROL_PLANE.md`, este snapshot deve ser conferido contra as evidências reais do GitHub antes de repetir homologações.

## Comprovado

- Factory Control Plane e Jules API-first integrados em `main`.
- Gateway durável multi-provider integrado em `main`.
- Providers automáticos reconhecidos: OpenCode/Ollama, Jules e Antigravity; Codex permanece manual-only.
- Paralelismo, dependências, branches isoladas e CI por SHA exato comprovados.
- Retomada idempotente de `factory:ci` após restart comprovada.
- Lease/heartbeat e takeover entre executores distintos após expiração comprovados em execução real.
- Merge final no target continua humano.
- Produção, ampliação de privilégios e Banco de Notas sync continuam fora da autoridade da Factory.

## Jules

Homologado no piloto `jules-api-pilot-002`, incluindo dois workers paralelos, tarefa dependente, retomada durável, CI consolidado e gate humano final.

## OpenCode/Ollama

O caminho operacional real está comprovado com OpenCode 1.18.23 + Ollama 0.33.1 + Qwen3 0.6B:

- inferência local real;
- tool call `write` real;
- alteração limitada ao escopo;
- commit pelo runtime confiável;
- push para worker branch;
- nenhum shell concedido ao modelo;
- falha fechada quando o conteúdo não satisfaz o contrato de homologação.

Os pilotos v13 e v15 chegaram a `write + commit + push`, mas o gate artificial de conteúdo Markdown byte-for-byte ainda rejeitou diferenças de serialização/formatação. Isso não deve ser confundido com falha do protocolo durável ou da publicação segura. A homologação final deve validar argumentos estruturados bounded e o diff real sem reduzir os guardrails de path, SHA, CI ou autoridade.

O experimento v14 com Qwen3 1.7B não produziu tool call dentro das tentativas limitadas e falhou fechado; não substitui o caminho 0.6B já comprovado.

## Antigravity

Contrato e workflow existem, mas a prova live continua bloqueada por dependência externa: runner Linux x64 efêmero/freshly reprovisioned com labels `self-hosted`, `Linux`, `X64`, `factory-antigravity`, `ephemeral`, `agy` instalado e profile Antigravity dedicado/autenticado fora do worktree. O provider não pode receber credencial de publicação GitHub.

## Dependências externas restantes

1. Habilitar administrativamente `Allow GitHub Actions to create and approve pull requests` no repositório do Ecossistema para autonomia de criação de worker/final PR; merge final continua humano.
2. Provisionar o runner/profile Antigravity descrito acima.
3. Conectar evidência real de revisão externa para o Merge Train. CodeRabbit está instalado, mas informa que review automático não roda em repositório com menos de 10 estrelas; Semgrep/Sonar ainda não têm integração real detectada no repositório.

## Próxima definição de pronto

A Factory pode ser usada operacionalmente com Jules hoje. Para declarar a visão multi-provider completa pronta, faltam somente as provas externas/últimos gates: homologação estruturada final do OpenCode/Ollama, piloto live Antigravity, permissão administrativa de criação de PR por Actions e Merge Train com revisores reais disponíveis.
