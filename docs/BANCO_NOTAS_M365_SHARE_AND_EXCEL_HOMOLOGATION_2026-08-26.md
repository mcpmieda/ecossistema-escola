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

## Próximos gates

- resolver a identidade real de `gui@escolaieda.com` no Entra/Graph;
- compartilhamento individual autenticado e conferência do OID concedido;
- abertura e edição sintética no Excel Online pelo navegador interno do Codex;
- download pós-edição, reanálise, revogação e cleanup final.

Nenhum secret, token, cookie, senha ou MFA foi registrado.
