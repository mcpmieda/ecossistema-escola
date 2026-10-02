import type { SheetJs } from './spreadsheet-recognizer';
import {
  SHEETJS_LOCAL_SOURCE_V1 as SHEETJS_SRC,
  SHEETJS_INTEGRITY_V1 as SHEETJS_INTEGRITY,
  SHEETJS_VERSION_V1,
} from './sheetjs-source-v1';

declare global {
  interface Window {
    XLSX?: SheetJs;
  }
}

let sheetJsPromise: Promise<SheetJs> | null = null;

export function loadSheetJs(): Promise<SheetJs> {
  if (window.XLSX)
    return window.XLSX.version === SHEETJS_VERSION_V1
      ? Promise.resolve(window.XLSX)
      : Promise.reject(new Error('A versão do leitor de planilhas é incompatível.'));
  if (sheetJsPromise) return sheetJsPromise;

  const pending = new Promise<SheetJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_SRC;
    script.integrity = SHEETJS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.addEventListener('load', () => {
      if (window.XLSX?.version === SHEETJS_VERSION_V1) resolve(window.XLSX);
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
