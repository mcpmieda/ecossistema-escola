# Banco de Notas — Implementation State

## Estado corrente

O Banco de Notas está incorporado ao `ecossistema-escola` e usa a rota `/banco-de-notas` com APIs same-origin em `/api/banco-notas/v1/*`.

O caminho operacional inicial de planilhas é o **upload administrativo de cópia XLSX**:

- o original não é alterado;
- o servidor calcula o hash e mantém proveniência;
- XLSB não é processado diretamente pelo runtime;
- análise não implica promoção automática para notas oficiais;
- zero e ausência permanecem estados distintos.

A sincronização automática por add-in foi retirada do caminho obrigatório. O código/histórico relacionado pode existir para referência, mas não representa uma pendência que deva ser retomada automaticamente.

## Fundação preservada

- HeroUI React v3 no Banco; Ambient Constellation proibido;
- autorização server-side por capabilities;
- Cloudflare D1 para persistência estruturada/transacional;
- SharePoint/OneDrive para arquivos e versões;
- Microsoft Graph somente pelo backend quando necessário;
- fontes de notas com autoridade explícita, sem mistura silenciosa;
- dados reais, notas, tokens e secrets fora do Git/logs públicos;
- golden masters privados somente como regressão autorizada, nunca como template/configuração de produção.

## Processo atual

A App Factory não governa mais o projeto por padrão. Não há obrigação de atualizar este documento, handoff, semantic assurance ou evidências a cada alteração.

Para uma mudança comum, use o fluxo normal do repositório. Verificações extras entram somente quando o diff afetar add-in, D1/migrations, Microsoft integrations, workflows, segurança, produção ou recovery.

## Histórico

Detalhes de migrations, provas D1/Graph/Excel, NAA, pilotos, branches, PRs e contagens históricas de testes permanecem disponíveis no histórico do Git e nos documentos específicos em `docs/`. Eles não constituem próximos passos obrigatórios.
