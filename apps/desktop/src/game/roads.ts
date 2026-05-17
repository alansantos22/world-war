/**
 * Estradas e ferrovias.
 *
 * Uma estrada liga duas cidades da facção por um caminho de tiles **possuídos**
 * — o traçado mais curto é achado por **A\*** (8 direções). Estradas aceleram o
 * movimento das tropas (2 tiles/turno) e a **ferrovia** é um upgrade da estrada
 * (3 tiles/turno, custa 3× mais). Ligar cidades dá um pequeno boost de
 * prosperidade. Ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';

/** Tipo de via de um tile. */
export type RoadKind = 'ROAD' | 'RAIL';

/** Custo de produção e dinheiro por tile de **estrada**. */
export const ROAD_TILE_COST = { prod: 200, money: 1500 };
/** A ferrovia custa 3× a estrada, por tile. */
export const RAIL_COST_MULTIPLIER = 3;

/** Boost de crescimento de prosperidade por cidade ligada. */
export const ROAD_PROSPERITY = 0.005;
export const RAIL_PROSPERITY = 0.015;

/** Custo (produção/dinheiro) por tile de uma via do tipo dado. */
export function roadTileCost(kind: RoadKind): { prod: number; money: number } {
  const m = kind === 'RAIL' ? RAIL_COST_MULTIPLIER : 1;
  return { prod: ROAD_TILE_COST.prod * m, money: ROAD_TILE_COST.money * m };
}

/**
 * Quantos tiles um esquadrão consegue andar no turno ao **entrar** num tile da
 * via dada — estrada 2, ferrovia 3, sem via 1.
 */
export function roadMoveAllowance(road: string | null | undefined): number {
  return road === 'RAIL' ? 3 : road === 'ROAD' ? 2 : 1;
}

// ===== Pathfinding =====

interface Cell {
  x: number;
  y: number;
}

/** As 8 direções vizinhas de uma célula. */
const NEIGHBORS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const key = (x: number, y: number): string => `${x},${y}`;

/**
 * Caminho mais curto (A\*, 8 direções) entre dois tiles, passando **só** por
 * tiles do conjunto `allowed`. Devolve o caminho (incluindo as pontas) ou
 * `null` se não há ligação. A heurística é a distância de Chebyshev.
 */
export function findRoadPath(
  start: Cell,
  goal: Cell,
  allowed: Set<string>,
): Cell[] | null {
  const sk = key(start.x, start.y);
  const gk = key(goal.x, goal.y);
  if (!allowed.has(sk) || !allowed.has(gk)) return null;
  if (sk === gk) return [start];

  const cameFrom = new Map<string, string>();
  const g = new Map<string, number>([[sk, 0]]);
  const open = new Set<string>([sk]);
  const cellOf = (k: string): Cell => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  };
  const heuristic = (k: string): number => {
    const c = cellOf(k);
    return Math.max(Math.abs(c.x - goal.x), Math.abs(c.y - goal.y));
  };

  while (open.size > 0) {
    // Tira do conjunto aberto o nó de menor f = g + heurística.
    let current = '';
    let bestF = Infinity;
    for (const k of open) {
      const f = (g.get(k) ?? Infinity) + heuristic(k);
      if (f < bestF) {
        bestF = f;
        current = k;
      }
    }
    if (current === gk) {
      const path: Cell[] = [];
      let k: string | undefined = gk;
      while (k) {
        path.push(cellOf(k));
        k = cameFrom.get(k);
      }
      return path.reverse();
    }
    open.delete(current);
    const c = cellOf(current);
    const cost = g.get(current) ?? Infinity;
    for (const [dx, dy] of NEIGHBORS) {
      const nk = key(c.x + dx, c.y + dy);
      if (!allowed.has(nk)) continue;
      const tentative = cost + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        g.set(nk, tentative);
        open.add(nk);
      }
    }
  }
  return null;
}

/**
 * Cidades que estão ligadas por uma rede de vias a **outra cidade da mesma
 * facção**. `tiles` é o conjunto de tiles que contam como via (todas as vias,
 * ou só as de ferrovia). Devolve as chaves `"x,y"` das cidades ligadas.
 */
export function connectedCities(
  cities: { x: number; y: number; ownerCode: string }[],
  tiles: Set<string>,
): Set<string> {
  const connected = new Set<string>();
  const visited = new Set<string>();
  for (const tile of tiles) {
    if (visited.has(tile)) continue;
    // BFS do componente de vias.
    const component = new Set<string>([tile]);
    const queue = [tile];
    visited.add(tile);
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!.split(',').map(Number);
      for (const [dx, dy] of NEIGHBORS) {
        const nk = key(cx + dx, cy + dy);
        if (tiles.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          component.add(nk);
          queue.push(nk);
        }
      }
    }
    // Cidades encostadas (ou em cima) deste componente.
    const here = cities.filter((c) => {
      if (component.has(key(c.x, c.y))) return true;
      return NEIGHBORS.some(([dx, dy]) => component.has(key(c.x + dx, c.y + dy)));
    });
    // Facção com 2+ cidades no mesmo componente → todas ficam ligadas.
    const byOwner = new Map<string, string[]>();
    for (const c of here) {
      const list = byOwner.get(c.ownerCode);
      if (list) list.push(key(c.x, c.y));
      else byOwner.set(c.ownerCode, [key(c.x, c.y)]);
    }
    for (const list of byOwner.values()) {
      if (list.length >= 2) for (const ck of list) connected.add(ck);
    }
  }
  return connected;
}

// ===== Fila de estradas =====

/** Uma ordem na fila de estradas de uma cidade. */
export interface RoadOrder {
  id: number;
  cityX: number;
  cityY: number;
  ownerCode: string;
  kind: RoadKind;
  /** Cidade de destino da ligação. */
  targetX: number;
  targetY: number;
  /** Tiles que receberão a via quando a ordem concluir. */
  path: Cell[];
  prodCost: number;
  prodDone: number;
  moneyCost: number;
}

interface RoadOrderRow {
  id: number;
  save_id: number;
  city_x: number;
  city_y: number;
  owner_code: string;
  kind: string;
  target_x: number;
  target_y: number;
  path: string;
  prod_cost: number;
  prod_done: number;
  money_cost: number;
}

function parsePath(raw: string): Cell[] {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function rowToRoadOrder(r: RoadOrderRow): RoadOrder {
  return {
    id: r.id,
    cityX: r.city_x,
    cityY: r.city_y,
    ownerCode: r.owner_code,
    kind: r.kind as RoadKind,
    targetX: r.target_x,
    targetY: r.target_y,
    path: parsePath(r.path),
    prodCost: r.prod_cost,
    prodDone: r.prod_done,
    moneyCost: r.money_cost,
  };
}

/** Carrega as ordens da fila de estradas de uma partida. */
export async function loadRoadOrders(saveId: number): Promise<RoadOrder[]> {
  const db = await getDb();
  const rows = await db.select<RoadOrderRow[]>(
    'SELECT * FROM road_orders WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToRoadOrder);
}

/**
 * Enfileira a construção de uma estrada/ferrovia. Cobra o **dinheiro** na hora;
 * a **produção** é gasta turno a turno. `path` são os tiles que receberão a via
 * (já sem as cidades das pontas) — o custo é `nº de tiles × custo por tile`.
 */
export async function queueRoad(
  saveId: number,
  ownerCode: string,
  cityX: number,
  cityY: number,
  targetX: number,
  targetY: number,
  kind: RoadKind,
  path: Cell[],
): Promise<void> {
  if (path.length === 0) {
    throw new Error('Sem caminho de tiles próprios para ligar as cidades.');
  }
  const db = await getDb();
  const tile = roadTileCost(kind);
  const prodCost = tile.prod * path.length;
  const moneyCost = tile.money * path.length;

  const rows = await db.select<{ money: number }[]>(
    'SELECT money FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  if (!rows[0] || rows[0].money < moneyCost) {
    throw new Error(`Dinheiro insuficiente (${moneyCost}).`);
  }

  await db.execute('BEGIN');
  try {
    await db.execute(
      'UPDATE factions SET money = money - ? WHERE save_id = ? AND code = ?',
      [moneyCost, saveId, ownerCode],
    );
    await db.execute(
      `INSERT INTO road_orders
         (save_id, city_x, city_y, owner_code, kind, target_x, target_y,
          path, prod_cost, prod_done, money_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        saveId,
        cityX,
        cityY,
        ownerCode,
        kind,
        targetX,
        targetY,
        JSON.stringify(path),
        prodCost,
        moneyCost,
      ],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/** Cancela uma ordem da fila de estradas e devolve o dinheiro pago. */
export async function cancelRoad(orderId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<RoadOrderRow[]>(
    'SELECT * FROM road_orders WHERE id = ?',
    [orderId],
  );
  const o = rows[0];
  if (!o) return;
  await db.execute('BEGIN');
  try {
    await db.execute(
      'UPDATE factions SET money = money + ? WHERE save_id = ? AND code = ?',
      [o.money_cost, o.save_id, o.owner_code],
    );
    await db.execute('DELETE FROM road_orders WHERE id = ?', [orderId]);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}
