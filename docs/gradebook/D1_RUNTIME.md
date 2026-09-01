# Runtime D1 local/preview e runner autorizado V1

## Escopo

O runtime conecta os adaptadores D1 integrados a uma composição de backend para desenvolvimento local e previews controlados. Ele não cria banco, binding, secret ou recurso remoto, não aplica migration remota e não habilita persistência ou consulta acadêmica no site oficial.

Produção permanece fechada por padrão: `RUNTIME_ENVIRONMENT=production` impede a construção do runtime antes de qualquer inspeção de `GRADEBOOK_D1`, mesmo que um objeto de armazenamento seja apresentado. O `wrangler.jsonc` de produção continua sem binding D1 acadêmico.

A onda 14 adicionou duas capacidades sem mudar esse limite:

- Operational Workspace F5 com catálogo explícito de anos, serviço/bridge local-preview e HeroUI;
- Audit Workspace F4 composto **internamente** no runtime após a #306, sem endpoint/UI.

Desempenho #304 e Boletins #305 permanecem aplicações provider-independent e não são compostos fisicamente neste runtime.

## Autorização

A capability `gradebook.persistence.admin` faz parte do contrato público da plataforma e é concedida somente a `ADMINISTRADOR`.

Uma sessão válida é convertida no servidor em um contexto opaco de autorização depois da verificação dessa capability. O contexto não contém nome, e-mail, nota, payload ou credencial e não pode ser reconstruído a partir de JSON. Sem ele:

- o runtime não é construído;
- o binding não é inspecionado;
- o runner não consulta nem aplica migrations;
- a promoção não alcança o adaptador transacional;
- os read models, pesquisa, Operational Workspace e Audit Workspace não são expostos.

O Audit Workspace não aceita um booleano de autorização do caller. `GradebookD1RuntimeV1.auditWorkspace(...)` valida a autorização opaca e cria internamente `isAuthorized()`. O caller pode fornecer apenas `resolutionIdentity()` com ator/instante efetivos server-side e, opcionalmente, uma fonte de plano de importação **já existente** para a projeção informativa de elegibilidade.

## Ambientes e binding

| `RUNTIME_ENVIRONMENT`   | `OFFICIAL_ORIGIN` aceito                   | Runtime acadêmico                       |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| `local`                 | origem `localhost`, `127.0.0.1` ou `[::1]` | permitido com binding estrutural válido |
| `preview`               | origem HTTPS `*.pages.dev`                 | permitido com binding estrutural válido |
| `production` ou ausente | `https://admin.escolaieda.com`             | desabilitado antes do binding           |

O binding é recebido somente como `env.GRADEBOOK_D1`. O runtime valida `prepare`/`exec` e o shape do statement (`bind`, `first`, `all`, `run`) antes de compor adaptadores. O objeto não é retornado ao navegador nem incluído em respostas ou logs.

A configuração/criação concreta de banco ou binding local/preview pertence ao integrador/ambiente apropriado; nenhum identificador remoto é versionado.

## Composição do runtime

Depois da autorização, validação do ambiente e validação estrutural do binding, `createGradebookD1RuntimeV1` compõe:

- `createGradebookD1PersistenceUnitOfWorkV1` para as portas V1;
- `createGradebookOperationalReadModelsV1` sobre `unitOfWork.entities`;
- `createOperationalWorkspaceAcademicYearCatalogV1` sobre o catálogo persistido de anos;
- `GradebookD1AuditWorkspaceSourceV1` sobre o mesmo database;
- visão restrita da UoW para planejamento de reconciliação;
- `GradebookD1BatchPromotionTransactionV1` para a unidade de escrita integrada;
- `GradebookD1MigrationRunnerV1` para conferir/aplicar o schema local autorizado.

Superfícies do runtime:

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(resolutionIdentity, existingPlans?)
  ├── planningRepositories()
  ├── inspectSchema()
  ├── runMigrations()
  └── promoteImportChangePlan()
```

Cada método valida novamente a autorização opaca aplicável.

## Operational Workspace

`operationalReadModels()` retorna uma única fachada com:

- `students`;
- `classGroups`;
- `teachers`;
- `subjects`;
- `search`.

`operationalWorkspaceAcademicYears()` retorna somente a leitura `academic_year_id + year`, ordenada deterministicamente. Não existe fallback por relógio nem inferência por convenção de ID.

A #302 adicionou o único bridge acadêmico HTTP desta etapa:

| Método | Rota                                    | Operação |
| ------ | --------------------------------------- | -------- |
| `POST` | `/api/gradebook/operational-workspace` | bootstrap, quatro Centrais e pesquisa discriminada |

Regras:

- same-origin;
- `requireAuth`;
- autorização opaca de `gradebook.persistence.admin`;
- runtime construído somente depois da autorização;
- respostas acadêmicas `no-store`;
- sem roles/capabilities/tokens do cliente;
- produção retorna indisponibilidade sem tocar no binding;
- nenhuma mutation acadêmica.

A #306 preserva esse bridge como **único**. Nenhum segundo handler/rota operacional é criado.

### Pesquisa acadêmica

`search` é a instância integrada da #287. Ela:

- consome `GlobalSearchRequestV1` e retorna `GlobalSearchResponseV1`;
- preserva ano explícito;
- lista somente tipos solicitados;
- usa ordem oficial e cursor opaco;
- faz matching literal após normalização de caixa/diacríticos;
- não usa fuzzy matching/heurística de identidade;
- não retorna nota, resultado, evidência ou alias de origem;
- converte falhas em resposta sem divulgação.

Não existe segundo matching/ranking/normalização no transport, bridge ou React.

## Audit Workspace interno

A #303 integrou:

- `AuditWorkspaceSourceV1` provider-independent;
- `GradebookD1AuditWorkspaceSourceV1` para lotes, ocorrências e reconciliações atuais;
- `createAuditWorkspaceV1` para listagem, detalhe e resolução.

A #306 compõe o workspace em `GradebookD1RuntimeV1.auditWorkspace(...)`:

```text
autorização opaca já emitida
        ↓
requireGradebookD1RuntimeAuthorizationV1
        ↓
GradebookD1AuditWorkspaceSourceV1 + mesma UoW imports/audit
        ↓
createAuditWorkspaceV1
        ↓
list / detail / resolve (somente uso interno local/preview)
```

Regras preservadas:

- consultas de lista são batch/keyset, sem N+1 por item;
- detalhe reutiliza os repositórios existentes;
- resolução reutiliza `AuditPersistenceRepositoryV1.appendVersion` com CAS;
- ator/instante efetivos vêm de `resolutionIdentity()` server-side;
- pedidos não transportam autorização efetiva;
- elegibilidade de promoção é apenas informativa e somente pode refletir `ImportChangePlanV1` já produzido;
- não existe método `promote` no Audit Workspace;
- promoção real continua em `planImportReconciliation` + `executeImportChangePlan`;
- **nenhuma rota HTTP ou UI de Auditoria existe nesta integração**.

A exposição HeroUI/HTTP local-preview é tarefa #314.

## Desempenho e Boletins deliberadamente fora da composição física

### Desempenho

A #304 implementa `createClassPerformanceReadModelV1(source)` e `ClassPerformanceSourceV1`. A #306 não cria:

- adapter D1;
- método no runtime;
- endpoint;
- UI.

A fonte física em lote sem N+1 é #315.

### Boletins

A #305 implementa materialização/emissão provider-independent e snapshots por porta, incluindo somente repositório em memória/local de teste. A #306 não cria:

- método físico no runtime;
- endpoint;
- PDF/renderer;
- tabela/migration;
- persistência remota de snapshots;
- exposição de lote de alta escala.

O hardening/materialização agregada e snapshots locais é #316.

## Runner de migrations

O runner continua consumindo `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` como catálogo canônico de 0001–0003. A onda 14 não adiciona migration.

Antes de executar SQL, o runner verifica sequência, unicidade, correspondência de catálogo e prefixo exato já aplicado. Reexecução sobre catálogo atual retorna `up-to-date`.

Nenhum comando Wrangler, API de controle ou conexão remota faz parte do runner/testes.

## Rotas administrativas mínimas existentes

| Método | Rota                                          | Operação                                          |
| ------ | --------------------------------------------- | ------------------------------------------------- |
| `GET`  | `/api/gradebook/admin/persistence/status`     | resumo de versão corrente e migrations pendentes |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplicação idempotente das migrations pendentes   |

Essas rotas exigem sessão válida e `gradebook.persistence.admin`. A escrita exige `Origin` exatamente igual a `OFFICIAL_ORIGIN` e não aceita corpo. Todas usam `no-store` e payload sanitizado.

## Erros e logs

Erros do runtime/runner usam códigos e mensagens fixos. Exceções brutas do driver são descartadas. Logs não incluem nomes, notas, payload acadêmico, SQL, parâmetros, binding ou secrets.

Operational Workspace converte não autorização/indisponibilidade para estados contratuais sem revelar ano/entidade/total/continuação. Audit Workspace converte falhas para outcomes contratuais sem exceção bruta.

## Verificação

As suites usam somente SQLite em memória, doubles estruturais e dados sintéticos. Depois da #306 cobrem também:

- Operational Workspace completo e bridge único;
- catálogo explícito de anos;
- Audit Workspace real sobre a mesma UoW/D1;
- resolução CAS com ator/instante server-side;
- não autorização antes do binding;
- produção antes do binding;
- ausência de composição física de Desempenho/Boletins;
- ausência de HTTP para Auditoria/Desempenho/Boletins;
- `authorityMode: imported-source` conjunto.

## Limites preservados

- nenhum banco/binding remoto criado;
- nenhuma migration remota ou nova migration local;
- nenhum secret criado/versionado;
- nenhuma capability/papel novo;
- nenhum fluxo de escrita acadêmica novo;
- `authorityMode` permanece `imported-source`;
- produção continua sem persistência/consulta acadêmica ativa;
- Audit Workspace permanece interno;
- Desempenho/Boletins permanecem provider-independent até suas issues físicas específicas.