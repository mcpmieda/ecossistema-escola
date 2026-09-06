import type { SheetJs } from './spreadsheet-recognizer';

const SHEETJS_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

declare global {
  interface Window {
    XLSX?: SheetJs;
  }
}

let sheetJsPromise: Promise<SheetJs> | null = null;

export function loadSheetJs(): Promise<SheetJs> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;

  const pending = new Promise<SheetJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error('O leitor de planilhas não foi carregado.'));
    });
    script.addEventListener('error', () => {
      reject(new Error('Não foi possível carregar o leitor de planilhas.'));
    });
    document.head.appendChild(script);
  });

  sheetJsPromise = pending.catch((cause) => {
    sheetJsPromise = null;
    throw cause;
  });
  return sheetJsPromise;
}

export function preloadSheetJs(): void {
  void loadSheetJs().catch(() => undefined);
}
