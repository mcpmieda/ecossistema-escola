import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('teacher assignment maintenance HeroUI V1', () => {
  const workspace = source(
    'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-workspace.tsx',
  );
  const panel = source(
    'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-panel.tsx',
  );
  const client = source(
    'src/features/gradebook/operational-workspace/teacher-assignment-maintenance-client.ts',
  );
  const route = source('server/gradebook/http/operational-workspace-routes-v1.ts');
  const application = source(
    'server/gradebook/application/operational-workspace/teacher-assignment-maintenance-v1.ts',
  );
  const frozenTransport = source(
    'shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1.ts',
  );
  const shell = source('src/platform/gradebook-workspace-shell.tsx');

  it('entrega experiência HeroUI autocontida e lazy-on-action, sem request acadêmico automático', () => {
    expect(workspace).toContain("from '@heroui/react'");
    expect(workspace).toContain('Gerenciar professores e atribuições');
    expect(workspace).toContain('const [activated, setActivated] = useState(false)');
    expect(workspace).toContain('onPress={() => void openWorkspace()}');
    expect(workspace).not.toContain('useEffect(() => {\n    void openWorkspace()');
    expect(panel).toContain('<Card>');
    expect(panel).toContain('<Button');
    expect(panel).toContain('<Alert');
    expect(panel).toContain('<Chip');
  });

  it('exige ano explícito e pesquisa Professor/turma/componente pelas consultas oficiais existentes', () => {
    expect(workspace).toContain('Ano acadêmico');
    expect(workspace).toContain('<option value="">Selecione o ano</option>');
    expect(workspace).toContain("scope: { kinds: ['teacher'] }");
    expect(panel).toContain('kind="class-group"');
    expect(panel).toContain('kind="subject"');
    expect(panel).toContain("scope: { kinds: [kind] }");
    expect(application).toContain('academicYearExists');
    expect(application).not.toContain('new Date().getFullYear');
    expect(application).not.toContain('Date.now');
  });

  it('cobre cadastro, confirmação de nome observado e atribuição anual sem identidade paralela', () => {
    expect(panel).toContain('Cadastrar professor');
    expect(panel).toContain('Nome observado na planilha');
    expect(panel).toContain('Confirmar nome');
    expect(panel).toContain('Atribuições do ano');
    expect(panel).toContain('Confirmar atribuição importada');
    expect(panel).toContain('Nova atribuição anual');
    expect(panel).toContain('Cadastrar atribuição anual');
    expect(application).toContain('sourceNames: []');
    expect(application).toContain("confirmationOrigin: 'administrative'");
    expect(application).toContain("confirmationOrigin: 'user-confirmed'");
    expect(application).not.toContain('cpf');
    expect(application).not.toContain('inep');
  });

  it('expõe CAS/conflito compreensível e não repete writes silenciosamente', () => {
    expect(panel).toContain('maintenance.teacher.currentVersion');
    expect(panel).toContain('assignment.currentVersion');
    expect(panel).toContain("response.state === 'version-conflict'");
    expect(panel).toContain('Nenhuma escrita foi repetida automaticamente.');
    expect(panel).not.toContain('setTimeout');
    expect(client).not.toContain('retry');
  });

  it('mantém o único bridge operacional e não amplia o transporte V1 congelado', () => {
    expect(client).toContain("const OPERATIONAL_WORKSPACE_ENDPOINT = '/api/gradebook/operational-workspace'");
    expect(client).toContain("cache: 'no-store'");
    expect(route.match(/'\/api\/gradebook\/operational-workspace'/gu)).toHaveLength(1);
    expect(route).toContain('isTeacherAssignmentMaintenanceRequestV1');
    expect(frozenTransport).not.toContain('teacher-register');
    expect(frozenTransport).not.toContain('assignment-register');
    expect(frozenTransport).not.toContain('maintenanceVersion');
  });

  it('preserva auth server-side, claims proibidos e produção fail-closed pelo runtime existente', () => {
    expect(route).toContain('session = await requireAuth(request, env)');
    expect(route).toContain('authorizeGradebookD1RuntimeV1(session)');
    expect(route).toContain('createGradebookD1RuntimeV1(env, authorization)');
    expect(route).toContain("'Cache-Control': 'no-store, no-cache, must-revalidate, private'");
    expect(application).toContain('hasOnlyKeys');
    expect(application).not.toContain('actorId');
    expect(application).not.toContain('capability:');
  });

  it('mantém teclado, foco, labels, sinais textuais e responsividade', () => {
    expect(workspace).toContain('focus-visible:ring-2');
    expect(workspace).toContain('teacherHeadingRef.current?.focus()');
    expect(panel).toContain('tabIndex={-1}');
    expect(panel).toContain('mutationAlertRef.current?.focus()');
    expect(panel).toContain('htmlFor="teacher-maintenance-display-name"');
    expect(panel).toContain('htmlFor="teacher-maintenance-source-name"');
    expect(panel).toContain('htmlFor="teacher-assignment-starts-on"');
    expect(panel).toContain('htmlFor="teacher-assignment-ends-on"');
    expect(panel).toContain('Importada · aguardando confirmação');
    expect(panel).toContain('Confirmada pelo usuário');
    expect(panel).toContain('Cadastro administrativo');
    expect(panel).toContain('sm:grid-cols');
    expect(panel).toContain('lg:grid-cols');
    expect(panel).not.toContain('min-w-[1024px]');
  });

  it('não persiste dados acadêmicos no browser e deixa montagem central para #356', () => {
    const frontend = `${workspace}\n${panel}\n${client}`;
    expect(frontend).not.toContain('localStorage');
    expect(frontend).not.toContain('sessionStorage');
    expect(frontend).not.toContain('indexedDB');
    expect(frontend).not.toContain('caches.open');
    expect(frontend).not.toContain('serviceWorker');
    expect(shell).not.toContain('TeacherAssignmentMaintenanceWorkspace');
  });
});
