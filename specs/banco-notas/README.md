# Specs do Banco de Notas

Estes arquivos são **referência técnica**, não um framework obrigatório de execução.

- `semantic-contract.json`: preserva decisões e regras de domínio úteis.
- `verification-plan.json`: define a política atual de validação proporcional.
- `semantic-assurance.json`: marcador de que o processo antigo de Semantic Assurance foi aposentado como obrigação.
- `addin-entra-registration.json`: configuração/contrato técnico específico do add-in.

Uma alteração comum não precisa atualizar estes arquivos. Atualize uma spec somente quando a própria decisão descrita nela mudar.

O fluxo normal é branch/PR + checks padrão do repositório. Verificações especiais entram somente quando o diff afetar diretamente add-in, D1/migrations, Microsoft integrations, workflows, segurança, produção ou recovery.
