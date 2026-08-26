# Banco de Notas — M365 readiness e ciclo D1 → Graph

Data: 26/08/2026

PR: `#52` — **open, draft, sem merge e sem produção**.

## Objetivo desta evidência

Registrar separadamente duas provas que agora existem e não devem ser confundidas:

1. a prontidão operacional Microsoft 365 via GitHub Control Plane, executada de forma read-only;
2. o ciclo interno D1 → Graph do modelo docente, validado por testes e CI sem executar upload real no tenant.

## Microsoft 365 — readiness real via GitHub Control Plane

Workflow: `M365 operations`.

Execução validada:

- run `33003875460` / `#3` — **success**;
- operação: `banco-notas-readiness`;
- commit do `main`: `a393589265378a1954325e504c4f12cbf63c5e14`;
- autenticação: GitHub OIDC → Entra workload federation;
- audience do token — válida;
- `Sites.Selected` — presente;
- acesso ao site — válido;
- listas visíveis no site — `13`;
- drives/bibliotecas visíveis — `4`;
- fonte estruturada/transacional declarada — `D1`;
- fronteira Microsoft declarada — SharePoint/OneDrive somente para arquivos;
- `syncActivation` — `not-performed`;
- `writeOperation` — `false`.

A execução produziu o artefato `m365-operation-33003875460`. Nenhuma escrita, compartilhamento, ativação de sync ou mudança de permissão foi realizada por esse readiness.

### Resultado

O antigo bloqueio "não sabemos se o GitHub consegue autenticar no Microsoft 365 e enxergar o site permitido" está encerrado.

Isso **não** equivale ainda ao round-trip operacional do adapter runtime do Banco de Notas. A prova atual valida a identidade operacional do GitHub Control Plane, o grant `Sites.Selected`, o site e as superfícies necessárias para a futura homologação.

## SharePoint — bibliotecas confirmadas

Consulta read-only ao site `CENTROADMIN` confirmou quatro bibliotecas:

- `Documentos`;
- `ARQUIVOS_PLATAFORMA`;
- `SNAPSHOTS_PLATAFORMA`;
- `RELATORIOS_PLATAFORMA`.

`ARQUIVOS_PLATAFORMA` é o candidato institucional para arquivos/modelos do Banco de Notas. O ID observado na descoberta é evidência de homologação, **não constante de produto**. O runtime continua obrigado a resolver o destino por configuração (`BANCO_NOTAS_GRAPH_DRIVE_ID` e `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`) e a falhar fechado quando estiver ausente.

Nenhuma pasta foi criada e nenhum arquivo foi enviado nesta etapa. O parent item/pasta dedicado do Banco ainda deve ser resolvido ou provisionado antes do primeiro round-trip real.

## Ciclo D1 → Graph do modelo docente

Foi criada a camada `D1TeacherModelRepository` sobre as tabelas já existentes `teacher_models`, `teacher_model_versions`, `cell_mappings` e `share_audit`.

Fluxo validado:

```text
modelo gerado e validado
→ persistência atômica de versão + mappings no D1
→ validated
→ gate de professor ativo + Entra OID + homologation + sync=false
→ ready_to_share
→ validação local do SHA-256 antes do upload
→ Graph store/share
→ metadata
→ download
→ SHA-256 dos bytes realmente baixados
→ reanálise OOXML
→ share_audit succeeded
→ shared + drive_item_id no D1
```

### Falhas e compensação

- hash local divergente bloqueia o processo **antes** de chamar `store` no Graph;
- falha depois do upload revoga a permissão quando ela existir e remove o arquivo;
- falha de metadata, tamanho, hash baixado ou reanálise impede `shared`;
- falha operacional mantém o modelo em `ready_to_share` para uma tentativa posterior;
- `share_audit` registra `requested`, `succeeded` ou `failed`;
- transições D1 relevantes usam `D1Database.batch()`;
- `sync_enabled` permanece `0`.

## CI do bloco

Head de código validado: `9959c6f143339c25e15fad7f50755339d4e47242`.

GitHub Actions `CI and deploy`:

- run `33005219880` / `#762` — **success**;
- `Validate application` — success;
- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **294/294 em 54 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped.

Os cinco testes de `banco-notas-teacher-model-share-service` passaram. A orquestração Graph possui nove testes, incluindo a prova de que conteúdo com SHA-256 divergente não chega ao upload.

## Segurança preservada

- D1 continua sendo a fonte estruturada/transacional;
- SharePoint/OneDrive continuam limitados a arquivos/modelos/versões;
- Graph continua backend-only;
- nenhum ID de drive observado foi embutido no runtime;
- nenhum secret foi adicionado ao repositório ou aos logs;
- nenhuma permissão Entra/Graph foi ampliada;
- nenhuma escrita real em SharePoint/OneDrive foi realizada;
- `SyncEnabled` não foi habilitado;
- o add-in público continua bloqueado sem audience/scope reais;
- golden masters privados externos continuam fora do produto;
- o produto continua obrigado a gerar um modelo genérico limpo.

## Bloqueios que permanecem externos

1. resolver/provisionar o parent item/pasta dedicado dentro do destino institucional escolhido;
2. executar o primeiro round-trip operacional do adapter runtime: upload → share autenticado → metadata → download → hash → reanálise → compensação/limpeza;
3. homologar `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` antes de qualquer liberação do add-in;
4. comprovar atomicidade por binding D1 real quando houver runtime Cloudflare de homologação autorizado;
5. realizar browser QA somente em ambiente navegável e autorizado.

Nenhum desses itens justifica ampliar privilégios, tocar produção ou habilitar sync antecipadamente.
