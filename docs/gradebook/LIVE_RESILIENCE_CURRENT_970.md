# Estado atual de resiliência live — #970 / B-21

Data da reconciliação: 20/09/2026.

Este documento separa três conceitos que os checkpoints #839 misturavam por estarem em execução na época:

1. **implementação integrada**;
2. **prova sintética/CI**;
3. **homologação real externa**.

Uma prova sintética não é promovida a homologação real por repetição documental.

## Cadeia atual

```text
commit acadêmico/Portal
  → revision_event ou audit_event na mesma transação
  → trigger 0011
  → live_event_outbox_v1
  → claim/lease curto
  → publicação Durable Object fora da transação PostgreSQL
  → cursor/change ou resync
  → invalidação local autorizada
  → reader refaz GET/POST autorizado
```

O aviso não transporta nota, nome, nascimento, QR, senha ou payload acadêmico. O navegador nunca trata o evento live como fonte de verdade; ele revalida a leitura autorizada.

## Matriz de prova atual

| Propriedade | Evidência atual | Estado |
| --- | --- | --- |
| causas BN → outbox | `tests/student-portal/persistence/live-coverage-839.test.ts` | PROVADO EM TESTE |
| replay do mesmo evento não duplica | `live-coverage-839.test.ts` | PROVADO EM TESTE |
| roteamento admin/aluno por causa | `live-coverage-839.test.ts` | PROVADO EM TESTE |
| login/login-failed não viram mudança de dados | `live-coverage-839.test.ts` | PROVADO EM TESTE |
| claim/ack/retry com postgres.js real | `tests/student-portal/runtime/live-delivery-839.postgres.ts` | PROVADO EM POSTGRESQL LOCAL |
| drainers concorrentes/lease | `live-delivery-839.postgres.ts` | PROVADO EM POSTGRESQL LOCAL |
| evento fora de ordem → resync | `tests/student-portal/runtime/live-ordering-839.workerd.ts` | PROVADO EM WORKERD |
| cursor igual/à frente → revalidação segura | `live-ordering-839.workerd.ts` | PROVADO EM WORKERD |
| socket único por sessão ADM | `tests/live-data/administrative-live-resilience-839.test.tsx` | PROVADO EM TESTE |
| troca de identidade descarta conexão anterior | `administrative-live-resilience-839.test.tsx` | PROVADO EM TESTE |
| 4401/4403 é terminal no escopo | `administrative-live-resilience-839.test.tsx` | PROVADO EM TESTE |
| offline/hidden + backoff | `administrative-live-resilience-839.test.tsx` | PROVADO EM TESTE |
| mudança remota não ecoa via BroadcastChannel | `administrative-live-resilience-839.test.tsx` | PROVADO EM TESTE |
| draft local não é sobrescrito | `tests/live-data/draft-and-cadence-839.test.tsx` | PROVADO EM TESTE |
| expectedVersion original permanece | `draft-and-cadence-839.test.tsx` | PROVADO EM TESTE |
| área oculta pausa scheduler sem desmontar draft | `tests/live-data/live-refresh-scope-839.test.tsx` | PROVADO EM TESTE |
| formulário sujo/operação ativa bloqueia refresh | `live-refresh-scope-839.test.tsx` | PROVADO EM TESTE |
| fallback interativo 30s preservado | `tests/live-data/read-resilience-839.test.ts` | PROVADO EM TESTE |
| analytics pesado pode usar 120s | `read-resilience-839.test.ts` + configuração explícita | PROVADO EM TESTE |
| falha aplica cooldown/backoff até 5min | `read-resilience-839.test.ts` | PROVADO EM TESTE |
| aviso de commit antecipa polling | `read-resilience-839.test.ts` | PROVADO EM TESTE |
| fan-out local ~600 sockets | `LIVE_DATA_V1.md` / workerd | SINTÉTICO, NÃO PRODUÇÃO |

## Invariantes preservadas

- nenhuma mutação é repetida automaticamente por um aviso;
- CAS/`expectedVersion` continua decidindo conflito real;
- `idempotencyKey` continua pertencendo ao comando original;
- um evento live não altera draft;
- uma conexão live não elimina fallback de leitura;
- não há polling zero prometido;
- resposta atrasada pode ser descartada pelo reader sem reverter estado mais novo;
- troca/perda de identidade encerra o escopo anterior;
- falha de live degrada para recuperação periódica, não para dado inventado.

## O que ainda NÃO está homologado

Estes itens exigem ambiente externo e permanecem em #968/P-12:

- duas sessões autenticadas reais em dispositivos/navegadores distintos;
- usuário B salva enquanto usuário A mantém um draft real aberto;
- aba antiga atravessa um deploy oficial e reconecta;
- perda e retorno de rede reais;
- evento acadêmico real autorizado percorrendo outbox → socket → revalidação;
- carga/CPU/requests/latência Cloudflare/Hyperdrive em volume representativo;
- confirmação operacional de alertas/dashboards externos.

## Estado da antiga #839

#839 está **encerrada por consolidação**, não porque toda homologação externa acima foi executada. Seu histórico continua sendo evidência da investigação de 17/09; a causa raiz do timeout original permanece não comprovada.

Para código/testes, a autoridade atual é #970/B-21. Para homologação humana/externa, a autoridade é #968/P-12.
