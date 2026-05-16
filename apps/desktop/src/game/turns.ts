/**
 * Turnos do jogo.
 *
 * O jogo começa no **turno 1**, em **01 de Janeiro de 1980**. Cada turno
 * avança o calendário em **1 semana**.
 */

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Data em que começa um turno (turno 1 = 01/01/1980; +1 semana por turno). */
export function turnDate(turn: number): Date {
  const d = new Date(Date.UTC(1980, 0, 1));
  d.setUTCDate(d.getUTCDate() + (turn - 1) * 7);
  return d;
}

/** Formata a data de um turno como "01 de Janeiro de 1980". */
export function formatTurnDate(turn: number): string {
  const d = turnDate(turn);
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} de ${MONTHS_PT[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
