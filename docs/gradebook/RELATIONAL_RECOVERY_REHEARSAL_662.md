# Ensaio de recuperação lógica e contenção — #662

## Alcance comprovado

A #662 executa, em PostgreSQL 18 local e descartável, a restauração da cópia lógica privada capturada antes de `0005`. O ensaio não conecta à produção, não aplica DDL/DML remoto e não publica nomes, notas, hashes de fonte ou payloads. A massa existente foi autorizada como massa de teste; ela não é evidência acadêmica oficial.

O utilitário `gradebook:restore-rehearsal` aceita somente conexão loopback e nome de banco iniciado por `gradebook_recovery_`. O alvo precisa estar vazio. Ele não contém `DROP`, não cria login/senha e não escolhe silenciosamente outro banco. A role local `gradebook_app` é `NOLOGIN`, criada apenas dentro do alvo descartável para que os grants e ACLs possam ser reconstruídos e verificados.

O plano exato de schema é:

1. `0001_current_schema.sql`;
2. `application_role_grants.sql`;
3. `0003_council_session_v3.sql`;
4. `0004_council_v3_least_privilege.sql`;
5. `0005_relational_bulletin_snapshot_v2.sql`.

`0002_import_diagnostics_audit_v1.sql` é uma migration histórica cujo resultado já está incorporado em `0001`. Reaplicá-la depois da baseline é inválido; ela não integra o roteiro de recuperação atual.

## Resultado medido em 11/09/2026

O restore preservou e conferiu 120.879 linhas nas 28 relações presentes no artefato, 12 contadores de sequence e todos os IDs. O catálogo reconstruído terminou com 29 tabelas, 227 colunas, 203 constraints estruturais, 62 índices, 51 FKs, 12 sequences, 4 funções e 3 triggers distintos. O postflight confirmou:

- somente o ano 2026;
- todas as FKs validadas;
- nenhuma concessão de tabela a `PUBLIC`;
- `boletim_snapshot` vazio, sem fabricar emissão;
- contagem exata por relação e estado exato das sequences.

O restore de schema + dados + validação levou **7.385 ms** nessa máquina, excluindo criação do cluster. É uma medida local do artefato, não SLA nem RTO institucional contratado. O ponto recuperado corresponde ao instante da captura privada; a #662 não cria frequência de backup e, portanto, não define RPO operacional.

## Jornadas sobre o banco recuperado

O teste opt-in `gradebook:recovery-contention` abriu conexões reais e executou os serviços atuais, sem emitir boletim:

- catálogo relacional 2026;
- Desempenho com comparação T2 versus T1 no mesmo snapshot;
- leitura de Auditoria corrente;
- workspace do Conselho V3;
- histórico de Boletins, confirmado vazio para o artefato recuperado.

Na substituição de diagnósticos, uma transação manteve o advisory lock enquanto outra conexão tentou substituir a mesma fonte. O segundo escritor permaneceu bloqueado até a liberação; duas substituições concorrentes terminaram com um único conjunto completo do último commit, sem mistura. Uma falha intencional depois do `DELETE` reverteu a transação e preservou o conjunto anterior.

No Conselho, duas conexões enviaram comandos com a mesma versão esperada. O ensaio revelou que PostgreSQL `SERIALIZABLE` pode abortar o perdedor com SQLSTATE `40001` antes da leitura do CAS. O serviço passou a repetir **uma única vez** a transação abortada; na nova fotografia, devolve `version-conflict`. O resultado observado foi um vencedor, um conflito e repetição idempotente do vencedor, sem registrar voto de diretor ou desempate.

Toda massa criada pelo ensaio de contenção usa identificadores sintéticos reservados e é removida ao final. A verificação pós-teste confirmou zero sessões, votos, fechamentos, idempotências e diagnósticos sintéticos remanescentes; as 49.459 notas do artefato continuaram intactas.

## Reprodução privada

Com um PostgreSQL local vazio e o arquivo privado fora do Git:

```powershell
$env:GRADEBOOK_RECOVERY_DATABASE_URL = 'postgres://postgres@127.0.0.1:55462/gradebook_recovery_662'
npm run gradebook:restore-rehearsal -- --backup '<caminho-privado-do-backup-v2.csv>'
npm run gradebook:recovery-contention
```

Sem `GRADEBOOK_RECOVERY_DATABASE_URL`, a suíte de integração fica ignorada no `npm run verify`; CI nunca recebe o backup nem credenciais. Parser, allowlists, proteção de destino e ordem continuam cobertos por testes sintéticos normais.

## O que continua pendente

Este ensaio prova que **esse artefato** restaura o modelo corrente e serve as jornadas selecionadas. Ainda não prova nem autoriza:

- restauração pelo mecanismo gerenciado da produção;
- política/frequência de backup, retenção, RPO e RTO institucionais;
- recuperação de binding Hyperdrive, secrets, identidade, DNS, Pages/Functions ou outras configurações externas;
- permissões efetivas de contas remotas além do catálogo/grants reconstruídos localmente;
- failover, perda regional, capacidade/latência da infraestrutura publicada;
- piloto integral #406, aceite acadêmico #347, entrega #596 ou validação visual conjunta.

Esses limites permanecem gates explícitos. Não usar o tempo local para prometer recuperação produtiva nem usar a restauração como autorização para alterar dados/schema, regra ou autoridade oficial.
