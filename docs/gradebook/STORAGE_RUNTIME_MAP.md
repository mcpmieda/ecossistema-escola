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

## Nomes separados na #970

Os nomes agora distinguem o banco selecionado da compatibilidade histórica:

1. **`GRADEBOOK_DATABASE`** — banco injetado por `withOfficialGradebookDatabaseV1`; em produção, somente PostgreSQL. Serviços atuais usam `query`/`executeNative` e tipos PostgreSQL;
2. **`GRADEBOOK_D1`** — binding físico legado de fixtures local/preview, ocultado no ambiente de execução PostgreSQL;
3. **`D1WriteDatabaseV1` e `d1-*`** — protocolo e adaptadores legados ainda utilizados pela compatibilidade e pelos testes históricos, não pelas consultas atuais.

No caminho oficial PostgreSQL, `withOfficialGradebookDatabaseV1` injeta a fachada em `GRADEBOOK_DATABASE`, sem ler o binding físico antigo. A autorização compartilhada está em `server/gradebook/authorization-v1.ts`; capability, autenticação e permissões não mudaram.

Os transportes de compatibilidade ainda podem receber a fachada PostgreSQL. Isso não recria as tabelas antigas e não prova que esses transportes funcionam no catálogo atual. O inventário e os consumidores preservados estão em [LEGACY_RUNTIME_970.md](LEGACY_RUNTIME_970.md).

A autoridade física deve ser determinada pela composição da rota e pelo provider oficial.

## Gate de produção

`withOfficialGradebookDatabaseV1` permite `provider=d1` apenas quando `RUNTIME_ENVIRONMENT` não é `production`.

Em produção:
- `provider=postgres` + `PROD_DB` válido → abre PostgreSQL sob demanda;
- provider ausente/inválido/`d1` → operação acadêmica que precisa de banco falha fechada;
- não existe fallback automático para D1 físico.

Desde a BN-08, o parser de ambiente **não injeta mais `d1` por default**. Provider ausente permanece `undefined`; produção continua fail-closed e exige `postgres` explicitamente.

## Admin de persistência

As URLs `/api/gradebook/admin/persistence/*` permanecem iguais. A implementação foi renomeada para `http/persistence-admin-routes-v1.ts`, com `handleGradebookPersistenceAdminRequestV1`.

Em produção:
- status consulta o PostgreSQL oficial por `withOfficialGradebookDatabaseV1`;
- migrations pela rota antiga retornam `410 retired`;
- runtime D1/migration runner é acessível somente em local/preview para fixtures históricas descartáveis.

## Classificação dos principais módulos

| Módulo | Classificação atual |
| --- | --- |
| `server/gradebook/persistence/postgres/official-gradebook-database-v1.ts` | CURRENT — seleção física oficial/fail-closed |
| `server/gradebook/persistence/postgres/postgres-database-v1.ts` | CURRENT — porta nativa e compatibilidade histórica explicitamente separadas |
| `GradebookPostgresReadPortV1` / `GradebookPostgresWritePortV1` | CURRENT — SQL `$n` enviado sem tradução; JSON tipado explicitamente com `postgresJsonTextV1` |
| `D1WriteDatabaseV1` / `D1WriteStatementV1` | COMPATIBILITY — somente protocolo legado, fachada/lazy e fixtures |
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

A #970 separa a renomeação nominal da migração SQL em commits distintos. Nenhum arquivo legado pode ser apagado apenas pelo nome: o inventário B-16 encontrou consumidores nos 26 candidatos. A retirada do tradutor continua dependendo da resolução dessa compatibilidade, não somente da medição zero do B-15.
