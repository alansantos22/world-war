/**
 * Sistema de batalha.
 *
 * Uma batalha é **bidirecional**: o esquadrão atacante e o defensor (outro
 * esquadrão ou as tropas de defesa de um território neutro) trocam dano de
 * uma só vez. A força de cada lado é a sua força-base ajustada por vários
 * fatores que se **somam**:
 *
 * - **Ambiente** — bônus de capital próxima e debuffs de clima/estação;
 * - **Dados** — 2 dados por lado (estilo EU4); +10% de força por ponto de
 *   diferença na soma, e o empate favorece o defensor;
 * - **Moral** — 50% é neutro; ±3% de força a cada 10% de moral.
 *
 * Cada batalha é registrada (ver `loadBattleLogs`) para o jogador estudar.
 *
 * > **Planejado:** bônus de defesa do tile e buffs/debuffs de construções.
 */

import { getDb } from '../db';
import { ClimateZone, Season } from './climate';
import {
  deleteSquad,
  squadForce,
  squadDefense,
  squadName,
  TROOP_TYPES,
  MORAL_MAX,
  XP_BASE_PER_BATTLE,
  XP_DIFFICULTY_MAX,
  XP_TERRITORY_BONUS,
  XP_GAIN_MULTIPLIER,
  type Squad,
  type SquadTroop,
} from './squads';
import type { Province } from './world';

/** Alcance (em células) dentro do qual a capital concede bônus de força. */
export const CAPITAL_BONUS_RANGE = 3;
/** Moral perdida por um esquadrão a cada batalha. */
export const MORAL_BATTLE_LOSS = 5;
/** Moral ganha ao destruir todo o exército inimigo. */
export const MORAL_WIN_GAIN = 15;
/** Moral perdida ao perder uma tropa numa batalha. */
export const MORAL_TROOP_LOSS = 15;

// ===== Ambiente =====

/** Ambiente em que uma batalha acontece — para um dos lados. */
export interface BattleEnv {
  /** Clima do tile onde a batalha ocorre. */
  climate: ClimateZone;
  /** Estação do ano no tile da batalha. */
  season: Season;
  /** `true` se o tile fica a até `CAPITAL_BONUS_RANGE` células da capital. */
  nearCapital: boolean;
}

/** Um modificador de força (ambiente, dados ou moral). */
export interface BattleModifier {
  label: string;
  /** Variação no multiplicador, em fração (ex.: +0,05, −0,20). */
  delta: number;
}

/**
 * Modificadores de **ambiente** de um lado da batalha:
 *
 * - **perto da capital** (≤ 3 células): +5%;
 * - **terreno**: gelado −20%, desértico −10%, tropical −10%;
 * - **inverno em terreno gelado**: −30% (o "inverno russo");
 * - **verão em terreno desértico**: −20%.
 */
export function battleModifiers(env: BattleEnv): BattleModifier[] {
  const mods: BattleModifier[] = [];
  if (env.nearCapital) {
    mods.push({ label: 'Perto da capital', delta: 0.05 });
  }
  if (env.climate === ClimateZone.GELADO) {
    mods.push({ label: 'Terreno gelado', delta: -0.2 });
  } else if (env.climate === ClimateZone.DESERTICO) {
    mods.push({ label: 'Terreno desértico', delta: -0.1 });
  } else if (env.climate === ClimateZone.TROPICAL) {
    mods.push({ label: 'Terreno tropical', delta: -0.1 });
  }
  if (env.climate === ClimateZone.GELADO && env.season === Season.INVERNO) {
    mods.push({ label: 'Inverno em terreno gelado', delta: -0.3 });
  }
  if (env.climate === ClimateZone.DESERTICO && env.season === Season.VERAO) {
    mods.push({ label: 'Verão em terreno desértico', delta: -0.2 });
  }
  return mods;
}

/** Multiplicador só do ambiente (para a prévia no painel de Combate). */
export function attackerMultiplier(env: BattleEnv): number {
  return Math.max(0, battleModifiers(env).reduce((m, x) => m + x.delta, 1));
}

// ===== Moral =====

/**
 * Variação de força conferida pela moral: 50% é neutro; a cada 10% de moral
 * acima de 50% são +3%, e a cada 10% abaixo são −3%.
 */
export function moralForceDelta(moral: number): number {
  return ((moral - 50) / 10) * 0.03;
}

// ===== Dados =====

/** Os 2 dados crus (1–6) lançados para cada lado. */
export interface DiceRoll {
  attacker: number[];
  defender: number[];
}

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/** Lança 2 dados crus para cada lado. */
export function rollDice(): DiceRoll {
  return {
    attacker: [rollDie(), rollDie()],
    defender: [rollDie(), rollDie()],
  };
}

/**
 * Bônus de força dos dados, dadas as **somas** já com a tradição militar:
 * +10% por ponto de diferença para quem somou mais; no empate, o defensor
 * leva +10% de vantagem.
 */
export function diceDeltas(
  attackerSum: number,
  defenderSum: number,
): { attacker: number; defender: number } {
  const diff = attackerSum - defenderSum;
  if (diff > 0) return { attacker: 0.1 * diff, defender: 0 };
  if (diff < 0) return { attacker: 0, defender: 0.1 * -diff };
  return { attacker: 0, defender: 0.1 };
}

/** Número de tropas de defesa vivas num território, dada a vida somada. */
export function defenderTroopCount(defenderHp: number): number {
  return Math.ceil(Math.max(0, defenderHp) / TROOP_TYPES.INFANTARIA.hp);
}

// ===== Relatório da batalha =====

/** Um modificador aplicado a um lado, já em pontos percentuais. */
export interface BattleModifierLine {
  label: string;
  pct: number;
}

/** O resultado de um lado da batalha. */
export interface BattleSideReport {
  kind: 'squad' | 'territory';
  label: string;
  ownerCode: string | null;
  /** Tradição militar somada à soma dos dados. */
  tradition: number;
  /** Soma dos 2 dados, já com a tradição militar. */
  diceSum: number;
  /** Todos os modificadores de força (ambiente, dados, moral). */
  modifiers: BattleModifierLine[];
  baseForce: number;
  effectiveForce: number;
  hpBefore: number;
  hpAfter: number;
  /** Dano sofrido por este lado. */
  damageTaken: number;
  troopsBefore: number;
  troopsLost: number;
  destroyed: boolean;
}

/** O registro completo de uma batalha. */
export interface BattleReport {
  turn: number;
  tileName: string;
  tileX: number;
  tileY: number;
  attackerDice: number[];
  defenderDice: number[];
  attacker: BattleSideReport;
  defender: BattleSideReport;
  /** Experiência ganha pelo esquadrão atacante (comandante e tropas). */
  xpGained: number;
  /** `true` se a batalha destruiu um dos lados (batalha final). */
  finalBattle: boolean;
}

/** Uma batalha registrada, com o id da linha do log. */
export type BattleLog = BattleReport & { logId: number };

// ===== Resolução =====

interface SquadDamagePlan {
  deadTroopIds: number[];
  hurtTroops: { id: number; hp: number }[];
  commanderHp: number;
  troopsLost: number;
  /** Vida somada do esquadrão depois do dano (0 se destruído). */
  hpAfter: number;
  destroyed: boolean;
}

/**
 * Distribui um dano por um esquadrão: cai primeiro nas tropas (na ordem em
 * que entraram) e só depois no comandante — o último a morrer.
 */
function planSquadDamage(
  troops: SquadTroop[],
  commanderHp: number,
  damage: number,
): SquadDamagePlan {
  let remaining = damage;
  const deadTroopIds: number[] = [];
  const hurtTroops: { id: number; hp: number }[] = [];
  for (const t of troops) {
    if (remaining <= 0) break;
    if (remaining >= t.hp) {
      remaining -= t.hp;
      deadTroopIds.push(t.id);
    } else {
      hurtTroops.push({ id: t.id, hp: t.hp - remaining });
      remaining = 0;
    }
  }
  const newCommanderHp = commanderHp - Math.max(0, remaining);
  const destroyed = newCommanderHp <= 0;
  let hpAfter = 0;
  if (!destroyed) {
    hpAfter = newCommanderHp;
    for (const t of troops) {
      if (deadTroopIds.includes(t.id)) continue;
      const hurt = hurtTroops.find((h) => h.id === t.id);
      hpAfter += hurt ? hurt.hp : t.hp;
    }
  }
  return {
    deadTroopIds,
    hurtTroops,
    commanderHp: newCommanderHp,
    troopsLost: deadTroopIds.length,
    hpAfter,
    destroyed,
  };
}

/** Vida somada de um esquadrão (comandante + tropas). */
function squadHp(squad: Squad): number {
  return (
    squad.commander.hp + squad.troops.reduce((s, t) => s + t.hp, 0)
  );
}

/** Soma os deltas de uma lista de modificadores. */
function sumDeltas(mods: BattleModifierLine[]): number {
  return mods.reduce((m, x) => m + x.pct / 100, 0);
}

function clampMoral(m: number): number {
  return Math.max(0, Math.min(MORAL_MAX, m));
}

/** Aplica as variações de moral de um esquadrão depois de uma batalha. */
function battleMoral(
  moral: number,
  lostTroop: boolean,
  destroyedEnemy: boolean,
): number {
  let m = moral - MORAL_BATTLE_LOSS;
  if (lostTroop) m -= MORAL_TROOP_LOSS;
  if (destroyedEnemy) m += MORAL_WIN_GAIN;
  return clampMoral(m);
}

/** Parâmetros de uma batalha iniciada pelo esquadrão atacante. */
export interface BattleParams {
  saveId: number;
  turn: number;
  /** Tile onde a batalha ocorre. */
  province: Province;
  attacker: Squad;
  attackerEnv: BattleEnv;
  defenderEnv: BattleEnv;
  /** O defensor: outro esquadrão, ou as tropas do território neutro. */
  defender: { kind: 'squad'; squad: Squad } | { kind: 'territory' };
}

/**
 * Resolve uma batalha completa: lança os dados (somando a tradição militar),
 * calcula a força efetiva dos dois lados, aplica o dano em ambos, atualiza a
 * moral, dá experiência ao atacante, grava o log e devolve o relatório. O
 * atacante gasta 1 dos seus ataques do turno.
 */
export async function executeBattle(p: BattleParams): Promise<BattleReport> {
  const db = await getDb();
  const dice = rollDice();

  const isTerritory = p.defender.kind === 'territory';
  const defSquad = p.defender.kind === 'squad' ? p.defender.squad : null;

  // --- Dados + tradição militar (somada uma vez à soma de cada lado) ---
  const atkTradition = p.attacker.commander.tradition;
  const defTradition = defSquad ? defSquad.commander.tradition : 0;
  const atkDiceSum = dice.attacker[0] + dice.attacker[1] + atkTradition;
  const defDiceSum = dice.defender[0] + dice.defender[1] + defTradition;
  const dd = diceDeltas(atkDiceSum, defDiceSum);

  // --- Atacante ---
  const atkBase = squadForce(p.attacker);
  const atkMods: BattleModifierLine[] = [
    ...battleModifiers(p.attackerEnv).map((m) => ({
      label: m.label,
      pct: m.delta * 100,
    })),
    { label: `Dados (${atkDiceSum})`, pct: dd.attacker * 100 },
    {
      label: `Moral ${p.attacker.moral}%`,
      pct: moralForceDelta(p.attacker.moral) * 100,
    },
  ];
  const atkForce = Math.round(atkBase * Math.max(0, 1 + sumDeltas(atkMods)));
  const atkDefense = squadDefense(p.attacker);

  // --- Defensor ---
  const defTroopsBefore = isTerritory
    ? defenderTroopCount(p.province.defenderHp)
    : defSquad!.troops.length;
  const defBase = isTerritory
    ? defTroopsBefore * TROOP_TYPES.INFANTARIA.force
    : squadForce(defSquad!);
  const defMods: BattleModifierLine[] = [
    ...battleModifiers(p.defenderEnv).map((m) => ({
      label: m.label,
      pct: m.delta * 100,
    })),
    { label: `Dados (${defDiceSum})`, pct: dd.defender * 100 },
  ];
  if (defSquad) {
    defMods.push({
      label: `Moral ${defSquad.moral}%`,
      pct: moralForceDelta(defSquad.moral) * 100,
    });
  }
  const defForce = Math.round(defBase * Math.max(0, 1 + sumDeltas(defMods)));
  const defDefense = defSquad ? squadDefense(defSquad) : 0;

  // --- Dano dos dois lados ---
  const dmgToDefender = Math.max(0, atkForce - defDefense);
  const dmgToAttacker = Math.max(0, defForce - atkDefense);

  const atkHpBefore = squadHp(p.attacker);
  const atkPlan = planSquadDamage(
    p.attacker.troops,
    p.attacker.commander.hp,
    dmgToAttacker,
  );

  let defHpBefore: number;
  let defHpAfter: number;
  let defTroopsLost: number;
  let defDestroyed: boolean;
  let defPlan: SquadDamagePlan | null = null;
  let newDefenderHp = 0;
  if (isTerritory) {
    defHpBefore = p.province.defenderHp;
    newDefenderHp = Math.max(0, defHpBefore - dmgToDefender);
    defHpAfter = newDefenderHp;
    defTroopsLost = defTroopsBefore - defenderTroopCount(newDefenderHp);
    defDestroyed = newDefenderHp <= 0;
  } else {
    defHpBefore = squadHp(defSquad!);
    defPlan = planSquadDamage(
      defSquad!.troops,
      defSquad!.commander.hp,
      dmgToDefender,
    );
    defHpAfter = defPlan.hpAfter;
    defTroopsLost = defPlan.troopsLost;
    defDestroyed = defPlan.destroyed;
  }

  // --- Experiência ganha pelo atacante ---
  // 5 fixo + dificuldade (dano dado − sofrido, /100, teto 4) + bônus de
  // território limpo. O multiplicador é o gancho para pesquisas futuras.
  const clearedTerritory = isTerritory && defDestroyed;
  const difficulty = Math.max(
    0,
    Math.min(
      XP_DIFFICULTY_MAX,
      Math.floor((dmgToDefender - dmgToAttacker) / 100),
    ),
  );
  const xpGained = atkPlan.destroyed
    ? 0
    : Math.round(
        (XP_BASE_PER_BATTLE +
          difficulty +
          (clearedTerritory ? XP_TERRITORY_BONUS : 0)) *
          XP_GAIN_MULTIPLIER,
      );

  // O defensor também ganha XP — mas só quando é um esquadrão e sobrevive
  // (territórios neutros não ganham experiência) e sem bônus de território.
  const defXp =
    !isTerritory && defSquad && !defPlan!.destroyed
      ? Math.round(
          (XP_BASE_PER_BATTLE +
            Math.max(
              0,
              Math.min(
                XP_DIFFICULTY_MAX,
                Math.floor((dmgToAttacker - dmgToDefender) / 100),
              ),
            )) *
            XP_GAIN_MULTIPLIER,
        )
      : 0;

  // --- Persistência: atacante ---
  if (atkPlan.destroyed) {
    await deleteSquad(p.attacker.id);
  } else {
    for (const id of atkPlan.deadTroopIds) {
      await db.execute('DELETE FROM squad_troops WHERE id = ?', [id]);
    }
    // As tropas sobreviventes têm a vida atualizada e ganham XP da batalha.
    for (const t of p.attacker.troops) {
      if (atkPlan.deadTroopIds.includes(t.id)) continue;
      const hurt = atkPlan.hurtTroops.find((h) => h.id === t.id);
      await db.execute(
        'UPDATE squad_troops SET hp = ?, xp = xp + ? WHERE id = ?',
        [hurt ? hurt.hp : t.hp, xpGained, t.id],
      );
    }
    await db.execute(
      `UPDATE squads
         SET cmd_hp = ?, moral = ?, cmd_xp = cmd_xp + ?,
             attacks_used = attacks_used + 1
       WHERE id = ?`,
      [
        atkPlan.commanderHp,
        battleMoral(p.attacker.moral, atkPlan.troopsLost > 0, defDestroyed),
        xpGained,
        p.attacker.id,
      ],
    );
  }

  // --- Persistência: defensor ---
  if (isTerritory) {
    await db.execute('UPDATE provinces SET defender_hp = ? WHERE id = ?', [
      newDefenderHp,
      p.province.id,
    ]);
  } else if (defPlan!.destroyed) {
    await deleteSquad(defSquad!.id);
  } else {
    for (const id of defPlan!.deadTroopIds) {
      await db.execute('DELETE FROM squad_troops WHERE id = ?', [id]);
    }
    // As tropas sobreviventes do defensor têm a vida atualizada e ganham XP.
    for (const t of defSquad!.troops) {
      if (defPlan!.deadTroopIds.includes(t.id)) continue;
      const hurt = defPlan!.hurtTroops.find((h) => h.id === t.id);
      await db.execute(
        'UPDATE squad_troops SET hp = ?, xp = xp + ? WHERE id = ?',
        [hurt ? hurt.hp : t.hp, defXp, t.id],
      );
    }
    await db.execute(
      'UPDATE squads SET cmd_hp = ?, moral = ?, cmd_xp = cmd_xp + ? WHERE id = ?',
      [
        defPlan!.commanderHp,
        battleMoral(defSquad!.moral, defPlan!.troopsLost > 0, atkPlan.destroyed),
        defXp,
        defSquad!.id,
      ],
    );
  }

  const report: BattleReport = {
    turn: p.turn,
    tileName: p.province.name,
    tileX: p.province.x,
    tileY: p.province.y,
    attackerDice: dice.attacker,
    defenderDice: dice.defender,
    xpGained,
    attacker: {
      kind: 'squad',
      label: squadName(p.attacker),
      ownerCode: p.attacker.ownerCode,
      tradition: atkTradition,
      diceSum: atkDiceSum,
      modifiers: atkMods,
      baseForce: atkBase,
      effectiveForce: atkForce,
      hpBefore: atkHpBefore,
      hpAfter: atkPlan.destroyed ? 0 : atkPlan.hpAfter,
      damageTaken: dmgToAttacker,
      troopsBefore: p.attacker.troops.length,
      troopsLost: atkPlan.troopsLost,
      destroyed: atkPlan.destroyed,
    },
    defender: {
      kind: isTerritory ? 'territory' : 'squad',
      label: isTerritory ? 'Defensores do território' : squadName(defSquad!),
      ownerCode: defSquad ? defSquad.ownerCode : null,
      tradition: defTradition,
      diceSum: defDiceSum,
      modifiers: defMods,
      baseForce: defBase,
      effectiveForce: defForce,
      hpBefore: defHpBefore,
      hpAfter: defHpAfter,
      damageTaken: dmgToDefender,
      troopsBefore: defTroopsBefore,
      troopsLost: defTroopsLost,
      destroyed: defDestroyed,
    },
    finalBattle: atkPlan.destroyed || defDestroyed,
  };

  await db.execute(
    'INSERT INTO battle_logs (save_id, turn, data) VALUES (?, ?, ?)',
    [p.saveId, p.turn, JSON.stringify(report)],
  );
  // Mantém só as 200 batalhas mais recentes — o histórico não cresce sem fim.
  await db.execute(
    `DELETE FROM battle_logs
      WHERE save_id = ? AND id NOT IN (
        SELECT id FROM battle_logs WHERE save_id = ? ORDER BY id DESC LIMIT 200
      )`,
    [p.saveId, p.saveId],
  );
  return report;
}

/** Carrega o histórico de batalhas de uma partida (mais recentes primeiro). */
export async function loadBattleLogs(saveId: number): Promise<BattleLog[]> {
  const db = await getDb();
  const rows = await db.select<{ id: number; data: string }[]>(
    'SELECT id, data FROM battle_logs WHERE save_id = ? ORDER BY id DESC',
    [saveId],
  );
  return rows.map((r) => ({
    ...(JSON.parse(r.data) as BattleReport),
    logId: r.id,
  }));
}
