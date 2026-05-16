import { ResourceType } from './enums';

/**
 * Gerador procedural do mapa-múndi (vetorial estilizado).
 *
 * O mundo é uma grade de células. Cada célula de TERRA é uma PROVÍNCIA
 * individual (a unidade básica do jogo — pode ser possuída e selecionada).
 * O desenho dos continentes é fixo; a cada "novo mapa" os recursos e os
 * donos iniciais (capitais) são sorteados de novo.
 */

export const GRID = { cols: 50, rows: 24 };

export interface Cell {
  x: number;
  y: number;
}

/** Uma província gerada (1 célula de terra). */
export interface GeneratedProvince {
  x: number;
  y: number;
  continent: string;
  name: string;
  resource: ResourceType;
  ownerCode: string | null;
  isCapital: boolean;
}

export interface GeneratedMap {
  cols: number;
  rows: number;
  provinces: GeneratedProvince[];
}

/** Onde cada nação tem a sua capital (usado para sortear a província dona). */
export interface CapitalSeed {
  code: string;
  continent: string;
  capital: { col: number; row: number };
}

export const CONTINENT_NAMES: Record<string, string> = {
  N: 'América do Norte',
  S: 'América do Sul',
  E: 'Europa',
  A: 'África',
  I: 'Ásia',
  O: 'Oceania',
};

// Desenho dos continentes: cada entrada é [linha, colInicio, colFim].
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

const COMMON: ResourceType[] = [
  ResourceType.MADEIRA,
  ResourceType.FERRO,
  ResourceType.BAUXITA,
  ResourceType.COBRE,
  ResourceType.TERRAS_AGRICOLAS,
];

const NAME_PREFIX = [
  'Nova', 'Alta', 'Baixa', 'Porto', 'Vale', 'Serra', 'Campo', 'Monte',
  'Santa', 'Lago', 'Costa', 'Alto', 'Velha', 'Grande', 'São', 'Forte',
  'Cabo', 'Ilha',
];
const NAME_ROOT = [
  'Belmar', 'Castria', 'Doravale', 'Estrada', 'Farlon', 'Granvik',
  'Holmgard', 'Ironvale', 'Jorund', 'Kessel', 'Loranz', 'Maron',
  'Norvik', 'Ostmark', 'Pelmon', 'Quaria', 'Ronval', 'Sundar',
  'Torven', 'Ulmar', 'Varnik', 'Welmor', 'Yastra', 'Zorath',
  'Arden', 'Brennac', 'Corvel', 'Delmoor', 'Eldra', 'Fenwick',
  'Aldain', 'Brimmel', 'Cethran', 'Dunmar', 'Estavel', 'Forlan',
  'Gravisk', 'Harnel', 'Iverra', 'Kaldor', 'Lumira',
  'Mossvik', 'Nyland', 'Orvath', 'Praven', 'Renmark', 'Solvik',
  'Trennor', 'Vandar', 'Wexford', 'Zarnel',
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

/** Converte o desenho de um continente em uma lista de células. */
export function continentCells(continent: string): Cell[] {
  const cells: Cell[] = [];
  for (const [row, c0, c1] of LAND[continent]) {
    for (let x = c0; x <= c1; x++) cells.push({ x, y: row });
  }
  return cells;
}

/** Todas as células de terra do mundo (útil p/ silhuetas decorativas). */
export function allLandCells(): Cell[] {
  return Object.keys(LAND).flatMap(continentCells);
}

function uniqueNames(count: number): string[] {
  const names = new Set<string>();
  let guard = 0;
  while (names.size < count && guard < count * 120) {
    guard++;
    const root = pick(NAME_ROOT);
    names.add(Math.random() < 0.6 ? `${pick(NAME_PREFIX)} ${root}` : root);
  }
  let n = 1;
  while (names.size < count) names.add(`${pick(NAME_ROOT)} ${n++}`);
  return shuffle([...names]);
}

/** Gera o mapa-múndi completo: uma província por célula de terra. */
export function generateMap(seeds: CapitalSeed[]): GeneratedMap {
  // 1. Cria uma província para cada célula de terra.
  const provinces: GeneratedProvince[] = [];
  for (const continent of Object.keys(LAND)) {
    for (const cell of continentCells(continent)) {
      provinces.push({
        x: cell.x,
        y: cell.y,
        continent,
        name: '',
        resource: null as any,
        ownerCode: null,
        isCapital: false,
      });
    }
  }

  // 2. Nomeia as províncias.
  const names = uniqueNames(provinces.length);
  provinces.forEach((p, i) => (p.name = names[i]));

  // 3. Posiciona os recursos.
  //
  // Recursos RAROS são espalhados com "farthest-point sampling": cada novo
  // raro é colocado na província mais DISTANTE possível de todos os raros
  // já posicionados. Isso evita que um recurso raro fique amontoado num
  // canto do mapa (ou que um único país monopolize todos eles).
  const T = provinces.length;
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

  const assigned = provinces.map(() => false);
  const placed: Cell[] = []; // posições dos raros já posicionados

  for (const type of rareOrder) {
    for (let n = 0; n < rareCounts[type]; n++) {
      let bestIdx = -1;
      let bestScore = -1;
      for (let i = 0; i < provinces.length; i++) {
        if (assigned[i]) continue;
        let score: number;
        if (placed.length === 0) {
          score = Math.random(); // 1º raro: posição aleatória
        } else {
          let minD = Infinity;
          for (const p of placed) {
            const d = dist2(provinces[i].x, provinces[i].y, p.x, p.y);
            if (d < minD) minD = d;
          }
          score = minD;
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      provinces[bestIdx].resource = type;
      assigned[bestIdx] = true;
      placed.push({ x: provinces[bestIdx].x, y: provinces[bestIdx].y });
    }
  }

  // Recursos comuns preenchem o restante (sorteio livre).
  for (let i = 0; i < provinces.length; i++) {
    if (!assigned[i]) provinces[i].resource = pick(COMMON);
  }

  // 4. Cada nação começa com 1 província: a sua capital.
  // Escolhemos a província livre mais próxima do ponto-semente da nação.
  for (const seed of seeds) {
    const pool = provinces
      .filter((p) => p.continent === seed.continent && !p.ownerCode)
      .sort(
        (a, b) =>
          dist2(a.x, a.y, seed.capital.col, seed.capital.row) -
          dist2(b.x, b.y, seed.capital.col, seed.capital.row),
      );
    if (pool.length > 0) {
      pool[0].ownerCode = seed.code;
      pool[0].isCapital = true;
    }
  }

  return { cols: GRID.cols, rows: GRID.rows, provinces };
}
