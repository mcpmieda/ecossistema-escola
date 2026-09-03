# Readiness F9 — produção controlada e próximo piloto

## Estado e autoridade deste documento

Este runbook preserva a preparação histórica, registra o fechamento controlado da onda 23 e incorpora a revisão de escopo pré-piloto da #394. Ele não autoriza piloto real nem troca de autoridade.

### V1 histórico

`server/gradebook/readiness/production-readiness-v1.ts` continua representando o estado anterior à produção. Seu resultado positivo máximo permanece `prepared-for-manual-authorization` e binding/migration remotos continuam `scope-violation` **nesse modelo histórico**. O V1 não foi enfraquecido nem reinterpretado.

### V2 pós-onda 23

`server/gradebook/readiness/controlled-production-readiness-v2.ts` representa a sequência explicitamente autorizada #380 → #381 → #382 e só retorna `production-infrastructure-smoke-validated-awaiting-private-pilot` quando D1/binding, schema 4/25, smoke sintético, resíduo zero, recovery, gate OFF e `imported-source` estão confirmados, sem piloto real ou autoridade nativa.

O V2 é um avaliador puro de estado. Não contém cliente HTTP, API Cloudflare, Wrangler, SQL, executor de migration, smoke, piloto ou autoridade.

## Evidência consolidada da onda 23

| Gate            | Issue | Resultado sanitizado                                      |
| --------------- | ----: | --------------------------------------------------------- |
| recurso/binding |  #380 | presente; gate OFF                                        |
| migrations      |  #381 | 4/4; schema 4/25; pendentes 0                             |
| smoke           |  #382 | 5/5; somente corpus sintético; recovery para resíduo 0    |
| integração      |  #383 | memória canônica + readiness V2; nenhuma nova operação D1 |

SHA/deployment usado no smoke final: `2fdefa87f186e84ed40637437d4b0199baff82c6`. A janela terminou com `production-gate-final: off` e `authorityMode: imported-source`.

A #384 foi integrada pela PR #393 e publicou a BN-DEC-020. O primeiro piloto real passa a ser a **escola inteira**, em janela privada/controlada, ainda com `imported-source` autoritativo durante a validação. Essa decisão não abriu o gate, não executou piloto e não alterou autoridade.

## Estado atual pós-#399

- #394: revisão de escopo concluída;
- #395 / PR #398: sessão institucional V2 durável em D1 integrada no código;
- #399: migration 0005 aplicada exclusivamente ao D1 produtivo;
- registry remoto: 0001–0005 em ordem;
- schema remoto: version 5 / 27 tabelas / pendentes 0;
- tabelas, FKs e índices da 0005: confirmados;
- production gate: OFF;
- `authorityMode`: `imported-source`;
- piloto real: não iniciado;
- smoke produtivo da sessão V2: não executado pela #399; separado na #400.

## Hard stops depois da onda 23 e da revisão #394

Os gates históricos e o gate de schema 5 estão fechados. Antes da janela real permanecem etapas separadas:

1. `council-v2-production-synthetic-smoke-and-recovery` — **#400**, depois da integração documental da #399;
2. `private-real-pilot-authorization` — autorização/execução em issue separada somente depois da #400 verde;
3. `native-authority-separate-authorization` — trilha posterior, incluindo contrato de autoridade por escopo e #347.

O production gate permanece OFF. `authorityMode` permanece `imported-source`; `native-engine` permanece inativo.

## Revisão de escopo da onda 24 — #394

### Classificação das limitações conhecidas

| Limitação                                                         | Classificação                                       | Evidência/efeito                                                                                                                                                                                 | Decisão pré-piloto                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `reconciliation_v2.case_store` provider-independent/process-local | `allowed-with-controls`                             | `createLocalDeterministicCorrectionCaseStoreV2` usa `Map`/`Set`; após perda do store, `inspect()` relê a reconciliação durável da Auditoria e recria um caso fail-closed, sem liberar `mismatch` | pode participar do piloto desde que qualquer investigação/receita em voo seja invalidada após restart e reconstituída antes de correção |
| sessão/reunião institucional do Conselho V2 process-local         | `blocks-pilot` histórico, removido no código/schema | #395 / PR #398 integrou `GradebookD1CouncilSessionStoreV2`; #399 aplicou a 0005 e confirmou schema 5/27                                                                                          | #400 deve provar o caminho produtivo sintético e recovery antes da issue de piloto                                                      |
| write administrativo da configuração de comparação                | `not-hit-by-authorized-pilot-scope`                 | contrato V2 possui configuração server-only, default canônico `enabled: true` e leitura de `PlatformConfiguration`; somente o write permanece `not-integrated-hard-stop`                         | o piloto não altera configuração; usa a configuração server-side aplicável já resolvida no início da janela                             |

### Reconciliation V2 — controles obrigatórios

A limitação process-local não é considerada bloqueadora porque a perda do case store não produz fail-open: `inspect()` consegue reconstruir o caso base a partir da reconciliação persistida e o estado reconstruído volta a exigir investigação quando a divergência não está reconciliada.

Durante futura janela real:

- nunca tratar case/recipe/history do store process-local como evidência institucional durável;
- se ocorrer restart/deploy durante investigação, considerar perdido todo case/claim/recipe em voo;
- após restart, executar nova inspeção a partir da reconciliação durável e aceitar o retorno fail-closed como nova base;
- revalidar evidência, inputs imutáveis e CAS antes de registrar nova prova/receita;
- nunca atravessar restart entre prova registrada e execução determinística presumindo continuidade do store;
- `mismatch` com possível impacto acadêmico continua bloqueando liberação/fechamento;
- quando uma correção for realmente aplicada, o write acadêmico e a ocorrência de Auditoria continuam pelo planner/executor/transação oficiais.

Se o piloto demonstrar necessidade de preservar investigação/recipe entre restarts como requisito operacional, isso deixa de ser `allowed-with-controls` e exige issue própria; não se adiciona persistência por conveniência nesta revisão.

### Conselho V2 — bloqueio histórico e resolução atual

`CouncilSessionStoreV2` representa por ano/turma o estado `open | closed`, versão/CAS, votos opcionais, snapshot de fechamento e histórico. Na revisão #394, a implementação central ainda era descartável/process-local e não havia tabela D1 para o agregado.

Esse estado era incompatível com o piloto integral porque a BN-DEC-020 exige validar Conselho nos limites formalizados junto com restart/recuperação/CAS/histórico. Na implementação antiga, após restart real uma sessão fechada poderia reaparecer como `open` versão 0, perder histórico e deixar de aplicar o guard pós-fechamento. As decisões humanas V1 duráveis não substituíam o estado institucional V2.

A #395 / PR #398 removeu esse bloqueio no código, reutilizando a porta `CouncilSessionStoreV2`, adicionando persistência provider-specific e provando localmente recuperação de estado/fechamento/histórico/CAS após reinstanciação. A #399 aplicou a 0005 remotamente e validou o schema sem abrir o runtime. A #400 ficou reservada ao smoke sintético produtivo e recovery; nenhuma dessas etapas autoriza piloto ou altera autoridade.

### Configuração da comparação — limite fora do escopo autorizado

O piloto integral deve validar Desempenho e comparação proporcional, mas não precisa exercer alteração administrativa da configuração. A projeção possui default canônico habilitado e aceita snapshot server-side de `PlatformConfiguration`; não existe preferência de navegador.

Na futura janela:

- fixar a configuração server-side aplicável no início da janela;
- se não houver linha aplicável, usar o default canônico `enabled: true`;
- não editar configuração por SQL manual, cliente, flag local ou qualquer caminho ad hoc;
- se surgir necessidade institucional de mudar a configuração durante o piloto, parar a operação afetada e abrir issue própria antes da mudança.

Portanto a ausência de write administrativo não justifica implementação antes do piloto enquanto a janela autorizada não exigir mudança de configuração.

### Outros limites revisados

Não foi identificado outro `blocks-pilot` obrigatório além da sessão institucional V2.

O desempate do Conselho permanece fail-closed sem identidade/capability formal de diretor. A votação é opcional e não cria decisão; por isso o desempate não é requisito obrigatório da janela integral. O piloto não pode inventar identidade de diretor, inferir `ADMINISTRADOR == diretor` ou transformar esse limite em regra nova.

## Mapa do piloto integral por fluxo

| Fluxo                                   | Estado pós-#383                                                      | Efeito da revisão #394                                                       | Situação para futura janela                           |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| importação/reimportação                 | pipeline/versionamento integrados                                    | nenhuma das três limitações altera o fluxo                                   | apto, sujeito à autorização da janela                 |
| Auditoria/reconciliação                 | reconciliação durável + investigação/correção V2                     | case store process-local                                                     | apto com controles de restart/reinvestigação          |
| Desempenho/comparação proporcional      | comparação profile-aware server-side                                 | write de config não integrado                                                | apto com configuração congelada; write fora do escopo |
| Boletins/snapshots/reprint              | snapshots D1 duráveis; reprint histórico                             | nenhuma das três limitações altera o fluxo                                   | apto, sujeito à autorização da janela                 |
| Relatórios                              | dados oficiais, fail-closed para semântica ausente                   | nenhuma das três limitações altera o fluxo                                   | apto, sujeito à autorização da janela                 |
| Conselho/decisões humanas               | decisões V1 + sessão institucional V2 D1 duráveis no código/schema 5 | smoke produtivo/recovery da sessão ainda separado                            | apto após #400 verde e autorização própria da janela  |
| restart/recuperação/CAS/histórico       | D1/reprint/decisões V1 possuem cobertura; sessão V2 possui store D1  | reconciliação volta fail-closed; sessão V2 aguarda prova produtiva sintética | #400 antes do piloto                                  |
| gates server-side/stop/RPO/RTO/recovery | gate OFF, auth/capability/no-store e runbook existentes              | nenhuma mudança operacional nesta revisão                                    | preservados; não autorizam piloto por si só           |

## Ordem segura até a janela real

1. integrar a memória canônica da #399, já com schema remoto 5/27 e gate OFF;
2. executar #400 com corpus exclusivamente sintético, sessão oficial, recovery para resíduo zero e gate final OFF;
3. abrir issue **separada** de autorização/execução do piloto privado da escola inteira;
4. somente nessa issue posterior abrir o gate durante a janela autorizada e usar dados reais privados;
5. ao fim do piloto, fechar o gate novamente e produzir evidência sanitizada/mapa de escopos elegíveis versus bloqueados;
6. #347 continua bloqueada até piloto verde, contrato de autoridade por escopo, vigência explícita e demais gates da BN-DEC-020.

## Ensaios locais permanecem obrigatórios

`npm run test:gradebook-readiness` cobre V1 histórico, V2 controlado e cenários sintéticos. `npm run verify` permanece obrigatório no SHA final. Repo/CI públicos continuam usando somente dados sintéticos.

## Protocolo privado de piloto paralelo — execução futura, não autorizada pela #394

### Pré-condições

O piloto real só começa quando:

- #394 estiver integrada;
- #395 / PR #398 estiver integrada;
- #399 estiver integrada com schema remoto 5/27 e gate OFF;
- #400 estiver verde com resíduo sintético zero e gate OFF;
- production gate estiver confirmado OFF antes da janela;
- RPO/RTO e recovery continuarem válidos;
- houver issue própria de autorização/execução registrando janela temporal, operadores, stop conditions e procedimento de encerramento;
- `authorityMode` continuar `imported-source`.

O escopo institucional é a **escola inteira**, conforme BN-DEC-020. Detalhes privados que identifiquem pessoas, turmas, arquivos, recursos ou corpus não são versionados. A ausência de qualquer pré-condição é hard stop.

### Execução

1. Selecionar o corpus integral autorizado fora do clone e fora de pasta sincronizada/rastreada.
2. Calcular integridade antes/depois apenas localmente, seguindo `REAL_DATA_VALIDATION.md`; nunca publicar caminhos ou hashes.
3. Importar em lotes bounded. `imported-source` permanece o resultado oficial.
4. Observar o lado calculado já existente apenas como comparação/evidência; não transformar `not-comparable` em match e não inventar tolerância/materialidade.
5. Exercitar, no escopo integral autorizado, Centrais, Auditoria, Desempenho, Conselho, Boletins/reprint e Relatórios. Decisões de Conselho continuam humanas.
6. Para divergência, registrar somente categoria/contagem pública. Investigação detalhada permanece privada; qualquer correção pública nasce de reprodução sintética mínima.
7. Repetir leituras depois de restart e confirmar histórico/CAS/snapshots/fechamento institucional sem reinterpretação.
8. Encerrar a janela sem mudar autoridade e retornar o production gate a OFF. A aprovação de piloto não ativa `native-engine`.

### Critérios de parada

Parar novas operações acadêmicas e preservar evidência privada quando houver:

- dado real em local público, log, issue, PR, screenshot ou telemetria;
- acesso sem capability/autorização server-side;
- cache/persistência acadêmica no navegador;
- erro com SQL, binding, payload, nome ou nota;
- divergência material não reconciliada;
- write parcial, histórico órfão, perda de CAS ou reprint que releia estado atual;
- perda do fechamento/histórico institucional do Conselho depois de restart;
- schema inesperado, migration pendente ou indisponibilidade do ponto de recuperação;
- necessidade de alterar configuração de comparação sem write administrativo formalizado;
- necessidade de regra acadêmica, precedência humana ou autoridade não formalizada.

### Relatório sanitizado

Pode conter somente:

- SHA/deployment testado;
- intervalo da janela sem identificar pessoas;
- contagens por fluxo, status e categoria;
- latência/erros agregados sem payload;
- quantidade de divergências por estado oficial;
- quantidade de arquivos alterados, obrigatoriamente zero;
- decisão `prosseguir`, `repetir` ou `parar`, com gate pendente.

Não pode conter nomes, matrículas, turmas identificáveis, notas, fórmulas, nomes de arquivo/guia, hashes, caminhos, IDs de recursos, bookmarks, credenciais, bodies ou screenshots acadêmicos.

## Rollback e recuperação formal

### Princípios

- rollback de código e recuperação de dados são decisões separadas;
- rollback de deployment deve voltar ao SHA conhecido que mantém produção acadêmica fail-closed;
- corrupção/alteração de dados não é corrigida por redeploy;
- restore D1 é destrutivo e nunca automático;
- decisões humanas, snapshots e histórico não são recalculados para “corrigir” o passado;
- sem RPO/RTO formalizados, o piloto não começa.

### Matriz de decisão

| Sinal                                       | Ação inicial                                              | Recuperação de dados                                                    |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| regressão de código sem write incorreto     | interromper janela e voltar ao deployment fail-closed     | não restaurar D1 por conveniência                                       |
| migration falhou sem commit parcial         | manter runtime fechado, inspecionar schema e runner       | restaurar somente se a inspeção provar necessidade e houver autorização |
| write parcial/órfão ou corrupção confirmada | interromper writes e preservar instante/evidência privada | avaliar Time Travel no ponto anterior ao incidente                      |
| dado real exposto em artefato público       | interromper piloto e acionar resposta institucional       | recuperação D1 não resolve exposição; tratar separadamente              |
| divergência acadêmica não reconciliada      | bloquear publicação/fechamento                            | não alterar imported/calculated automaticamente                         |

### Procedimento futuro

1. Interromper a janela e retornar o código ao deployment fail-closed conhecido.
2. Registrar privadamente o instante do incidente, último write confirmado, deployment e ponto de recuperação; não copiar valores para o repositório.
3. Inspecionar schema e contagens agregadas sem executar correção.
4. Escolher explicitamente entre: somente rollback de código; correção forward autorizada; ou restore point-in-time. Na dúvida, parar.
5. Antes de restore, obter e guardar privadamente o bookmark vigente. O restore sobrescreve o banco in-place e cancela operações em voo; exige aprovação específica.
6. Restaurar somente ao bookmark/timestamp aprovado. Guardar também o bookmark anterior retornado pelo provedor para permitir desfazer o restore.
7. Revalidar schema, histórico, CAS, contagens agregadas e smokes sintéticos autorizados.
8. Reabrir somente com novo aceite explícito. Nunca trocar autoridade durante recuperação.

Cloudflare D1 documenta Time Travel/bookmarks e alerta que restore é destrutivo:
[Time Travel e backups](https://developers.cloudflare.com/d1/reference/time-travel/). Export SQL é
uma alternativa operacional documentada em
[Importar e exportar dados](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
mas um export real contém dados acadêmicos: destino, criptografia, acesso e retenção precisam de
decisão própria e o arquivo nunca entra no clone/CI. Confirmar a documentação e a janela vigente do
plano no momento da execução; a janela do provedor não define retenção acadêmica.

## Evidência histórica de encerramento da #360 — não é checklist atual

Antes do handoff:

- [ ] diff restrito ao manifesto/runbook/testes/script de readiness;
- [ ] nenhuma alteração em `PROJECT_STATE.yaml`, runtime central, Functions, migration ou Wrangler;
- [ ] nenhum cliente/execução de rede em readiness;
- [ ] nenhum dado real ou identificável;
- [ ] `npm run test:gradebook-readiness` verde;
- [ ] `npm run verify` verde no SHA final;
- [ ] PR e CI oficial no mesmo SHA;
- [ ] handoff na #360 registra limites e todos os hard stops ainda ativos.
