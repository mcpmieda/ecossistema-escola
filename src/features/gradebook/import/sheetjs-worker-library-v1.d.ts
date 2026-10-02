declare module 'virtual:gradebook-sheetjs-worker-v1' {
  const library: import('./spreadsheet-recognizer').SheetJs;
  export default library;
  export const libraryEvaluationMs: number;
}
