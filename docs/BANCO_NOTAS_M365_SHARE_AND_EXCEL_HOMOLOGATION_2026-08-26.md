# Banco de Notas — Homologação M365, compartilhamento e Excel

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — open, draft, sem merge.

## Storage Graph/SharePoint

Boundary exclusivo:

`CENTROADMIN → ARQUIVOS_PLATAFORMA → BANCO_NOTAS_HOMOLOGACAO`

Run final deste gate: `33025586408`.

Commit validado: `f928783c6283f126bbcea6012bd1edbd6a66d4ff`.

Resultado:

- validação da aplicação e segurança de Actions: success;
- upload de XLSX sintético genérico: success;
- drive e parent folder resolvidos em runtime, sem hardcode;
- metadata: `21330` bytes;
- download: `21330` bytes, MIME XLSX e assinatura ZIP válida;
- reanálise OOXML: success, sem findings;
- turma, componente, estudante e mappings sintéticos preservados;
- remoção do XLSX: success;
- pasta dedicada: retida;
- sync: desligado;
- deploy/recovery de produção: skipped.

## Normalização observada

O arquivo local tinha `9588` bytes. O SharePoint devolveu `21330` bytes e outro SHA-256.

O diagnóstico do pacote comprovou que o serviço adicionou metadados de biblioteca em `customXml`, `docProps/custom.xml`, catálogos de relações/content types e partes auxiliares. As partes de dados e estrutura do produto permaneceram idênticas. `docProps/core.xml` foi reserializado preservando título e criador.

O gate definitivo não ignora a diferença de hash. Ele exige:

1. igualdade byte a byte quando não há normalização;
2. quando há normalização, preservação exata de toda parte original do produto;
3. preservação semântica das relações, content types e propriedades core originais;
4. adições restritas às partes server-managed observadas;
5. metadata size igual ao tamanho realmente baixado;
6. reanálise OOXML completa e sem findings.

Alteração em worksheet, remoção de parte original ou adição inesperada no namespace `xl/` falha fechado e aciona compensação.

## Cleanup diagnóstico

- XLSX do SharePoint removido pelo job.
- Artefato XLSX diagnóstico do run `33024796115` excluído do GitHub após a análise.
- Apenas evidências JSON redigidas permanecem.

## Identidade e D1 de homologação

- `GUI@escolaieda.com` foi confirmado no perfil Entra como membro habilitado.
- O Object ID exibido no Entra foi conferido com a identidade concedida pelo Graph, sem hardcode de identidade inventada.
- Run D1 `33026452850`: professor/modelo sintéticos preparados no banco exclusivo `banco-notas-homologation`.
- Estado persistido: `ready_to_share`, `environment=homologation` e `sync_enabled=0`.

## Compartilhamento individual

Run final: `33026888705`.

Commit validado: `14d9eb19738be44aece479b1d1b08e9a81e61dcd`.

Resultado:

- arquivo `banco-notas-share-excel-sintetico-20260826.xlsx` criado somente no boundary dedicado;
- compartilhamento individual com role `write`, login obrigatório e sem envio de convite;
- OID concedido exatamente igual ao OID confirmado no Entra;
- ausência de link anônimo, `Anyone`, organização inteira e grupo;
- nenhuma nova permissão para outro usuário além do destinatário;
- uma permissão efetiva de usuário já existia antes do share e foi tratada como baseline herdado, não como concessão nova;
- pacote normalizado pelo SharePoint aprovado pelo gate de integridade;
- metadata/download com `21334` bytes;
- reanálise OOXML aprovada, sem findings;
- XLSX retido temporariamente apenas para a validação no Excel Online;
- job one-shot removido no commit `18f35be9785bb6c80b6ab83e8eedb58979a024a7`;
- CI pós-remoção `33027020137`: success; deploy/recovery de produção skipped.

O primeiro run de share (`33026678794`) falhou fechado ao confundir uma permissão efetiva preexistente com concessão nova. A compensação revogou a permissão criada e removeu o XLSX. O critério foi corrigido para comparar a coleção anterior e posterior ao share; as proibições de link amplo e grupo permaneceram absolutas.

## Próximos gates

- abertura e edição sintética no Excel Online pelo navegador interno do Codex;
- download pós-edição, reanálise, revogação e cleanup final.

Nenhum secret, token, cookie, senha ou MFA foi registrado.
