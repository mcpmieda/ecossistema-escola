# Contexto acadêmico 2026 V1

## Objetivo

O Banco de Notas possui uma única composição oficial de contexto acadêmico para 2026. Ela conecta o `AcademicYearV1` persistido à identidade técnica da configuração e aos perfis nativos já existentes, sem copiar nenhuma regra pedagógica para o contexto.

O contexto não escolhe ano pelo relógio. O `academicYearId` é uma dependência explícita do serviço de aplicação e toda leitura física permanece isolada por esse identificador.

## Identidade técnica

A identidade V1 está centralizada em `src/gradebook-domain/context/academic-context-2026-v1.ts`:

- ano acadêmico do perfil: `2026`;
- perfil de avaliação: `evaluation-profile:2026`;
- configuração: `academic-year-configuration:2026`;
- versão técnica da configuração: `1`.

Esses valores identificam a composição, não reimplementam regras acadêmicas. Pesos, máximos, arredondamento, aplicabilidade, aprovação e elegibilidade continuam definidos exclusivamente nos perfis nativos do motor.

## Perfis reutilizados

`ACADEMIC_EVALUATION_PROFILE_2026_V1` mantém referências diretas aos objetos já exportados pelo domínio:

- `NATIVE_TERM_COMPOSITION_PROFILE_2026_V1`;
- `NATIVE_PARALLEL_RECOVERY_PROFILE_2026_V1`;
- `NATIVE_TERM_OUTCOME_PROFILE_2026_V1`;
- `NATIVE_FINAL_RECOVERY_PROFILE_2026_V1`;
- `NATIVE_ANNUAL_OUTCOME_PROFILE_2026_V1`.

O contexto valida que todos declaram o mesmo ano e versão compatível e que as referências internas entre composição trimestral, recuperação paralela, resultado trimestral e recuperação final apontam para os mesmos objetos canônicos. O arquivo de contexto não repete os valores acadêmicos desses perfis.

## Forma do contexto

`createAcademicContext2026V1(academicYear)` produz um objeto imutável com:

- `academicYear`: o `AcademicYearV1` ativo e compatível;
- `persistenceContext`: o `AcademicPersistenceContextV1` com o mesmo `academicYearId`;
- `evaluationProfile`: a composição canônica 2026 V1;
- `authorityMode: imported-source`.

A autoridade importada permanece inalterada. O contexto não promove `native-engine`, não calcula notas e não altera registros acadêmicos.

## Serviço de aplicação

`createActiveAcademicContextServiceV1` recebe somente dependências injetadas:

```text
academicYearId
AcademicEntityRepositoryV1
        ↓
list academic-year no mesmo AcademicPersistenceContextV1
        ↓
exatamente um registro atual
        ↓
createAcademicContext2026V1
```

Não existe `Date`, ano corrente implícito, fallback para outro ano nem seleção por ordem de registros.

Erros controlados:

- `context-missing`: nenhum contexto configurado;
- `context-duplicate`: mais de um resultado para a configuração solicitada;
- `context-inactive`: ano planejado ou encerrado;
- `context-incompatible`: ano, perfil, versão ou identidade incompatível com a composição 2026 V1.

## Persistência D1 local

A implementação reutiliza `AcademicEntityRepositoryV1` sem alterar a porta compartilhada.

### Leitura

`createGradebookD1AcademicEntityReadAdapterV1` reconstrói o `academic-year` a partir de:

- `academic_years` para identidade, escola, ano e ponteiro atual;
- `academic_year_versions` para estado, vigência, perfil ativo e referência de configuração;
- `academic_year_configuration_versions` para confirmar a versão/configuração referenciada.

A consulta usa sempre `academic_year_id = ?`. Uma referência a outro ano não atravessa o contexto informado. Ponteiro quebrado, configuração ausente ou vínculo incoerente falham com erro sanitizado do adaptador de leitura.

### Escrita

`createGradebookD1WriteUnitOfWorkV1(...).entities.appendVersion` suporta localmente somente `academic-year`; os demais tipos de entidade continuam fora do escopo deste adaptador.

Cada append usa o savepoint já adotado pelo adaptador:

1. valida o `AcademicYearV1` contra a identidade técnica 2026;
2. aplica compare-and-set em `academic_years.current_version`;
3. garante a configuração técnica referenciada em `academic_year_configuration_versions` sem copiar regras nativas;
4. acrescenta uma linha em `academic_year_versions`;
5. libera o savepoint somente se raiz, configuração e histórico forem coerentes.

Para `expectedVersion: null`, uma raiz existente retorna `version-conflict`. Para expectativa obsoleta, o ponteiro não avança. Falha de `CHECK`, FK, configuração incompatível ou inserção histórica reverte o savepoint, evitando raiz, configuração, versão ou ponteiro órfão.

A configuração técnica V1 é reutilizada quando não mudou; novas versões do ano permanecem append-only sem criar cópias idênticas da configuração.

## Limites deliberados

Esta entrega não cria endpoint, UI, Function, binding, secret, banco remoto, migration nova, runner, workflow ou recurso de infraestrutura. Nenhuma migration é aplicada remotamente e nenhum comportamento de produção é ativado.

O domínio não conhece D1, SQL, rede, React, HeroUI ou relógio global. SQL permanece restrito aos adaptadores locais autorizados.

## Testes

As suites novas usam somente dados sintéticos:

- `tests/gradebook/context/academic-context-2026-v1.test.ts` cobre composição única, referências canônicas, imutabilidade, autoridade e falhas explícitas do serviço;
- `tests/gradebook/persistence/d1-context/d1-academic-context-v1.test.ts` cobre leitura, histórico append-only, isolamento por `academicYearId`, expectativa nula/obsoleta e rollback de raiz/configuração/ponteiro.

A validação de entrega é `npm run verify` no SHA final do pull request.

## Evolução administrativa #424

A área global de Configurações ganhou um cadastro guiado de ano letivo. O servidor cria identidade,
configuração e versão inicial dentro de um savepoint: 2026 nasce `active` com o perfil 2026 já
congelado; anos posteriores podem ser cadastrados como `planned`, sem ativar cálculo ou autoridade.
A importação só aceita o ano reconhecido quando existe um contexto ativo correspondente.
