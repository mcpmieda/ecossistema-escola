# Banco de Notas — Verificação de hardening de importação e Graph

Data: 25/08/2026

PR: `#52`

Branch: `feat/banco-de-notas-foundation`

## Evidência funcional

Head funcional verificado: `fb1ed728183a048681109d3d0134921295324a7f`.

GitHub Actions: workflow `32919405343` / run `#545` — **success**.

Gates:

- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **203/203 em 35 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped.

## Problema 1 — blockers de importação sem caminho de resolução

### Situação anterior

`import_findings` era append-only e o gate considerava todos os findings de erro históricos. Como não havia identidade/resolução canônica no contrato, um job que recebesse um blocker de erro não possuía caminho auditável para corrigir a correspondência e seguir para geração.

### Correção

Foi criada `0004_banco_notas_import_finding_resolution.sql`.

Ela adiciona `import_finding_resolutions` como stream separado e append-only com:

- finding referenciado;
- operador;
- motivo;
- data/hora;
- unicidade por finding.

O finding original continua imutável.

O contrato passou a expor `id` e `resolvedAt` e a transição aceita `resolvedFindingIds` únicos.

A state machine agora permite que `draft → analyzed` persista blockers de erro para revisão. `generated` e estados posteriores continuam bloqueados enquanto existir qualquer erro não resolvido.

Foi adicionada proteção no banco contra reentrada concorrente no mesmo estado.

### Evidência

Testes cobrem:

- análise com blocker;
- bloqueio de geração com erro não resolvido;
- avanço após resolução;
- IDs de resolução únicos;
- finding original imutável;
- resolução imutável;
- tentativa de resolver duas vezes rejeitada;
- mesma transição de estado repetida rejeitada no storage.

A migration é exercitada em SQLite real por helper Node isolado.

## Problema 2 — compartilhamento Graph sem compensação

### Situação anterior

A orquestração executava:

```text
store → share → metadata/hash
```

Se o compartilhamento funcionasse mas a validação final falhasse, a operação retornava erro sem garantir revogação da permissão e remoção do arquivo armazenado.

### Correção

`TeacherModelGraphGateway` passou a exigir:

- `revokeShare`;
- `remove`.

Em falha após upload/compartilhamento:

1. revoga a permissão quando ela já existe;
2. remove o arquivo armazenado;
3. grava o estado da compensação no audit;
4. se a compensação falhar, promove `teacher_model_compensation_failed:*`, preservando a causa original.

### Evidência

Testes cobrem:

- caminho de sucesso sem compensação;
- mismatch de metadata com revoke + remove;
- falha de share com remoção do upload;
- falha da própria revogação sendo promovida e auditada;
- rejeição de arquivo não-XLSX antes de qualquer chamada ao gateway.

Nenhuma chamada Graph real foi executada; a evidência é do boundary/orquestração local.

## Problema 3 — configuração do add-in incompleta no exemplo operacional

`.env.example` agora lista, sem valores reais:

```text
BANCO_NOTAS_ADDIN_AUDIENCE=
BANCO_NOTAS_ADDIN_SCOPE=
```

O runtime já suportava esses campos. Nenhum audience/scope real foi criado ou inventado.

## OpenAPI

`api/banco-notas-models-v1.openapi.yaml` foi atualizado para `0.2.0`.

O contrato documenta:

- finding de entrada separado de finding persistido;
- `id` e `resolvedAt` na resposta;
- `resolvedFindingIds` na transição;
- blockers permitidos em `analyzed`;
- progressão condicionada à resolução;
- conflitos de resolução/state machine;
- teacher model/share/reconcile ainda `future-not-routed`.

## Limites da evidência

Esta verificação **não prova**:

- Cloudflare D1 remoto;
- Microsoft Entra provisionado;
- adapter Microsoft Graph real;
- SharePoint aplicado;
- browser QA real;
- add-in end-to-end;
- sync institucional;
- deploy do Banco de Notas.

Esses gates continuam externos e pendentes.

## Resultado

O hardening corrige os três riscos locais encontrados antes de qualquer homologação externa:

- blocker de importação agora pode ser resolvido sem apagar histórico;
- compartilhamento rejeitado possui compensação explícita;
- configuração operacional do futuro add-in lista todos os nomes necessários sem expor valores.

O PR deve continuar draft e sem produção até os gates externos.
