import {
  BookOpenText,
  Boxes,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { PlatformRoute } from '../../shared/platform-contract';

export const routeLabels: Record<PlatformRoute, string> = {
  'visao-geral': 'Visão geral',
  operacao: 'Operação',
  publicacoes: 'Publicações',
  paginas: 'Páginas',
  sistemas: 'Sistemas',
  auditoria: 'Auditoria',
  configuracoes: 'Configurações',
};

export const routeIcons: Record<PlatformRoute, LucideIcon> = {
  'visao-geral': LayoutDashboard,
  operacao: HeartPulse,
  publicacoes: BookOpenText,
  paginas: FileText,
  sistemas: Boxes,
  auditoria: ShieldCheck,
  configuracoes: Settings2,
};

export function platformHref(route: PlatformRoute): string {
  return `#/${route}`;
}
