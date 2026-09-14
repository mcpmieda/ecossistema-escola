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
    label: 'Contas',
    description: 'Pesquisar alunos, abrir fichas e gerenciar acesso.',
  },
  {
    id: 'birth',
    label: 'Dados de acesso',
    description: 'Ano de nascimento e procedência por turma.',
  },
  {
    id: 'credentials',
    label: 'QR e cartões',
    description: 'Emitir, copiar, reimprimir e preparar PDF.',
  },
  {
    id: 'publication',
    label: 'Publicação',
    description: 'Publicar, atualizar ou retirar períodos.',
  },
  {
    id: 'sessions',
    label: 'Sessões',
    description: 'Consultar e revogar sessões por aluno ou turma.',
  },
  { id: 'audit', label: 'Auditoria', description: 'Consultar eventos e detalhes autorizados.' },
  {
    id: 'settings',
    label: 'Configurações',
    description: 'Acesso, herança, calendário e vínculos.',
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
