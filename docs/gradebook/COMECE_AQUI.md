# Comece aqui — execução final

## Estado integrado

A #636 foi integrada com autorização em `main@4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`. Deploy Cloudflare Pages 254 / `34468184541`: build, bindings privados e publicação aprovados. A entrega inclui documentação reconciliada, projeções em lote, baseline reproduzível e Auditoria transacional. Isso não encerra FINAL-1 nem homologa todas as telas.

## Próxima tarefa segura

**#639 dentro da FINAL-1 #633**, branch `feat/bn-final-1-centrais-relacionais`, PR #640. Contrato V2 explícito, contexto/catálogo, pesquisa e quatro Centrais somente leitura. O código e a conexão da interface estão na branch; validação final, revisão e publicação autorizada são etapas distintas. Ver [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md).

Não refazer o primeiro bloco nem criar streams/versions para preencher os contratos antigos. Após a integração deste bloco, avançar nas leituras de resultados e suas interfaces, registrando antes as lacunas contratuais de manutenção, boletins e Conselho.

## Ordem das fases

| Ordem | Issue | Branch atual/reservada | Condição |
| --- | --- | --- | --- |
| 1 | #633; entrega #639 | `feat/bn-final-1-centrais-relacionais` | em execução, PR #640 |
| 2 | #634 | `feat/bn-final-2-desempenho` | após fonte/contrato relacional compartilhado |
| 3 | #635 | `feat/bn-final-3-conselho` | após base relacional e contrato das lacunas de Conselho |
| 4 | #406 | `test/bn-final-4-piloto-integral` | após jornadas funcionais integradas |

Branches posteriores são reservas e devem incorporar a main validada antes de execução; não fazer merges cegos entre fases. #347 registra aceite por consumidor/escopo; #596 fecha a entrega. #637 trata separadamente as dependências sinalizadas no npm.

## O que não refazer

A #613 concluiu reconstrução e cutover de persistência. Não reiniciar #592/#594/#595, não devolver PostgreSQL a shadow, não reativar V8 nem limpar a massa atual. Importadores arquivados ficam em `Aprendizados/IMPORTADORES-LEGADOS/`.

O [mapa](CONSUMER_MAP.md) diferencia fontes antigas e contratos atuais. Nome D1 pode ser só interface; confirmar composição/SQL. Snapshot de boletim e sessão de Conselho não reaparecem com troca de provider. Do documento antigo usar só Conselho; Desempenho segue seu documento específico.

## Gates

`npm run verify` no head final, CI, revisão e integração/publicação autorizadas. Sem DDL/DML de produção ou mudanças de infraestrutura nesta entrega. Dados reais não entram no repositório/CI. Restore não é presumido por migration. A reimportação idêntica não prova todas as telas.

A autorização de integração da #636 já foi utilizada; a nova #640 aguarda autorização própria. Estados e ondas antigos ficam em [memória histórica](history/pre-final-1/README.md), não na fila executável.
