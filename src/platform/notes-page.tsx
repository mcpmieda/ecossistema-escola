import { useRef, useState } from 'react';
import { Alert, Button, Chip, Surface } from '@heroui/react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { PageHeader } from './presentation';

const SHEETJS_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const ACCEPTED_EXTENSIONS = ['xlsx', 'xlsb', 'xls'] as const;

type Worksheet = {
  '!ref'?: string;
};

type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, Worksheet>;
};

type SheetJs = {
  version: string;
  read: (data: ArrayBuffer, options?: Record<string, unknown>) => Workbook;
  utils: {
    decode_range: (range: string) => {
      s: { r: number; c: number };
      e: { r: number; c: number };
    };
  };
};

type SheetSummary = {
  name: string;
  range: string;
  rows: number;
  columns: number;
};

type WorkbookSummary = {
  fileName: string;
  format: string;
  size: number;
  parserVersion: string;
  sheets: SheetSummary[];
};

declare global {
  interface Window {
    XLSX?: SheetJs;
  }
}

let sheetJsPromise: Promise<SheetJs> | null = null;

function loadSheetJs(): Promise<SheetJs> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;

  sheetJsPromise = new Promise<SheetJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_SRC;
    script.async = true;
    script.dataset.sheetjs = '0.20.3';
    script.addEventListener('load', () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error('O leitor de planilhas não foi carregado.'));
    });
    script.addEventListener('error', () => {
      sheetJsPromise = null;
      reject(new Error('Não foi possível carregar o leitor de planilhas.'));
    });
    document.head.appendChild(script);
  });

  return sheetJsPromise;
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.trim().toLowerCase() ?? '';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeWorkbook(file: File, workbook: Workbook, xlsx: SheetJs): WorkbookSummary {
  return {
    fileName: file.name,
    format: fileExtension(file.name).toUpperCase(),
    size: file.size,
    parserVersion: xlsx.version,
    sheets: workbook.SheetNames.map((name) => {
      const range = workbook.Sheets[name]?.['!ref'];
      if (!range) return { name, range: 'Vazia', rows: 0, columns: 0 };
      const decoded = xlsx.utils.decode_range(range);
      return {
        name,
        range,
        rows: decoded.e.r - decoded.s.r + 1,
        columns: decoded.e.c - decoded.s.c + 1,
      };
    }),
  };
}

export function NotesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookSummary | null>(null);

  async function handleFile(file: File) {
    const extension = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
      setWorkbook(null);
      setError('Selecione uma planilha XLSX, XLSB ou XLS.');
      return;
    }

    setLoading(true);
    setError(null);
    setWorkbook(null);

    try {
      const xlsx = await loadSheetJs();
      const data = await file.arrayBuffer();
      const parsed = xlsx.read(data, {
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellHTML: true,
        cellNF: true,
        cellStyles: true,
      });

      if (parsed.SheetNames.length === 0) throw new Error('A planilha não contém abas reconhecíveis.');
      setWorkbook(summarizeWorkbook(file, parsed, xlsx));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reconhecer a planilha.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Banco de notas"
        title="Leitor de planilhas"
        description="Selecione uma planilha para reconhecer o arquivo e todas as abas diretamente no navegador."
      />

      <Surface variant="default" className="platform-card-surface rounded-[2rem] p-6 sm:p-7">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.binary.macroEnabled.12"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-accent" />
              <h3 className="text-lg font-semibold">Importar planilha</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              XLSB, XLSX e XLS. O arquivo permanece no dispositivo e é lido localmente.
            </p>
          </div>
          <Button variant="primary" isPending={loading} onPress={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            {loading ? 'Lendo planilha' : 'Importar planilha'}
          </Button>
        </div>

        {error && (
          <Alert status="danger" className="mt-5">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Não foi possível ler o arquivo</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {workbook && (
          <div className="mt-6">
            <Alert status="success">
              <Alert.Indicator>
                <CheckCircle2 className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>Planilha reconhecida</Alert.Title>
                <Alert.Description>
                  {workbook.fileName} · {workbook.format} · {formatBytes(workbook.size)} ·{' '}
                  {workbook.sheets.length} aba(s)
                </Alert.Description>
              </Alert.Content>
            </Alert>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {workbook.sheets.map((sheet) => (
                <Surface key={sheet.name} variant="secondary" className="rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{sheet.name}</p>
                      <p className="mt-1 text-xs text-muted">Intervalo: {sheet.range}</p>
                    </div>
                    <Chip variant="soft" size="sm">
                      {sheet.rows} × {sheet.columns}
                    </Chip>
                  </div>
                </Surface>
              ))}
            </div>

            <p className="mt-4 text-xs text-muted">Leitor SheetJS {workbook.parserVersion}</p>
          </div>
        )}
      </Surface>
    </>
  );
}
