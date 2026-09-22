import type { GradebookRelationImportRequestV9 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';

export interface ResolvedRelationClassV9 {
  readonly id: number;
  readonly codigo: string;
}

export interface ExistingRelationBindingV9 {
  readonly turmaId: number;
  readonly numero: number;
  readonly alunoId: number;
  readonly situacao: number | null;
  readonly turmaRelacionadaId: number | null;
  readonly nome: string;
}

export interface RelationSourceBindingV9 {
  readonly index: number;
  readonly turmaId: number;
  readonly turmaCode: string;
  readonly numero: number;
  readonly nome: string;
  readonly situacao: number | null;
  readonly relatedTurmaId: number | null;
}

export interface RelationIdentityRepairV9 {
  readonly canonicalAlunoId: number;
  readonly duplicateAlunoId: number;
}

export interface RelationComponentV9 {
  readonly items: readonly RelationSourceBindingV9[];
  readonly seedAlunoId: number | null;
  readonly preferred: RelationSourceBindingV9;
  readonly identityRepair?: RelationIdentityRepairV9;
}

export interface RelationPlanV9 {
  readonly source: readonly RelationSourceBindingV9[];
  readonly orderedSource: readonly RelationSourceBindingV9[];
  readonly existingByBinding: ReadonlyMap<string, ExistingRelationBindingV9>;
  readonly components: readonly RelationComponentV9[];
}

export class RelationPlanErrorV9 extends Error {
  constructor(
    readonly state: 'blocked' | 'conflict',
    readonly reason: string,
  ) {
    super(reason);
  }
}

class UnionFindV9 {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(value: number): number {
    const parent = this.parent[value]!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent[value] = root;
    return root;
  }

  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

export function normalizeRelationNameV9(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

function classKeyV9(value: string): string {
  return value.trim().toUpperCase();
}

export function relationBindingKeyV9(turmaId: number, numero: number): string {
  return `${turmaId}:${numero}`;
}

function nameClassKeyV9(turmaId: number, name: string): string {
  return `${turmaId}:${normalizeRelationNameV9(name)}`;
}

function indexExistingBindingsV9(existing: readonly ExistingRelationBindingV9[]): {
  readonly byBinding: ReadonlyMap<string, ExistingRelationBindingV9>;
  readonly byNameClass: ReadonlyMap<string, readonly ExistingRelationBindingV9[]>;
} {
  const byBinding = new Map<string, ExistingRelationBindingV9>();
  const byNameClass = new Map<string, ExistingRelationBindingV9[]>();
  for (const item of existing) {
    byBinding.set(relationBindingKeyV9(item.turmaId, item.numero), item);
    const key = nameClassKeyV9(item.turmaId, item.nome);
    const values = byNameClass.get(key) ?? [];
    values.push(item);
    byNameClass.set(key, values);
  }
  return { byBinding, byNameClass };
}

function materializeSourceBindingsV9(
  request: GradebookRelationImportRequestV9,
  classes: ReadonlyMap<string, ResolvedRelationClassV9>,
): readonly RelationSourceBindingV9[] {
  const source: RelationSourceBindingV9[] = [];
  for (const turma of request.turmas) {
    const resolved = classes.get(classKeyV9(turma.codigo));
    if (!resolved) throw new Error('resolved-class-missing');
    for (const aluno of turma.alunos) {
      const related = aluno[3] === undefined ? null : classes.get(classKeyV9(aluno[3]));
      if (aluno[3] !== undefined && !related) {
        throw new RelationPlanErrorV9(
          'blocked',
          `Turma relacionada não encontrada: ${aluno[3]}.`,
        );
      }
      source.push({
        index: source.length,
        turmaId: resolved.id,
        turmaCode: resolved.codigo,
        numero: aluno[0],
        nome: aluno[1].trim(),
        situacao: aluno[2] === 0 ? null : aluno[2],
        relatedTurmaId: related?.id ?? null,
      });
    }
  }
  return source;
}

function indexSourceByNameClassV9(
  source: readonly RelationSourceBindingV9[],
): ReadonlyMap<string, readonly RelationSourceBindingV9[]> {
  const result = new Map<string, RelationSourceBindingV9[]>();
  for (const item of source) {
    const key = nameClassKeyV9(item.turmaId, item.nome);
    const values = result.get(key) ?? [];
    values.push(item);
    result.set(key, values);
  }
  return result;
}

function linkMovementSourcesV9(
  source: readonly RelationSourceBindingV9[],
  sourceByNameClass: ReadonlyMap<string, readonly RelationSourceBindingV9[]>,
  existingByNameClass: ReadonlyMap<string, readonly ExistingRelationBindingV9[]>,
): { readonly union: UnionFindV9; readonly externalSeed: ReadonlyMap<number, number> } {
  const union = new UnionFindV9(source.length);
  const externalSeed = new Map<number, number>();

  for (const item of source) {
    if (item.relatedTurmaId === null) continue;
    const key = nameClassKeyV9(item.relatedTurmaId, item.nome);
    const candidates = sourceByNameClass.get(key) ?? [];
    if (candidates.length > 1) {
      throw new RelationPlanErrorV9('blocked', `Movimentação ambígua para ${item.nome}.`);
    }
    if (candidates.length === 1) {
      union.union(item.index, candidates[0]!.index);
      continue;
    }

    const existing = existingByNameClass.get(key) ?? [];
    const ids = [...new Set(existing.map((value) => value.alunoId))];
    if (ids.length !== 1) {
      throw new RelationPlanErrorV9(
        'blocked',
        ids.length === 0
          ? `Movimentação sem vínculo de origem/destino para ${item.nome}.`
          : `Movimentação ambígua para ${item.nome}.`,
      );
    }
    externalSeed.set(item.index, ids[0]!);
  }

  return { union, externalSeed };
}

function groupComponentsV9(
  source: readonly RelationSourceBindingV9[],
  union: UnionFindV9,
): ReadonlyMap<number, readonly RelationSourceBindingV9[]> {
  const components = new Map<number, RelationSourceBindingV9[]>();
  for (const item of source) {
    const root = union.find(item.index);
    const values = components.get(root) ?? [];
    values.push(item);
    components.set(root, values);
  }
  return components;
}

function explicitReciprocalRepairV9(
  items: readonly RelationSourceBindingV9[],
  existingByBinding: ReadonlyMap<string, ExistingRelationBindingV9>,
): RelationIdentityRepairV9 | null {
  if (items.length !== 2) return null;
  const origin = items.find((item) => item.situacao === 6);
  const destination = items.find((item) => item.situacao === 7);
  if (
    !origin ||
    !destination ||
    origin.relatedTurmaId !== destination.turmaId ||
    destination.relatedTurmaId !== origin.turmaId ||
    normalizeRelationNameV9(origin.nome) !== normalizeRelationNameV9(destination.nome)
  )
    return null;

  const originBinding = existingByBinding.get(
    relationBindingKeyV9(origin.turmaId, origin.numero),
  );
  const destinationBinding = existingByBinding.get(
    relationBindingKeyV9(destination.turmaId, destination.numero),
  );
  if (
    !originBinding ||
    !destinationBinding ||
    originBinding.alunoId === destinationBinding.alunoId ||
    normalizeRelationNameV9(originBinding.nome) !== normalizeRelationNameV9(origin.nome) ||
    normalizeRelationNameV9(destinationBinding.nome) !== normalizeRelationNameV9(destination.nome)
  )
    return null;

  return {
    canonicalAlunoId: originBinding.alunoId,
    duplicateAlunoId: destinationBinding.alunoId,
  };
}

function buildComponentV9(
  items: readonly RelationSourceBindingV9[],
  existingByBinding: ReadonlyMap<string, ExistingRelationBindingV9>,
  externalSeed: ReadonlyMap<number, number>,
): RelationComponentV9 {
  const seeds = new Set<number>();
  for (const item of items) {
    const existing = existingByBinding.get(relationBindingKeyV9(item.turmaId, item.numero));
    if (existing) seeds.add(existing.alunoId);
    const external = externalSeed.get(item.index);
    if (external !== undefined) seeds.add(external);
  }
  const preferred = items.find((item) => item.situacao !== 6) ?? items[0]!;
  if (seeds.size > 1) {
    const identityRepair = explicitReciprocalRepairV9(items, existingByBinding);
    if (!identityRepair) {
      throw new RelationPlanErrorV9(
        'conflict',
        `Vínculos existentes apontam para alunos diferentes em ${items[0]!.nome}.`,
      );
    }
    return {
      items,
      seedAlunoId: identityRepair.canonicalAlunoId,
      preferred,
      identityRepair,
    };
  }
  return {
    items,
    seedAlunoId: [...seeds][0] ?? null,
    preferred,
  };
}

export function buildRelationPlanV9(
  request: GradebookRelationImportRequestV9,
  classes: ReadonlyMap<string, ResolvedRelationClassV9>,
  existing: readonly ExistingRelationBindingV9[],
): RelationPlanV9 {
  const indexes = indexExistingBindingsV9(existing);
  const source = materializeSourceBindingsV9(request, classes);
  const sourceByNameClass = indexSourceByNameClassV9(source);
  const linked = linkMovementSourcesV9(source, sourceByNameClass, indexes.byNameClass);
  const components = [...groupComponentsV9(source, linked.union).values()].map((items) =>
    buildComponentV9(items, indexes.byBinding, linked.externalSeed),
  );
  const orderedSource = [...source].sort((left, right) => {
    const leftMoved = left.situacao === 6;
    const rightMoved = right.situacao === 6;
    if (leftMoved !== rightMoved) return leftMoved ? -1 : 1;
    return left.index - right.index;
  });
  return {
    source,
    orderedSource,
    existingByBinding: indexes.byBinding,
    components,
  };
}
