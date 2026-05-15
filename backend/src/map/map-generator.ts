import { ResourceType } from '../entities/enums';

/**
 * Gerador procedural do mapa-mundi (vetorial estilizado).
 *
 * O mundo e uma grade de celulas. Cada continente e um conjunto de celulas
 * que e subdividido em varias REGIOES (clusters de celulas). A cada "novo
 * servidor" o mapa e regerado: o desenho dos continentes e fixo, mas a
 * subdivisao em regioes, os recursos e os donos iniciais sao aleatorios.
 */

export const GRID = { cols: 50, rows: 24 };

export interface Cell {
  x: number;
  y: number;
}

export interface GeneratedRegion {
  name: string;
  continent: string;
  resource: ResourceType;
  ownerCode: string | null;
  isCapital: boolean;
  cells: Cell[];
}

export interface GeneratedMap {
  cols: number;
  rows: number;
  regions: GeneratedRegion[];
}

export const CONTINENT_NAMES: Record<string, string> = {
  N: 'América do Norte',
  S: 'América do Sul',
  E: 'Europa',
  A: 'África',
  I: 'Ásia',
  O: 'Oceania',
};

// Desenho dos continentes: cada entrada e [linha, colInicio, colFim].
const LAND: Record<string, number[][]> = {
  N: [
    [2, 6, 13], [3, 5, 15], [4, 4, 16], [5, 4, 16], [6, 5, 15],
    [7, 6, 14], [8, 7, 13], [9, 8, 12], [10, 9, 12], [11, 9, 11], [12, 10, 11],
  ],
  S: [
    [12, 14, 18], [13, 13, 19], [14, 12, 20], [15, 13, 19], [16, 13, 19],
    [17, 14, 18], [18, 14, 18], [19, 15, 17], [20, 15, 17], [21, 16, 17], [22, 16, 16],
  ],
  E: [
    [2, 25, 29], [3, 24, 30], [4, 24, 31], [5, 25, 30], [6, 25, 29], [7, 26, 28],
  ],
  A: [
    [8, 24, 31], [9, 24, 32], [10, 24, 33], [11, 25, 33], [12, 25, 32],
    [13, 25, 31], [14, 25, 30], [15, 26, 29], [16, 26, 29], [17, 26, 28],
    [18, 26, 27], [19, 26, 26],
  ],
  I: [
    [2, 32, 45], [3, 32, 47], [4, 32, 48], [5, 32, 48], [6, 32, 47],
    [7, 32, 45], [8, 33, 43], [9, 34, 41], [10, 35, 39], [11, 35, 38],
    [12, 36, 37], [13, 36, 36],
  ],
  O: [
    [14, 41, 46], [15, 40, 48], [16, 41, 47], [17, 42, 46], [18, 43, 45],
  ],
};

// Onde fica a CAPITAL de cada pais (continente + celula aproximada).
// Cada pais comeca controlando apenas 1 regiao: a sua capital.
const COUNTRY_SEEDS: Array<{
  code: string;
  continent: string;
  col: number;
  row: number;
}> = [
  { code: 'USA', continent: 'N', col: 10, row: 6 },
  { code: 'BRA', continent: 'S', col: 15, row: 14 },
  { code: 'ARG', continent: 'S', col: 16, row: 20 },
  { code: 'FRA', continent: 'E', col: 25, row: 5 },
  { code: 'GER', continent: 'E', col: 28, row: 3 },
  { code: 'RUS', continent: 'I', col: 38, row: 3 },
  { code: 'CHN', continent: 'I', col: 40, row: 9 },
  { code: 'JPN', continent: 'I', col: 45, row: 6 },
];

const TARGET_CELLS_PER_REGION = 6;

const COMMON: ResourceType[] = [
  ResourceType.MADEIRA,
  ResourceType.FERRO,
  ResourceType.BAUXITA,
  ResourceType.COBRE,
  ResourceType.TERRAS_AGRICOLAS,
];

const NAME_PREFIX = [
  'Nova', 'Alta', 'Baixa', 'Porto', 'Vale', 'Serra', 'Campo', 'Monte',
  'Santa', 'Lago', 'Costa', 'Alto', 'Velha', 'Grande',
];
const NAME_ROOT = [
  'Belmar', 'Castria', 'Doravale', 'Estrada', 'Farlon', 'Granvik',
  'Holmgard', 'Ironvale', 'Jorund', 'Kessel', 'Loranz', 'Maron',
  'Norvik', 'Ostmark', 'Pelmon', 'Quaria', 'Ronval', 'Sundar',
  'Torven', 'Ulmar', 'Varnik', 'Welmor', 'Yastra', 'Zorath',
  'Arden', 'Brennac', 'Corvel', 'Delmoor', 'Eldra', 'Fenwick',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

/** Converte o desenho de um continente em uma lista de celulas. */
function continentCells(continent: string): Cell[] {
  const cells: Cell[] = [];
  for (const [row, c0, c1] of LAND[continent]) {
    for (let x = c0; x <= c1; x++) cells.push({ x, y: row });
  }
  return cells;
}

const MIN_REGION_CELLS = 3;

/** Subdivide um conjunto de celulas em k regioes (k-means simples). */
function partition(cells: Cell[], k: number): Cell[][] {
  if (k <= 1 || cells.length <= MIN_REGION_CELLS) return [cells];

  // Centroides iniciais: k celulas distintas aleatorias.
  const seeds = shuffle([...cells]).slice(0, k);
  let centroids = seeds.map((c) => ({ x: c.x, y: c.y }));
  let clusters: Cell[][] = [];

  for (let iter = 0; iter < 18; iter++) {
    clusters = centroids.map(() => [] as Cell[]);
    for (const cell of cells) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = dist2(cell.x, cell.y, centroids[i].x, centroids[i].y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      clusters[best].push(cell);
    }
    centroids = clusters.map((cl, i) => {
      if (cl.length === 0) return centroids[i];
      const sx = cl.reduce((s, c) => s + c.x, 0);
      const sy = cl.reduce((s, c) => s + c.y, 0);
      return { x: sx / cl.length, y: sy / cl.length };
    });
  }

  // Funde regioes pequenas demais na regiao vizinha mais proxima.
  let result = clusters.filter((cl) => cl.length > 0);
  while (result.length > 1) {
    result.sort((a, b) => a.length - b.length);
    if (result[0].length >= MIN_REGION_CELLS) break;
    const small = result.shift()!;
    const sc = centroidOf(small);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < result.length; i++) {
      const c = centroidOf(result[i]);
      const d = dist2(sc.x, sc.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    result[best].push(...small);
  }
  return result;
}

function centroidOf(cells: Cell[]): Cell {
  const sx = cells.reduce((s, c) => s + c.x, 0);
  const sy = cells.reduce((s, c) => s + c.y, 0);
  return { x: sx / cells.length, y: sy / cells.length };
}

function uniqueNames(count: number): string[] {
  const names = new Set<string>();
  let guard = 0;
  while (names.size < count && guard < count * 80) {
    guard++;
    const root = pick(NAME_ROOT);
    names.add(Math.random() < 0.6 ? `${pick(NAME_PREFIX)} ${root}` : root);
  }
  let n = 1;
  while (names.size < count) names.add(`${pick(NAME_ROOT)} ${n++}`);
  return shuffle([...names]);
}

/** Gera o mapa-mundi completo. */
export function generateMap(countryCodes: string[]): GeneratedMap {
  // 1. Cria as regioes subdividindo cada continente.
  const regions: GeneratedRegion[] = [];
  for (const continent of Object.keys(LAND)) {
    const cells = continentCells(continent);
    const k = Math.max(1, Math.round(cells.length / TARGET_CELLS_PER_REGION));
    for (const cluster of partition(cells, k)) {
      regions.push({
        name: '',
        continent,
        resource: null as any,
        ownerCode: null,
        isCapital: false,
        cells: cluster,
      });
    }
  }

  // 2. Nomeia as regioes.
  const names = uniqueNames(regions.length);
  regions.forEach((r, i) => (r.name = names[i]));

  // 3. Posiciona os recursos.
  //
  // Recursos RAROS sao espalhados com "farthest-point sampling": cada novo
  // raro e colocado na regiao mais DISTANTE possivel de todos os raros ja
  // posicionados. Isso garante que nenhum recurso raro fique amontoado num
  // canto do mapa (nem que um unico pais monopolize todos eles).
  const T = regions.length;
  const rareCounts: Record<string, number> = {
    [ResourceType.NIOBIO]: Math.max(2, Math.round(T * 0.03)),
    [ResourceType.URANIO]: Math.max(3, Math.round(T * 0.045)),
    [ResourceType.PRATA]: Math.max(4, Math.round(T * 0.06)),
    [ResourceType.OURO]: Math.max(4, Math.round(T * 0.06)),
    [ResourceType.PETROLEO]: Math.max(6, Math.round(T * 0.09)),
  };
  // Ordem do mais raro para o menos raro.
  const rareOrder = [
    ResourceType.NIOBIO,
    ResourceType.URANIO,
    ResourceType.PRATA,
    ResourceType.OURO,
    ResourceType.PETROLEO,
  ];

  const centroids = regions.map((r) => centroidOf(r.cells));
  const assigned = regions.map(() => false);
  const placed: Cell[] = []; // centroides dos raros ja posicionados

  for (const type of rareOrder) {
    for (let n = 0; n < rareCounts[type]; n++) {
      let bestIdx = -1;
      let bestScore = -1;
      for (let idx = 0; idx < regions.length; idx++) {
        if (assigned[idx]) continue;
        let score: number;
        if (placed.length === 0) {
          score = Math.random(); // 1º raro: posicao aleatoria
        } else {
          // distancia ate o raro mais proximo (queremos maximizar = raio)
          let minD = Infinity;
          for (const p of placed) {
            const d = dist2(centroids[idx].x, centroids[idx].y, p.x, p.y);
            if (d < minD) minD = d;
          }
          score = minD;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      }
      if (bestIdx < 0) break;
      regions[bestIdx].resource = type;
      assigned[bestIdx] = true;
      placed.push(centroids[bestIdx]);
    }
  }

  // Recursos comuns preenchem o restante (sorteio livre).
  for (let idx = 0; idx < regions.length; idx++) {
    if (!assigned[idx]) regions[idx].resource = pick(COMMON);
  }

  // 4. Cada pais comeca com 1 unica regiao: a sua capital.
  // Escolhemos a regiao mais proxima do ponto-semente do pais.
  const codeSet = new Set(countryCodes);
  for (const seed of COUNTRY_SEEDS) {
    if (!codeSet.has(seed.code)) continue;
    const pool = regions
      .filter((r) => r.continent === seed.continent && !r.ownerCode)
      .sort((a, b) => {
        const ca = centroidOf(a.cells);
        const cb = centroidOf(b.cells);
        return (
          dist2(ca.x, ca.y, seed.col, seed.row) -
          dist2(cb.x, cb.y, seed.col, seed.row)
        );
      });
    if (pool.length > 0) {
      pool[0].ownerCode = seed.code;
      pool[0].isCapital = true;
    }
  }

  return { cols: GRID.cols, rows: GRID.rows, regions };
}

/** Conta quantas regioes possuem cada recurso. */
export function summarize(regions: GeneratedRegion[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of regions) counts[r.resource] = (counts[r.resource] || 0) + 1;
  return counts;
}
