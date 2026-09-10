# Comece aqui — execução final

## Estado integrado

A #636 foi integrada em `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`, deploy 254 aprovado: planejamento, lote de projeções, baseline reproduzível e Auditoria transacional.

A #640 foi integrada em `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, deploy 255 / `34477526551` aprovado: contexto, pesquisa e quatro Centrais somente leitura, contrato #639. Isso não encerra FINAL-1 nem homologa todas as telas. Smoke autenticado/visual permanece explícito.

## Próxima tarefa segura

Concluir a remediação #637/#641 pelos gates registrados e continuar **#633 / FINAL-1**: conectar leituras acadêmicas e Desempenho ao motor simplificado, unificar contexto anual e adaptar consumidores por contratos próprios. Não refazer importação nem fontes cadastrais já integradas. A publicação da correção é registrada na #637; [evidência do lock e audits](SECURITY_REMEDIATION_637.md).

**Não pedir autorização novamente a cada PR concluída.** O responsável autorizou integração e deploy contínuos em 10/09/2026, #182 comentário `5618750384`, BN-DEC-023. Confirmar revisão, CI do head, merge com SHA esperado e deploy oficial. Não publicar código com falhas ou tratar deploy como aceite acadêmico.

## Ordem das fases

| Ordem | Issue | Branch atual/reservada | Condição |
| --- | --- | --- | --- |
| 1 | #633 | branch curta para a próxima entrega | base e Centrais integradas; consumidores acadêmicos pendentes |
| 2 | #634 | `feat/bn-final-2-desempenho` | fonte/contrato relacional compartilhado |
| 3 | #635 | `feat/bn-final-3-conselho` | base e contrato das lacunas de Conselho |
| 4 | #406 | `test/bn-final-4-piloto-integral` | jornadas funcionais integradas |

Branches posteriores são reservas e devem incorporar a main validada antes de execução; não fazer merges cegos entre fases. #347 registra aceite por consumidor/escopo; #596 fecha a entrega. Nenhum bloco parcial encerra a fase inteira.

## O que não refazer

A #613 concluiu reconstrução e cutover de persistência. Não reiniciar #592/#594/#595, não devolver PostgreSQL a shadow, não reativar V8 nem limpar a massa atual. Importadores arquivados ficam em `Aprendizados/IMPORTADORES-LEGADOS/`.

O [mapa](CONSUMER_MAP.md) diferencia fontes antigas e contratos atuais. Nome D1 pode ser só interface; confirmar composição/SQL. Snapshot de boletim e sessão de Conselho não reaparecem com troca de provider. Do documento antigo usar só Conselho; Desempenho segue seu documento específico.

## Gates e limites

A autorização contínua não modifica proteção de branches, permissões, secrets, recursos, dados/schema ou regras/autoridade acadêmica. Alterações dessa natureza continuam exigindo decisão e escopo próprios. Dados reais ficam fora de Git/CI. Restore não é presumido por migration; reimportação idêntica não prova todas as telas. Estados e ondas antigos ficam em [memória histórica](history/pre-final-1/README.md).
