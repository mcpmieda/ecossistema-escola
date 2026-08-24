# Snapshot pré-implantação — Fundação Cloudflare + Microsoft 365

Data: 2026-08-24 10:44:58 -03:00

Este snapshot foi registrado antes de qualquer mutação externa desta implantação.

## Identidade Microsoft

- Organização: `ESCOLA IÊDA ALVES DE OLIVEIRA MCPM`
- Tenant confirmado: `f04e0fa3-b8dc-4f77-be3c-7dfda0635188`
- Conta administrativa atual: `adminn@eduieda.onmicrosoft.com`
- Object ID da conta: `5855a8db-ce2a-4cd6-b7a6-46d430bf359b`
- App registrations `Ecossistema Escolar - *`: nenhum.
- Site `/sites/CENTROADMIN`: inexistente (Graph HTTP 404).
- Grupos `ECO-*`: nenhum.

## Grupos Microsoft 365 existentes — somente leitura

| Grupo                                 | Object ID                              | E-mail                          | Papel futuro  |
| ------------------------------------- | -------------------------------------- | ------------------------------- | ------------- |
| GRUPO DA SECRETARIA - ARQUIVO DIGITAL | `6b9be4a5-52a4-4e41-8654-1564f14e5ab5` | `ARQUIVODIGITAL@escolaieda.com` | ADMINISTRADOR |
| PROFESSORES                           | `96227794-63b1-421c-96f4-cd062fcdf00a` | `PROFESSORES@escolaieda.com`    | PROFESSOR     |
| ALUNOS                                | `8255b76e-dd85-4d04-a360-8ce1baf6ce63` | `ALUNOS@escolaieda.com`         | ALUNO         |
| EQUIPE DE APOIO                       | `74386ce1-2db4-4352-8618-7ab4659ab7b6` | `apoio@escolaieda.com`          | APOIO         |
| VISITANTE                             | `9b0283b8-8883-4257-8085-3ac60060d489` | `VISITANTE@escolaieda.com`      | VISITANTE     |

Nenhum membro, configuração ou proprietário desses grupos foi alterado.

## Cloudflare

- Conta confirmada pelo MCP: `40cef24b2a2a1df8ab3d974dcafb2c03`.
- Conta exibida: `Adminn@eduieda.onmicrosoft.com's Account`.
- Projetos Pages: nenhum.
- Workers scripts: nenhum.
- Projeto `ecossistema-escola`: inexistente.
- Skills/MCPs: previamente instalados e habilitados; não foram reconfigurados.

## GitHub

- Conta autenticada: `mcpmieda`.
- Repositório privado planejado `mcpmieda/ecossistema-escola`: inexistente.
- A pasta local `ecossistema-escola` continha apenas o snapshot do prompt cancelado; não era repositório Git e não possuía código.

## DNS preservado

- `admin.escolaieda.com`: NXDOMAIN, disponível.
- `escolaieda.com`: continua no GitHub Pages.
- `www.escolaieda.com`: continua apontando para `mcpmieda.github.io`.
- DNS autoritativo permanece na GoDaddy.
- Nenhum registro DNS foi alterado nesta fase.

## Azure fora do runtime

- Contexto Azure existente foi apenas lido para confirmar o tenant.
- Nenhum recurso Azure foi criado, alterado ou excluído.

## Fontes e método

- Microsoft Graph/Azure PowerShell em modo leitura;
- Cloudflare MCP/API com requisições GET;
- GitHub CLI em modo leitura;
- `Resolve-DnsName`;
- documentação oficial Cloudflare consultada em 2026-08-24.

Tokens e credenciais foram mantidos em memória e não foram registrados.
