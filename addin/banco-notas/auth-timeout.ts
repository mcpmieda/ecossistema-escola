export class BancoNotasNaaSilentTimeoutError extends Error {
  constructor() {
    super('NAA_SILENT_TIMEOUT');
    this.name = 'BancoNotasNaaSilentTimeoutError';
  }
}

export function withNaaSilentTimeout<T>(operation: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new BancoNotasNaaSilentTimeoutError()),
      timeoutMs,
    );
    operation.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
