# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai (`#182`, `#184`–`#192`) são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 22 — integração #374

| Frente                 | Issue / PR    | Resultado                                                                                       |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Decisão                | `#349 / #375` | BN-DEC-019 consolidada                                                                           |
| Contratos V2           | `#371 / #376` | comparação percentual profile-aware e correção determinística fail-closed                       |
| Comparação             | `#372 / #377` | F6 no bridge existente, configuração server-side e sem write path inventado                     |
| Correção determinística | `#373 / #378` | Audit Workspace, planner/executor/CAS/rollback oficiais                                          |
| Integração             | `#374 / #379` | regressão transversal, readiness sintética e memória canônica sem ativação produtiva             |

Heads e merges validados:

- #349: `24d40efce8a6c5a8eb26e9ca6aa3e0eef0601da7` → merge `a49b05de243353d1aea9452d0cdc108c75a1221a`;
- #371: `b3063b4498cb70f6b9b754e736cb45ad94da8eb0` → merge `92c0760ff8735e11f94ba61c148f8b789d53929d`;
- #372 recomposta: `c5811ed5dc3543b834598162ac9362752a63ff15` → merge `da73b8cabc30fd5479c00683c36cef481076b286`;
- #373 recomposta: `98684ded7cfc986789bcf0d11680a04576b43a5a` → merge `9cc998225c612722fcbe2ebc64bbf35d2d9dbd1b`.

## Invariantes atuais

- `authorityMode: imported-source`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhum D1/binding/secret/recurso acadêmico remoto;
- nenhuma migration remota, restore ou export executado;
- nenhum smoke acadêmico produtivo ou piloto real executado;
- somente dados sintéticos no repositório/CI;
- #347 permanece separada e não autorizada antes do piloto.

## Estado funcional

- **F1:** validação histórica 7/7 preservada e evolução prospectiva V2 integrada.
- **F4/F5:** concluídas.
- **F6:** concluída com comparação proporcional profile-aware; escrita administrativa da configuração permanece hard stop explícito.
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios permanecem integrados em local/preview.
- **F9:** readiness está `prepared-for-manual-authorization`; isso não equivale a produção ou piloto aprovados.

## Próximo passo

Depois da publicação da #374, seguir a ordem sem antecipar gates:

1. **onda 23 — produção controlada:** recurso/binding → migration remota → smoke acadêmico produtivo, cada ação em issue/gate próprio;
2. **onda 24 — piloto real:** execução privada e controlada, ainda com `imported-source`;
3. **#347 — autoridade nativa:** somente após piloto, vigência e autorização explícitas.

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
