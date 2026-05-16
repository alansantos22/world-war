/**
 * Cidades e esquadrões de colonos (estilo Civilization).
 *
 * Uma **cidade** é um tile especial: as capitais já nascem como cidade e novas
 * cidades são **fundadas** por um **esquadrão de colonos**. A cidade tem
 * **população**, um estoque de **comida** e uma **zona de influência**; o seu
 * ciclo de turno (comida, crescimento, manpower) é processado em `world.ts`.
 *
 * O **esquadrão de colonos** é uma unidade própria — move-se pelo mapa como um
 * esquadrão, mas não tem comandante nem combate: se um esquadrão militar
 * inimigo entra no seu tile, ele é destruído. Ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';

// ===== Catálogo =====

/** Limite de estoque de comida de uma cidade comum. */
export const CITY_STORAGE = 100;
/** Limite de estoque de comida de uma capital. */
export const CAPITAL_STORAGE = 200;
/** Raio (Chebyshev) da zona de influência de uma cidade comum. */
export const CITY_INFLUENCE = 1;
/** Raio (Chebyshev) da zona de influência de uma capital. */
export const CAPITAL_INFLUENCE = 2;
/** Comida que uma capital produz por turno, no mínimo (sem fazendas ainda). */
export const CAPITAL_FOOD_PROD = 10;
/** Distância mínima (Chebyshev) exigida entre duas cidades. */
export const MIN_CITY_DISTANCE = 2;
/** População que cada 1 ponto de comida/turno sustenta. */
export const POP_PER_FOOD = 100_000;
/** Fração da população que vira manpower (modelo Hearts of Iron). */
export const MANPOWER_FRACTION = 0.01;
/** Multiplicador de consumo de comida de uma cidade sem conexão à facção. */
export const DISCONNECT_FOOD_PENALTY = 1.3;
/** Perda de população por turno quando a cidade fica sem comida. */
export const STARVATION_LOSS = 0.03;

/** População e comida com que uma cidade fundada nasce, por colono. */
export const CITY_START_POP = 100_000;
export const CITY_START_FOOD = 10;
/** População e comida com que uma capital começa a partida. */
export const CAPITAL_START_POP = 1_000_000;
export const CAPITAL_START_FOOD = 10;

/** Custo de um colono (cobrado da cidade que o produz). */
export const COLONO_COST = {
  /** População retirada da cidade ao enfileirar. */
  population: 100_000,
  /** Comida retirada do estoque da cidade ao enfileirar. */
  food: 10,
  /** Produção — a cidade constrói o colono ao longo de vários turnos. */
  production: 200,
};

// ===== Cidade =====

/** Uma cidade no mapa de uma partida. */
export interface City {
  id: number;
  x: number;
  y: number;
  /** Código da facção dona. */
  ownerCode: string;
  /** `true` se a cidade é a capital de uma nação. */
  isCapital: boolean;
  /** População atual da cidade. */
  population: number;
  /** Estoque de comida da cidade. */
  food: number;
  /** Manpower que a cidade já concedeu à facção (catraca — ver `world.ts`). */
  manpowerCap: number;
  /** Turno em que a cidade foi fundada (1 para as capitais iniciais). */
  foundedTurn: number;
}

interface CityRow {
  id: number;
  x: number;
  y: number;
  owner_code: string;
  is_capital: number;
  population: number;
  food: number;
  manpower_cap: number;
  founded_turn: number;
}

function rowToCity(r: CityRow): City {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    ownerCode: r.owner_code,
    isCapital: r.is_capital === 1,
    population: r.population,
    food: r.food,
    manpowerCap: r.manpower_cap,
    foundedTurn: r.founded_turn,
  };
}

/** Limite de estoque de comida de uma cidade. */
export function cityStorage(city: { isCapital: boolean }): number {
  return city.isCapital ? CAPITAL_STORAGE : CITY_STORAGE;
}

/** Raio da zona de influência de uma cidade. */
export function cityInfluence(city: { isCapital: boolean }): number {
  return city.isCapital ? CAPITAL_INFLUENCE : CITY_INFLUENCE;
}

/** Comida produzida por turno por uma cidade (só capitais, sem fazendas ainda). */
export function cityFoodProduction(city: { isCapital: boolean }): number {
  return city.isCapital ? CAPITAL_FOOD_PROD : 0;
}

/** Comida que uma população consome por turno (1 a cada 100 mil habitantes). */
export function cityFoodConsumption(population: number): number {
  return Math.ceil(population / POP_PER_FOOD);
}

/** Manpower-teto de uma cidade: 1% da sua população. */
export function cityManpower(population: number): number {
  return Math.floor(population * MANPOWER_FRACTION);
}

/** Distância de Chebyshev (8 direções) entre duas células. */
export function chebyshev(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Tiles na zona de influência de uma cidade (o raio em torno dela, incluindo
 * o próprio tile). Reservado para o sistema de construções.
 */
export function cityInfluenceTiles(city: City): { x: number; y: number }[] {
  const r = cityInfluence(city);
  const tiles: { x: number; y: number }[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      tiles.push({ x: city.x + dx, y: city.y + dy });
    }
  }
  return tiles;
}

/**
 * `true` se dá para fundar uma cidade num tile: ele precisa estar a pelo menos
 * `MIN_CITY_DISTANCE` tiles (Chebyshev) de toda cidade já existente.
 */
export function canFoundCity(
  x: number,
  y: number,
  cities: City[],
): boolean {
  return cities.every(
    (c) => chebyshev(x, y, c.x, c.y) >= MIN_CITY_DISTANCE,
  );
}

/** Carrega as cidades de uma partida. */
export async function loadCities(saveId: number): Promise<City[]> {
  const db = await getDb();
  const rows = await db.select<CityRow[]>(
    'SELECT * FROM cities WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToCity);
}

// ===== Esquadrão de colonos =====

/** Um esquadrão de colonos posicionado num tile do mapa. */
export interface SettlerSquad {
  id: number;
  /** Código da facção dona. */
  ownerCode: string;
  x: number;
  y: number;
  /** Quantidade de colonos no esquadrão. */
  count: number;
  /** Turno em que foi criado (fica pronto no turno seguinte). */
  createdTurn: number;
  /** Último turno em que se moveu. */
  lastMovedTurn: number;
}

interface SettlerRow {
  id: number;
  owner_code: string;
  x: number;
  y: number;
  count: number;
  created_turn: number;
  last_moved_turn: number;
}

function rowToSettler(r: SettlerRow): SettlerSquad {
  return {
    id: r.id,
    ownerCode: r.owner_code,
    x: r.x,
    y: r.y,
    count: r.count,
    createdTurn: r.created_turn,
    lastMovedTurn: r.last_moved_turn,
  };
}

/** Carrega os esquadrões de colonos de uma partida. */
export async function loadSettlerSquads(
  saveId: number,
): Promise<SettlerSquad[]> {
  const db = await getDb();
  const rows = await db.select<SettlerRow[]>(
    'SELECT * FROM settler_squads WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToSettler);
}

/** Um esquadrão de colonos fica pronto no turno seguinte ao da sua criação. */
export function isSettlerSquadReady(
  s: SettlerSquad,
  currentTurn: number,
): boolean {
  return currentTurn > s.createdTurn;
}

/**
 * Um esquadrão de colonos move-se uma vez por turno — depois de pronto e
 * respeitando o custo do terreno (sair de um tile gelado leva 2 turnos).
 */
export function canSettlerSquadMove(
  s: SettlerSquad,
  currentTurn: number,
  onGlacialTile: boolean,
): boolean {
  if (!isSettlerSquadReady(s, currentTurn)) return false;
  const turnCost = onGlacialTile ? 2 : 1;
  return currentTurn - s.lastMovedTurn >= turnCost;
}

/**
 * Adiciona um colono a um esquadrão de colonos no tile dado: incrementa o
 * `count` de um esquadrão da facção que já esteja ali ou cria um novo.
 */
export async function addColonoAt(
  saveId: number,
  ownerCode: string,
  x: number,
  y: number,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM settler_squads
      WHERE save_id = ? AND owner_code = ? AND x = ? AND y = ?
      LIMIT 1`,
    [saveId, ownerCode, x, y],
  );
  if (existing[0]) {
    await db.execute(
      'UPDATE settler_squads SET count = count + 1 WHERE id = ?',
      [existing[0].id],
    );
  } else {
    await db.execute(
      `INSERT INTO settler_squads
         (save_id, owner_code, x, y, count, created_turn, last_moved_turn)
       VALUES (?, ?, ?, ?, 1, ?, 0)`,
      [saveId, ownerCode, x, y, currentTurn],
    );
  }
}

/** Move um esquadrão de colonos para um tile, gastando o seu movimento. */
export async function moveSettlerSquad(
  squadId: number,
  x: number,
  y: number,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE settler_squads SET x = ?, y = ?, last_moved_turn = ? WHERE id = ?',
    [x, y, currentTurn, squadId],
  );
}

/** Dissolve um esquadrão de colonos. */
export async function deleteSettlerSquad(squadId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM settler_squads WHERE id = ?', [squadId]);
}

/**
 * Destrói os esquadrões de colonos de **outras** facções num tile — chamado
 * quando um esquadrão militar entra nele (civis não resistem a tropas).
 */
export async function destroySettlerSquadsAt(
  saveId: number,
  x: number,
  y: number,
  attackerCode: string,
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `DELETE FROM settler_squads
      WHERE save_id = ? AND x = ? AND y = ? AND owner_code != ?`,
    [saveId, x, y, attackerCode],
  );
  return res.rowsAffected ?? 0;
}

/**
 * Funda uma cidade a partir de um esquadrão de colonos: consome o esquadrão e
 * cria a cidade no seu tile, com `100 mil` de população e `10` de comida por
 * colono. A cidade concede de imediato `1%` da sua população como manpower à
 * facção. Se o tile for neutro, ele é tomado pela facção.
 */
export async function foundCity(
  saveId: number,
  settler: SettlerSquad,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  const population = CITY_START_POP * settler.count;
  const food = Math.min(CITY_STORAGE, CITY_START_FOOD * settler.count);
  const manpower = cityManpower(population);

  await db.execute('BEGIN');
  try {
    await db.execute(
      `INSERT INTO cities
         (save_id, x, y, owner_code, is_capital, population, food,
          manpower_cap, founded_turn)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        saveId,
        settler.x,
        settler.y,
        settler.ownerCode,
        population,
        food,
        manpower,
        currentTurn,
      ],
    );
    await db.execute('DELETE FROM settler_squads WHERE id = ?', [settler.id]);
    // A cidade toma o tile (neutro vira da facção; defensores se rendem).
    await db.execute(
      `UPDATE provinces SET owner_code = ?, defender_hp = 0
        WHERE save_id = ? AND x = ? AND y = ?`,
      [settler.ownerCode, saveId, settler.x, settler.y],
    );
    await db.execute(
      'UPDATE factions SET manpower = manpower + ? WHERE save_id = ? AND code = ?',
      [manpower, saveId, settler.ownerCode],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}
