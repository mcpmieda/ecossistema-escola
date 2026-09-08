# Banco de Notas: cutover PostgreSQL e rollback D1

## Estado oficial

- Provedor oficial: `GRADEBOOK_STORAGE_PROVIDER=postgres`.
- Conexão: binding Hyperdrive `PROD_DB`, configuração dedicada sem cache.
- Autoridade acadêmica: `imported-source`; o cutover não habilita o motor nativo.
- D1 `GRADEBOOK_D1`: preservado sem dual write para rollback de contingência.

## Gate e janela de rollback

A janela permanece aberta até a conclusão do piloto integral da issue #406 e por no mínimo
sete dias após o cutover, valendo o evento que ocorrer por último. Durante a janela, toda
leitura e escrita acadêmica oficial usa PostgreSQL. O D1 não recebe escrita acadêmica.

Cada resposta de uma rota oficial do Banco de Notas inclui
`X-Gradebook-Storage-Provider: postgres`. O endpoint administrativo de persistência D1 é
deliberadamente separado e não passa pelo seletor oficial.

## Rollback controlado

1. Interromper importações e alterações acadêmicas no portal.
2. Registrar o motivo e o último instante de escrita PostgreSQL confirmado.
3. Alterar somente `GRADEBOOK_STORAGE_PROVIDER` para `d1` e implantar `main`.
4. Confirmar o cabeçalho `X-Gradebook-Storage-Provider: d1` em uma leitura autenticada.
5. Manter PostgreSQL intacto; não executar sincronização reversa automaticamente.
6. Antes de reabrir escrita, avaliar as escritas ocorridas após o cutover. Se houver qualquer
   escrita exclusiva em PostgreSQL, o rollback passa a exigir reconciliação explícita.

O rollback é imediatamente seguro enquanto a verificação pós-cutover confirmar que não houve
escrita material exclusiva no PostgreSQL. Depois disso, ele continua tecnicamente disponível,
mas somente após reconciliação para impedir perda lógica.

## Verificações operacionais

- Integridade: executar a operação `verify-integrity` da rota privada de backfill; diferenças de
  contagem, versão, autoridade e chaves estrangeiras devem permanecer em zero.
- Consistência: confirmar que o Hyperdrive está com cache desativado e que uma escrita oficial é
  visível em leitura/reload subsequente.
- Concorrência: repetir uma mutação com a mesma versão esperada; apenas a primeira pode avançar
  o stream (CAS).
- Idempotência: repetir a mesma importação; não deve surgir nova versão material.
- Banco: confirmar role sem privilégios administrativos, sem bypass de RLS e sem escrita na
  tabela `gradebook_schema_migrations`.
- Recuperação: verificar o backup gerenciado mais recente antes do cutover e manter este runbook
  junto da referência do ponto de recuperação.

Nunca registrar connection strings, senhas, cookies, arquivos XLSB ou dados pessoais em Git,
issues, PRs ou logs.
