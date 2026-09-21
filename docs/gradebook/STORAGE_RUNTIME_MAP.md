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

1. **`GRADEBOOK_DATABASE`** — banco injetado por `withOfficialGradebookDatabaseV1`; somente PostgreSQL em todos os ambientes. Serviços atuais usam `query`/`executeNative` e tipos PostgreSQL;
2. **`GRADEBOOK_D1`** — entrada legada rejeitada/ocultada, nunca lida pelo wrapper nem pelos transportes retirados;
3. **`D1WriteDatabaseV1` e `d1-*`** — protocolo e adaptadores arquivados em `Aprendizados/RUNTIME-D1-RETIRADO-1079`, fora do runtime atual.

No caminho oficial PostgreSQL, `withOfficialGradebookDatabaseV1` injeta a fachada em `GRADEBOOK_DATABASE`, sem ler o binding físico antigo. A autorização compartilhada está em `server/gradebook/authorization-v1.ts`; capability, autenticação e permissões não mudaram.

Os transportes retirados retornam HTTP 410 depois de auth/validacao, sem acessar banco. O inventario anterior permanece em [LEGACY_RUNTIME_970.md](LEGACY_RUNTIME_970.md); a autorizacao que o substitui esta em [LEGACY_RUNTIME_RETIREMENT_1079.md](LEGACY_RUNTIME_RETIREMENT_1079.md).

A autoridade física deve ser determinada pela composição da rota e pelo provider oficial.

## Gate de produção

`withOfficialGradebookDatabaseV1` exige `provider=postgres` em todos os ambientes desde a #1079.

Em todos os ambientes:
- `provider=postgres` + `PROD_DB` válido → abre PostgreSQL sob demanda;
- provider ausente/inválido/`d1` → operação acadêmica que precisa de banco falha fechada;
- não existe fallback automático para D1 físico.

Desde a BN-08, o parser de ambiente **não injeta mais `d1` por default**. Provider ausente permanece `undefined`; produção continua fail-closed e exige `postgres` explicitamente.

## Admin de persistência

As URLs `/api/gradebook/admin/persistence/*` permanecem iguais. A implementação foi renomeada para `http/persistence-admin-routes-v1.ts`, com `handleGradebookPersistenceAdminRequestV1`.

Em todos os ambientes (com gate de ativacao preservado para status produtivo):
- status consulta o PostgreSQL oficial por `withOfficialGradebookDatabaseV1`;
- migrations pela rota antiga retornam `410 retired`;
- runtime D1/migration runner foi arquivado e nao e acessivel nem em local/preview.

## Classificação dos principais módulos

| Módulo | Classificação atual |
| --- | --- |
| `server/gradebook/persistence/postgres/official-gradebook-database-v1.ts` | CURRENT — seleção física oficial/fail-closed |
| `server/gradebook/persistence/postgres/postgres-database-v1.ts` | CURRENT — somente portas nativas; tradutor retirado |
| `GradebookPostgresReadPortV1` / `GradebookPostgresWritePortV1` | CURRENT — SQL `$n` enviado sem tradução; JSON tipado explicitamente com `postgresJsonTextV1` |
| `D1WriteDatabaseV1` / `D1WriteStatementV1` | MEMORY — protocolo arquivado; nao compoe facade/lazy |
| antigo `server/gradebook/persistence/d1/**` | MEMORY — movido para `Aprendizados/RUNTIME-D1-RETIRADO-1079` |
| `Aprendizados/**` | MEMORY — nunca autoridade operacional |

## Allowlist de relações legacy não é catálogo físico atual

O facade PostgreSQL anterior continha uma allowlist de nomes como `academic_entity_streams`, `source_file_versions` e `import_batch_streams`. A #1079 retirou essa allowlist junto do tradutor; ela permanece apenas na memoria arquivada.

Essa allowlist:
- não representa as tabelas físicas atuais `aluno/nota/oferta/fechamento/...`;
- não deve ser sincronizada com migrations do schema simplificado;
- não autoriza reativar o modelo stream/version;
- nao existe mais na fachada executavel atual.

Consultas relacionais atuais devem usar `gradebook.<tabela>` explicitamente. O catálogo físico atual é validado separadamente pelo recovery/gate PostgreSQL da BN-09.

## Como decidir se um arquivo D1 pode sair

Antes de remover:
1. buscar consumidores fora de `Aprendizados/**`;
2. identificar se ele recebe o facade PostgreSQL;
3. verificar se a query toca tabelas relacionais atuais ou schema stream/version legado;
4. rodar testes e Sonar;
5. só então classificar como compatibilidade ou runtime morto.

A #970 separou renomeacao nominal e migracao SQL. O inventario encontrou consumidores nos 26 candidatos, por isso a retirada exigiu a autorizacao explicita #1079/BN-DEC-041. O contrato retira esses consumidores HTTP e ensaios D1, preservando tipos compartilhados e a evidencia historica; nenhum arquivo foi retirado apenas pelo nome.
