# Runtime D1 local/preview e runner autorizado V1

## Escopo

Esta entrega conecta os adaptadores D1 já integrados a uma composição de backend para desenvolvimento local e previews controlados. Ela não cria banco, binding, secret, rota anônima ou recurso remoto, não aplica migration remota e não habilita persistência ou consulta acadêmica no site oficial.

Produção permanece fechada por padrão: `RUNTIME_ENVIRONMENT=production` impede a construção do runtime mesmo que um objeto de armazenamento seja apresentado. O `wrangler.jsonc` de produção continua sem binding D1.

## Autorização

A capability `gradebook.persistence.admin` faz parte do contrato público da plataforma e é concedida somente a `ADMINISTRADOR`.

Uma sessão válida é convertida no servidor em um contexto opaco de autorização depois da verificação dessa capability. O contexto não contém nome, e-mail, nota, payload ou credencial e não pode ser reconstruído a partir de JSON. Sem ele:

- o runtime não é construído;
- o binding não é inspecionado;
- o runner não consulta nem aplica migrations;
- a promoção não alcança o adaptador transacional;
- os read models e a pesquisa acadêmica não são expostos.

## Ambientes e binding

O backend reconhece três modos explícitos:

| `RUNTIME_ENVIRONMENT`   | `OFFICIAL_ORIGIN` aceito                   | Runtime acadêmico                       |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| `local`                 | origem `localhost`, `127.0.0.1` ou `[::1]` | permitido com binding estrutural válido |
| `preview`               | origem HTTPS `*.pages.dev`                 | permitido com binding estrutural válido |
| `production` ou ausente | `https://admin.escolaieda.com`             | desabilitado                            |

O binding é recebido somente como `env.GRADEBOOK_D1`. O runtime valida, antes de compor qualquer adaptador, a presença de `prepare` e `exec` e o shape do statement necessário à leitura e escrita (`bind`, `first`, `all` e `run`). O objeto não é retornado ao navegador nem incluído em respostas ou logs.

A configuração ou criação concreta de um banco/binding local ou de preview pertence ao integrador. Nenhum identificador remoto é versionado nesta entrega.

## Composição do runtime

Depois da autorização, da validação do ambiente e da validação estrutural do binding, `createGradebookD1RuntimeV1` compõe:

- `createGradebookD1PersistenceUnitOfWorkV1` para todas as famílias das portas V1;
- `createGradebookOperationalReadModelsV1` sobre a porta `entities` dessa mesma UoW;
- uma visão restrita dessa mesma UoW para o planejamento de reconciliação;
- `GradebookD1BatchPromotionTransactionV1`, que cria a unidade de escrita já integrada;
- `GradebookD1MigrationRunnerV1` para conferir e aplicar o schema.

O método administrativo `persistenceUnitOfWork()` expõe a composição integral somente depois da autorização opaca já validada. Não há segunda implementação de `academic-year`, fonte, registro ou associação. Históricos de registros e associações usam paginação keyset vinculada ao ano e ao stream.

`operationalReadModels()` aplica a mesma validação de autorização e retorna uma única fachada com:

- `students`;
- `classGroups`;
- `teachers`;
- `subjects`;
- `search`.

A fachada reutiliza exclusivamente `unitOfWork.entities`; não executa SQL próprio, não duplica consulta, normalização, matching ou autorização e não cria regra acadêmica.

### Pesquisa acadêmica

`search` é a instância de `AcademicGlobalSearchReadModelV1` integrada pela #287 e composta pela #288. Ela:

- consome `GlobalSearchRequestV1` e retorna `GlobalSearchResponseV1`;
- preserva o ano explícito em todas as consultas;
- lista somente os tipos solicitados e nunca chama `repository.get`;
- retorna somente `kind`, ID e `displayName`/`code`;
- usa a ordem oficial e cursor opaco;
- faz matching literal após normalização de caixa/diacríticos;
- não usa fuzzy matching ou heurística de identidade;
- não retorna nota, resultado, evidência ou alias de origem;
- converte falhas em resposta sem divulgação.

Ela não fica disponível em produção porque o runtime continua falhando antes de inspecionar o binding. A integração não criou endpoint ou UI. Portanto nenhuma resposta HTTP acadêmica nova existe nesta onda; a política `Cache-Control: no-store` permanece aplicada às rotas administrativas já existentes.

A única operação de promoção exposta pela composição chama `executeImportChangePlan`. Portanto, a ordem continua sendo:

```text
BEGIN IMMEDIATE
  fonte
  registro acadêmico
  associação fonte lógica ↔ registro
COMMIT
```

Qualquer falha mantém o rollback integral implementado pelo adaptador transacional. Não existe chamada D1 no domínio, no executor ou no navegador.

## Runner de migrations

O runner consome `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` como catálogo canônico. Os textos SQL de 0001, 0002 e 0003 são importados como módulos; versões, nomes e filenames não são mantidos em um segundo catálogo.

Antes de executar SQL, o runner verifica:

1. sequência contígua iniciando em 1;
2. unicidade de nome e filename;
3. correspondência entre cada entrada canônica e o registro final contido no respectivo SQL;
4. conteúdo de `gradebook_schema_migrations` como prefixo exato do catálogo canônico.

Depois de cada migration, o registro é lido novamente. Lacuna, versão inesperada, nome divergente, entrada excedente ou migration que não registra sua versão falha com erro controlado. Uma segunda execução sobre 0001–0003 já aplicadas retorna `up-to-date` e não executa novamente os scripts.

Nenhum comando Wrangler, API de controle ou conexão remota faz parte do runner ou dos testes.

## Rotas administrativas mínimas

| Método | Rota                                          | Operação                                          |
| ------ | --------------------------------------------- | ------------------------------------------------- |
| `GET`  | `/api/gradebook/admin/persistence/status`     | resumo de versão corrente e migrations pendentes |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplicação idempotente das migrations pendentes   |

As duas rotas exigem sessão válida e `gradebook.persistence.admin`. A escrita exige `Origin` exatamente igual a `OFFICIAL_ORIGIN` e não aceita corpo. Métodos incorretos recebem 405.

Todas as respostas usam `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache` e `Expires: 0`. O payload contém somente versão do contrato, capability exigida, modo local/preview e contagens/versões do schema. SQL, parâmetros, binding, credenciais e dados acadêmicos não são retornados.

Não existe rota HTTP de promoção ou pesquisa acadêmica nesta entrega. A promoção permanece uma operação interna do backend, disponível apenas no runtime autorizado para um fluxo posterior que já possua um `ImportChangePlanV1` validado.

## Erros e logs

Erros do runtime e do runner usam códigos e mensagens fixos. Exceções brutas do driver são descartadas. A camada HTTP converte falhas em respostas operacionais sanitizadas; o logger global recebe somente a mensagem fixa, o caminho da rota e o correlation ID.

Nenhum log acrescentado inclui nome, nota, payload acadêmico, SQL, parâmetros, binding ou secret.

## Verificação

As suites desta entrega usam somente:

- `node:sqlite` em memória;
- doubles estruturais do binding;
- sessões e dados acadêmicos sintéticos.

Elas cobrem:

- autorização antes do binding;
- bloqueio de produção antes do binding;
- shape do binding;
- aplicação/reaplicação 0001–0003 e catálogo incompatível;
- sanitização, `no-store`, método, origem e corpo das rotas existentes;
- a UoW integral;
- os quatro centros pela mesma fachada;
- pesquisa com os quatro tipos, ano, paginação, ordem, vazio, ausência, escopo insuficiente e cursor inválido;
- pesquisa restrita aos campos mínimos e sem `get`/N+1;
- exposição da pesquisa em preview autorizado;
- não autorização e produção bloqueadas antes do binding;
- promoção `fonte → registro → associação` pelo executor existente em uma única transação.

## Limites preservados

- nenhum banco ou binding remoto criado;
- nenhuma migration remota aplicada;
- nenhum secret criado ou versionado;
- nenhum fluxo, endpoint ou UI acadêmica ativado;
- nenhuma alteração em migrations 0001–0003, portas V1, motor ou importador;
- nenhuma capability ou papel novo;
- `authorityMode` permanece `imported-source`;
- produção continua sem persistência ou consulta acadêmica ativa.