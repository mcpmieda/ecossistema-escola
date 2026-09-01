# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua como tarefa comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#306` — integração da próxima onda, bloqueada pelas quatro frentes.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237`, `#246`, `#256`, `#264`, `#272`, `#281`, `#288` e `#297` pertencem às ondas já integradas quando este documento estiver na `main`.

## Décima terceira onda — contratos integrados

|  Issue | Entrega                                                | PR / merge       |
| -----: | ------------------------------------------------------ | ---------------- |
| `#293` | Contrato V1 da experiência operacional F5              | `#298` / `8452199` |
| `#294` | Contrato V1 do workspace de Auditoria/revisão F4       | `#301` / `a78e410` |
| `#295` | Contrato V1 do read model de Desempenho F6             | `#299` / `706426b` |
| `#296` | `BulletinModelV1` e emissão versionada F8              | `#300` / `e7b9298` |

A integração #297 verifica os quatro juntos. Invariantes comuns:

- ano acadêmico explícito, sem fallback pelo relógio;
- autorização efetiva e identidade de ator/emissor no servidor;
- cursores opacos e ausência de totais quando o contrato assim define;
- ausência, não aplicabilidade e insuficiência preservadas sem virar zero;
- `authorityMode: imported-source`, inclusive nas projeções internas de Boletins;
- nenhuma fórmula, regra acadêmica ou executor de promoção concorrente.

Nenhum desses contratos, sozinho ou em conjunto, ativa UI, endpoint, persistência acadêmica ou recurso remoto em produção.

## Próxima onda — quatro frentes grandes e paralelas

As issues foram criadas pela #297. **O título atual da issue é a autoridade de execução:** enquanto estiver `[BLOQUEADA]`, não iniciar; depois que a #297 concluir CI, merge, deploy e smokes, o integrador muda as quatro para `[PRONTA]`.

| Frente | Issue | Trabalho | Executor | Caminhos reservados principais |
| :----: | ----: | -------- | -------- | ------------------------------ |
| A | `#302` | Experiência operacional local/preview F5, Centrais, ano, pesquisa e HeroUI | **Extra Alto** | `src/features/gradebook/operational-workspace/**`, `server/gradebook/application/operational-workspace/**` |
| B | `#303` | Workspace de Auditoria local/preview F4 | **Codex GPT-5.6 Sol, esforço max** | `server/gradebook/application/audit-workspace/**` |
| C | `#304` | Read model provider-independent de Desempenho F6 | **Codex GPT-5.6 Sol, esforço max** | `server/gradebook/application/read-models/performance/**` |
| D | `#305` | Emissão provider-independent de Boletins F8 | **Codex GPT-5.6 Sol, esforço max** | `server/gradebook/application/bulletins/**` |

A integração seguinte é `#306`, bloqueada pelas quatro.

As quatro frentes não editam contratos compartilhados silenciosamente e foram desenhadas para começar em paralelo depois da liberação da #297. Separar trabalho adicional somente quando surgir conflito real de caminho, contrato, persistência, renderização ou decisão arquitetural.

### Frente A — #302

- consome o contrato #293 e a fachada/read models existentes;
- implementa experiência das Centrais com seleção explícita de ano e pesquisa acadêmica;
- usa HeroUI React v3 no shell existente;
- não cria regra acadêmica no frontend;
- não ativa endpoint/UI acadêmica em produção nesta onda.

### Frente B — #303

- consome #294;
- implementa listas, filtros, detalhe, pendências e resolução versionada;
- reutiliza repositórios existentes;
- promoção continua exclusivamente em `planImportReconciliation` + `executeImportChangePlan`;
- ator, autorização e instante efetivos permanecem no servidor.

### Frente C — #304

- consome #295;
- implementa matriz, quatro lentes, paginação, cobertura, comparabilidade e detalhe sob demanda;
- preserva lados importado/calculado e `authorityMode: imported-source`;
- não cria fórmula, arredondamento, recuperação, classificação ou tolerância concorrente.

### Frente D — #305

- consome #296;
- materializa `BulletinModelV1`, emissão/snapshot, reimpressão e lote;
- `imported-source` é invariável no modelo e em todas as projeções internas;
- reimpressão usa snapshot histórico e não recalcula silenciosamente;
- PDF/renderização e persistência remota ficam fora se exigirem decisão ou caminho próprios.

## Sessão temporária #273

A #273 não é orquestrador paralelo e não recebe a nova fila. Cada issue executável deve ser entregue diretamente ao agente indicado, com branch e PR próprios.

```text
issue → branch curta → PR → npm run verify → handoff
quatro frentes verdes → integração #306 → main → deploy → próxima onda
```

Não usar App Factory, Factory Runs, subagentes ou automação permanente.

## Estado real do D1

Já existem:

- migrations 0001–0003 e 21 tabelas;
- leitura/escrita local de ano, entidades, fonte, lotes, registros, associações e Auditoria;
- promoção transacional local com CAS, savepoints e rollback;
- runtime injetado permitido somente em local/preview;
- runner canônico e idempotente das migrations;
- capability administrativa no servidor e rotas `no-store`;
- quatro read models operacionais e pesquisa acadêmica na mesma fachada autorizada;
- contratos V1 integrados para experiência operacional, Auditoria, Desempenho e Boletins.

Ainda não existem em produção:

- banco D1 acadêmico remoto/persistente;
- binding remoto ou migration remota;
- persistência ou consulta acadêmica ativa no site oficial;
- experiência HeroUI das Centrais consumindo os novos contratos;
- workspace funcional de Auditoria/revisão;
- matriz executável de Desempenho;
- emissão executável de boletim/PDF ou persistência de snapshots.

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