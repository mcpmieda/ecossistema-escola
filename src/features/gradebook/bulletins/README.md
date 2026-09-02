# Boletins local/preview V1

A experiência de Boletins está integrada ao shell do Banco de Notas com transporte serializável, serviço provider-independent, handler autorizado, página HeroUI e PDF canônico sob demanda.

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

A #335 integrou renderer **client-side** sob demanda, sem biblioteca PDF adicional.

- PDF oficial aceita exclusivamente `BulletinPdfInputV1`, isto é, um `BulletinSnapshotV1` canônico;
- emissão oficial segue `snapshot → renderer → PDF`;
- reimpressão PDF usa exclusivamente snapshot histórico, com zero leitura/materialização acadêmica atual e sem criar nova versão;
- renderer é carregado por `import()` e permanece fora do chunk inicial;
- layout é P&B/raster, com `Geist Variable` já empacotada no projeto e sem CDN/fonte privada/fonte do sistema;
- Blob URLs são temporárias e revogadas; não há `localStorage`, `sessionStorage`, IndexedDB ou Cache API para modelo/snapshot;
- bounds atuais: 32 componentes, 96 períodos, 320 avaliações, 160 mil caracteres canônicos, 24 páginas, 12 MiB e um documento concorrente;
- geração de PDF em lote não é disparada nesta versão; a emissão acadêmica em lote continua disponível, mas o arquivo PDF é gerado por snapshot individual.

O PDF é uma apresentação do snapshot canônico. O renderer não calcula nota, percentual, REC, média, arredondamento, resultado ou elegibilidade.
