/** The school's official name, used everywhere it is shown (owner decision, 26/09/2026). */
export const SCHOOL_NAME_V1 = 'Escola Mun. Prof.ª Iêda Alves de Oliveira MCPM';

/** The same name in the access card's two uppercase header lines. */
export const SCHOOL_CARD_NAME_LINES_V1 = (() => {
  const upper = SCHOOL_NAME_V1.toLocaleUpperCase('pt-BR');
  const split = upper.indexOf(' ', upper.indexOf('MUN.'));
  return [upper.slice(0, split), upper.slice(split + 1)] as const;
})();
