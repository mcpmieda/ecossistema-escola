import { Button, Surface } from '@heroui/react';
import { FileSpreadsheet } from 'lucide-react';
import { NotesImportPanel } from '../features/gradebook/import/import-panel';
import { notesSections } from './notes-module';
import { PageHeader } from './presentation';

export { MAX_NOTES_IMPORT_FILES } from '../features/gradebook/import/import-batch';

export function NotesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Banco de notas"
        title="Banco de notas"
        description="Importação local em lote e reconhecimento do padrão das planilhas de notas."
      />

      <Surface variant="default" className="mb-5 rounded-2xl border border-border/60 p-2 shadow-sm">
        <nav aria-label="Seções do Banco de notas" className="flex flex-wrap items-center gap-2">
          {notesSections.map((section) => (
            <Button
              key={section.id}
              variant="secondary"
              size="sm"
              aria-current={section.id === 'importacao' ? 'page' : undefined}
              onPress={() => {
                if (window.location.hash !== section.href) window.location.hash = section.href;
              }}
            >
              <FileSpreadsheet className="size-4" />
              {section.label}
            </Button>
          ))}
        </nav>
      </Surface>

      <NotesImportPanel />
    </>
  );
}
