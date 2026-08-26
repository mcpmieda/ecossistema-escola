# Factory Run pilot

Manifesto de teste para materialização segura de tarefas do Banco de Notas.

<!-- FACTORY_RUN_BEGIN -->
{
  "schema_version": 1,
  "run_id": "banco-notas-pilot",
  "goal": "Provar materialização segura de tarefas paralelas do Banco de Notas sem tocar produção.",
  "tasks": [
    {
      "id": "ano-letivo",
      "title": "Fatia funcional de configuração do ano letivo",
      "role": "implementation",
      "depends_on": [],
      "paths": ["src/banco-de-notas/ano-letivo"],
      "required_capabilities": ["reasoning", "repo_read", "repo_write", "test"],
      "preferred_providers": ["jules", "antigravity", "opencode_ollama"],
      "human_gates": []
    },
    {
      "id": "conselho",
      "title": "Fatia funcional do Conselho de Classe",
      "role": "implementation",
      "depends_on": [],
      "paths": ["src/banco-de-notas/conselho"],
      "required_capabilities": ["reasoning", "repo_read", "repo_write", "test"],
      "preferred_providers": ["jules", "antigravity", "opencode_ollama"],
      "human_gates": []
    },
    {
      "id": "verificacao",
      "title": "Verificação integrada das duas fatias",
      "role": "verification",
      "depends_on": ["ano-letivo", "conselho"],
      "paths": ["tests/banco-de-notas/integration"],
      "required_capabilities": ["repo_read", "repo_write", "test", "review"],
      "preferred_providers": ["opencode_ollama", "jules", "antigravity"],
      "human_gates": []
    },
    {
      "id": "production-activation",
      "title": "Ativação de produção somente mediante decisão humana",
      "role": "delivery",
      "depends_on": ["verificacao"],
      "paths": ["infra/production"],
      "required_capabilities": ["github_api", "repo_write"],
      "preferred_providers": ["manual"],
      "human_gates": ["production_activation"]
    }
  ]
}
<!-- FACTORY_RUN_END -->
