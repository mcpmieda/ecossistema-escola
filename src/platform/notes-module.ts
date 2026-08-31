import type { CoreModuleContract } from '../../shared/platform-contract';
import { platformHref } from './routes';

export const notesModule: CoreModuleContract = {
  id: 'content.notes',
  name: 'Banco de notas',
  description: 'Importação, reconhecimento e evolução do fluxo de notas escolares.',
  route: 'banco-de-notas',
  state: 'ready',
  requiredRole: 'ADMINISTRADOR',
  capabilities: [],
};

export type NotesSection = {
  id: 'importacao';
  label: string;
  description: string;
  href: string;
  searchTerms: string;
};

export const notesSections: NotesSection[] = [
  {
    id: 'importacao',
    label: 'Importação',
    description: 'Importar e reconhecer planilhas de notas XLSB, XLSX e XLS.',
    href: platformHref('banco-de-notas'),
    searchTerms: 'importar importação planilha planilhas xlsb xlsx xls leitor reconhecimento',
  },
];

export function withNotesModule(modules: CoreModuleContract[]): CoreModuleContract[] {
  return modules.some((module) => module.route === notesModule.route)
    ? modules
    : [...modules, notesModule];
}
