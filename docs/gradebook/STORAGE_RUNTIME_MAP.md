# Mapa atual de persistência física e interfaces — BN-05

Baseline original BN-05: `main@4eb8ea70131a0479ecf60407e91e3c2ab65e6b93`. Atualizações posteriores deste documento refletem BN-08/BN-14 e devem ser lidas junto ao `PROJECT_STATE.yaml` corrente.

## Fonte física oficial

Em produção, o Banco de Notas usa:

```text
Pages/Worker
  → GRADEBOOK_STORAGE_PROVIDER=postgres
  → withOfficialGradebookDatabaseV1
  → Hyperdrive PROD_DB
  → PostgreSQL/Supabase
  → schema gradebook
```

O `wrangler.jsonc` da aplicação oficial declara `GRADEBOOK_STORAGE_PROVIDER=postgres` e o binding Hyperdrive `PROD_DB`. Ele **não declara binding D1 acadêmico** para o runtime oficial.

## Por que ainda existe o nome GRADEBOOK_D1

`GRADEBOOK_D1` é hoje usado em dois sentidos diferentes no código histórico:

1. **porta/interface de compatibilidade** — `D1WriteDatabaseV1` e nomes `d1-*` descrevem uma API de `prepare/bind/first/all/run/batch`;
2. **D1 físico legado** — runtime/migrations antigos usados apenas em local/preview/histórico.

No caminho oficial PostgreSQL, `withOfficialGradebookDatabaseV1` cria um facade PostgreSQL e o injeta temporariamente no campo lógico `GRADEBOOK_D1`. Portanto:

> ver `GRADEBOOK_D1` ou `D1WriteDatabaseV1` num serviço **não prova** que a consulta vai para Cloudflare D1.

A autoridade física deve ser determinada pela composição da rota e pelo provider oficial.

## Gate de produção

`withOfficialGradebookDatabaseV1` permite `provider=d1` apenas quando `RUNTIME_ENVIRONMENT` não é `production`.

Em produção:
- `provider=postgres` + `PROD_DB` válido → abre PostgreSQL sob demanda;
- provider ausente/inválido/`d1` → operação acadêmica que precisa de banco falha fechada;
- não existe fallback automático para D1 físico.

Desde a BN-08, o parser de ambiente **não injeta mais `d1` por default**. Provider ausente permanece `undefined`; produção continua fail-closed e exige `postgres` explicitamente.

## Admin de persistência

As rotas históricas `/api/gradebook/admin/persistence/*` ainda mantêm o nome D1 por compatibilidade.

Em produção:
- status consulta o PostgreSQL oficial por `withOfficialGradebookDatabaseV1`;
- migrations pela rota antiga retornam `410 retired`;
- runtime D1/migration runner é acessível somente em local/preview para fixtures históricas descartáveis.

## Classificação dos principais módulos

| Módulo | Classificação atual |
| --- | --- |
| `server/gradebook/persistence/postgres/official-gradebook-database-v1.ts` | CURRENT — seleção física oficial/fail-closed |
| `server/gradebook/persistence/postgres/postgres-database-v1.ts` | CURRENT — facade PostgreSQL compatível com a porta histórica |
| `D1WriteDatabaseV1` / `D1WriteStatementV1` | COMPATIBILITY — interface ainda usada por serviços atuais |
| `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts` | LEGACY-RUNTIME — local/preview/compatibilidade; não fonte física oficial |
| `server/gradebook/persistence/d1/schema/**` | HISTORICAL/LOCAL — schema D1 antigo |
| `server/gradebook/persistence/d1/{read,write,transaction,...}` | MIXED — alguns adapters ainda são portas reutilizadas pelo facade PostgreSQL; avaliar por consumidor |
| `Aprendizados/**` | MEMORY — nunca autoridade operacional |

## Allowlist de relações legacy não é catálogo físico atual

O facade PostgreSQL contém uma allowlist de nomes como `academic_entity_streams`, `source_file_versions` e `import_batch_streams`. Ela serve somente para qualificar SQL **D1-shaped legado** que chega sem schema.

Essa allowlist:
- não representa as tabelas físicas atuais `aluno/nota/oferta/fechamento/...`;
- não deve ser sincronizada com migrations do schema simplificado;
- não autoriza reativar o modelo stream/version;
- existe apenas enquanto consumers de compatibilidade ainda passam pelo tradutor.

Consultas relacionais atuais devem usar `gradebook.<tabela>` explicitamente. O catálogo físico atual é validado separadamente pelo recovery/gate PostgreSQL da BN-09.

## Como decidir se um arquivo D1 pode sair

Antes de remover:
1. buscar consumidores fora de `Aprendizados/**`;
2. identificar se ele recebe o facade PostgreSQL;
3. verificar se a query toca tabelas relacionais atuais ou schema stream/version legado;
4. rodar testes e Sonar;
5. só então classificar como compatibilidade ou runtime morto.

A renomeação transversal de `D1WriteDatabaseV1`/`GRADEBOOK_D1` não faz parte da BN-05. Ela deve ocorrer separadamente para não misturar mudança nominal com mudança de persistência.
