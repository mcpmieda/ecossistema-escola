# Fotos do aluno — #1119

O [plano de integração](FINAL_INTEGRATION_V1.md) descreve a implementação atual. O bucket privado `student-photos` do Supabase Storage guarda os WebP; PostgreSQL guarda identidade, revisão, autorização de uso, metadados e recibos, sem manter cópia permanente dos pixels.

O editor administrativo existente prepara principal 3×4 com fundo e avatar 1×1. O backend valida e grava objetos imutáveis, vinculados ao `studentUid`, em operações recuperáveis. O Portal serve a principal pela própria origem somente após a sessão e as políticas de acesso existentes serem validadas. A credencial do Storage permanece exclusiva dos backends.

As 361 fotos previamente vinculadas ao SharePoint foram importadas em uma operação interna, com tamanho, formato, dimensões e SHA-256 verificados após o upload. Os originais e as referências antigas foram preservados. Nenhuma sincronização SharePoint faz parte do fluxo futuro. Novas fotos e edições usam o próprio painel.

As migrations `0001`–`0004` são a base histórica já aplicada. A `0005_supabase_storage_v1.sql` prepara a mudança de persistência; a publicação depende também da configuração privada dos dois backends, dos gates oficiais e da verificação do uso real. O estado exato de implantação e validação deve ser registrado na #1119, sem confundir código pronto, publicação e aceite do responsável.
