# Readiness F9 — produção controlada e próximo piloto

## Estado e autoridade deste documento

Este runbook preserva a preparação histórica e registra o fechamento controlado da onda 23. Ele não autoriza piloto real nem troca de autoridade.

### V1 histórico

`server/gradebook/readiness/production-readiness-v1.ts` continua representando o estado anterior à produção. Seu resultado positivo máximo permanece `prepared-for-manual-authorization` e binding/migration remotos continuam `scope-violation` **nesse modelo histórico**. O V1 não foi enfraquecido nem reinterpretado.

### V2 pós-onda 23

`server/gradebook/readiness/controlled-production-readiness-v2.ts` representa a sequência explicitamente autorizada #380 → #381 → #382 e só retorna `production-infrastructure-smoke-validated-awaiting-private-pilot` quando D1/binding, schema 4/25, smoke sintético, resíduo zero, recovery, gate OFF e `imported-source` estão confirmados, sem piloto real ou autoridade nativa.

O V2 é um avaliador puro de estado. Não contém cliente HTTP, API Cloudflare, Wrangler, SQL, executor de migration, smoke, piloto ou autoridade.

## Evidência consolidada da onda 23

| Gate | Issue | Resultado sanitizado |
| --- | ---: | --- |
| recurso/binding | #380 | presente; gate OFF |
| migrations | #381 | 4/4; schema 4/25; pendentes 0 |
| smoke | #382 | 5/5; somente corpus sintético; recovery para resíduo 0 |
| integração | #383 | memória canônica + readiness V2; nenhuma nova operação D1 |

SHA/deployment usado no smoke final: `2fdefa87f186e84ed40637437d4b0199baff82c6`. A janela terminou com `production-gate-final: off` e `authorityMode: imported-source`.

## Hard stops depois da onda 23

Os três primeiros gates produtivos históricos estão fechados. Restam independentes:

1. `private-real-pilot-authorization`;
2. `native-authority-separate-authorization`.

A #384 / PR #385 ainda não está integrada nesta consolidação; BN-DEC-019 permanece a decisão canônica vigente até integração própria.

## Limitações conhecidas para revisão da onda 24

- `reconciliation_v2.case_store` provider-independent/process-local;
- sessão/reunião institucional do Conselho V2 process-local e sem durabilidade cross-restart;
- write administrativo da configuração de comparação ainda `not-integrated-hard-stop`.

A revisão da onda 24 deve decidir se o escopo real autorizado depende dessas limitações; esta integração não cria schema/capability por conveniência.

## Ensaios locais permanecem obrigatórios

`npm run test:gradebook-readiness` cobre V1 histórico, V2 controlado e cenários sintéticos. `npm run verify` permanece obrigatório no SHA final. Repo/CI públicos continuam usando somente dados sintéticos.

## Protocolo privado de piloto paralelo

### Pré-condições

O piloto real só começa quando A–D estiverem aprovados, o ambiente estiver autorizado e houver uma
decisão institucional registrando escopo temporal, amostra, operadores e critérios de parada. Esses
detalhes privados não são versionados. A ausência de qualquer decisão é hard stop.

### Execução

1. Selecionar o corpus autorizado fora do clone e fora de pasta sincronizada/rastreada.
2. Calcular integridade antes/depois apenas localmente, seguindo `REAL_DATA_VALIDATION.md`; nunca
   publicar caminhos ou hashes.
3. Importar em lote bounded. `imported-source` permanece o resultado oficial.
4. Observar o lado calculado já existente apenas como comparação/evidência; não transformar
   `not-comparable` em match e não inventar tolerância/materialidade.
5. Exercitar, na amostra autorizada, Centrais, Auditoria, Desempenho, Conselho, Boletins/reprint e
   Relatórios. Decisões de Conselho continuam humanas.
6. Para divergência, registrar somente categoria/contagem pública. Investigação detalhada permanece
   privada; qualquer correção pública nasce de reprodução sintética mínima.
7. Repetir leitura depois de restart e confirmar histórico/CAS/snapshots sem reinterpretação.
8. Encerrar a janela sem mudar autoridade. A aprovação de piloto não ativa `native-engine`.

### Critérios de parada

Parar novas operações acadêmicas e preservar evidência privada quando houver:

- dado real em local público, log, issue, PR, screenshot ou telemetria;
- acesso sem capability/autorização server-side;
- cache/persistência acadêmica no navegador;
- erro com SQL, binding, payload, nome ou nota;
- divergência material não reconciliada;
- write parcial, histórico órfão, perda de CAS ou reprint que releia estado atual;
- schema inesperado, migration pendente ou indisponibilidade do ponto de recuperação;
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

Não pode conter nomes, matrículas, turmas identificáveis, notas, fórmulas, nomes de arquivo/guia,
hashes, caminhos, IDs de recursos, bookmarks, credenciais, bodies ou screenshots acadêmicos.

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
2. Registrar privadamente o instante do incidente, último write confirmado, deployment e ponto de
   recuperação; não copiar valores para o repositório.
3. Inspecionar schema e contagens agregadas sem executar correção.
4. Escolher explicitamente entre: somente rollback de código; correção forward autorizada; ou
   restore point-in-time. Na dúvida, parar.
5. Antes de restore, obter e guardar privadamente o bookmark vigente. O restore sobrescreve o banco
   in-place e cancela operações em voo; exige aprovação específica.
6. Restaurar somente ao bookmark/timestamp aprovado. Guardar também o bookmark anterior retornado
   pelo provedor para permitir desfazer o restore.
7. Revalidar schema, histórico, CAS, contagens agregadas e smokes sintéticos autorizados.
8. Reabrir somente com novo aceite explícito. Nunca trocar autoridade durante recuperação.

Cloudflare D1 documenta Time Travel/bookmarks e alerta que restore é destrutivo:
[Time Travel e backups](https://developers.cloudflare.com/d1/reference/time-travel/). Export SQL é
uma alternativa operacional documentada em
[Importar e exportar dados](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
mas um export real contém dados acadêmicos: destino, criptografia, acesso e retenção precisam de
decisão própria e o arquivo nunca entra no clone/CI. Confirmar a documentação e a janela vigente do
plano no momento da execução; a janela do provedor não define retenção acadêmica.

## Evidência de encerramento da #360

Antes do handoff:

- [ ] diff restrito ao manifesto/runbook/testes/script de readiness;
- [ ] nenhuma alteração em `PROJECT_STATE.yaml`, runtime central, Functions, migration ou Wrangler;
- [ ] nenhum cliente/execução de rede em readiness;
- [ ] nenhum dado real ou identificável;
- [ ] `npm run test:gradebook-readiness` verde;
- [ ] `npm run verify` verde no SHA final;
- [ ] PR e CI oficial no mesmo SHA;
- [ ] handoff na #360 registra limites e todos os hard stops ainda ativos.
