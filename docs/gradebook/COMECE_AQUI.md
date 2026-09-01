# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua como tarefa comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#288` — integração planejada da décima segunda onda.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237`, `#246`, `#256` e `#264` foram concluídas.

## Nona onda — concluída e integrada

|  Issue | Entrega                                               | PR/merge           |
| -----: | ----------------------------------------------------- | ------------------ |
| `#261` | Runtime D1 local/preview, runner e backend autorizado | `#268` / `44bde4d` |
| `#262` | Contexto acadêmico único de 2026                      | `#267` / `4584af4` |
| `#263` | Equivalência anual fonte × motor                      | `#266` / `94535a9` |

A produção continua sem banco, binding ou migration D1 remota. A autoridade permanece `imported-source`.

## Décima onda — concluída e integrada

|  Issue | Entrega                                                            | PR/merge                 |
| -----: | ------------------------------------------------------------------ | ------------------------ |
| `#269` | Repositório D1 local de entidades acadêmicas                       | `#275` / `57e7a98`       |
| `#270` | Repositório D1 local de importações                                | `#276` / `2f5ed83`       |
| `#271` | Repositório D1 local de Auditoria e reconciliação                  | `#277` / `79a2426`       |
| `#272` | UoW integral, verificação, integração e liberação da onda seguinte | PR próprio de integração |

## Décima primeira onda — concluída e integrada

|  Issue | Entrega                                   | PR/merge           |
| -----: | ----------------------------------------- | ------------------ |
| `#278` | Read model local da Central do Aluno     | `#283` / `1e79af0` |
| `#279` | Read model local da Central da Turma     | `#284` / `5483fe5` |
| `#280` | Read models de Professor e Componente    | `#285` / `3dd300f` |
| `#281` | Fachada única, integração e próxima onda | PR de integração   |

## Décima segunda onda — fila condicionada

| Ordem |  Issue | Trabalho                                         | Agente recomendado |
| ----: | -----: | ------------------------------------------------ | ------------------ |
|     1 | `#286` | Contrato da pesquisa global acadêmica autorizada | **Pro**            |
|     2 | `#287` | Read model local da pesquisa, bloqueado por #286 | **Codex**          |
|     3 | `#288` | Integração, bloqueada por #286 e #287            | **Pro**            |

A sessão #273 deve parar depois da #281: a primeira tarefa é exclusiva para Pro e a #287 ainda não
está pronta nem explicitamente autorizada ao Codex.

## Sessão temporária

A issue `#273` autoriza uma única sessão do Codex 5.6 High a percorrer a fila, mantendo o processo oficial:

```text
issue → branch → PR → verify → handoff
onda concluída → integração → main → deploy → próxima onda
```

Ela não cria App Factory, workflow, subagente ou orquestrador. Os comandos do responsável são `PAUSAR`, `PARAR`, `RETOMAR` e `ENCERRAR MODO AUTÔNOMO`.

## Estado real do D1

Já existem:

- migrations 0001–0003 e 21 tabelas;
- leitura/escrita local de ano, fonte, registros e associações;
- promoção transacional local com CAS, savepoints e rollback;
- runtime injetado permitido somente em local/preview;
- runner canônico e idempotente das migrations;
- capability administrativa no servidor e rotas `no-store`.
- quatro read models operacionais e uma fachada única no runtime local/preview autorizado.

Ainda não existem:

- banco D1 remoto/persistente;
- binding remoto ou migration remota;
- persistência acadêmica ativa no site oficial;
- contrato e read model da pesquisa global acadêmica autorizada;
- interface funcional de revisão/Auditoria.

## Gates manuais que não bloqueiam o trabalho local seguro

- executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado;
- expandir o SHA-256 completo no smoke autenticado;
- observar a etapa transitória de hash;
- conferir falha isolada controlada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Instrução para execução comum

1. Entregue somente uma issue `[PRONTA]` ao agente indicado.
2. O agente lê `AGENTS.md`, `docs/gradebook/`, a issue e os contratos citados.
3. Executa diretamente, sem App Factory ou agentes auxiliares.
4. Cria branch curta e um único PR.
5. Executa `npm run verify` no SHA final e registra o handoff.
6. Não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. O integrador executa a issue própria da onda.
