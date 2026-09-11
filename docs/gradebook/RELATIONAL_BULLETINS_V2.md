# Boletins relacionais V2 — #654

## Escopo e autoridade

O contrato V2 reancora a área de Boletins nas relações correntes do schema `gradebook`, exclusivamente em 2026. A entrega não cria, seleciona nem compara anos letivos e não altera fatos acadêmicos, importador ou motor.

AM e U importadas permanecem os valores oficiais do documento. O cálculo nativo aparece ao lado como comparação descritiva `match | mismatch | unavailable`; divergência não substitui a fonte. A decisão formal de Conselho é somente o fato humano já registrado. `ASSISTIDO` pode ter notas visíveis, mas não recebe resultado geral. REC aparece junto das notas normais e preserva `N/C` sem convertê-lo em zero.

## Fluxo ativo

```text
RelationalBulletinPageV2
  → POST /api/gradebook/bulletins (contractVersion 2)
  → auth + gradebook.persistence.admin + origin + no-store
  → transação read-only/repeatable-read
  → turma/aluno/oferta + projeção relacional em lote + instrumentos opcionais
  → prévia canônica
  → emissão append-only em gradebook.boletim_snapshot
  → PDF local somente a partir do snapshot emitido
```

Operações: `catalog`, `students`, `preview`, `emit`, `emit-batch`, `history` e `reprint`. Catálogo e nomes usam o nome completo da turma como apresentação principal. Componentes seguem a ordem canônica da fonte. O lote aceita no máximo 50 alunos; projeções são agrupadas em blocos de até 1.000 pares, sem consulta por aluno/componente.

## Emissão, idempotência e histórico

Uma emissão pronta recebe `dataVersion` do conteúdo acadêmico e uma chave de série por ano/turma/aluno/período/detalhe. Repetir conteúdo e apresentação devolve a última versão; mudança real avança a série. A inclusão usa comparação da versão anterior e unicidade no banco. Falha de banco não é mascarada como conflito de versão.

`gradebook.boletim_snapshot` é a única extensão: 13 colunas, PK `snapshot_id + versao`, unicidade `chave_serie + versao`, FKs para 2026, checks de identidade do JSON e dois índices de histórico explícitos. É aditiva, sem backfill e sem DML acadêmico. `gradebook_app` recebe apenas `SELECT, INSERT`; `PUBLIC`, `anon` e `authenticated` ficam sem acesso. Reimpressão consulta exclusivamente `snapshot_json`, sem materializar notas atuais nem criar nova versão.

Emissão é bloqueada quando falta AM/U oficial necessária, composição está incompleta, a recuperação está pendente, o ano ainda está em curso ou a decisão humana obrigatória não foi registrada. A prévia continua mostrando a evidência disponível e os motivos legíveis.

## Interface e PDF

A página ativa usa HeroUI `Select`, `Card`, `Chip`, `Alert` e `Table`, mantém os filtros estáveis durante carregamentos, cancela catálogo obsoleto, anuncia estados e não oferece arraste de colunas. A tabela anual reúne os três trimestres, REC, U e situação do componente; o detalhamento lista instrumentos sem recalcular no navegador.

Download e impressão aparecem apenas para emissão/reimpressão. O renderer é carregado sob demanda, usa a Geist empacotada, cria um PDF por vez e não faz HTTP, storage persistente ou cálculo acadêmico. A prévia não é apresentada como PDF oficial.

## Evidência e gates

PGlite cobre contrato estrito, migration, ACL, materialização, `N/C`, `ASSISTIDO`, idempotência, mudança de versão, histórico e contagem limitada de queries. HTTP cobre sessão/capability, 2026, `no-store` e gate produtivo. React/jsdom cobre a jornada HeroUI; PDF cobre conteúdo canônico, sanitização e falha fechada.

Gate produtivo executado em 11/09/2026 no head `4072211`: `npm run verify` e CI `34571001180` verdes; backup lógico pré-DDL das 28 tabelas/12 sequências/120.879 linhas validado em JSON e SHA-256; preflight confirmou somente 2026 e alvo ausente. A aplicação única de `0005` resultou em 29 tabelas, 227 colunas, 203 constraints, 62 índices, 51 FKs e 12 sequências, mantendo 4 funções e 3 triggers. A relação nova ficou vazia, com 13 colunas, 15 constraints, 4 índices totais, 3 FKs e ACL exata `SELECT, INSERT` para `gradebook_app`, sem privilégios de `PUBLIC`, `anon` ou `authenticated`. As contagens acadêmicas permaneceram idênticas.

Restam documentar este postflight no head final, repetir verify/CI, revisar, integrar/publicar e executar smoke autenticado somente leitura. A automação não emite boletim real. A validação visual conjunta permanece no encontro único posterior com o responsável.
