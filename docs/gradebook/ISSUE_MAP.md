# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Programa:** #182
- **Onda 19:** #353 + #354 + #355 → #356 / PR #362
- **Onda 20:** #360 / PR #363 → #361
- **Armazenamento:** Cloudflare D1 local/preview, migrations 0001–0004 / 25 tabelas
- **Produção acadêmica:** sem D1 remoto, binding ou migration remota; consultas/persistência desativadas
- **Autoridade ativa:** `imported-source`
- **Autoridade-alvo futura:** `native-engine`, separada em #347/F9
- **Autorização acadêmica:** `gradebook.persistence.admin`, server-side

## Fases após onda 20

| Fase                   | Issue | Estado                                                          | Próximo grande passo                     |
| ---------------------- | ----: | --------------------------------------------------------------- | ---------------------------------------- |
| F0 Fundação            |  #183 | concluída                                                       | manutenção                               |
| F1 Fonte/importação    |  #184 | **concluída/validada 7/7**                                      | manutenção                               |
| F2 Persistência        |  #185 | D1 local + durabilidade Bulletin/Council                        | produção somente por autorização própria |
| F3 Motor               |  #186 | V1 concluída, comparativa                                       | futura autoridade via #347/F9            |
| F4 Auditoria           |  #187 | revisão autoritativa 7/7 concluída                              | manutenção                               |
| F5 Centrais            |  #188 | cadastro/confirmação docente + atribuições anuais concluídos    | manutenção                               |
| F6 Desempenho          |  #189 | gráficos oficiais; comparação proporcional bloqueada            | decisão canônica de semântica            |
| F7 Conselho            |  #190 | V2 institucional + decisões duráveis local/preview              | gates residuais próprios                 |
| F8 Boletins/Relatórios |  #191 | snapshots duráveis + PDF individual/batch + reports             | produção somente por autorização própria |
| F9 Piloto/segurança    |  #192 | readiness preparado; piloto/produção/autoridade não autorizados | gates manuais independentes              |

## Onda 20 — F9 readiness

| Frente     | Issue / PR  | Entrega                                                                                        |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Readiness  | #360 / #363 | manifesto puro, evidências, hard stops, ensaios sintéticos e runbook de piloto/rollback futuro |
| Integração | #361        | regressão transversal, estado canônico e publicação inerte                                     |

Merge da frente:

```text
#363 → 000a6988565419d9c1f2c638e929af4e0dff1491
```

### Resultado integrado

- preparação completa resulta somente em `prepared-for-manual-authorization`;
- cinco ações produtivas/institucionais continuam bloqueadas por autorização própria;
- ensaios usam somente dados sintéticos e D1 em memória/local;
- plano de smoke futuro é declarativo e não executa rede/migration;
- produção continua fail-closed antes do binding;
- `authorityMode` continua `imported-source`;
- nenhum recurso, secret, binding, migration remota ou piloto real foi criado/executado.

## Gates manuais após a publicação

1. recurso e binding produtivos;
2. migration remota;
3. smoke acadêmico produtivo;
4. piloto privado real;
5. autoridade nativa, pela trilha separada #347.

Nenhum desses gates é consequência automática da #361. Nova execução exige autorização própria e escopo explícito.

## Como iniciar agente

1. usar apenas issue `[PRONTA]`;
2. ler `AGENTS.md`, docs e contratos;
3. uma branch curta / um PR;
4. `npm run verify` no SHA final;
5. handoff completo;
6. não executar merge/deploy/provisionamento fora da autoridade expressa;
7. nunca antecipar #347.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
