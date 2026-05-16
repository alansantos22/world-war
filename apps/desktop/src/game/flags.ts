/**
 * Bandeiras das facções — geradas no estilo "identicon" do GitHub.
 *
 * A partir de uma semente (o código da nação, ou o nome de uma nação
 * personalizada) montamos um padrão 5×5 simétrico. A facção desenha esse
 * padrão na sua própria cor, então cada uma fica com uma bandeira distinta
 * e estável (a mesma semente gera sempre o mesmo desenho).
 */

/** Hash FNV-1a de 32 bits — determinístico e bem espalhado. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Padrão 5×5 da bandeira: matriz de booleanos (célula pintada ou não),
 * espelhada na vertical para ficar simétrica.
 */
export function flagPattern(seed: string): boolean[][] {
  let bits = hashSeed(seed);
  const grid: boolean[][] = [];
  for (let y = 0; y < 5; y++) {
    const row = [false, false, false, false, false];
    for (let x = 0; x < 3; x++) {
      const on = (bits & 1) === 1;
      bits >>>= 1;
      row[x] = on;
      row[4 - x] = on;
    }
    // Evita uma linha totalmente vazia (bandeira "buraco").
    if (!row.some((c) => c)) row[2] = true;
    grid.push(row);
  }
  return grid;
}

/** Lista das células pintadas do padrão, prontas para desenhar em SVG. */
export function flagCells(seed: string): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  flagPattern(seed).forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) cells.push({ x, y });
    }),
  );
  return cells;
}
