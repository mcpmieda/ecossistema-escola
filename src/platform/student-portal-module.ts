import {
  STUDENT_PORTAL_MODULE,
  type CoreModuleContract,
  type PlatformCapability,
} from '../../shared/platform-contract';

export const studentPortalModule = STUDENT_PORTAL_MODULE;
export const studentPortalSections = [
  { id: 'overview', label: 'Visão geral', description: 'Contas, acesso e saúde operacional.' },
  {
    id: 'accounts',
    label: 'Alunos',
    description: 'Pesquisar alunos, abrir fichas e gerenciar acesso.',
  },
  {
    id: 'birth',
    label: 'Nascimento',
    description: 'Cadastrar o ano de nascimento por turma.',
  },
  {
    id: 'credentials',
    label: 'QR e cartões',
    description: 'Emitir, copiar, reimprimir e preparar PDF.',
  },
  {
    id: 'publication',
    label: 'Notas publicadas',
    description: 'Publicar, atualizar ou retirar períodos.',
  },
  {
    id: 'sessions',
    label: 'Sessões',
    description: 'Ver acessos ativos e histórico.',
  },
  { id: 'audit', label: 'Auditoria', description: 'Consultar eventos e detalhes autorizados.' },
  {
    id: 'settings',
    label: 'Configurações',
    description: 'Acesso, datas e turmas.',
  },
] as const;
export type StudentPortalSection = (typeof studentPortalSections)[number]['id'];
export function portalSectionFromHash(hash: string): StudentPortalSection {
  const selected = new URLSearchParams(hash.split('?')[1] ?? '').get('area');
  return studentPortalSections.find((section) => section.id === selected)?.id ?? 'overview';
}
export const studentPortalHref = (section: StudentPortalSection) =>
  '#/painel-do-aluno?area=' + section;
export function withStudentPortalModule(
  modules: CoreModuleContract[],
  capabilities: readonly PlatformCapability[],
) {
  const existing = modules.filter((module) => module.route !== 'painel-do-aluno');
  return capabilities.includes('platform.settings.read')
    ? [...existing, studentPortalModule]
    : existing;
}
