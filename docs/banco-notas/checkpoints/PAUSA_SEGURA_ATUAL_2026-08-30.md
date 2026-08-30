# PAUSA SEGURA ATUAL — Upload Manual V1

Atualizado em: 30/08/2026

Status: Upload Manual V1 publicado; fonte institucional pronta; primeiro upload real ainda não enviado.

## Decisão vigente

Concluir a primeira versão operacional do Banco de Notas por upload manual de cópias `.xlsx` das planilhas que os professores já usam. O add-in e a sincronização automática ficam fora do caminho crítico.

## Git

- repositório: `mcpmieda/ecossistema-escola`;
- Upload Manual V1 integrado pelo PR `#150`, squash `c5b75744f3f153fe27edeafef5ca60bc5968f8cf`;
- binding permanente do D1 de produção integrado pelo PR `#151`, squash `a07b8d43a1309779f2bfb5767a4a165b0e37e11a`;
- `main` local e remota revalidadas no SHA `a07b8d43a1309779f2bfb5767a4a165b0e37e11a` antes deste registro.

## GitHub/Cloudflare

- workflow do merge do Upload Manual V1: `33329183232`, PASS;
- workflow do hotfix permanente do binding D1: `33329890467`, PASS;
- deployment Pages canônico: `14d0be08-fd7f-4036-930c-083474941fd8`, branch `main`, source `a07b8d4`, status sucesso;
- binding `BANCO_NOTAS_DB` de produção revalidado no D1 `banco-notas-production`;
- smoke autenticado em `https://admin.escolaieda.com/banco-de-notas/importacoes` sem erro de storage e sem erros de console.

## D1 e escrita acadêmica

- `sync_enabled=0` na última leitura live;
- `commit_route_enabled=0` na última leitura live;
- `sync_attempts=0`;
- `sync_attempt_invocations=0`;
- `import_analysis_profiles=0`, `import_jobs=0` e `import_analyses=0` na revalidação live imediatamente anterior ao primeiro upload;
- consulta D1 estritamente read-only: `changed_db=false` e `rows_written=0`;
- nenhum primeiro write acadêmico foi executado;
- os eventos existentes do piloto são baselines provisionados, não lançamentos produzidos pelo suplemento.

## Microsoft/Add-in

- add-in distribuído somente à coorte piloto autorizada;
- taskpane e comando central apareceram no Excel Online;
- consentimento do escopo próprio do Banco foi concedido;
- NAA permaneceu bloqueado no broker/iframe mesmo após correções documentadas;
- não repetir mudanças de redirect ou popup sem nova evidência;
- não habilitar sync/commit nesta fase.

## Arquivos e dados

- arquivos reais e nomes/notas reais não entram no Git;
- a planilha original do professor permanece intacta;
- upload aceita uma cópia `.xlsx`;
- `.xlsb` deve ser convertido pelo operador com “Salvar uma cópia”;
- chave do estudante: ano + turma + número sequencial;
- nome é somente conferência;
- `Vínculo Notas`, `RELACAOTURMA*` e `SITUACAOTURMA*` orientam o perfil institucional, sem regra específica de professor.

## Implementação existente a reutilizar

- `import_jobs` com idempotência e state machine;
- `import_analyses` append-only;
- `import_analysis_profiles` versionados;
- parser OOXML seguro;
- distinção zero/ausência;
- findings e proveniência;
- capabilities administrativas;
- D1 e páginas read-only do Banco.

## Progresso do Upload Manual V1 nesta branch

- documentação do pivot, progresso completo e histórico de pausas adicionados em `docs/banco-notas/`;
- rota administrativa `/importacoes` implementada com HeroUI;
- endpoint binário único `/v1/manual-imports` implementado;
- hash SHA-256 calculado no servidor;
- perfil institucional versionado aplicado automaticamente;
- estudante identificado pelo número sequencial da turma, com nome somente para conferência;
- `.xlsb` rejeitado no boundary e orientação de “Salvar uma cópia” apresentada na UI;
- análise concluída antes da criação do job, evitando lote draft envenenado por arquivo incompatível;
- parser OOXML corrigido para células autocontidas `<c/>`;
- testes direcionados e typecheck passaram;
- gate local integral passou: 472 testes em 94 arquivos, build web/add-in, manifesto, lint, tipos, contrato semântico e formatação;
- auditoria de dependências encontrou 0 vulnerabilidades e `git diff --check` passou;
- regressão privada sobre uma cópia autorizada passou sem expor conteúdo;
- cópia temporária movida para a Lixeira; original intocado;
- produção, Pages, Entra, add-in e D1 não foram alterados por esta fase até este checkpoint.

## Próximo passo exato

1. obter confirmação imediata do usuário para transmitir a cópia `.xlsx`, pois ela contém nomes e notas reais;
2. enviar somente a cópia temporária validada, associada a `SECRETARIA — PILOTO CONTROLADO` e à fonte `Upload manual de planilhas docentes 2026`;
3. conferir o resumo da análise sem promover notas para eventos oficiais;
4. revalidar D1, kill switches e ausência de sincronização;
5. remover a cópia temporária local e registrar a evidência final sem dados pessoais.

## Condições de interrupção

Parar e registrar novo checkpoint se:

- o arquivo exigir inferência por nome;
- não existir perfil versionado compatível;
- o `.xlsx` contiver macros/relações externas ou exceder limites;
- a promoção criar conflito de fonte/ano/professor;
- qualquer gate indicar escrita não prevista;
- GitHub, Cloudflare, D1 ou Microsoft divergirem do estado esperado.

## Incidente de binding após o primeiro deploy do Upload Manual V1

- PR `#150` integrado em `main` como `c5b75744f3f153fe27edeafef5ca60bc5968f8cf`;
- workflow `33329183232`: CI, deploy Pages e recovery PASS;
- deployment produzido: `c2fa6523-48a8-462d-95b5-77a47cd49e58`;
- smoke autenticado mostrou a nova tela, mas com `Banco de Notas storage unavailable`;
- Cloudflare confirmou `deployment_configs.production.d1_databases={}` enquanto preview continuava ligado apenas ao D1 de homologação;
- causa: o `wrangler.jsonc` usado pelo deploy genérico de `main` não declarava `BANCO_NOTAS_DB`, removendo o binding de produção a cada release;
- tentativa pelo conector Cloudflare foi rejeitada por autenticação e não alterou estado;
- control plane protegido `deploy-read-only`, run `33329512110`, criou backup/bookmark e confirmou migrations idempotentes, mas falhou fechado antes do deploy porque seu gate histórico exige zero pilotos;
- o estado canônico atual tem exatamente um piloto/modelo/assignment interno habilitado e kill switches globais em zero; esse estado não foi desmontado para satisfazer o gate antigo;
- correção permanente integrada pelo PR `#151`; o deploy seguinte preservou o binding e o smoke autenticado eliminou o erro de storage;
- produção permanece sem importações e sem write acadêmico; sync global e commit route continuam em zero.

## Fonte manual provisionada e ponto seguro final

- fonte criada pela interface administrativa auditada: `Upload manual de planilhas docentes 2026`;
- tipo `legacy_import`, ambiente `production`, migração `ready`, status `active`;
- promoção registrada com motivo explícito e sem criar vigência de sincronização;
- leitura D1 posterior: `changed_db=false`, `rows_written=0`, `import_jobs=0`, `import_analyses=0` e `sync_attempts=0`;
- formulário de importação reconheceu automaticamente ano 2026, fonte e perfil `Visão Geral · turma + número sequencial`;
- único professor disponível: `SECRETARIA — PILOTO CONTROLADO`, previamente autorizado;
- uma cópia local temporária `.xlsx` foi produzida a partir de uma cópia isolada do `.xlsb`; o original não foi modificado;
- regressão privada sobre essa cópia: 1 arquivo de teste PASS, sem imprimir conteúdo;
- nenhum arquivo real foi transmitido, e nenhum nome ou nota foi registrado no GitHub;
- parada segura: aguardar confirmação imediata do usuário antes do upload real.
