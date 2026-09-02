# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai (`#182`, `#184`–`#192`) são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 21 — integração #367

| Frente        | Issue / PR    | Resultado                                                                                |
| ------------- | ------------- | ---------------------------------------------------------------------------------------- |
| Contrato V2   | `#365 / #368` | R3/S3, R/S e AA3:AJ4 formalizados sem reinterpretar V1 histórico                         |
| Implementação | `#366 / #369` | recognizer, componentes, GradeEntry, reconciliação e consumidores V1/V2                  |
| Integração    | `#367`        | regressão transversal, readiness sintética e memória canônica sem ativação produtiva     |

Heads e merges validados:

- #365: `c5d6c3c4e799a99413ebf104d737ab62a6749457` → merge `7b59a226b557153d6e3094b64f268ce5e9373cc3`;
- #366: `7aad372412cfdf10a66a4e29c342bb1d39d6ef0c` → merge `70748d527f0ebf11803dab748a6d5d5dbe6c082a`.

## Invariantes atuais

- `authorityMode: imported-source`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhum D1/binding/secret/recurso acadêmico remoto;
- nenhuma migration remota, restore ou export executado;
- nenhum smoke acadêmico produtivo ou piloto real executado;
- somente dados sintéticos no repositório/CI;
- #347 permanece separada e não autorizada.

## Estado funcional

- **F1:** validação histórica 7/7 preservada e evolução prospectiva V2 integrada.
- **F4/F5:** concluídas.
- **F6:** gráficos oficiais entregues; comparação proporcional permanece fail-closed sem semântica canônica.
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios permanecem integrados em local/preview.
- **F9:** readiness está `prepared-for-manual-authorization`; isso não equivale a produção ou piloto aprovados.

## Próximo passo

Depois da publicação da #367, não iniciar ativação automaticamente. Cada ação abaixo exige autorização própria:

1. criar recurso/binding produtivo;
2. aplicar migration remota;
3. executar smoke acadêmico produtivo;
4. executar piloto privado real;
5. alterar autoridade pela trilha separada #347.

## Fluxo

```text
issue [PRONTA]
  → branch curta
  → um PR
  → npm run verify
  → handoff

frente verde
  → integradora
  → merge fixado
  → testes/docs mínimos
  → verify
  → PR de integração
  → merge/deploy/smokes públicos sem dados
  → gate manual explícito
```

Não usar App Factory, Factory Runs, subagentes ou orquestração salvo autorização explícita da issue. Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.
