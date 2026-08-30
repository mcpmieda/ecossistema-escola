# Factory — providers duráveis: estado final

Atualizado em 30 de agosto de 2026.

## Estado final

A automação multiagente do ecossistema está encerrada no escopo operacional comprovado:

- `opencode_ollama` como provider durável preferencial quando disponível;
- `jules` como provider remoto suportado;
- `codex` permanece fora do fallback automático e só pode ser usado manualmente.

Não há homologações adicionais obrigatórias nem roadmap residual associado a esta implementação.

## Antigravity

A expansão para Antigravity foi encerrada sem prova live e foi retirada da política de despacho automático. Uma task que declare somente `antigravity` fica sem provider automático em vez de iniciar um piloto incompleto.

Artefatos históricos ou contratos compatíveis que ainda mencionem esse identificador não lhe concedem autoridade de execução automática.

## Arquitetura preservada

O estado durável continua no GitHub e não no executor:

- manifesto imutável da Factory Run;
- issue tipada da task;
- comentários e labels confiáveis;
- lease quando aplicável;
- worker branch;
- commits e SHA remoto;
- PR para a integration branch;
- CI ligado ao SHA exato;
- marcador de merge.

O executor local pode desaparecer ou ser substituído sem se tornar fonte de verdade.

## Fluxo suportado

```text
Factory Run
  -> materialização no GitHub
  -> task pronta
  -> seleção OpenCode/Ollama ou Jules
  -> worker isolado
  -> commit/push apenas na worker branch
  -> revalidação de escopo e SHA
  -> CI exato
  -> integração somente na integration branch
  -> liberação de dependências
  -> PR final controlado
```

## Guardrails permanentes

Workers não recebem autoridade para:

- escrever `.github`, `infra/factory` ou `infra/validation` fora dos fluxos confiáveis;
- fazer merge automático em `main` ou outro target humano;
- ativar produção;
- habilitar sincronização do Banco de Notas;
- ampliar permissões;
- acessar secrets de GitHub Actions por conveniência;
- escolher Codex automaticamente.

## Evidência já concluída

As provas históricas preservadas demonstraram:

- Jules API-first remoto;
- OpenCode/Ollama real com escrita limitada, commit/push controlado e SHA remoto confirmado;
- execução paralela Jules + OpenCode/Ollama;
- dependências entre tasks;
- recuperação por estado durável;
- isolamento de branches;
- CI por SHA exato;
- integração apenas na branch intermediária;
- target final sob controle humano.

Essas provas encerram o projeto atual. Qualquer novo provider, reviewer ou extensão será considerado um projeto novo e exigirá decisão explícita própria.
