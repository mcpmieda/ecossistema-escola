# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#245` — adaptador D1 de escrita, ainda bloqueado;
- `#246` — integração da sétima onda.

As integrações `#203`, `#210`, `#214`, `#221`, `#229` e `#237` já foram concluídas.

## Ondas concluídas

| Onda | Issues | Integração |
|---:|---|---|
| 1 | `#193`, `#194`, `#195` | `#203` |
| 2 | `#196`, `#198` | `#210` |
| 3 | `#197`, `#201` | `#214` |
| 4 | `#199`, `#218`, `#219` | `#221` |
| 5 | `#226`, `#227`, `#228` | `#229` |
| 6 | `#234`, `#235`, `#236` | `#237` |

A sexta onda integrou recuperação paralela nativa, migration 0003 + leitura D1 local e o executor transacional abstrato. Código vigente: `e8be42bd65b0a59d837ee6ca8283d9564967a6db`; deploy: `33441758173`.

## Onda 7 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#242` | Consolidar o resultado trimestral nativo |
| 2 | `#243` | Formalizar a associação transacional fonte lógica ↔ stream |
| 3 | `#244` | Implementar recuperação final nativa |

As três issues escrevem em áreas diferentes e podem começar juntas. A integração será feita exclusivamente pela `#246`.

## Adaptação obrigatória da #243

A migration 0003 e o adaptador de leitura já conhecem a associação entre fonte lógica e stream acadêmico. Porém, as portas, o plano e o executor ainda não representam a **escrita versionada dessa associação**.

A #243 corrige o contrato antes do adaptador físico. Não é permitido esconder essa escrita como efeito colateral do D1, varrer JSON ou inferir relação pelo nome do arquivo.

## O que cada tarefa libera

```text
#242 + #244 → resultado anual e precedências do motor
#243        → libera #245
#245        → escrita/promoção transacional concreta no D1 local
```

## Gates manuais que não bloqueiam a onda 7

- Executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes de fechar definitivamente a F1.
- O happy path visual da #199 foi aprovado com dois arquivos XLSB. Ainda faltam expandir o SHA-256 completo, observar a etapa transitória e conferir uma falha isolada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> #203
#196 + #198 ──────────> #210
#197 + #201 ──────────> #214
#199 + #218 + #219 ───> #221
#226 + #227 + #228 ───> #229
#234 + #235 + #236 ───> #237

AGORA
#242 ─┐
#243 ─┼──> integração #246 ──> oitava onda
#244 ─┘
```

## Instrução simples para iniciar

1. Escolha `#242`, `#243` ou `#244`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff.
6. O agente não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. Depois das três entregas, execute a integração pela `#246`.
