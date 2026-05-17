/**
 * Esquadrões e recrutamento de tropas (estilo Rome: Total War).
 *
 * Um esquadrão é montado numa província do jogador e fica posicionado num
 * tile do mapa. Ele nasce só com o **comandante** e ganha **tropas** pelo
 * sistema de **recrutamento**: a cidade produz a tropa ao longo de vários
 * turnos (fila de produção) e, quando pronta, a tropa entra no esquadrão.
 *
 * O comandante e as tropas ganham **experiência** (level) nas batalhas; a
 * resolução de combate em si fica em `battle.ts`. Ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';
import { COLONO_COST, destroySettlerSquadsAt } from './cities';
import { cityHasConstruction } from './constructions';
import { roadMoveAllowance } from './roads';

/** Custo, em dinheiro, para montar um esquadrão. */
export const SQUAD_COST = 500;
/** Custo, em manpower, do comandante de um esquadrão novo. */
export const SQUAD_MANPOWER_COST = 1000;
/** Manutenção por turno de um esquadrão — só o comandante. */
export const SQUAD_UPKEEP = 25;
/** Ataques que um esquadrão pode dar por turno. */
export const ATTACKS_PER_TURN = 2;
/** Vida que cada tropa (e o comandante) recupera por turno numa cidade sua. */
export const HP_REGEN_PER_TURN = 5;

// ===== Construções militares (ver `constructions.ts`) =====
/** Multiplicador de produção das tropas numa cidade com Quartel (+10%). */
export const BARRACKS_PROD_PENALTY = 1.1;
/** XP com que uma tropa nasce numa cidade com Quartel. */
export const BARRACKS_TROOP_XP = 5;
/** XP com que um comandante nasce numa cidade com Academia Militar. */
export const ACADEMY_COMMANDER_XP = 15;

// ===== Moral =====
/** Moral máxima (e inicial) de um esquadrão, em pontos percentuais. */
export const MORAL_MAX = 100;
/** Moral perdida a cada movimento. */
export const MORAL_MOVE_COST = 2;
/** Moral recuperada por turno por um esquadrão parado (sem lutar/mover). */
export const MORAL_REGEN = 5;
/** Moral recuperada por turno parado em território da própria facção (dobro). */
export const MORAL_REGEN_OWN_TILE = 10;

// ===== Level e experiência =====
/** Level máximo de um comandante ou tropa (experiência de batalha). */
export const MAX_LEVEL = 5;
/**
 * XP necessário para subir de cada level (índice = level atual). É uma
 * progressão geométrica de 20 (level 0→1) a 500 (level 4→5).
 */
export const LEVEL_XP_COSTS = [20, 45, 100, 224, 500];
/** Cada level médio do esquadrão adiciona este tanto de força. */
export const LEVEL_FORCE_BONUS = 0.1;
/** XP fixo ganho por uma batalha. */
export const XP_BASE_PER_BATTLE = 5;
/** Teto da parcela de XP vinda da dificuldade da batalha. */
export const XP_DIFFICULTY_MAX = 4;
/** XP extra por derrotar todos os defensores de um território. */
export const XP_TERRITORY_BONUS = 10;
/** Multiplicador dos ganhos de XP — reservado para pesquisas futuras. */
export const XP_GAIN_MULTIPLIER = 1;

/** Valores iniciais do comandante de um esquadrão recém-criado. */
export const COMMANDER_BASE = {
  /** Estrelas — o **talento** inato do comandante (não muda com XP). */
  stars: 1,
  /** Força de batalha que o comandante contribui (a tropa soma ~1/3 disso). */
  force: 30,
  /** Pontos de vida. */
  hp: 100,
  maxHp: 100,
  /** Defesa do comandante. */
  defense: 1,
  /** Experiência de batalha acumulada (define o level). */
  xp: 0,
  /** Tradição militar — somada à soma dos dados na batalha. */
  tradition: 0,
};

/** Level de uma unidade a partir do XP acumulado. */
export function levelFromXp(xp: number): number {
  let level = 0;
  let remaining = xp;
  for (const cost of LEVEL_XP_COSTS) {
    if (remaining >= cost) {
      remaining -= cost;
      level++;
    } else break;
  }
  return level;
}

/** Progresso de level: level atual, XP dentro dele e XP para o próximo. */
export interface LevelProgress {
  level: number;
  /** XP acumulado dentro do level atual. */
  current: number;
  /** XP necessário para o próximo level (0 se já no máximo). */
  needed: number;
}

/** Decompõe o XP acumulado em level e progresso para o próximo. */
export function levelProgress(xp: number): LevelProgress {
  let level = 0;
  let remaining = xp;
  for (const cost of LEVEL_XP_COSTS) {
    if (remaining >= cost) {
      remaining -= cost;
      level++;
    } else {
      return { level, current: remaining, needed: cost };
    }
  }
  return { level, current: 0, needed: 0 };
}

// ===== Tropas =====

/** Tipos de tropa recrutáveis. Hoje só há infantaria. */
export type TroopKind = 'INFANTARIA';

/**
 * O que uma cidade pode pôr na sua fila de produção: as tropas e o **colono**
 * (que não é uma tropa de esquadrão — ver `cities.ts`). A fila é única por
 * cidade, então produzir tropas adia o colono e vice-versa.
 */
export type RecruitKind = TroopKind | 'COLONO';

/** Catálogo de uma tropa recrutável. */
export interface TroopType {
  kind: TroopKind;
  label: string;
  icon: string;
  /** Força que a tropa soma ao esquadrão. */
  force: number;
  /** Pontos de vida da tropa. */
  hp: number;
  /** Custo em dinheiro (pago ao enfileirar). */
  moneyCost: number;
  /** Custo em manpower (pago ao enfileirar). */
  manpowerCost: number;
  /** Custo em produção — a cidade constrói ao longo de vários turnos. */
  productionCost: number;
  /** Manutenção em dinheiro por turno. */
  upkeep: number;
}

/** Catálogo das tropas. */
export const TROOP_TYPES: Record<TroopKind, TroopType> = {
  INFANTARIA: {
    kind: 'INFANTARIA',
    label: 'Infantaria',
    icon: '🪖',
    force: 10,
    // Vida = 50% da vida do comandante (comandante = 100).
    hp: 50,
    moneyCost: 200,
    manpowerCost: 500,
    productionCost: 50,
    upkeep: 10,
  },
};

/** Uma tropa dentro de um esquadrão. */
export interface SquadTroop {
  id: number;
  kind: TroopKind;
  /** Força que a tropa soma ao esquadrão. */
  force: number;
  /** Pontos de vida atuais. */
  hp: number;
  /** Pontos de vida máximos. */
  maxHp: number;
  /** Experiência de batalha acumulada. */
  xp: number;
  /** Level (0–5), derivado do XP. */
  level: number;
}

// ===== Comandante e esquadrão =====

/** O comandante que lidera um esquadrão. */
export interface Commander {
  /** Estrelas (1–5) — o **talento** inato; dá +5% de força e o limite de tropas. */
  stars: number;
  /** Força de batalha contribuída pelo comandante. */
  force: number;
  /** Pontos de vida atuais. */
  hp: number;
  /** Pontos de vida máximos. */
  maxHp: number;
  /** Defesa. */
  defense: number;
  /** Experiência de batalha acumulada. */
  xp: number;
  /** Level (0–5), derivado do XP. */
  level: number;
  /** Tradição militar — somada à soma dos dados na batalha. */
  tradition: number;
}

/** Um esquadrão posicionado num tile do mapa. */
export interface Squad {
  id: number;
  /** Código da facção dona. */
  ownerCode: string;
  /** Posição (célula) no mapa. */
  x: number;
  y: number;
  /** Turno em que foi criado (fica pronto no turno seguinte). */
  createdTurn: number;
  /** Último turno em que se moveu. */
  lastMovedTurn: number;
  /** Ataques já gastos no turno atual (zera a cada turno). */
  attacksUsed: number;
  /** Movimentos já gastos no turno atual (zera a cada turno). */
  movesUsed: number;
  /** Movimentos permitidos no turno — sobe ao andar por estradas/ferrovias. */
  moveAllowance: number;
  /** Moral do esquadrão (0–100). Afeta a força em batalha. */
  moral: number;
  /** Nome dado pelo jogador, ou `null` (mostra "Esquadrão #id"). */
  name: string | null;
  /** O comandante do esquadrão. */
  commander: Commander;
  /** As tropas do esquadrão (sem contar o comandante). */
  troops: SquadTroop[];
}

interface SquadRow {
  id: number;
  owner_code: string;
  x: number;
  y: number;
  created_turn: number;
  last_moved_turn: number;
  attacks_used: number;
  moves_used: number;
  move_allowance: number;
  moral: number;
  name: string | null;
  cmd_stars: number;
  cmd_force: number;
  cmd_hp: number;
  cmd_max_hp: number;
  cmd_defense: number;
  cmd_xp: number;
  cmd_tradition: number;
}

interface TroopRow {
  id: number;
  squad_id: number;
  kind: string;
  force: number;
  hp: number;
  max_hp: number;
  xp: number;
}

function rowToSquad(r: SquadRow): Squad {
  return {
    id: r.id,
    ownerCode: r.owner_code,
    x: r.x,
    y: r.y,
    createdTurn: r.created_turn,
    lastMovedTurn: r.last_moved_turn,
    attacksUsed: r.attacks_used,
    movesUsed: r.moves_used ?? 0,
    moveAllowance: r.move_allowance ?? 1,
    moral: r.moral,
    name: r.name,
    commander: {
      stars: r.cmd_stars,
      force: r.cmd_force,
      hp: r.cmd_hp,
      maxHp: r.cmd_max_hp,
      defense: r.cmd_defense,
      xp: r.cmd_xp,
      level: levelFromXp(r.cmd_xp),
      tradition: r.cmd_tradition,
    },
    troops: [],
  };
}

/** Nome de exibição de um esquadrão (o nome dado, ou "Esquadrão #id"). */
export function squadName(squad: Squad): string {
  return squad.name && squad.name.trim()
    ? squad.name
    : `Esquadrão #${squad.id}`;
}

/**
 * Multiplicador de força conferido pelas estrelas do comandante: cada estrela
 * acima da 1ª adiciona +5% — 1★ = +0%, 5★ = +20%.
 */
export function starMultiplier(stars: number): number {
  return 1 + (Math.max(1, stars) - 1) * 0.05;
}

/**
 * Limite de tropas que um comandante comporta: 20 no 1★, e **+2 por estrela**
 * (5★ = 28). O comandante não conta para esse limite.
 */
export function maxTroops(stars: number): number {
  return 20 + (Math.max(1, stars) - 1) * 2;
}

/**
 * Level médio do esquadrão. O **comandante pesa como 3 tropas** — um
 * comandante experiente puxa tropas fracas para cima, e um inexperiente
 * arrasta tropas fortes para baixo.
 */
export function averageLevel(squad: Squad): number {
  const total =
    squad.commander.level * 3 +
    squad.troops.reduce((sum, t) => sum + t.level, 0);
  return total / (3 + squad.troops.length);
}

/** Bônus de força conferido pela experiência: +10% por level médio. */
export function levelMultiplier(squad: Squad): number {
  return 1 + averageLevel(squad) * LEVEL_FORCE_BONUS;
}

/**
 * Força de batalha total do esquadrão: a força do comandante somada à das
 * tropas, multiplicada pelo **talento** (estrelas) e pela **experiência**
 * (level médio).
 */
export function squadForce(squad: Squad): number {
  const base =
    squad.commander.force +
    squad.troops.reduce((sum, t) => sum + t.force, 0);
  return Math.round(
    base * starMultiplier(squad.commander.stars) * levelMultiplier(squad),
  );
}

/** Manutenção-base por turno de um esquadrão: o comandante mais as tropas. */
export function squadUpkeep(squad: Squad): number {
  return (
    SQUAD_UPKEEP +
    squad.troops.reduce((sum, t) => sum + TROOP_TYPES[t.kind].upkeep, 0)
  );
}

/**
 * Manutenção efetiva de um esquadrão: cai pela **metade** quando ele está num
 * tile da própria facção — tropas em repouso custam menos que em campanha.
 */
export function squadUpkeepAt(squad: Squad, onOwnTile: boolean): number {
  const base = squadUpkeep(squad);
  return onOwnTile ? Math.round(base / 2) : base;
}

/** Defesa de um esquadrão — hoje só a defesa do comandante. */
export function squadDefense(squad: Squad): number {
  return squad.commander.defense;
}

/** Ataques que o esquadrão ainda pode dar neste turno. */
export function attacksLeft(squad: Squad): number {
  return Math.max(0, ATTACKS_PER_TURN - squad.attacksUsed);
}

/** Um esquadrão pode atacar se está pronto e ainda tem ataques no turno. */
export function canSquadAttack(squad: Squad, currentTurn: number): boolean {
  return isSquadReady(squad, currentTurn) && attacksLeft(squad) > 0;
}

/** Um esquadrão fica pronto no turno **seguinte** ao da sua criação. */
export function isSquadReady(squad: Squad, currentTurn: number): boolean {
  return currentTurn > squad.createdTurn;
}

/**
 * Um esquadrão pode mover-se depois de pronto. Fora de tile gelado, ele move
 * enquanto tiver movimentos no turno (`movesUsed < moveAllowance`) — andar por
 * **estradas/ferrovias** eleva o `moveAllowance` (ver `roads.ts`). Sair de um
 * **tile gelado** leva 2 turnos.
 */
export function canSquadMove(
  squad: Squad,
  currentTurn: number,
  onGlacialTile: boolean,
): boolean {
  if (!isSquadReady(squad, currentTurn)) return false;
  if (onGlacialTile) {
    return currentTurn - squad.lastMovedTurn >= 2;
  }
  return squad.movesUsed < squad.moveAllowance;
}

/** Carrega os esquadrões de uma partida, já com as suas tropas. */
export async function loadSquads(saveId: number): Promise<Squad[]> {
  const db = await getDb();
  const rows = await db.select<SquadRow[]>(
    'SELECT * FROM squads WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  const squads = rows.map(rowToSquad);
  if (squads.length === 0) return squads;

  const troopRows = await db.select<TroopRow[]>(
    `SELECT t.* FROM squad_troops t
       JOIN squads s ON s.id = t.squad_id
      WHERE s.save_id = ?
      ORDER BY t.id`,
    [saveId],
  );
  const bySquad = new Map<number, SquadTroop[]>();
  for (const r of troopRows) {
    const list = bySquad.get(r.squad_id) ?? [];
    list.push({
      id: r.id,
      kind: r.kind as TroopKind,
      force: r.force,
      hp: r.hp,
      maxHp: r.max_hp,
      xp: r.xp,
      level: levelFromXp(r.xp),
    });
    bySquad.set(r.squad_id, list);
  }
  for (const s of squads) s.troops = bySquad.get(s.id) ?? [];
  return squads;
}

/**
 * Monta um esquadrão numa província: cobra `SQUAD_COST` de dinheiro e
 * `SQUAD_MANPOWER_COST` de manpower do dono e insere o esquadrão com um
 * comandante inicial. Falha se a facção não tiver os recursos.
 */
export async function createSquad(
  saveId: number,
  ownerCode: string,
  x: number,
  y: number,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ money: number; manpower: number }[]>(
    'SELECT money, manpower FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const f = rows[0];
  if (!f || f.money < SQUAD_COST) {
    throw new Error(
      `Dinheiro insuficiente para montar um esquadrão (${SQUAD_COST}).`,
    );
  }
  if (f.manpower < SQUAD_MANPOWER_COST) {
    throw new Error(
      `Manpower insuficiente para montar um esquadrão (${SQUAD_MANPOWER_COST}).`,
    );
  }
  // A Academia Militar da cidade dá um comandante mais bem formado.
  const academy = await cityHasConstruction(saveId, x, y, 'ACADEMIA');
  let stars = COMMANDER_BASE.stars;
  let xp = COMMANDER_BASE.xp;
  if (academy) {
    const r = Math.random();
    stars = r < 0.02 ? 4 : r < 0.12 ? 3 : 2;
    xp = ACADEMY_COMMANDER_XP;
  }
  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE factions SET money = money - ?, manpower = manpower - ?
       WHERE save_id = ? AND code = ?`,
      [SQUAD_COST, SQUAD_MANPOWER_COST, saveId, ownerCode],
    );
    await db.execute(
      `INSERT INTO squads
         (save_id, owner_code, x, y, created_turn, last_moved_turn,
          cmd_stars, cmd_force, cmd_hp, cmd_max_hp, cmd_defense, cmd_xp,
          cmd_tradition)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saveId,
        ownerCode,
        x,
        y,
        currentTurn,
        stars,
        COMMANDER_BASE.force,
        COMMANDER_BASE.hp,
        COMMANDER_BASE.maxHp,
        COMMANDER_BASE.defense,
        xp,
        COMMANDER_BASE.tradition,
      ],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Exclui um esquadrão (dissolvido pelo jogador ou destruído em batalha) e as
 * suas tropas. **Não há reembolso** — esquadrão perdido é perdido.
 */
export async function deleteSquad(squadId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM squad_troops WHERE squad_id = ?', [squadId]);
  await db.execute('DELETE FROM squads WHERE id = ?', [squadId]);
}

/**
 * Move um esquadrão para um tile, gastando um movimento do turno e
 * `MORAL_MOVE_COST` de moral. Entrar num tile com **estrada/ferrovia** eleva o
 * `move_allowance` (2 tiles de estrada, 3 de ferrovia por turno).
 */
export async function moveSquad(
  squadId: number,
  x: number,
  y: number,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  const info = await db.select<{ save_id: number; owner_code: string }[]>(
    'SELECT save_id, owner_code FROM squads WHERE id = ?',
    [squadId],
  );
  // A via do tile de destino define quantos tiles cabem no turno.
  let allowance = 1;
  if (info[0]) {
    const prov = await db.select<{ road: string | null }[]>(
      'SELECT road FROM provinces WHERE save_id = ? AND x = ? AND y = ?',
      [info[0].save_id, x, y],
    );
    allowance = roadMoveAllowance(prov[0]?.road ?? null);
  }
  await db.execute(
    `UPDATE squads
       SET x = ?, y = ?, last_moved_turn = ?, moves_used = moves_used + 1,
           move_allowance = MAX(move_allowance, ?), moral = MAX(0, moral - ?)
     WHERE id = ?`,
    [x, y, currentTurn, allowance, MORAL_MOVE_COST, squadId],
  );
  // Civ5: um esquadrão militar que entra num tile destrói os esquadrões de
  // colonos inimigos que estiverem nele (civis não resistem a tropas).
  if (info[0]) {
    await destroySettlerSquadsAt(info[0].save_id, x, y, info[0].owner_code);
  }
}

/** Exclui uma tropa de um esquadrão. */
export async function deleteTroop(troopId: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM squad_troops WHERE id = ?', [troopId]);
}

/**
 * Move uma tropa para outro esquadrão. Falha se o esquadrão de destino já
 * estiver no limite de tropas. (A interface só oferece esquadrões no mesmo
 * tile — ver `GAME_DESIGN.md`.)
 */
export async function moveTroop(
  troopId: number,
  targetSquadId: number,
): Promise<void> {
  const db = await getDb();
  const tgt = await db.select<{ cmd_stars: number }[]>(
    'SELECT cmd_stars FROM squads WHERE id = ?',
    [targetSquadId],
  );
  if (!tgt[0]) throw new Error('Esquadrão de destino não encontrado.');
  const cnt = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM squad_troops WHERE squad_id = ?',
    [targetSquadId],
  );
  if ((cnt[0]?.n ?? 0) >= maxTroops(tgt[0].cmd_stars)) {
    throw new Error('O esquadrão de destino já atingiu o limite de tropas.');
  }
  await db.execute('UPDATE squad_troops SET squad_id = ? WHERE id = ?', [
    targetSquadId,
    troopId,
  ]);
}

/** Renomeia um esquadrão (um nome vazio volta para "Esquadrão #id"). */
export async function renameSquad(
  squadId: number,
  name: string,
): Promise<void> {
  const db = await getDb();
  const clean = name.trim().slice(0, 40);
  await db.execute('UPDATE squads SET name = ? WHERE id = ?', [
    clean || null,
    squadId,
  ]);
}

// ===== Fila de recrutamento =====

/**
 * Uma ordem de recrutamento na fila de produção de uma cidade. A tropa pronta
 * vai para o **inventário da cidade** (ver `CityTroop`), não para um esquadrão.
 */
export interface RecruitOrder {
  id: number;
  /** Tile da cidade que produz a tropa. */
  x: number;
  y: number;
  /** Facção dona. */
  ownerCode: string;
  /** O que está sendo produzido (tropa ou colono). */
  kind: RecruitKind;
  /** Produção necessária para concluir o item. */
  prodCost: number;
  /** Produção já acumulada. */
  prodDone: number;
}

interface RecruitRow {
  id: number;
  save_id: number;
  x: number;
  y: number;
  owner_code: string;
  kind: string;
  prod_cost: number;
  prod_done: number;
}

/** Carrega as ordens de recrutamento de uma partida (em ordem de fila). */
export async function loadRecruitOrders(
  saveId: number,
): Promise<RecruitOrder[]> {
  const db = await getDb();
  const rows = await db.select<RecruitRow[]>(
    'SELECT * FROM recruit_orders WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    ownerCode: r.owner_code,
    kind: r.kind as RecruitKind,
    prodCost: r.prod_cost,
    prodDone: r.prod_done,
  }));
}

/**
 * Enfileira o recrutamento de uma tropa numa cidade. Cobra o dinheiro e o
 * manpower na hora; a produção será gasta turno a turno e, ao concluir, a
 * tropa entra no **inventário da cidade**.
 */
export async function queueRecruit(
  saveId: number,
  ownerCode: string,
  x: number,
  y: number,
  kind: RecruitKind,
): Promise<void> {
  const db = await getDb();

  // O colono é pago com a **população** e a **comida** da própria cidade.
  if (kind === 'COLONO') {
    const cityRows = await db.select<
      { id: number; population: number; food: number; is_capital: number }[]
    >(
      'SELECT id, population, food, is_capital FROM cities WHERE save_id = ? AND x = ? AND y = ?',
      [saveId, x, y],
    );
    const city = cityRows[0];
    if (!city) throw new Error('Só é possível produzir colonos numa cidade.');
    // A cidade precisa manter um piso de população depois de pagar o colono:
    // 500 mil numa capital, 100 mil numa cidade comum.
    const floor = city.is_capital === 1 ? 500_000 : 100_000;
    if (city.population < COLONO_COST.population + floor) {
      throw new Error(
        `População insuficiente para um colono — a cidade precisa manter ${floor.toLocaleString(
          'pt-BR',
        )} de população.`,
      );
    }
    if (city.food < COLONO_COST.food) {
      throw new Error(`Comida insuficiente para um colono (${COLONO_COST.food}).`);
    }
    await db.execute('BEGIN');
    try {
      await db.execute(
        'UPDATE cities SET population = population - ?, food = food - ? WHERE id = ?',
        [COLONO_COST.population, COLONO_COST.food, city.id],
      );
      await db.execute(
        `INSERT INTO recruit_orders
           (save_id, x, y, owner_code, squad_id, kind, prod_cost, prod_done)
         VALUES (?, ?, ?, ?, 0, 'COLONO', ?, 0)`,
        [saveId, x, y, ownerCode, COLONO_COST.production],
      );
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
    return;
  }

  const troop = TROOP_TYPES[kind];

  const rows = await db.select<{ money: number; manpower: number }[]>(
    'SELECT money, manpower FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const f = rows[0];
  if (!f || f.money < troop.moneyCost) {
    throw new Error(`Dinheiro insuficiente (${troop.moneyCost}).`);
  }
  if (f.manpower < troop.manpowerCost) {
    throw new Error(`Manpower insuficiente (${troop.manpowerCost}).`);
  }

  // Um Quartel deixa a produção 10% mais lenta (mas a tropa nasce treinada).
  const barracks = await cityHasConstruction(saveId, x, y, 'BARRACKS');
  const prodCost = barracks
    ? Math.round(troop.productionCost * BARRACKS_PROD_PENALTY)
    : troop.productionCost;

  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE factions SET money = money - ?, manpower = manpower - ?
       WHERE save_id = ? AND code = ?`,
      [troop.moneyCost, troop.manpowerCost, saveId, ownerCode],
    );
    // `squad_id` é coluna legada (a tropa vai para o inventário da cidade).
    await db.execute(
      `INSERT INTO recruit_orders
         (save_id, x, y, owner_code, squad_id, kind, prod_cost, prod_done)
       VALUES (?, ?, ?, ?, 0, ?, ?, 0)`,
      [saveId, x, y, ownerCode, kind, prodCost],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Cancela uma ordem de recrutamento e devolve o que foi pago ao enfileirar —
 * dinheiro e manpower para tropas; população e comida (à cidade) para colonos.
 */
export async function cancelRecruit(orderId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<RecruitRow[]>(
    'SELECT * FROM recruit_orders WHERE id = ?',
    [orderId],
  );
  const o = rows[0];
  if (!o) return;
  await db.execute('BEGIN');
  try {
    if (o.kind === 'COLONO') {
      await db.execute(
        `UPDATE cities SET population = population + ?, food = food + ?
         WHERE save_id = ? AND x = ? AND y = ?`,
        [COLONO_COST.population, COLONO_COST.food, o.save_id, o.x, o.y],
      );
    } else {
      const troop = TROOP_TYPES[o.kind as TroopKind];
      await db.execute(
        `UPDATE factions SET money = money + ?, manpower = manpower + ?
         WHERE save_id = ? AND code = ?`,
        [troop.moneyCost, troop.manpowerCost, o.save_id, o.owner_code],
      );
    }
    await db.execute('DELETE FROM recruit_orders WHERE id = ?', [orderId]);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

// ===== Inventário de tropas da cidade =====

/**
 * Uma tropa guardada no **inventário de uma cidade** — já treinada, mas ainda
 * fora de um esquadrão. O jogador a transfere para um esquadrão estacionado
 * naquela cidade.
 */
export interface CityTroop {
  id: number;
  /** Tile da cidade onde a tropa está guardada. */
  x: number;
  y: number;
  /** Facção dona. */
  ownerCode: string;
  kind: TroopKind;
  hp: number;
  maxHp: number;
  xp: number;
  /** Level (0–5), derivado do XP. */
  level: number;
}

interface CityTroopRow {
  id: number;
  x: number;
  y: number;
  owner_code: string;
  kind: string;
  hp: number;
  max_hp: number;
  xp: number;
}

/** Carrega as tropas no inventário das cidades de uma partida. */
export async function loadCityTroops(saveId: number): Promise<CityTroop[]> {
  const db = await getDb();
  const rows = await db.select<CityTroopRow[]>(
    'SELECT * FROM city_troops WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    ownerCode: r.owner_code,
    kind: r.kind as TroopKind,
    hp: r.hp,
    maxHp: r.max_hp,
    xp: r.xp,
    level: levelFromXp(r.xp),
  }));
}

/**
 * Move tropas do inventário de uma cidade para um esquadrão. Falha se o
 * esquadrão não comportar todas (limite pelas estrelas do comandante).
 */
export async function moveCityTroopsToSquad(
  troopIds: number[],
  squadId: number,
): Promise<void> {
  if (troopIds.length === 0) return;
  const db = await getDb();
  const sq = await db.select<{ cmd_stars: number }[]>(
    'SELECT cmd_stars FROM squads WHERE id = ?',
    [squadId],
  );
  if (!sq[0]) throw new Error('Esquadrão não encontrado.');
  const cnt = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM squad_troops WHERE squad_id = ?',
    [squadId],
  );
  if ((cnt[0]?.n ?? 0) + troopIds.length > maxTroops(sq[0].cmd_stars)) {
    throw new Error('O esquadrão não comporta todas essas tropas.');
  }
  const placeholders = troopIds.map(() => '?').join(', ');
  const rows = await db.select<CityTroopRow[]>(
    `SELECT * FROM city_troops WHERE id IN (${placeholders})`,
    troopIds,
  );
  await db.execute('BEGIN');
  try {
    for (const r of rows) {
      await db.execute(
        `INSERT INTO squad_troops (squad_id, kind, force, hp, max_hp, xp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          squadId,
          r.kind,
          TROOP_TYPES[r.kind as TroopKind].force,
          r.hp,
          r.max_hp,
          r.xp,
        ],
      );
      await db.execute('DELETE FROM city_troops WHERE id = ?', [r.id]);
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}
