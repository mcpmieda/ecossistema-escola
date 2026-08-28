import type { ImportJobState } from '../../shared/banco-notas-import-jobs';

const transitions: Record<ImportJobState, ReadonlySet<ImportJobState>> = {
  draft: new Set(['analyzed', 'failed']),
  analyzed: new Set(['generated', 'failed']),
  generated: new Set(['validated', 'failed']),
  validated: new Set(['ready_to_share', 'failed']),
  ready_to_share: new Set(['shared', 'failed']),
  shared: new Set(['connected', 'failed']),
  connected: new Set(),
  failed: new Set(),
};

export class InvalidImportJobTransitionError extends Error {
  constructor(from: ImportJobState, to: ImportJobState) {
    super(`invalid_import_job_transition:${from}:${to}`);
    this.name = 'InvalidImportJobTransitionError';
  }
}

export function assertImportJobTransition(from: ImportJobState, to: ImportJobState): void {
  if (!transitions[from].has(to)) throw new InvalidImportJobTransitionError(from, to);
}

export function assertImportJobGate(args: {
  targetState: ImportJobState;
  unresolvedErrorFindingCount: number;
}): void {
  if (
    args.targetState !== 'analyzed' &&
    args.targetState !== 'failed' &&
    args.unresolvedErrorFindingCount > 0
  ) {
    throw new Error('import_job_has_unresolved_error_findings');
  }
}
