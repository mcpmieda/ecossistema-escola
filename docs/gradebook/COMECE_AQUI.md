# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.** Issues-pai (`#182`, `#184`–`#192`) são acompanhamento; integrações rodam somente pela issue integradora correspondente.

## Onda 20 — integração #361

|    Frente    | Issue / PR    | Resultado                                                                             |
| :----------: | ------------- | ------------------------------------------------------------------------------------- |
| F9 readiness | `#360 / #363` | manifesto inerte, ensaios sintéticos, rollback/recuperação e protocolo privado futuro |
|  Integração  | `#361`        | regressão transversal, memória canônica e publicação sem ativação produtiva           |

Head validado da frente:

- #360: `3a49d50e0abbf1bb4b352fe9e4da57cd528adcd0`;
- merge em `main`: `000a6988565419d9c1f2c638e929af4e0dff1491`.

## Invariantes atuais

- `authorityMode: imported-source`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- nenhum D1/binding/secret/recurso acadêmico remoto;
- nenhuma migration remota, restore ou export executado;
- nenhum smoke acadêmico produtivo ou piloto real executado;
- somente dados sintéticos no repositório/CI;
- #347 permanece separada e não autorizada.

## Estado funcional

- **F4/F5:** concluídas.
- **F6:** gráficos oficiais entregues; comparação proporcional permanece fail-closed sem semântica canônica.
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios permanecem integrados em local/preview.
- **F9:** readiness está `prepared-for-manual-authorization`; isso não equivale a produção ou piloto aprovados.

## Próximo passo

Depois da publicação da #361, não iniciar ativação automaticamente. Cada ação abaixo exige autorização própria:

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
