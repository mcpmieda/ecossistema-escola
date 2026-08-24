# Decisões de arquitetura

1. Azure Static Web Apps foi descartado; nenhum Azure runtime foi criado.
2. Cloudflare Pages Free hospeda o frontend.
3. Pages Functions é o BFF/backend no Workers runtime.
4. DNS permanece na GoDaddy.
5. Nameservers não migraram para Cloudflare.
6. Microsoft Entra ID continua a identidade oficial.
7. Os cinco grupos Microsoft 365 existentes são a fonte de autorização.
8. `AUTO | Grupos por Cargo | Microsoft 365` continua a fonte de associação por cargo e não foi alterado.
9. Nenhum grupo `ECO-*` foi criado.
10. O BFF mantém credenciais e tokens privilegiados fora do frontend.
11. SharePoint é a persistência institucional.
12. Graph runtime usa `Sites.Selected` e grant `write` somente no `CENTROADMIN`.
13. Cloudflare não guarda dados acadêmicos como banco principal.
14. Módulos de negócio serão construídos depois, seguindo a App Factory.
15. Foi criado um contrato padronizado de módulos.
16. Feature flags foram preparadas, sem flag acadêmica real.
17. Read models serão específicos por módulo.
18. Batching, paginação, timeout e retry Graph são centralizados.
19. Contratos e listas de automação existem, mas nenhum scheduler/motor vazio foi ativado.
20. Automações futuras não aceitarão código arbitrário pela interface.
21. PWA está apenas preparada por manifest; não existe cache offline sensível ou service worker.
22. Centro de Administração real, Banco de Notas e painéis não pertencem a esta etapa.
23. O fluxo Power Automate de alerta 60/30/7 foi substituído por rotação automática semanal de certificados; nenhuma conexão Outlook persistente foi criada.
24. Runtime Cloudflare → Entra secretless não foi adotado porque não há workload OIDC outbound oficialmente comprovado para Pages/Workers.
25. GitHub Actions → Entra usa OIDC secretless, FIC de subject imutável e `Application.ReadWrite.OwnedBy`.
26. Runtime usa certificados em slots A/B, com sobreposição, validação real e rollback antes de remover a chave anterior.
27. `PLATAFORMA_CREDENCIAIS` é inventário sem valores secretos, não agenda de lembretes.
28. O token CI Cloudflare é account-owned, Pages Write, sem expiração; não foi criado um autorrotator de API tokens com privilégio amplo.
