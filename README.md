# Centro de Administração

Repositório do Centro de Administração da Escola Iêda Alves de Oliveira MCPM.

- Produção: `https://admin.escolaieda.com`
- Frontend: React + HeroUI React v3
- Runtime: Cloudflare Pages + Pages Functions
- Identidade: Microsoft Entra ID
- Dados administrativos: SharePoint/Microsoft Graph
- Persistência acadêmica: PostgreSQL/Supabase via Hyperdrive `PROD_DB`

## Desenvolvimento

Node.js 22 ou compatível:

```powershell
npm ci
npm run verify
```

O fluxo verifica lint, tipos, testes e build. PRs passam pelo workflow de qualidade; publicação oficial ocorre pela `main`, após autorização de integração.

## Forma de entrega e validação

Diretriz do responsável em 23/09/2026 (#1128): **estratégia e escopo final → implementação completa → produto integrado e pronto → teste de uso no ambiente real**. Quando o escopo for toda a escola, não criar uma versão limitada a uma turma ou um modo piloto que depois precise ser ampliado/refeito. O responsável controla externamente os participantes e o momento do teste real, após receber o produto completo; não se exige validação manual de cada etapa intermediária.

Evitar ambientes paralelos e baterias sintéticas extensas que dupliquem trabalho. Reutilizar verificações técnicas essenciais e gates existentes, sem remover controles de segurança ou testar destrutivamente em dados reais. **Implementação concluída e validação real concluída são registros separados.** A orientação completa está em [`AGENTS.md`](AGENTS.md#entrega-completa-e-validação-real).

## Banco de Notas — programa final

Mesmo repositório, shell, identidade e autorização do Centro. A #613 concluiu a reconstrução e o cutover da persistência simplificada; isso não equivale a homologar todos os painéis.

Comece por [`AGENTS.md`](AGENTS.md), [`docs/gradebook/README.md`](docs/gradebook/README.md) e [`COMECE_AQUI.md`](docs/gradebook/COMECE_AQUI.md).

Programa #182: FINAL-1 #633 (runtime e documentação), FINAL-2 #634 (Desempenho), FINAL-3 #635 (Conselho), FINAL-4 #406 (piloto integral). Aceite acadêmico #347; entrega institucional #596. Não reiniciar as primeiras issues históricas #193–#195.

O [mapa dos consumidores](docs/gradebook/CONSUMER_MAP.md) separa caminhos relacionais, dependências antigas ainda usadas e lacunas. O [estado](docs/gradebook/PROJECT_STATE.yaml) separa baseline auditada e trabalho em andamento.

## Estrutura

- `src/`: interfaces do Centro e Banco de Notas, mais domínio acadêmico.
- `functions/`: entradas de autenticação e APIs.
- `server/`: backend, Microsoft Graph, serviços e persistência acadêmica.
- `shared/`: contratos compartilhados.
- `tests/`: testes sintéticos de domínio, integração e interfaces.
- `docs/gradebook/`: memória técnica e operacional vigente.
- `Aprendizados/`: conhecimento e código arquivado fora do runtime.

Dados acadêmicos reais, credenciais e arquivos privados não entram no Git, na CI nem em evidências públicas.
