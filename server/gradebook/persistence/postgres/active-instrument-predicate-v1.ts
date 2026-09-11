/**
 * Fixed SQL alias i. Evidence is checked across the entire instrument, never just
 * the student currently being read. A stored zero is a grade and keeps the slot.
 * Old empty placeholder rows remain stored for history but are not active facts.
 */
export const ACTIVE_INSTRUMENT_PREDICATE_V1 = `(
  i.slot < 11 OR i.maximo IS NOT NULL
  OR (NULLIF(btrim(i.descricao), '') IS NOT NULL
      AND NOT btrim(i.descricao) ~ ('^' || (i.slot - 10)::text || '([.,]0+)?$'))
  OR EXISTS (SELECT 1 FROM gradebook.nota evidence WHERE evidence.instrumento_id = i.id)
)`;
