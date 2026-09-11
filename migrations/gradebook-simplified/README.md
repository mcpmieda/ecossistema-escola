# Baseline relacional atual — #633

Esta pasta reconstrói o schema observado por inspeção **somente leitura** em 10/09/2026. Não executa uma migration de produção e não substitui um backup de dados.

## Arquivos

- `0001_current_schema.sql`: 20 tabelas (19 centrais + diagnóstico), 127 colunas, 123 constraints (34 FKs), 38 índices, 4 funções e **3 triggers distintos**. `information_schema.triggers` enumera 6 eventos porque cada trigger cobre INSERT e UPDATE. Inclui a FK de primeiro import `DEFERRABLE INITIALLY DEFERRED`, ausente no DDL inicial da reconstrução.
- `0002_import_diagnostics_audit_v1.sql`: extensão aditiva já homologada para registrar o ator da observação de diagnósticos. Não altera fatos acadêmicos.
- `0003_council_session_v3.sql`: extensão aditiva FINAL-3 #648 com sessão, idempotência, votação numérica, históricos e fotografias imutáveis do Conselho. Não faz backfill, não persiste presentes/desempate/diretor e não altera a autoridade acadêmica.
- `0004_council_v3_least_privilege.sql`: correção idempotente de ACL para neutralizar grants padrão do proprietário após `0003`; mantém somente as operações usadas pela role `gradebook_app` e não altera objetos ou dados.
- `0005_relational_bulletin_snapshot_v2.sql`: extensão aditiva #654 com snapshot imutável de boletim, FKs de 2026, checks de identidade JSON e ACL `SELECT, INSERT` para `gradebook_app`; sem backfill ou DML acadêmico.
- `inspect_current_schema.sql`: consulta read-only e fingerprints estruturais por categoria. O JSON de referência é `catalog_20260910.json`, coletado do catálogo, não de notas ou arquivos. MD5 é checksum de drift, não garantia criptográfica. O comparador cobre tabelas/RLS, colunas/tipos/defaults/identidade, constraints, índices, funções e triggers. Não cobre dados, sequence counters, grants, proprietários, extensions ou infraestrutura.
- `application_role_grants.sql`: concessões para a role backend já provisionada, sem criar senha/login/superuser. Aplicar separadamente somente no ambiente autorizado e pelo proprietário de objetos previsto; default privileges valem para esse proprietário. Revisar grants/defaults herdados ao reconstruir em Supabase, em vez de presumir que a role anon/authenticated está bloqueada.

## Reproduzir e validar

Os testes `tests/gradebook/relational-schema/current-schema-v1.test.ts` criam banco PGlite descartável, executam a baseline completa e comparam os seis fingerprints do catálogo observado. Exercitam constraints, triggers, FK diferida e grants. Executar `npm run verify` antes de aceitar a entrega. Nenhum teste usa conexão de produção.

Para um ambiente PostgreSQL 17 **vazio e autorizado**, executar a baseline transacional por uma conexão privada. `CREATE SCHEMA gradebook` falha se o schema já existir: não há DROP/TRUNCATE/recriação silenciosa. Depois inspecionar com o SQL read-only, comparar o JSON e validar ACL efetiva. Usar o search_path padrão sem gradebook ao comparar as representações canônicas do catálogo. Manter timezone de operação America/Sao_Paulo por configuração autorizada; este arquivo não altera globalmente o banco.

A baseline não cria extensões, contas Supabase, bindings Hyperdrive, secrets, políticas de backup nem snapshots institucionais ainda não contratados. As migrations antigas de streams/versions são memória e **não** devem ser reaplicadas sobre o modelo simplificado.

As extensões `0002`, `0003`, `0004` e `0005` são aplicadas em ordem, somente sobre
um schema já conferido contra a baseline. Para `0003`, o preflight deve confirmar
as oito tabelas-alvo ausentes e preservar uma cópia lógica recuperável das 20
tabelas e sequências anteriores. O arquivo usa uma única transação e falha
visivelmente diante de drift ou reexecução; não acrescentar `IF NOT EXISTS` para
contornar o gate. `0004` pode ser reaplicada com segurança para corrigir ACL, mas
não substitui o gate de `0003`. O postflight confere 28 tabelas, as quatro novas
sequências, ACL mínima exata de `gradebook_app`, ausência de privilégios `PUBLIC`, contagens centrais
inalteradas e somente o ano 2026. Ver
[`RELATIONAL_COUNCIL_V3.md`](../../docs/gradebook/RELATIONAL_COUNCIL_V3.md).

Para `0005`, o preflight confirmou as 28 tabelas pós-Conselho, ausência de `boletim_snapshot`, ano exclusivo 2026 e contagens acadêmicas; uma cópia lógica das 28 tabelas/12 sequências foi validada antes do DDL. O postflight produtivo de 11/09/2026 confirmou 29 tabelas no total e a relação nova vazia, com 13 colunas, 15 constraints, 4 índices totais, 3 FKs e ACL exata `SELECT, INSERT`, sem `UPDATE/DELETE` ou acesso público/cliente. Não emitir boletim real no smoke automatizado. Ver [`RELATIONAL_BULLETINS_V2.md`](../../docs/gradebook/RELATIONAL_BULLETINS_V2.md).

## O que ainda falta para declarar recuperação institucional

Restore de dados e identities, integridade após restore, RPO/RTO, credenciais/privilégios mínimos, configurações externas, validação das jornadas e autorização do ambiente de teste permanecem gates #406/#596. Igualdade estrutural em banco descartável não equivale a backup/restore da produção. A cópia D1 histórica não contém as novas escritas relacionais.
