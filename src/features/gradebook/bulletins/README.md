# Boletins local/preview V1

Esta frente entrega componentes isolados para a integração central da #328: transporte serializável, serviço provider-independent, handler autorizado e página HeroUI. O wiring de `functions/[[path]].ts`, `src/App.tsx` e do runtime central permanece intocado.

## Invariantes

- seleção explícita de ano, turma, aluno(s), período e modelo;
- `synthetic`, `composition` e `detailed` usam exclusivamente `BulletinModelV1`;
- prévia não recalcula nota nem regra acadêmica;
- emissão individual e lote reutilizam o materializador agregado existente;
- `ready`, `blocked` e `insufficient-data` permanecem isolados por estudante;
- snapshots continuam append-only, profundamente imutáveis e versionados com CAS;
- reimpressão lê somente o snapshot histórico, sem leitura acadêmica atual;
- o registry de snapshots é local/preview, descartável e não garante durabilidade entre restart/isolate;
- autoridade permanece `imported-source`; `native-engine` continua rejeitado pelo materializador;
- imported/calculated e estados `absent`, zero, `not-applicable` e `insufficient-data` são apenas apresentados, nunca reinterpretados na UI.

## PDF

`PDF/renderização pendente por decisão arquitetural`

Não existe no projeto renderer, biblioteca/runtime ou política de fontes/impressão aprovada suficiente para gerar PDF sem introduzir uma nova decisão arquitetural. Esta frente não adiciona dependência nem segundo motor de template. Quando a arquitetura for decidida, o renderer deverá consumir o mesmo `BulletinModelV1`/snapshot canônico da prévia.
