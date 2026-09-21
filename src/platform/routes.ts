import {
  BookOpenText,
  Boxes,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import type { PlatformRoute } from '../../shared/platform-contract';

export const routeLabels: Record<PlatformRoute, string> = {
  'visao-geral': 'Visão geral',
  operacao: 'Saúde do Sistema',
  publicacoes: 'Publicações',
  paginas: 'Páginas',
  'banco-de-notas': 'Banco de notas',
  'painel-do-aluno': 'Painel do Aluno',
  sistemas: 'Sistemas',
  auditoria: 'Auditoria',
  configuracoes: 'Configurações',
};

export const routeIcons: Record<PlatformRoute, LucideIcon> = {
  'visao-geral': LayoutDashboard,
  operacao: HeartPulse,
  publicacoes: BookOpenText,
  paginas: FileText,
  'banco-de-notas': BookOpenText,
  'painel-do-aluno': GraduationCap,
  sistemas: Boxes,
  auditoria: ShieldCheck,
  configuracoes: Settings2,
};

export function platformHref(route: PlatformRoute): string {
  return `#/${route}`;
}
