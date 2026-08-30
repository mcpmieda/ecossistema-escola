# PAUSA SEGURA ATUAL — Upload Manual V1

Atualizado em: 30/08/2026

Status: implementação autorizada, ainda sem mutação remota desta nova fase.

## Decisão vigente

Concluir a primeira versão operacional do Banco de Notas por upload manual de cópias `.xlsx` das planilhas que os professores já usam. O add-in e a sincronização automática ficam fora do caminho crítico.

## Git

- repositório: `mcpmieda/ecossistema-escola`;
- branch de trabalho: `feat/banco-notas-manual-upload-v1`;
- base revalidada: `9c3488bef6e9a925dd69ecc8b2f1f7a4da8fe49f`;
- `main` remota na abertura desta fase: mesmo SHA;
- commit da implementação e documentação: `f13bb58`;
- branch enviada ao GitHub e PR `#150` aberto;
- `main` permanece inalterada até aprovação dos gates do PR.

## GitHub/Cloudflare

- workflow de `main` mais recente: `33325864994`, sucesso;
- deployment Pages de produção observado: `ba1407f1-5d61-4572-89cf-94d88afa301c`;
- estado revalidado pelo terminal antes do push em 30/08/2026;
- produção deve ser revalidada antes do merge e novamente antes do deploy.

## D1 e escrita acadêmica

- `sync_enabled=0` na última leitura live;
- `commit_route_enabled=0` na última leitura live;
- `sync_attempts=0`;
- `sync_attempt_invocations=0`;
- `import_analysis_profiles=0`, `import_jobs=0` e `import_analyses=0` na revalidação live anterior ao push;
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

1. atualizar contratos semânticos para tornar Upload Manual V1 o caminho operacional inicial;
2. criar endpoint único que faça hash, crie/reutilize job, associe automaticamente o perfil institucional e analise o `.xlsx`;
3. criar UI `Importações` com seleção de ano/professor/fonte/arquivo;
4. exibir resumo e detalhe do conteúdo lido;
5. testar limites, tipos, duplicidade, autorização, zero/ausência e privacidade;
6. executar `npm run verify`, auditoria e `git diff --check`;
7. abrir PR e aguardar CI/review;
8. somente depois revalidar produção e decidir deploy;
9. validar com cópia autorizada, nunca com o original.

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
- correção permanente em andamento na branch `fix/banco-notas-preserve-production-d1`: declarar o D1 de produção e as variáveis fail-closed do Banco no `wrangler.jsonc` versionado;
- produção permanece sem importações e sem write acadêmico; sync global e commit route continuam em zero.
