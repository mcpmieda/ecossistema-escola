import { Skeleton } from '@heroui/react';
import type { MouseEvent } from 'react';
import {
  ChartColumn,
  Circle,
  ClipboardList,
  FileText,
  Gavel,
  LayoutDashboard,
  Library,
  MonitorSmartphone,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CoreModuleContract, PlatformRoute } from '../../shared/platform-contract';
import { allowDraftNavigationV1 } from '../shared/forms/draft-navigation-v1';
import { defaultNotesSectionId, notesSections, withNotesModule } from './notes-module';
import {
  portalSectionFromHash,
  studentPortalHref,
  studentPortalSections,
} from './student-portal-module';
import { platformHref, routeIcons } from './routes';

/*
 * Shell layout of 07/10/2026 (owner request): the areas of the Centro sit in one subtle row at
 * the top, and the side column lists the sections of the service that is open.
 */
type ServiceSectionV2 = { id: string; label: string; href: string; icon: LucideIcon };
const PORTAL_SECTION_ICONS_V2: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  accounts: Users,
  policies: SlidersHorizontal,
  sessions: MonitorSmartphone,
  audit: ShieldCheck,
  settings: Settings2,
};
const NOTES_SECTION_ICONS_V2: Record<string, LucideIcon> = {
  [defaultNotesSectionId]: Upload,
  operational: Library,
  audit: ShieldCheck,
  performance: ChartColumn,
  bulletins: FileText,
  reports: ClipboardList,
  council: Gavel,
  settings: Settings2,
};
export function serviceSectionsV2(route: PlatformRoute): ServiceSectionV2[] {
  if (route === 'painel-do-aluno')
    return studentPortalSections
      .filter((section) => section.id !== 'credentials')
      .map((section) => ({
        id: section.id,
        label: section.label,
        href: studentPortalHref(section.id),
        icon: PORTAL_SECTION_ICONS_V2[section.id] ?? Circle,
      }));
  if (route === 'banco-de-notas')
    return notesSections.map((section) => ({
      id: section.id,
      label: section.label,
      href: section.href,
      icon: NOTES_SECTION_ICONS_V2[section.id] ?? Circle,
    }));
  return [];
}
/** The section in the address; each service falls back to its own first section. */
export function serviceSectionFromHashV2(route: PlatformRoute, hash: string): string {
  if (route === 'painel-do-aluno') {
    const section = portalSectionFromHash(hash);
    return section === 'credentials' ? 'accounts' : section;
  }
  const requested = new URLSearchParams(hash.split('?')[1] ?? '').get('area');
  return notesSections.some((section) => section.id === requested)
    ? (requested as string)
    : defaultNotesSectionId;
}
/** Services first, then the platform areas (owner order of 07/10/2026). */
const TOP_ORDER_V2: readonly PlatformRoute[] = [
  'banco-de-notas',
  'painel-do-aluno',
  'visao-geral',
  'operacao',
  'auditoria',
  'configuracoes',
];
const topOrderV2 = (modules: CoreModuleContract[]) =>
  [...modules].sort(
    (left, right) => TOP_ORDER_V2.indexOf(left.route) - TOP_ORDER_V2.indexOf(right.route),
  );
const guardDraft = (event: MouseEvent<HTMLAnchorElement>) => {
  if (!allowDraftNavigationV1()) event.preventDefault();
};

export function TopNavigationV2({
  route,
  modules,
  loading,
}: {
  route: PlatformRoute;
  modules: CoreModuleContract[];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-8 w-full max-w-xl rounded-full" />;
  return (
    <nav aria-label="Navegação principal" className="shell-topnav">
      <ul>
        {topOrderV2(withNotesModule(modules)).map((module) => {
          const isSelected = route === module.route;
          return (
            <li key={module.id}>
              <a
                href={platformHref(module.route)}
                aria-current={isSelected ? 'page' : undefined}
                data-selected={isSelected ? 'true' : undefined}
                className="shell-topnav__item no-underline"
                onClick={guardDraft}
              >
                {module.name}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ServiceSidebarV2({
  route,
  section,
  serviceName,
}: {
  route: PlatformRoute;
  section: string;
  serviceName: string;
}) {
  const Icon = routeIcons[route];
  return (
    <nav aria-label={`Seções de ${serviceName}`} className="shell-sidenav">
      <p className="shell-sidenav__service">
        <span className="shell-sidenav__service-icon">
          <Icon className="size-4" />
        </span>
        <span className="truncate">{serviceName}</span>
      </p>
      <ul>
        {serviceSectionsV2(route).map((item) => {
          const isSelected = item.id === section;
          return (
            <li key={item.id}>
              <a
                href={item.href}
                aria-current={isSelected ? 'page' : undefined}
                data-selected={isSelected ? 'true' : undefined}
                className="shell-sidenav__item no-underline"
                onClick={guardDraft}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
