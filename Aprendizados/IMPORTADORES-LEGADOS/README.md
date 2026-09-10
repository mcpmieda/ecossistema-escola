# Importadores legados do Banco de Notas

Este diretório arquiva os caminhos de importação anteriores ao importador relacional V9/V10/V11 atual.

## Estado

- congelado para aprendizado e eventual reaproveitamento;
- não faz parte do runtime, build, lint ou testes ativos;
- os fontes preservados correspondem ao estado da `main` no commit de corte `cc662b6772aadf00c1c9bcb39ec9fc56cad42b2e`;
- não contém dados reais de estudantes, notas ou arquivos XLSB.

## Arquivos

- [`D1-V8/`](D1-V8/) — importação D1 anterior: transporte V2–V8, compactação, staging, atomicidade, bootstrap, known-content e persistência.
- [`HYPERDRIVE-SHADOW/`](HYPERDRIVE-SHADOW/) — transição anterior para PostgreSQL via Hyperdrive: probe, adapters, benchmark, backfill e shadow do fluxo V8.

## Autoridade atual

O caminho executável atual é o importador relacional:

1. navegador reconhece XLSB e cria payload canônico V9;
2. `functions/api/gradebook/import-persistence.ts` recebe o payload;
3. `import-relational-service-v11.ts` coordena V10/V9;
4. `relational-import-write-buffer-v11.ts` grava diretamente no schema simplificado PostgreSQL/Supabase;
5. a conexão PostgreSQL continua usando Hyperdrive em produção.

Portanto, **Hyperdrive continua atual como conectividade**. O que foi arquivado aqui é somente o método antigo de migração/espelhamento/benchmark, não a conexão oficial atual.

## O que não foi removido

Alguns tipos e planejadores nasceram durante o importador antigo, mas ainda são usados por Auditoria, correções determinísticas ou outras áreas. Esses componentes permanecem no código ativo quando existe uma dependência atual real. O arquivo não força a remoção de abstrações compartilhadas apenas por terem nomes históricos.

## Como reutilizar

Nunca reative estes diretórios por import direto. Para reutilizar:

1. crie uma branch específica;
2. copie somente as peças necessárias de `Aprendizados/IMPORTADORES-LEGADOS/.../codigo/`;
3. adapte contratos, autenticação, autorização e schema ao estado atual;
4. acrescente testes atuais;
5. execute `npm run verify`;
6. só então considere uma nova integração.

O Git também preserva o histórico original, mas este arquivo mantém o desenho legível e acessível sem precisar reconstruí-lo por commits antigos.
