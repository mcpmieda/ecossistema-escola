# Mapa de issues — Banco de Notas

Estado legível por máquina: [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Fila curta: [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral atual

- **Programa:** #182
- **Coordenação da consolidação:** #593
- **Etapa atual de implantação:** 3/5
- **Storage oficial atual:** PostgreSQL/Supabase via Hyperdrive `PROD_DB`
- **Rollback preservado:** D1 sem dual write, conforme BN-DEC-021 e runbook do cutover
- **Autoridade acadêmica ativa:** `imported-source`
- **Autoridade-alvo futura:** `native-engine` por escopo, somente pela #347
- **Entrega institucional final:** #596

## Issues abertas que devem guiar o restante da implantação

| Papel           | Issue | Estado      | Próximo gate                         |
| --------------- | ----: | ----------- | ------------------------------------ |
| Programa        |  #182 | aberta      | acompanhar 3/5 → 5/5                 |
| Persistência    |  #185 | aberta      | fechar após #595                     |
| F9/implantação  |  #192 | aberta      | fechar na entrega #596               |
| Saúde/limites   |  #220 | planejada   | pós-cutover / #596                   |
| Etapa 4/5       |  #347 | bloqueada   | depende da Etapa 3/5                 |
| Piloto integral |  #406 | **PRONTA**  | executar no PostgreSQL oficial       |
| Migração 1      |  #592 | concluída   | adapters + dual verification         |
| Coordenação     |  #593 | em execução | fecha após docs/backlog consolidados |
| Migração 2      |  #594 | concluída   | backfill e paridade verdes           |
| Migração 3      |  #595 | concluída   | PostgreSQL oficial, D1 em rollback   |
| Etapa 5/5       |  #596 | bloqueada   | depende de #347                      |

Nenhuma outra issue histórica D1/performance/benchmark deve permanecer aberta apenas como memória. O histórico continua no GitHub e o conhecimento reutilizável está em `../../Aprendizados/`.

## Etapa 3/5 — storage + piloto

```text
#592
  adapters PostgreSQL + dual verification
    ↓
#594
  backfill privado D1 → PostgreSQL + paridade
    ↓
#595
  cutover PostgreSQL + rollback D1
    ↓
#406
  piloto integral da escola inteira no storage oficial
```

A Etapa 3/5 termina somente quando #595 e #406 estiverem concluídas, com recuperação/rollback comprovados e `authorityMode: imported-source` preservado.

## Etapa 4/5 — autoridade acadêmica

`#347` só pode começar depois da #406. A ativação deve ser progressiva por escopo, temporal, versionada, reversível e não retroativa por padrão, conforme BN-DEC-019/020.

Storage e autoridade acadêmica são independentes: PostgreSQL ser oficial não significa `native-engine` ativo.

## Etapa 5/5 — entrega

`#596` encerra a implantação institucional. Gates mínimos:

- storage PostgreSQL estável;
- piloto integral aprovado;
- autoridade por escopo concluída conforme #347;
- backup/restore e rollback finalizados deliberadamente;
- observabilidade e runbook operacional;
- backlog de implantação limpo;
- documentação canônica final.

## Fases funcionais

| Fase                   | Issue | Estado atual                            |
| ---------------------- | ----: | --------------------------------------- |
| F0 Fundação            |  #183 | concluída                               |
| F1 Fonte/importação    |  #184 | concluída; V8 integrado                 |
| F2 Persistência        |  #185 | funcional; migração física em andamento |
| F3 Motor               |  #186 | V1 comparativo concluído                |
| F4 Auditoria           |  #187 | concluída                               |
| F5 Centrais            |  #188 | concluída                               |
| F6 Desempenho          |  #189 | concluída funcionalmente                |
| F7 Conselho            |  #190 | concluída/fechada                       |
| F8 Boletins/Relatórios |  #191 | concluída/fechada                       |
| F9 Implantação         |  #192 | Etapa 3/5 em andamento                  |

## Histórico preservado

As ondas 20–24 e a infraestrutura D1 continuam como evidência histórica. O estado histórico `production-infrastructure-smoke-validated-awaiting-private-pilot` permanece válido como registro da preparação D1 anterior, mas não é mais a fila executável atual após BN-DEC-021.

## Regra de execução

1. iniciar apenas issue `[PRONTA]`;
2. uma issue, uma branch curta, um PR;
3. executar `npm run verify`;
4. integrar/publicar somente quando a issue autorizar e CI estiver verde;
5. não avançar dependências bloqueadas;
6. nunca publicar dados reais, payloads, hashes privados, connection strings ou credenciais.
