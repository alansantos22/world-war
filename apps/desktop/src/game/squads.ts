/**
 * Esquadrões e recrutamento de tropas (estilo Rome: Total War).
 *
 * Um esquadrão é montado numa província do jogador e fica posicionado num
 * tile do mapa. Ele nasce só com o **comandante** e ganha **tropas** pelo
 * sistema de **recrutamento**: a cidade produz a tropa ao longo de vários
 * turnos (fila de produção) e, quando pronta, a tropa entra no esquadrão.
 *
 * O sistema de **batalha** em si (atacar territórios e outros esquadrões)
 * ainda será implementado — ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';

/** Custo, em dinheiro, para montar um esquadrão. */
export const SQUAD_COST = 500;
/** Custo, em manpower, do comandante de um esquadrão novo. */
export const SQUAD_MANPOWER_COST = 1000;
/** Manutenção por turno de um esquadrão — só o comandante. */
export const SQUAD_UPKEEP = 25;

/** Valores iniciais do comandante de um esquadrão recém-criado. */
export const COMMANDER_BASE = {
  /** 1 estrela = sem bônus de força (ver `starMultiplier`). */
  stars: 1,
  /** Força de batalha que o comandante contribui (a tropa soma ~1/3 disso). */
  force: 30,
  /** Pontos de vida. */
  hp: 100,
  maxHp: 100,
  /** Defesa do comandante. */
  defense: 1,
  /** Experiência acumulada. */
  xp: 0,
};

// ===== Tropas =====

/** Tipos de tropa recrutáveis. Hoje só há infantaria. */
export type TroopKind = 'INFANTARIA';

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
    manpowerCost: 250,
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
}

// ===== Comandante e esquadrão =====

/** O comandante que lidera um esquadrão. */
export interface Commander {
  /** Estrelas (1+) — quanto mais, maior o bônus de força e o limite de tropas. */
  stars: number;
  /** Força de batalha contribuída pelo comandante. */
  force: number;
  /** Pontos de vida atuais. */
  hp: number;
  /** Pontos de vida máximos. */
  maxHp: number;
  /** Defesa. */
  defense: number;
  /** Experiência acumulada. */
  xp: number;
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
  /** Último turno em que se moveu (move-se uma vez por turno). */
  lastMovedTurn: number;
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
  cmd_stars: number;
  cmd_force: number;
  cmd_hp: number;
  cmd_max_hp: number;
  cmd_defense: number;
  cmd_xp: number;
}

interface TroopRow {
  id: number;
  squad_id: number;
  kind: string;
  force: number;
  hp: number;
  max_hp: number;
}

function rowToSquad(r: SquadRow): Squad {
  return {
    id: r.id,
    ownerCode: r.owner_code,
    x: r.x,
    y: r.y,
    createdTurn: r.created_turn,
    lastMovedTurn: r.last_moved_turn,
    commander: {
      stars: r.cmd_stars,
      force: r.cmd_force,
      hp: r.cmd_hp,
      maxHp: r.cmd_max_hp,
      defense: r.cmd_defense,
      xp: r.cmd_xp,
    },
    troops: [],
  };
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
 * Força de batalha total do esquadrão: a força do comandante somada à das
 * tropas, multiplicada pelo bônus de estrelas.
 */
export function squadForce(squad: Squad): number {
  const base =
    squad.commander.force +
    squad.troops.reduce((sum, t) => sum + t.force, 0);
  return Math.round(base * starMultiplier(squad.commander.stars));
}

/** Manutenção por turno de um esquadrão: o comandante mais as tropas. */
export function squadUpkeep(squad: Squad): number {
  return (
    SQUAD_UPKEEP +
    squad.troops.reduce((sum, t) => sum + TROOP_TYPES[t.kind].upkeep, 0)
  );
}

/** Um esquadrão fica pronto no turno **seguinte** ao da sua criação. */
export function isSquadReady(squad: Squad, currentTurn: number): boolean {
  return currentTurn > squad.createdTurn;
}

/**
 * Um esquadrão pode mover-se uma vez por turno — só depois de pronto e
 * respeitando o custo do terreno: sair de um **tile gelado** leva 2 turnos,
 * os demais terrenos levam 1.
 */
export function canSquadMove(
  squad: Squad,
  currentTurn: number,
  onGlacialTile: boolean,
): boolean {
  if (!isSquadReady(squad, currentTurn)) return false;
  const turnCost = onGlacialTile ? 2 : 1;
  return currentTurn - squad.lastMovedTurn >= turnCost;
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
          cmd_stars, cmd_force, cmd_hp, cmd_max_hp, cmd_defense, cmd_xp)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        saveId,
        ownerCode,
        x,
        y,
        currentTurn,
        COMMANDER_BASE.stars,
        COMMANDER_BASE.force,
        COMMANDER_BASE.hp,
        COMMANDER_BASE.maxHp,
        COMMANDER_BASE.defense,
        COMMANDER_BASE.xp,
      ],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/** Exclui um esquadrão — reembolsa a fila de recrutamento ainda pendente. */
export async function deleteSquad(squadId: number): Promise<void> {
  const db = await getDb();
  const orders = await db.select<{ id: number }[]>(
    'SELECT id FROM recruit_orders WHERE squad_id = ?',
    [squadId],
  );
  for (const o of orders) await cancelRecruit(o.id);
  await db.execute('DELETE FROM squad_troops WHERE squad_id = ?', [squadId]);
  await db.execute('DELETE FROM squads WHERE id = ?', [squadId]);
}

/** Move um esquadrão para um tile, gastando o seu movimento do turno. */
export async function moveSquad(
  squadId: number,
  x: number,
  y: number,
  currentTurn: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE squads SET x = ?, y = ?, last_moved_turn = ? WHERE id = ?',
    [x, y, currentTurn, squadId],
  );
}

// ===== Fila de recrutamento =====

/** Uma ordem de recrutamento na fila de produção de uma cidade. */
export interface RecruitOrder {
  id: number;
  /** Tile da cidade que produz a tropa. */
  x: number;
  y: number;
  /** Facção dona. */
  ownerCode: string;
  /** Esquadrão que receberá a tropa pronta. */
  squadId: number;
  /** Tipo da tropa. */
  kind: TroopKind;
  /** Produção necessária para concluir a tropa. */
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
  squad_id: number;
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
    squadId: r.squad_id,
    kind: r.kind as TroopKind,
    prodCost: r.prod_cost,
    prodDone: r.prod_done,
  }));
}

/**
 * Enfileira o recrutamento de uma tropa para um esquadrão numa cidade. Cobra
 * o dinheiro e o manpower na hora; a produção será gasta turno a turno. Falha
 * se faltarem recursos ou se o esquadrão já estiver no limite de tropas.
 */
export async function queueRecruit(
  saveId: number,
  ownerCode: string,
  x: number,
  y: number,
  squadId: number,
  kind: TroopKind,
): Promise<void> {
  const db = await getDb();
  const troop = TROOP_TYPES[kind];

  const sq = await db.select<{ cmd_stars: number }[]>(
    'SELECT cmd_stars FROM squads WHERE id = ?',
    [squadId],
  );
  if (!sq[0]) throw new Error('Esquadrão não encontrado.');

  const cnt = await db.select<{ n: number }[]>(
    `SELECT
       (SELECT COUNT(*) FROM squad_troops  WHERE squad_id = ?) +
       (SELECT COUNT(*) FROM recruit_orders WHERE squad_id = ?) AS n`,
    [squadId, squadId],
  );
  if ((cnt[0]?.n ?? 0) >= maxTroops(sq[0].cmd_stars)) {
    throw new Error('O esquadrão já atingiu o limite de tropas.');
  }

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

  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE factions SET money = money - ?, manpower = manpower - ?
       WHERE save_id = ? AND code = ?`,
      [troop.moneyCost, troop.manpowerCost, saveId, ownerCode],
    );
    await db.execute(
      `INSERT INTO recruit_orders
         (save_id, x, y, owner_code, squad_id, kind, prod_cost, prod_done)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [saveId, x, y, ownerCode, squadId, kind, troop.productionCost],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/** Cancela uma ordem de recrutamento e devolve o dinheiro e o manpower pagos. */
export async function cancelRecruit(orderId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<RecruitRow[]>(
    'SELECT * FROM recruit_orders WHERE id = ?',
    [orderId],
  );
  const o = rows[0];
  if (!o) return;
  const troop = TROOP_TYPES[o.kind as TroopKind];
  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE factions SET money = money + ?, manpower = manpower + ?
       WHERE save_id = ? AND code = ?`,
      [troop.moneyCost, troop.manpowerCost, o.save_id, o.owner_code],
    );
    await db.execute('DELETE FROM recruit_orders WHERE id = ?', [orderId]);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}
