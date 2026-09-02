# Readiness F9 — piloto acadêmico futuro

## Estado e autoridade deste documento

Este runbook prepara o futuro piloto acadêmico privado. Ele **não autoriza nem executa**
provisionamento, binding, secret, migration remota, consulta acadêmica produtiva, piloto real ou
troca de autoridade.

Estado fechado pela #360:

- `authorityMode: imported-source`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- D1 acadêmico de produção, binding e migrations remotas ausentes;
- dados do repositório e da CI exclusivamente sintéticos;
- ativação do motor nativo separada em #347 e na trilha normativa BN-DEC-019/#349/PR #375.

A #367 revalidou estes mesmos gates depois da evolução prospectiva de fidelidade das avaliações da onda 21 (#365/#366). A manutenção preserva o resultado histórico F1 7/7, não cria recurso/binding/migration remota e devolve o projeto ao mesmo estado máximo `prepared-for-manual-authorization`.

A #374 revalida os gates depois da onda 22. Comparação proporcional e correção determinística estão integradas apenas em código/local/preview; possível impacto acadêmico permanece `stop`, `imported-source` continua autoridade e nenhum D1/binding/migration/smoke acadêmico produtivo ou piloto real foi executado.

`server/gradebook/readiness/production-readiness-v1.ts` materializa os gates preparatórios e os
hard stops como dados puros. Ele não contém cliente HTTP, API Cloudflare, Wrangler, SQL ou executor
de produção. `npm run test:gradebook-readiness` executa os ensaios locais.

## Resultado possível nesta frente

O único resultado positivo permitido é `prepared-for-manual-authorization`. Isso significa que a
preparação versionada está verificável e que **todos** os hard stops produtivos continuam ativos.
Não significa `production-ready`, piloto aprovado ou autoridade alterada.

O avaliador retorna `scope-violation` se observar qualquer um destes estados:

- autoridade diferente de `imported-source`;
- runtime acadêmico produtivo habilitado;
- binding D1 acadêmico produtivo presente;
- migration remota aplicada;
- piloto real executado.

Próxima ordem autorizada de trabalho, sem autorização implícita para executar os passos:

`onda 22 concluída → onda 23 produção controlada → onda 24 piloto real → #347 autoridade nativa`

A onda 23 deve separar recurso/binding, migration remota e smoke acadêmico produtivo em gates/issues próprios. A presença da BN-DEC-019 permite planejar essas issues, mas não remove os hard stops abaixo.

## Gates preparatórios executáveis

| Evidência                           | Como fechar                                         | Saída pública permitida                                      |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `final-sha-verify`                  | `npm run verify` no SHA final do PR                 | SHA e resultado agregado de lint/typecheck/test/build        |
| `synthetic-critical-flow-rehearsal` | `npm run test:gradebook-readiness`                  | cenários, contagens sintéticas, pass/fail e duração agregada |
| `rollback-recovery-rehearsal`       | rollback transacional e restart sobre D1 em memória | pass/fail; nunca payload/SQL de erro bruto                   |
| `security-privacy-regression`       | suíte completa + auditoria do diff                  | invariantes e contagens; nenhum conteúdo acadêmico           |
| `private-pilot-protocol-review`     | revisão humana deste protocolo                      | revisão aprovada ou pendente, sem identidade privada         |
| `future-smoke-plan-review`          | revisão da ordem e dos hard stops abaixo            | revisão aprovada ou pendente; nenhuma credencial/ID remoto   |

Para o PR da #360, a evidência de CI contou somente após o workflow oficial ficar verde no mesmo
SHA final. A #361 compôs/publicou a preparação, e a #367 a revalidou sem remover os gates manuais.

## Ensaios sintéticos representativos

O comando dedicado executa somente memória/processo local:

```powershell
npm run test:gradebook-readiness
```

Cenários V1:

1. **Importação bounded:** 50 workbooks sintéticos no limite público, em sequência e sem falha
   global por arquivo individual.
2. **Schema local:** migrations 0001–0004 e replay idempotente; versão 4 e 25 tabelas.
3. **Boletins duráveis:** 30 estudantes sintéticos, duas versões por série, histórico append-only e
   recuperação após reinstanciar o runtime.
4. **Fila de Conselho:** 30 estudantes sintéticos consultados em lote, mais um par CAS concorrente
   com exatamente um vencedor.
5. **Rollback/recuperação:** falha sintética depois do avanço de raiz reverte o savepoint, conserva
   a versão anterior e não cria versão órfã.
6. **Fail-closed produtivo:** runtime `production` recusa antes de consultar um binding apresentado.

As escalas são amostras de ensaio, não estimativa de capacidade, SLO, quota ou volume institucional.
Não há threshold de latência inventado. Qualquer objetivo operacional de capacidade precisa de
medição no ambiente futuramente autorizado e decisão própria.

## Hard stops antes de produção

Os gates abaixo permanecem manuais, ordenados e independentes. Nenhum pode ser inferido por CI,
presença de código ou merge:

1. `production-resource-and-binding-authorization` — autorização explícita para criar o D1 e
   configurar o binding/secret necessário;
2. `remote-migration-authorization` — autorização explícita e separada para inspecionar/aplicar
   migrations remotas;
3. `production-academic-smoke-authorization` — autorização para smokes acadêmicos no ambiente e
   conjunto de dados aprovados;
4. `private-real-pilot-authorization` — autorização institucional para o piloto paralelo privado;
5. `native-authority-separate-authorization` — vigência/versão/aceite próprios da #347; nunca é
   consequência automática do piloto.

Parar imediatamente se a execução exigir:

- criar ou identificar recurso remoto sem autorização registrada;
- colocar ID de banco, binding, token, secret, bookmark, export, nome/hash/caminho de arquivo ou
  conteúdo acadêmico em issue, PR, commit, log ou screenshot público;
- aplicar migration ou restore remoto como parte de CI/deploy comum;
- usar dado real em fixture, teste, smoke público ou artefato do repositório;
- definir retenção, RPO, RTO, volume, tolerância acadêmica, regra de comparação, capability, papel ou
  autoridade ainda não formalizados;
- continuar depois de divergência material, schema inesperado, erro não sanitizado ou dúvida sobre
  o ponto de recuperação.

## Checklist futuro de ativação controlada

Esta lista só pode ser usada depois das autorizações acima. Cada passo registra evidência privada
mínima e resultado agregado público.

### A. Congelamento e autorização

- [ ] Fixar SHA da `main`, deployment e migrations esperadas 0001–0004.
- [ ] Confirmar `authorityMode: imported-source` e vigência não retroativa.
- [ ] Registrar autorização explícita para recurso/binding e responsáveis institucionais fora do
      repositório público.
- [ ] Definir, por decisão própria, RPO/RTO e armazenamento/retention de export privado; se ausente,
      parar.
- [ ] Confirmar que o corpus real autorizado permanece privado e que o relatório será agregado.
- [ ] Confirmar caminho de rollback de código para o deployment fail-closed anterior.

### B. Recurso e schema — ainda não autorizados

- [ ] Criar o recurso somente pela issue autorizadora futura.
- [ ] Manter IDs, conta, binding e credenciais fora de artefatos públicos.
- [ ] Inspecionar versão/schema antes de qualquer write.
- [ ] Capturar privadamente o ponto de recuperação suportado pelo provedor.
- [ ] Aplicar migrations 0001–0004 somente após o gate remoto específico.
- [ ] Reinspecionar: versão 4, 25 tabelas, FKs/índices e nenhuma migration pendente.
- [ ] Não abrir consultas acadêmicas enquanto schema/recuperação não estiverem confirmados.

### C. Smokes preparados — não executados pela #360

A ordem V1 está registrada em `GRADEBOOK_FUTURE_PRODUCTION_SMOKE_PLAN_V1`:

1. `GET /` — shell público, nenhum dado acadêmico;
2. `GET /api/gradebook/admin/persistence/status` sem sessão — non-disclosure e `no-store`;
3. o mesmo status com autorização existente — somente agregado, depois do gate de recurso;
4. `POST /api/gradebook/performance` — leitura com dados **sintéticos**, depois do gate de smoke;
5. `POST /api/gradebook/bulletins` — write sintético e snapshot recuperável, depois do gate de smoke.

Para cada resposta acadêmica conferir `Cache-Control: no-store, no-cache, must-revalidate, private`,
Pragma/Expires aplicáveis, auth server-side e erro sanitizado. Não salvar body acadêmico em log,
HAR, screenshot ou artefato de CI. Conselho/write humano não entra no smoke mínimo automático; se
for indispensável, exige roteiro privado e ação humana explícita, sem automatizar decisão.

### D. Saída do smoke

- [ ] Registrar somente status, duração agregada, contagem e categoria sanitizada.
- [ ] Confirmar zero dado acadêmico em storage do navegador, logs e artefatos.
- [ ] Confirmar que reprint usa snapshot histórico e zero leitura acadêmica atual.
- [ ] Em qualquer falha, manter produção acadêmica fechada e iniciar o plano de recuperação.

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
