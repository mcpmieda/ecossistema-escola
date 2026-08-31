# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#221` — integração da quarta onda;
- `#220` — planejamento futuro de Saúde e limites.

As integrações `#203`, `#210` e `#214` já foram concluídas. A decisão `#200` também foi concluída: **Cloudflare D1 é o armazenamento físico aprovado**.

## Ondas concluídas

| Onda | Issues | Integração |
|---:|---|---|
| 1 | `#193`, `#194`, `#195` | `#203` |
| 2 | `#196`, `#198` | `#210` |
| 3 | `#197`, `#201` | `#214` |

A terceira onda integrou os contratos de lote/reconciliação/Auditoria e a primeira função pura do motor. O código vigente foi publicado no commit `9476f84af7f99733c32f4a2503a50a4ef3c15c3f`, deploy `33424938206`.

## Onda 4 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#199` | SHA-256, manifesto e proveniência visível no importador |
| 2 | `#218` | Arredondamento acadêmico nativo V1 |
| 3 | `#219` | Portas de persistência e transação independentes do D1 |

As três issues escrevem em áreas diferentes e podem começar juntas. A integração será feita exclusivamente pela `#221`.

## Depois da onda 4

A `#221` criará/liberará tarefas pequenas para:

- composição trimestral do motor, depois de `#218`;
- esquema e migrations D1, depois de `#219`;
- idempotência e versionamento persistente, depois de `#199` + `#219`.

## Planejada, mas não executar agora

`#220` criará futuramente `Centro de Administração → Configurações → Saúde e limites`, após existirem binding D1 e backend de métricas. Ela não pertence à onda atual.

## Gate manual que não bloqueia a onda 4

A suíte sintética e o protocolo foram criados em `#198`. A execução controlada com as planilhas reais continua pendente antes do fechamento definitivo da F1. Ela deve seguir `REAL_DATA_VALIDATION.md` e nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> #203
#196 + #198 ──────────> #210
#197 + #201 ──────────> #214

AGORA
#199 ─┐
#218 ─┼──> integração #221 ──> quinta onda
#219 ─┘

DECISÃO CONCLUÍDA
#200 ──> Cloudflare D1
```

## Instrução simples para iniciar

1. Escolha `#199`, `#218` ou `#219`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente a tarefa, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff, mas não faz merge.
6. Depois das três entregas, execute a integração pela `#221`.
