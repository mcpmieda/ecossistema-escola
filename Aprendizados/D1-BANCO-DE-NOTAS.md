# D1 no Banco de Notas — arquitetura e persistência

## Objetivo original

O D1 foi adotado como armazenamento institucional do Banco de Notas com uma regra arquitetural importante: o domínio acadêmico não conhece D1 diretamente. O domínio fala com portas de persistência e adapters backend implementam SQL, bindings e detalhes do provedor.

Esse isolamento foi uma decisão correta e deve ser preservado em qualquer migração futura.

## Estrutura de schema construída

As migrations canônicas do D1 chegaram a:

1. `0001_gradebook_context_entities_imports_v1.sql` — contexto, entidades e imports;
2. `0002_gradebook_records_audit_v1.sql` — registros acadêmicos e auditoria;
3. `0003_logical_source_record_catalog_v1.sql` — catálogo entre fonte lógica e registros;
4. `0004_bulletin_council_durability_v1.sql` — snapshots de boletins e decisões do Conselho;
5. `0005_council_session_durability_v2.sql` — sessão institucional do Conselho V2;
6. `0006_import_staging_v1.sql` — staging da importação para reduzir limites de transporte e permitir aplicação final atômica.

Os arquivos continuam em `migrations/gradebook/` e são a melhor referência estrutural do modelo D1.

## Padrão streams + versions

O desenho mais importante foi separar o ponteiro atual do histórico imutável:

- uma tabela `*_streams` identifica a chave lógica e mantém `current_version`;
- uma tabela `*_versions` preserva cada versão histórica;
- uma alteração cria nova versão em vez de sobrescrever silenciosamente o passado;
- reimportação sem mudança não cria versão nova.

Esse padrão foi usado para fontes, entidades, registros acadêmicos, associações e estados duráveis. Ele facilitou auditoria, idempotência e rollback lógico.

## CAS e concorrência

Escritas versionadas usam expectativa de versão (`expectedVersion`). A operação só avança se a versão observada ainda for a esperada.

Princípios que funcionaram:

- `expectedVersion = null` significa criação esperada;
- versão positiva significa atualização sobre um estado conhecido;
- conflito deve falhar de forma explícita, nunca sobrescrever silenciosamente;
- a decisão de retry pertence ao serviço, não ao SQL isolado;
- operações multi-registro que formam uma unidade acadêmica devem ser aplicadas atomicamente.

## Fonte lógica e reimportação

A identidade do arquivo físico não foi tratada como identidade acadêmica permanente. O sistema distingue:

- arquivo físico / manifest;
- conteúdo binário idêntico por SHA-256;
- fonte lógica confirmada;
- versões sucessivas da mesma fonte lógica;
- registros acadêmicos associados à fonte.

Isso permitiu reimportação incremental em vez de apagar e recriar tudo.

## D1 como autoridade backend-only

O navegador nunca acessa D1 diretamente. O binding `GRADEBOOK_D1` fica no backend Cloudflare e todo acesso passa por autenticação/autorização do Centro de Administração.

Pontos que devem ser mantidos em qualquer backend:

- nenhuma credencial no navegador;
- nenhum SQL construído a partir de input sem validação;
- `Cache-Control: no-store` em rotas acadêmicas sensíveis;
- autorização por capability server-side;
- dados reais nunca entram em Git, CI ou logs públicos.

## Durabilidade além das notas

O D1 também comprovou utilidade para dados institucionais que precisam sobreviver a restart:

- snapshots imutáveis de boletins e reimpressão histórica;
- decisões e histórico do Conselho;
- sessão institucional do Conselho V2;
- CAS e guards pós-fechamento;
- auditoria e recuperação.

Uma lição importante foi separar cálculo acadêmico de estado institucional humano. O banco pode persistir ambos, mas contratos e autoridade são diferentes.

## O que deve sobreviver à troca de tecnologia

Mesmo que D1 deixe de ser o banco principal, estes elementos não devem ser descartados:

- portas provider-independent do domínio;
- streams + versions;
- append-only onde histórico é obrigatório;
- CAS;
- idempotência de reimportação;
- identidade de fonte lógica;
- snapshots imutáveis;
- transações por unidade acadêmica;
- auditoria explícita;
- recuperação testável.

A troca de storage deve ser uma troca de adapter e implementação física, não uma reinvenção do domínio.
