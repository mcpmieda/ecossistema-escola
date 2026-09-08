# Readiness F9 — implantação controlada até a entrega

## Estado

A implantação está na **Etapa 3/5**. Este documento mantém a memória histórica do readiness D1 e define os gates atuais para migração PostgreSQL, piloto integral, autoridade nativa e entrega institucional.

`authorityMode: imported-source` permanece obrigatório durante toda a Etapa 3/5.

## Readiness histórico preservado

### V1 histórico

`server/gradebook/readiness/production-readiness-v1.ts` continua sendo a memória da preparação anterior. Seu resultado máximo permanece `prepared-for-manual-authorization`.

### V2 histórico

`server/gradebook/readiness/controlled-production-readiness-v2.ts` continua registrando a preparação D1 pós-smokes. O estado histórico é:

`production-infrastructure-smoke-validated-awaiting-private-pilot`

Esse estado não é apagado nem reinterpretado. Ele comprova a preparação anterior, mas a decisão BN-DEC-021 alterou o storage físico alvo antes do encerramento do piloto integral.

## Decisão de storage vigente

BN-DEC-021 substituiu BN-DEC-016 quanto ao armazenamento físico principal futuro:
- PostgreSQL/Supabase via Hyperdrive `PROD_DB` é o storage-alvo;
- D1 continua canônico até o cutover explícito da #595;
- D1 será preservado como rollback read-only por janela definida após o cutover;
- mudança de storage não muda autoridade acadêmica.

O schema PostgreSQL produtivo `gradebook` já foi aplicado sem dados reais. A migração real permanece bloqueada pelos gates abaixo.

## Etapa 3/5 — gates obrigatórios

### Gate 1 — #592 / adapters e dual verification

Antes de qualquer backfill real:
- adapters PostgreSQL equivalentes às portas oficiais;
- CAS, idempotência, transação, staging, snapshots, Conselho e Auditoria cobertos;
- dual verification D1 × PostgreSQL sanitizada;
- nenhuma credencial ou dado real público;
- D1 continua oficial.

### Gate 2 — #594 / backfill privado e paridade

Antes de qualquer cutover:
- migração integral D1 → PostgreSQL executada privadamente;
- contagens, versões, relações e hashes técnicos equivalentes;
- reexecução idempotente;
- nenhuma transformação acadêmica/recalculo durante backfill;
- qualquer divergência material interrompe a transição.

### Gate 3 — #595 / cutover e rollback

Antes do primeiro write acadêmico oficial em PostgreSQL:
- paridade #594 verde;
- role de aplicação de menor privilégio;
- backup e restore confirmados;
- Hyperdrive configurado para consistência read-after-write adequada ao Banco;
- rollback para D1 definido e testável;
- gate de produção controlado;
- D1 passa a read-only durante a janela de rollback.

### Gate 4 — #406 / piloto integral final

Somente depois do cutover:
- corpus privado integral exercitado 18/18;
- persistência/reload;
- reimportação idêntica `no-changes`/idempotente;
- mudança mínima versionada;
- ausência posterior sem delete silencioso;
- CAS concorrente sem write parcial;
- Auditoria e reconciliação;
- Desempenho;
- Boletins, snapshots e reprint;
- Relatórios;
- Conselho/durabilidade/restart;
- backup/recovery/rollback;
- mapa sanitizado de escopos elegíveis versus bloqueados.

A Etapa 3/5 só termina quando #595 e #406 estiverem verdes e `authorityMode` continuar `imported-source`.

## Etapa 4/5 — #347

A autoridade `native-engine` permanece separada e bloqueada. Só iniciar após #406, com:
- contrato de autoridade por escopo;
- divergências materiais reconciliadas;
- versão/vigência explícitas;
- histórico não retroativo;
- rollback confirmado;
- aceite institucional.

## Etapa 5/5 — #596

A entrega institucional fecha:
- operação estável em PostgreSQL;
- janela de rollback D1 encerrada deliberadamente;
- D1 preservado/arquivado conforme runbook;
- observabilidade/saúde e limites quando aplicável;
- backup/restore;
- documentação e `PROJECT_STATE.yaml` finais;
- backlog de implantação limpo;
- smoke final do site oficial.

## Hard stops permanentes

Parar antes de novos writes reais se houver:
- schema/binding/storage alvo ambíguo;
- backup/restore ou rollback indisponível;
- write parcial ou CAS enfraquecido;
- divergência material sem reconciliação;
- exposição de dado real, payload, hash privado ou credencial;
- necessidade de regra acadêmica não formalizada;
- tentativa de ativar autoridade antes da #347.

## Segurança e privacidade

- autenticação/autorização server-side obrigatórias;
- respostas acadêmicas `no-store`;
- nenhum armazenamento acadêmico persistente no browser;
- erros e telemetria sanitizados;
- dados reais somente em ambiente privado autorizado;
- Git/CI públicos usam somente dados sintéticos.

## Verificação de código

`npm run test:gradebook-readiness` continua preservando V1/V2 históricos. `npm run verify` é obrigatório no SHA final de cada entrega. Evoluções de storage devem adicionar gates sem apagar a evidência histórica anterior.