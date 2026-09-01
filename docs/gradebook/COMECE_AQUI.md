# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua como tarefa comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#281` — integração da décima primeira onda.

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

## Décima primeira onda — executar agora

| Ordem da sessão serial |  Issue | Trabalho                                     | Agente recomendado                            |
| ---------------------: | -----: | -------------------------------------------- | --------------------------------------------- |
|                      1 | `#278` | Read model local da Central do Aluno         | **Codex**                                     |
|                      2 | `#279` | Read model local da Central da Turma         | **Codex**                                     |
|                      3 | `#280` | Read models locais de Professor e Componente | **Codex**                                     |
|                      — | `#281` | Integração e liberação da próxima onda       | **Pro**; não autorizado ao Codex nesta sessão |

As três implementações escrevem em caminhos disjuntos e consomem somente portas por injeção. Durante a sessão temporária `#273`, o mesmo Codex executa apenas `#278 → #279 → #280`, em série, uma por branch e PR. A #281 exige autorização explícita nova.

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

Ainda não existem:

- banco D1 remoto/persistente;
- binding remoto ou migration remota;
- persistência acadêmica ativa no site oficial;
- read models das centrais operacionais;
- interface funcional de revisão/Auditoria.

## Gates manuais que não bloqueiam a décima primeira onda

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
