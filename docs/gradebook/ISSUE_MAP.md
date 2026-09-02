# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Onda 16:** #325/#326/#327 + #332 → integração #328
- **Onda 17:** #335 + #336 → integração #337
- **Onda 18:** #340 + #341 + #342 → integração #343 / PR #352
- **Onda 19:** #353 + #354 + #355 → integração #356
- **Armazenamento físico atual:** Cloudflare D1 local/preview, migrations 0001–0004
- **Produção acadêmica:** sem D1 remoto, binding, migration remota ou ativação de consultas
- **Autoridade ativa:** `imported-source`
- **Autoridade-alvo futura:** `native-engine`, somente após F9/readiness e #347
- **Autorização acadêmica:** `gradebook.persistence.admin`, server-side

## Fases — estado funcional após onda 18

| Fase | Issue | Estado | Próximo grande passo |
| --- | ---: | --- | --- |
| F0 Fundação | #183 | concluída | manutenção |
| F1 Fonte/importação | #184 | **concluída/validada 7/7** | manutenção |
| F2 Persistência | #185 | D1 local V1 + UoW/runtime + durabilidade Bulletin/Council | produção somente em F9 |
| F3 Motor | #186 | concluído, comparativo | autoridade futura via #347/F9 |
| F4 Auditoria | #187 | V1 operacional/hardened; fechamento literal pendente | #353 |
| F5 Centrais | #188 | V1 operacional/hardened; cadastro/confirmação docente pendente | #354 |
| F6 Desempenho | #189 | V1 end-to-end; comparison/gráficos pendentes | #355 |
| F7 Conselho | #190 | V2 institucional + decisões duráveis local/preview | resíduos de roadmap/F9 fora da onda 18 |
| F8 Boletins/Relatórios | #191 | PDF individual + batch bounded + reports + snapshots duráveis local/preview | produção em F9 |
| F9 Piloto/segurança | #192 | hardening integrado; piloto/produção/autoridade pendentes | após fechamento F4–F6 |

## F1

#184 está `completed`, F1 = **7/7**. Protocolo privado controlado, smoke autenticado e falha isolada passaram; arquivos reais modificados 0, dados identificáveis publicados 0, gates históricos antigos restantes 0.

## Onda 18 — durabilidade + Conselho V2 + Relatórios

| Frente | Issue / PR | Entrega |
| --- | --- | --- |
| Durabilidade | #340 / #351 | migration 0004, 4 tabelas, snapshots Bulletin + decisões Council duráveis, append-only/CAS |
| Conselho V2 | #341 / #345 | revisão/fechamento, fotografia e histórico imutáveis, votação opcional, desempate fail-closed |
| Relatórios | #342 / #346 | cinco famílias de relatório + artefatos PDF bounded/sequenciais |
| Integração | #343 / #352 | providers no runtime, Council V2/Reports no shell, bridges, testes/docs/deploy |

Merges das frentes:

```text
#351 → 27774b98f3e70eae32b917093a6954d6ccc9ec07
#345 → 6c87092b0829d5346d3bb86fe71ae03e15b771b9
#346 → a75f94deb86c8b8721e0f8fbbbeb4cc7be8f7f52
```

### Invariantes pós-onda 18

- exatamente um bridge Operational/Audit/Performance/Bulletins/Reports/Council;
- auth server-side, `gradebook.persistence.admin`, `no-store`;
- produção fail-closed antes de `GRADEBOOK_D1`;
- zero browser persistent storage acadêmico;
- rota e superfícies lazy/isoladas;
- PDF individual e batch continuam snapshot/model-only, sem segundo motor;
- batch PDF: máximo 3 documentos, 72 páginas totais, uma geração concorrente;
- reprint batch: somente snapshots históricos;
- snapshots Bulletin e decisões Council: D1 local/preview duráveis;
- Council V2: fechamento imutável e bloqueio pós-fechamento; sessão V2 permanece provider-independent/process-local nesta versão;
- desempate sem identidade formal de diretor continua fail-closed;
- Performance comparison continua `not-comparable` sem semântica oficial;
- `authorityMode` continua `imported-source`.

## Onda 19 — fechamento F4/F5/F6

As próximas frentes grandes ficam bloqueadas até #343 concluir:

1. **#353 — F4 fechamento / Extra Alto:** revisão autoritativa bullet-a-bullet de Reconciliação/Auditoria e correção de eventual lacuna real sem microissues.
2. **#354 — F5 fechamento / Extra Alto:** cadastro/confirmação de Professor e atribuições anuais, reutilizando as portas e entidades oficiais.
3. **#355 — F6 fechamento / Extra Alto:** comparabilidade proporcional somente se a semântica estiver oficialmente fechada + poucos gráficos úteis sem métricas inventadas.
4. **#356 — Integração / Extra Alto:** merges, composição, verify/deploy/docs e preparação de F9.

```text
#353 ─┐
#354 ─┼──> #356
#355 ─┘
```

## F9 e autoridade futura

A produção acadêmica continua desativada. Não existe banco/binding/migration remota. A futura transição para o motor nativo como autoridade está concentrada na #347 e só pode ocorrer após readiness/piloto F9, perfil/versionamento congelados, rollback e vigência explicitamente autorizada. Nenhuma onda anterior altera resultados históricos silenciosamente.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. sem merge/deploy/provisionamento/`PROJECT_STATE.yaml` em frente comum;
7. integração somente pela issue integradora.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
