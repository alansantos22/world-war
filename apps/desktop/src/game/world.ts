import { getDb } from '../db';
import {
  generateMap,
  GeneratedProvince,
  CapitalSeed,
  continentCells,
  MAP_SCALE,
} from './map-generator';
import { NATIONS, NATION_CODES, Nation, CUSTOM_NATION_CODE } from './nations';
import { AlignmentId } from './alignments';
import { ResourceType } from './enums';
import {
  FactionState,
  STARTING_FACTION,
  TerritoryProduction,
  cityTaxIncome,
  clampTax,
  areaBonus,
  happinessFor,
  cityHappiness,
  happinessGrowthModifier,
  initialProsperity,
  prosperityCap,
  prosperityGrowthMult,
  prosperityIncomeMultiplier,
  PROSPERITY_BASE_GROWTH,
  PROSPERITY_MIN,
  PROSPERITY_DECAY,
  FACTORY_BY_ALIGNMENT,
  ALIGNMENT_ECONOMY,
  type TaxLevel,
} from './economy';
import { ClimateZone } from './climate';
import {
  loadSquads,
  loadRecruitOrders,
  squadUpkeepAt,
  HP_REGEN_PER_TURN,
  MORAL_MAX,
  MORAL_REGEN,
  MORAL_REGEN_OWN_TILE,
  TROOP_TYPES,
  BARRACKS_TROOP_XP,
  type RecruitOrder,
  type TroopKind,
} from './squads';
import {
  cityFoodConsumption,
  cityFoodProduction,
  cityFoodCapacity,
  cityManpower,
  cityPopCap,
  cityProduction,
  cityBaseCulture,
  cityResourceYield,
  loadCities,
  loadCityResources,
  CAPITAL_START_FOOD,
  CAPITAL_START_POP,
  DISCONNECT_FOOD_PENALTY,
  STARVATION_LOSS,
  INDEPENDENT_CITY_RESEARCH,
  type City,
} from './cities';
import { resourceInfo } from './resources';
import {
  loadRoadOrders,
  connectedCities,
  ROAD_PROSPERITY,
  RAIL_PROSPERITY,
  type RoadKind,
  type RoadOrder,
} from './roads';
import {
  loadConstructions,
  loadConstructionOrders,
  CONSTRUCTIONS,
  PASTURE_PRODUCT_OUTPUT,
  constructionPopCap,
  constructionMoneyPerTurn,
  resourceCapacity,
  farmFood,
  pastureFood,
  mineOutput,
  type Sector,
  type Construction,
  type ConstructionOrder,
} from './constructions';
import {
  loadLawModifiers,
  emptyLawModifiers,
  type LawModifiers,
  type LawId,
} from './laws';

/** Uma província do mapa já persistida (1 célula de terra, com id do banco). */
export interface Province extends TerritoryProduction {
  id: number;
  x: number;
  y: number;
  continent: string;
  name: string;
  resource: ResourceType;
  ownerCode: string | null;
  isCapital: boolean;
  /** Zona de clima da província. */
  climate: ClimateZone;
  /** `true` se a província fica numa zona sísmica (anel de fogo). */
  seismic: boolean;
  /** `true` se há um vulcão na província. */
  volcano: boolean;
  /**
   * Vida somada das tropas de defesa de um território neutro; derrubá-la a 0
   * deixa o território livre para ser tomado. Territórios possuídos têm 0.
   */
  defenderHp: number;
  /** `true` se o território foi tomado de outra facção (não neutro). */
  conquered: boolean;
  /** Setor em que o tile foi especializado, ou `null` (ver `constructions.ts`). */
  sector: Sector | null;
  /** Via do tile (`ROAD`/`RAIL`), ou `null` (ver `roads.ts`). */
  road: RoadKind | null;
}

interface ProvinceRow {
  id: number;
  x: number;
  y: number;
  continent: string;
  name: string;
  resource: string;
  owner_code: string | null;
  is_capital: number;
  manpower_prod: number;
  resource_prod: number;
  production: number;
  research_prod: number;
  culture_prod: number;
  climate: string;
  seismic: number;
  volcano: number;
  defender_hp: number;
  conquered: number;
  sector: string | null;
  road: string | null;
}

interface FactionRow {
  code: string;
  money: number;
  influence: number;
  manpower: number;
  research_points: number;
  culture: number;
  tax_level: string;
  prosperity: number;
}

interface SaveRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  turn: number;
  player_code: string | null;
  custom_name: string | null;
  custom_color: string | null;
  custom_alignment: string | null;
  custom_continent: string | null;
  custom_default_law: string | null;
}

/** Uma partida carregada: dados do save + a nação personalizada (se houver). */
export interface GameSave {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Turno atual da partida (começa em 1). */
  turn: number;
  /** Código da nação controlada pelo jogador. */
  playerCode: string | null;
  /** Nação criada pelo jogador, ou `null` se ele escolheu uma nação fixa. */
  customNation: Nation | null;
}

/** Escolha do jogador ao iniciar um novo jogo. */
export type NewGameChoice =
  | { kind: 'existing'; code: string }
  | {
      kind: 'custom';
      name: string;
      color: string;
      alignment: AlignmentId;
      continent: string;
      /** Lei neutra escolhida como lei-padrão (travada) da nação. */
      defaultLaw: LawId;
    };

/**
 * Cria as tabelas do jogo se ainda não existirem e migra esquemas antigos.
 *
 * - `saves`     — uma linha por partida salva, incluindo a nação do jogador.
 * - `provinces` — as províncias do mapa; cada uma pertence a uma partida.
 */
export async function ensureSchema(): Promise<void> {
  const db = await getDb();
  // Limpa modelos obsoletos de versões antigas.
  await db.execute('DROP TABLE IF EXISTS regions');
  await db.execute('DROP TABLE IF EXISTS smoke_test');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS saves (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      created_at       TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL,
      turn             INTEGER NOT NULL DEFAULT 1,
      player_code       TEXT,
      custom_name       TEXT,
      custom_color      TEXT,
      custom_alignment  TEXT,
      custom_continent  TEXT,
      custom_default_law TEXT
    )
  `);
  // Migração: adiciona as colunas da nação do jogador em saves antigos.
  const saveCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(saves)',
  );
  const haveCol = new Set(saveCols.map((c) => c.name));
  for (const col of [
    'player_code',
    'custom_name',
    'custom_color',
    'custom_alignment',
    'custom_continent',
    'custom_default_law',
  ]) {
    if (!haveCol.has(col)) {
      await db.execute(`ALTER TABLE saves ADD COLUMN ${col} TEXT`);
    }
  }
  // Migração: a coluna do turno (saves anteriores ao sistema de turnos).
  if (!haveCol.has('turn')) {
    await db.execute(
      'ALTER TABLE saves ADD COLUMN turn INTEGER NOT NULL DEFAULT 1',
    );
  }

  // Tabela das facções: uma linha por nação em cada partida.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS factions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id         INTEGER NOT NULL,
      code            TEXT    NOT NULL,
      money           INTEGER NOT NULL,
      influence       INTEGER NOT NULL,
      manpower        INTEGER NOT NULL,
      research_points INTEGER NOT NULL,
      culture         INTEGER NOT NULL DEFAULT 0,
      tax_level       TEXT    NOT NULL DEFAULT 'MEDIO',
      prosperity      REAL    NOT NULL DEFAULT 40,
      law_slot_tier   INTEGER NOT NULL DEFAULT 1
    )
  `);
  // Migração: a coluna de cultura (facções anteriores a esse valor).
  const factionCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(factions)',
  );
  if (!factionCols.some((c) => c.name === 'culture')) {
    await db.execute(
      'ALTER TABLE factions ADD COLUMN culture INTEGER NOT NULL DEFAULT 0',
    );
  }
  // Migração: a coluna de nível de imposto.
  if (!factionCols.some((c) => c.name === 'tax_level')) {
    await db.execute(
      "ALTER TABLE factions ADD COLUMN tax_level TEXT NOT NULL DEFAULT 'MEDIO'",
    );
  }
  // Migração: a coluna de prosperidade.
  if (!factionCols.some((c) => c.name === 'prosperity')) {
    await db.execute(
      'ALTER TABLE factions ADD COLUMN prosperity REAL NOT NULL DEFAULT 40',
    );
  }
  // Migração: o nível de espaços de lei (facções anteriores ao sistema de leis).
  if (!factionCols.some((c) => c.name === 'law_slot_tier')) {
    await db.execute(
      'ALTER TABLE factions ADD COLUMN law_slot_tier INTEGER NOT NULL DEFAULT 1',
    );
  }

  // Tabela dos esquadrões: as unidades militares de cada partida.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS squads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id         INTEGER NOT NULL,
      owner_code      TEXT    NOT NULL,
      x               INTEGER NOT NULL,
      y               INTEGER NOT NULL,
      created_turn    INTEGER NOT NULL,
      last_moved_turn INTEGER NOT NULL DEFAULT 0,
      cmd_stars       INTEGER NOT NULL DEFAULT 1,
      cmd_force       INTEGER NOT NULL DEFAULT 10,
      cmd_hp          INTEGER NOT NULL DEFAULT 100,
      cmd_max_hp      INTEGER NOT NULL DEFAULT 100,
      cmd_defense     INTEGER NOT NULL DEFAULT 1,
      cmd_xp          INTEGER NOT NULL DEFAULT 0,
      attacks_used    INTEGER NOT NULL DEFAULT 0,
      moral           INTEGER NOT NULL DEFAULT 100,
      cmd_tradition   INTEGER NOT NULL DEFAULT 0,
      name            TEXT,
      moves_used      INTEGER NOT NULL DEFAULT 0,
      move_allowance  INTEGER NOT NULL DEFAULT 1
    )
  `);
  // Migração: colunas de combate (esquadrões anteriores ao sistema de batalha).
  const squadCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(squads)',
  );
  const haveSquadCol = new Set(squadCols.map((c) => c.name));
  if (!haveSquadCol.has('attacks_used')) {
    await db.execute(
      'ALTER TABLE squads ADD COLUMN attacks_used INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!haveSquadCol.has('moral')) {
    await db.execute(
      'ALTER TABLE squads ADD COLUMN moral INTEGER NOT NULL DEFAULT 100',
    );
  }
  if (!haveSquadCol.has('cmd_tradition')) {
    await db.execute(
      'ALTER TABLE squads ADD COLUMN cmd_tradition INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!haveSquadCol.has('name')) {
    await db.execute('ALTER TABLE squads ADD COLUMN name TEXT');
  }
  // Migração: colunas de movimento por estrada.
  if (!haveSquadCol.has('moves_used')) {
    await db.execute(
      'ALTER TABLE squads ADD COLUMN moves_used INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!haveSquadCol.has('move_allowance')) {
    await db.execute(
      'ALTER TABLE squads ADD COLUMN move_allowance INTEGER NOT NULL DEFAULT 1',
    );
  }

  // Tropas de cada esquadrão (o comandante é parte do próprio esquadrão).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS squad_troops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_id  INTEGER NOT NULL,
      kind      TEXT    NOT NULL,
      force     INTEGER NOT NULL,
      hp        INTEGER NOT NULL,
      max_hp    INTEGER NOT NULL,
      xp        INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Migração: a coluna de XP das tropas (tropas anteriores ao sistema de level).
  const troopCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(squad_troops)',
  );
  if (!troopCols.some((c) => c.name === 'xp')) {
    await db.execute(
      'ALTER TABLE squad_troops ADD COLUMN xp INTEGER NOT NULL DEFAULT 0',
    );
  }

  // Fila de recrutamento: tropas que as cidades estão produzindo por turno.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recruit_orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      x          INTEGER NOT NULL,
      y          INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      squad_id   INTEGER NOT NULL,
      kind       TEXT    NOT NULL,
      prod_cost  INTEGER NOT NULL,
      prod_done  INTEGER NOT NULL DEFAULT 0,
      money_cost INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Migração: a coluna do dinheiro pago (devolvido ao cancelar o recrutamento).
  const roCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(recruit_orders)',
  );
  if (!roCols.some((c) => c.name === 'money_cost')) {
    await db.execute(
      'ALTER TABLE recruit_orders ADD COLUMN money_cost INTEGER NOT NULL DEFAULT 0',
    );
  }

  // Histórico de batalhas — uma linha por batalha; `data` é o relatório JSON.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      turn    INTEGER NOT NULL,
      data    TEXT    NOT NULL
    )
  `);

  // Inventário de tropas das cidades — tropas recrutadas, fora de esquadrão.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS city_troops (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      x          INTEGER NOT NULL,
      y          INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      hp         INTEGER NOT NULL,
      max_hp     INTEGER NOT NULL,
      xp         INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Cidades — tiles especiais com população, comida e zona de influência.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id      INTEGER NOT NULL,
      x            INTEGER NOT NULL,
      y            INTEGER NOT NULL,
      owner_code   TEXT    NOT NULL,
      is_capital   INTEGER NOT NULL DEFAULT 0,
      population   INTEGER NOT NULL,
      food         INTEGER NOT NULL,
      manpower_cap INTEGER NOT NULL DEFAULT 0,
      founded_turn INTEGER NOT NULL DEFAULT 1,
      name         TEXT
    )
  `);
  // Migração: a coluna do nome dado pelo jogador à cidade.
  const cityCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(cities)',
  );
  if (!cityCols.some((c) => c.name === 'name')) {
    await db.execute('ALTER TABLE cities ADD COLUMN name TEXT');
  }

  // Esquadrões de colonos — unidades civis que fundam cidades.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settler_squads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id         INTEGER NOT NULL,
      owner_code      TEXT    NOT NULL,
      x               INTEGER NOT NULL,
      y               INTEGER NOT NULL,
      count           INTEGER NOT NULL DEFAULT 1,
      created_turn    INTEGER NOT NULL,
      last_moved_turn INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Construções erguidas nos tiles da zona de influência das cidades.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS constructions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      x          INTEGER NOT NULL,
      y          INTEGER NOT NULL,
      city_x     INTEGER NOT NULL,
      city_y     INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      variant    TEXT
    )
  `);

  // Fila de construção — uma fila por cidade, paralela à de tropas/colonos.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS construction_orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      city_x     INTEGER NOT NULL,
      city_y     INTEGER NOT NULL,
      target_x   INTEGER NOT NULL,
      target_y   INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      variant    TEXT,
      prod_cost  INTEGER NOT NULL,
      prod_done  INTEGER NOT NULL DEFAULT 0,
      money_cost INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Migração: a coluna do dinheiro pago (devolvido ao cancelar).
  const coCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(construction_orders)',
  );
  if (!coCols.some((c) => c.name === 'money_cost')) {
    await db.execute(
      'ALTER TABLE construction_orders ADD COLUMN money_cost INTEGER NOT NULL DEFAULT 0',
    );
  }

  // Inventário de recursos das cidades (minerais minerados e produtos).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS city_resources (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id  INTEGER NOT NULL,
      x        INTEGER NOT NULL,
      y        INTEGER NOT NULL,
      resource TEXT    NOT NULL,
      amount   INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Fila de estradas — uma fila por cidade; `path` é o traçado (JSON de tiles).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS road_orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      city_x     INTEGER NOT NULL,
      city_y     INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      target_x   INTEGER NOT NULL,
      target_y   INTEGER NOT NULL,
      path       TEXT    NOT NULL,
      prod_cost  INTEGER NOT NULL,
      prod_done  INTEGER NOT NULL DEFAULT 0,
      money_cost INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Inventário de leis — todas as cartas de lei que uma facção possui.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS law_inventory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      law_id     TEXT    NOT NULL,
      count      INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Leis ativas — uma linha por espaço de lei ocupado de cada facção.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS active_laws (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id    INTEGER NOT NULL,
      owner_code TEXT    NOT NULL,
      quality    TEXT    NOT NULL,
      slot_index INTEGER NOT NULL,
      law_id     TEXT    NOT NULL
    )
  `);

  const cols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(provinces)',
  );
  if (cols.length === 0) {
    await db.execute(`
      CREATE TABLE provinces (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        save_id       INTEGER NOT NULL,
        x             INTEGER NOT NULL,
        y             INTEGER NOT NULL,
        continent     TEXT    NOT NULL,
        name          TEXT    NOT NULL,
        resource      TEXT    NOT NULL,
        owner_code    TEXT,
        is_capital    INTEGER NOT NULL DEFAULT 0,
        manpower_prod INTEGER NOT NULL DEFAULT 0,
        resource_prod INTEGER NOT NULL DEFAULT 0,
        production    INTEGER NOT NULL DEFAULT 0,
        research_prod INTEGER NOT NULL DEFAULT 0,
        culture_prod  INTEGER NOT NULL DEFAULT 0,
        climate       TEXT    NOT NULL DEFAULT 'AMENO',
        seismic       INTEGER NOT NULL DEFAULT 0,
        volcano       INTEGER NOT NULL DEFAULT 0,
        defender_hp   INTEGER NOT NULL DEFAULT 0,
        conquered     INTEGER NOT NULL DEFAULT 0,
        sector        TEXT,
        road          TEXT
      )
    `);
  } else if (!cols.some((c) => c.name === 'save_id')) {
    // Migração: tabela de uma versão sem o conceito de partidas.
    const countRows = await db.select<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM provinces',
    );
    await db.execute('ALTER TABLE provinces ADD COLUMN save_id INTEGER');
    if ((countRows[0]?.n ?? 0) > 0) {
      const now = new Date().toISOString();
      const res = await db.execute(
        'INSERT INTO saves (name, created_at, updated_at) VALUES (?, ?, ?)',
        ['Partida recuperada', now, now],
      );
      await db.execute('UPDATE provinces SET save_id = ? WHERE save_id IS NULL', [
        res.lastInsertId,
      ]);
    }
  }

  // Migração: adiciona as colunas de produção em províncias antigas.
  const provCols = await db.select<{ name: string }[]>(
    'PRAGMA table_info(provinces)',
  );
  const haveProvCol = new Set(provCols.map((c) => c.name));
  for (const col of [
    'manpower_prod',
    'resource_prod',
    'production',
    'research_prod',
    'culture_prod',
    'seismic',
    'volcano',
    'defender_hp',
    'conquered',
  ]) {
    if (!haveProvCol.has(col)) {
      await db.execute(
        `ALTER TABLE provinces ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`,
      );
    }
  }
  if (!haveProvCol.has('climate')) {
    await db.execute(
      "ALTER TABLE provinces ADD COLUMN climate TEXT NOT NULL DEFAULT 'AMENO'",
    );
  }
  // Migração: a coluna do setor do tile (especialização para construções).
  if (!haveProvCol.has('sector')) {
    await db.execute('ALTER TABLE provinces ADD COLUMN sector TEXT');
  }
  // Migração: a coluna da via (estrada/ferrovia) do tile.
  if (!haveProvCol.has('road')) {
    await db.execute('ALTER TABLE provinces ADD COLUMN road TEXT');
  }
  // Migração: o setor residencial foi renomeado para urbano.
  await db.execute(
    "UPDATE provinces SET sector = 'URBANO' WHERE sector = 'RESIDENCIAL'",
  );
}

function rowToProvince(r: ProvinceRow): Province {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    continent: r.continent,
    name: r.name,
    resource: r.resource as ResourceType,
    ownerCode: r.owner_code,
    isCapital: r.is_capital === 1,
    manpowerProduction: r.manpower_prod,
    resourceProduction: r.resource_prod,
    production: r.production,
    researchProduction: r.research_prod,
    cultureProduction: r.culture_prod,
    climate: r.climate as ClimateZone,
    seismic: r.seismic === 1,
    volcano: r.volcano === 1,
    defenderHp: r.defender_hp,
    conquered: r.conquered === 1,
    sector: (r.sector as Sector | null) ?? null,
    road: (r.road as RoadKind | null) ?? null,
  };
}

function rowToFaction(r: FactionRow): FactionState {
  return {
    code: r.code,
    money: r.money,
    influence: r.influence,
    manpower: r.manpower,
    researchPoints: r.research_points,
    culture: r.culture,
    taxLevel: (r.tax_level as TaxLevel) ?? 'MEDIO',
    prosperity: r.prosperity ?? 40,
  };
}

/** Reconstrói a nação personalizada a partir das colunas do save. */
function customNationFromRow(r: SaveRow): Nation | null {
  if (r.player_code !== CUSTOM_NATION_CODE || !r.custom_name) return null;
  return {
    code: CUSTOM_NATION_CODE,
    name: r.custom_name,
    realWorld: 'Nação fundada pelo jogador',
    color: r.custom_color ?? '#8a909a',
    alignment: (r.custom_alignment as AlignmentId) ?? 'INDEPENDENTE',
    continent: r.custom_continent ?? 'N',
    capital: { col: 0, row: 0 },
  };
}

/** Insere todas as províncias de uma partida numa única transação (rápido). */
async function insertProvinces(
  saveId: number,
  provinces: GeneratedProvince[],
): Promise<void> {
  const db = await getDb();
  await db.execute('BEGIN');
  try {
    for (const p of provinces) {
      await db.execute(
        `INSERT INTO provinces
           (save_id, x, y, continent, name, resource, owner_code, is_capital,
            manpower_prod, resource_prod, production, research_prod, culture_prod,
            climate, seismic, volcano, defender_hp, conquered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saveId,
          p.x,
          p.y,
          p.continent,
          p.name,
          p.resource,
          p.ownerCode,
          p.isCapital ? 1 : 0,
          p.manpowerProduction,
          p.resourceProduction,
          p.production,
          p.researchProduction,
          p.cultureProduction,
          p.climate,
          p.seismic ? 1 : 0,
          p.volcano ? 1 : 0,
          p.defenderHp,
          p.conquered ? 1 : 0,
        ],
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Cria as facções de uma partida com os valores iniciais. A **prosperidade**
 * inicial depende do direcionamento político de cada nação.
 */
async function insertFactions(
  saveId: number,
  codes: string[],
  customAlignment: AlignmentId | null,
): Promise<void> {
  const db = await getDb();
  const s = STARTING_FACTION;
  for (const code of codes) {
    const alignment: AlignmentId =
      code === CUSTOM_NATION_CODE
        ? customAlignment ?? 'INDEPENDENTE'
        : NATIONS.find((n) => n.code === code)?.alignment ?? 'INDEPENDENTE';
    await db.execute(
      `INSERT INTO factions
         (save_id, code, money, influence, manpower, research_points, culture,
          tax_level, prosperity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saveId,
        code,
        s.money,
        s.influence,
        s.manpower,
        s.researchPoints,
        s.culture,
        s.taxLevel,
        initialProsperity(alignment),
      ],
    );
  }
}

/**
 * Cria uma **cidade** em cada província-capital de uma partida — capitais já
 * nascem como cidade (`1.000.000` de população, `10` de comida). Se
 * `grantManpower` for `true`, soma também o manpower inicial (1% da população)
 * à facção dona; partidas antigas migradas não recebem esse bônus, pois já
 * têm o manpower do modelo anterior.
 */
async function seedCapitalCities(
  saveId: number,
  provinces: {
    x: number;
    y: number;
    ownerCode: string | null;
    isCapital: boolean;
  }[],
  grantManpower: boolean,
): Promise<void> {
  const db = await getDb();
  const caps = provinces.filter((p) => p.isCapital && p.ownerCode);
  if (caps.length === 0) return;
  const mp = cityManpower(CAPITAL_START_POP);
  await db.execute('BEGIN');
  try {
    for (const p of caps) {
      await db.execute(
        `INSERT INTO cities
           (save_id, x, y, owner_code, is_capital, population, food,
            manpower_cap, founded_turn)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, 1)`,
        [
          saveId,
          p.x,
          p.y,
          p.ownerCode,
          CAPITAL_START_POP,
          CAPITAL_START_FOOD,
          mp,
        ],
      );
      if (grantManpower) {
        await db.execute(
          'UPDATE factions SET manpower = manpower + ? WHERE save_id = ? AND code = ?',
          [mp, saveId, p.ownerCode],
        );
      }
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Migração: partidas anteriores ao sistema de cidades não têm linhas em
 * `cities`. Se for o caso, semeia as cidades nas capitais (sem o bônus de
 * manpower — essas facções já o têm).
 */
async function ensureCapitalCities(
  saveId: number,
  provinces: Province[],
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM cities WHERE save_id = ?',
    [saveId],
  );
  if ((rows[0]?.n ?? 0) > 0) return;
  await seedCapitalCities(saveId, provinces, false);
}

async function readProvinces(saveId: number): Promise<Province[]> {
  const db = await getDb();
  const rows = await db.select<ProvinceRow[]>(
    'SELECT * FROM provinces WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToProvince);
}

/** Marca uma partida como modificada agora (atualiza `updated_at`). */
async function touchSave(saveId: number): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE saves SET updated_at = ? WHERE id = ?', [
    new Date().toISOString(),
    saveId,
  ]);
}

/**
 * Monta a lista de capitais a semear no mapa: as 13 nações fixas e, se o
 * jogador criou a sua própria, uma capital sorteada no continente escolhido.
 */
function buildSeeds(customContinent: string | null): CapitalSeed[] {
  // As capitais das nações fixas são definidas no desenho-base do mapa; aqui
  // são escaladas para o tamanho real do mapa (ver `MAP_SCALE`).
  const seeds: CapitalSeed[] = NATIONS.map((n) => ({
    code: n.code,
    continent: n.continent,
    capital: {
      col: n.capital.col * MAP_SCALE,
      row: n.capital.row * MAP_SCALE,
    },
  }));
  if (customContinent) {
    const cells = continentCells(customContinent);
    const spot = cells[Math.floor(Math.random() * cells.length)];
    seeds.push({
      code: CUSTOM_NATION_CODE,
      continent: customContinent,
      capital: { col: spot.x, row: spot.y },
    });
  }
  return seeds;
}

/**
 * Cria uma nova partida: insere a linha em `saves` (com a nação do jogador),
 * gera o mapa-múndi e grava as províncias. Devolve o `id` da partida.
 */
export async function createGame(
  name: string,
  choice: NewGameChoice,
): Promise<number> {
  await ensureSchema();
  const db = await getDb();
  const now = new Date().toISOString();

  const isCustom = choice.kind === 'custom';
  const playerCode = isCustom ? CUSTOM_NATION_CODE : choice.code;
  const customContinent = isCustom ? choice.continent : null;

  const res = await db.execute(
    `INSERT INTO saves
       (name, created_at, updated_at, player_code,
        custom_name, custom_color, custom_alignment, custom_continent,
        custom_default_law)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      now,
      now,
      playerCode,
      isCustom ? choice.name : null,
      isCustom ? choice.color : null,
      isCustom ? choice.alignment : null,
      customContinent,
      isCustom ? choice.defaultLaw : null,
    ],
  );
  const saveId = res.lastInsertId;
  if (saveId == null) throw new Error('Falha ao criar a partida.');

  const map = generateMap(buildSeeds(customContinent));
  await insertProvinces(saveId, map.provinces);
  const codes = isCustom ? [...NATION_CODES, CUSTOM_NATION_CODE] : NATION_CODES;
  await insertFactions(
    saveId,
    codes,
    isCustom ? choice.alignment : null,
  );
  // Cada capital nasce como cidade e semeia o manpower inicial da facção.
  await seedCapitalCities(saveId, map.provinces, true);
  return saveId;
}

/** Lê os dados de uma partida (sem o mapa). */
export async function getSave(saveId: number): Promise<GameSave> {
  await ensureSchema();
  const db = await getDb();
  const rows = await db.select<SaveRow[]>('SELECT * FROM saves WHERE id = ?', [
    saveId,
  ]);
  const r = rows[0];
  if (!r) throw new Error('Partida não encontrada.');
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    turn: r.turn,
    playerCode: r.player_code,
    customNation: customNationFromRow(r),
  };
}

/** Carrega as províncias de uma partida salva. */
export async function loadMap(saveId: number): Promise<Province[]> {
  await ensureSchema();
  const provinces = await readProvinces(saveId);
  await ensureCapitalCities(saveId, provinces);
  return provinces;
}

/**
 * Carrega as facções de uma partida. Partidas antigas (criadas antes da
 * tabela `factions`) recebem aqui as suas facções com os valores iniciais.
 */
export async function loadFactions(saveId: number): Promise<FactionState[]> {
  await ensureSchema();
  const db = await getDb();
  const save = await getSave(saveId);
  const expected = save.customNation
    ? [...NATION_CODES, CUSTOM_NATION_CODE]
    : NATION_CODES;

  const existing = await db.select<{ code: string }[]>(
    'SELECT code FROM factions WHERE save_id = ?',
    [saveId],
  );
  const have = new Set(existing.map((r) => r.code));
  const missing = expected.filter((c) => !have.has(c));
  if (missing.length > 0) {
    await insertFactions(
      saveId,
      missing,
      save.customNation?.alignment ?? null,
    );
  }

  const rows = await db.select<FactionRow[]>(
    'SELECT * FROM factions WHERE save_id = ?',
    [saveId],
  );
  return rows.map(rowToFaction);
}

/** Define o nível de imposto de uma facção. */
export async function setTaxLevel(
  saveId: number,
  code: string,
  level: TaxLevel,
): Promise<void> {
  await ensureSchema();
  const db = await getDb();
  await db.execute(
    'UPDATE factions SET tax_level = ? WHERE save_id = ? AND code = ?',
    [level, saveId, code],
  );
}

/** Apaga o mapa da partida e gera um novo (botão "Novo mapa"). */
export async function regenerateMap(saveId: number): Promise<Province[]> {
  await ensureSchema();
  const db = await getDb();
  const save = await getSave(saveId);
  await db.execute('DELETE FROM provinces WHERE save_id = ?', [saveId]);
  // Os esquadrões (e as suas tropas e fila) ficavam sobre o mapa antigo.
  await db.execute(
    'DELETE FROM squad_troops WHERE squad_id IN (SELECT id FROM squads WHERE save_id = ?)',
    [saveId],
  );
  await db.execute('DELETE FROM recruit_orders WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM battle_logs WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM city_troops WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM squads WHERE save_id = ?', [saveId]);
  // As cidades, colonos e construções também ficavam sobre o mapa antigo.
  await db.execute('DELETE FROM cities WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM settler_squads WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM constructions WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM construction_orders WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM city_resources WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM road_orders WHERE save_id = ?', [saveId]);
  const map = generateMap(buildSeeds(save.customNation?.continent ?? null));
  await insertProvinces(saveId, map.provinces);
  // As facções são mantidas no "Novo mapa", então as capitais são semeadas
  // sem o bônus de manpower (a facção já o tem).
  await seedCapitalCities(saveId, map.provinces, false);
  await touchSave(saveId);
  return readProvinces(saveId);
}

/** As 8 direções vizinhas de uma célula. */
const NEIGHBORS_8: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * `true` se a cidade tem uma **conexão** de tiles possuídos pela facção até
 * outra cidade da mesma facção. Uma cidade isolada (única da facção) conta
 * como conectada — não há a quem se ligar. Sem conexão, a cidade paga um
 * sobrecusto de comida (ver `advanceTurn`).
 */
function isCityConnected(
  city: City,
  cities: City[],
  ownedTiles: Set<string>,
): boolean {
  const targets = new Set(
    cities
      .filter((c) => c.ownerCode === city.ownerCode && c.id !== city.id)
      .map((c) => `${c.x},${c.y}`),
  );
  if (targets.size === 0) return true;
  const visited = new Set([`${city.x},${city.y}`]);
  const queue: { x: number; y: number }[] = [{ x: city.x, y: city.y }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of NEIGHBORS_8) {
      const k = `${cur.x + dx},${cur.y + dy}`;
      if (visited.has(k) || !ownedTiles.has(k)) continue;
      if (targets.has(k)) return true;
      visited.add(k);
      queue.push({ x: cur.x + dx, y: cur.y + dy });
    }
  }
  return false;
}

/** O que `advanceTurn` devolve: o novo turno e as facções atualizadas. */
export interface TurnResult {
  turn: number;
  factions: FactionState[];
}

/**
 * Avança a partida em um turno:
 *
 * - cada **cidade** processa o seu ciclo: produz/consome **comida**, cresce ou
 *   encolhe de **população**, concede **manpower** à facção (1% da população) e
 *   rende **cultura**, **pesquisa**, **dinheiro** e **recursos** — províncias
 *   sem cidade não produzem nada (ver `cities.ts` e `constructions.ts`);
 * - cada facção paga a **manutenção** do seu exército em **dinheiro** —
 *   esquadrões e tropas de inventário; quem está num tile da própria facção
 *   custa **metade** (ver `squadUpkeepAt`);
 * - a **fila de recrutamento** de cada cidade avança: a produção da província
 *   é gasta no primeiro item da fila e, quando concluído, uma tropa entra no
 *   inventário da cidade ou um colono reforça um esquadrão de colonos no tile;
 * - cada esquadrão parado em **território próprio** recupera vida (comandante
 *   e tropas); os esquadrões que não lutaram nem se moveram recuperam
 *   **moral** (o dobro em território próprio);
 * - todos os esquadrões recuperam os seus **ataques** do turno.
 *
 * As **leis ativas** de cada facção modificam a economia do turno — renda,
 * cultura, pesquisa, manpower, comida, energia, prosperidade, manutenção etc.
 * (ver `loadLawModifiers`).
 */
export async function advanceTurn(saveId: number): Promise<TurnResult> {
  await ensureSchema();
  const db = await getDb();
  const save = await getSave(saveId);
  const provinces = await readProvinces(saveId);
  const factions = await loadFactions(saveId);

  // Modificadores das leis ativas de cada facção (aplicados na economia).
  const lawModByCode = new Map<string, LawModifiers>();
  for (const f of factions) {
    lawModByCode.set(f.code, await loadLawModifiers(saveId, f.code));
  }
  const lawOf = (code: string): LawModifiers =>
    lawModByCode.get(code) ?? emptyLawModifiers();

  // Mapa de células → província, usado na manutenção, no recrutamento e na
  // recuperação dos esquadrões.
  const provByTile = new Map(provinces.map((p) => [`${p.x},${p.y}`, p]));

  // Soma, por facção, a manutenção do exército. Esquadrões e tropas **num
  // tile da própria facção custam metade** (tropas em repouso).
  const squads = await loadSquads(saveId);
  const upkeep = new Map<string, number>();
  for (const s of squads) {
    const prov = provByTile.get(`${s.x},${s.y}`);
    const onOwnTile = !!prov && prov.ownerCode === s.ownerCode;
    upkeep.set(
      s.ownerCode,
      (upkeep.get(s.ownerCode) ?? 0) + squadUpkeepAt(s, onOwnTile),
    );
  }
  // As tropas guardadas no inventário das cidades custam metade da manutenção.
  const cityTroopRows = await db.select<
    { owner_code: string; kind: string }[]
  >('SELECT owner_code, kind FROM city_troops WHERE save_id = ?', [saveId]);
  for (const r of cityTroopRows) {
    const cost = Math.round(TROOP_TYPES[r.kind as TroopKind].upkeep / 2);
    upkeep.set(r.owner_code, (upkeep.get(r.owner_code) ?? 0) + cost);
  }
  // Leis podem baratear ou encarecer a manutenção do exército.
  for (const [code, raw] of [...upkeep]) {
    const m = lawOf(code).TROOP_UPKEEP_PCT;
    if (m !== 0) upkeep.set(code, Math.round(raw * (1 + m / 100)));
  }

  // ===== Cidades, construções e economia =====
  const cities = await loadCities(saveId);
  const constructions = await loadConstructions(saveId);
  const constructionOrders = await loadConstructionOrders(saveId);
  const cityResources = await loadCityResources(saveId);
  const factionByCode = new Map(factions.map((f) => [f.code, f]));

  // Direcionamento político de cada facção (define economia e impostos).
  const alignmentByCode = new Map<string, AlignmentId>();
  for (const n of NATIONS) alignmentByCode.set(n.code, n.alignment);
  if (save.customNation) {
    alignmentByCode.set(save.customNation.code, save.customNation.alignment);
  }
  const alignOf = (code: string): AlignmentId =>
    alignmentByCode.get(code) ?? 'INDEPENDENTE';

  // Manutenção das construções erguidas — somada ao custo do exército, já com
  // o desconto de manutenção do direcionamento (comunismo −20%, estados
  // independentes −15%).
  const consUpkeepRaw = new Map<string, number>();
  for (const con of constructions) {
    consUpkeepRaw.set(
      con.ownerCode,
      (consUpkeepRaw.get(con.ownerCode) ?? 0) + CONSTRUCTIONS[con.kind].upkeep,
    );
  }
  for (const [code, raw] of consUpkeepRaw) {
    const mult = ALIGNMENT_ECONOMY[alignOf(code)].upkeepMult;
    const lawMult = 1 + lawOf(code).CONSTRUCTION_UPKEEP_PCT / 100;
    upkeep.set(
      code,
      (upkeep.get(code) ?? 0) + Math.round(raw * mult * lawMult),
    );
  }

  // Bônus de ganhos (Banco/Bolsa/Agência bancária) de cada facção.
  const bonusByFaction = new Map<string, ReturnType<typeof areaBonus>>();
  for (const f of factions) {
    const fc = constructions.filter((x) => x.ownerCode === f.code);
    bonusByFaction.set(
      f.code,
      areaBonus(
        alignOf(f.code),
        fc.some((x) => x.kind === 'BANCO'),
        fc.some((x) => x.kind === 'BOLSA'),
        fc.filter((x) => x.kind === 'AGENCIA_BANCARIA').length,
      ),
    );
  }

  // Construções agrupadas pela cidade dona (em ordem de construção).
  const consByCity = new Map<string, Construction[]>();
  for (const con of constructions) {
    const k = `${con.cityX},${con.cityY}`;
    const list = consByCity.get(k);
    if (list) list.push(con);
    else consByCity.set(k, [con]);
  }

  // Inventário de recursos atual de cada cidade e os tiles que já têm linha.
  const invByCity = new Map<string, Map<string, number>>();
  const existingResKeys = new Set<string>();
  for (const r of cityResources) {
    const k = `${r.x},${r.y}`;
    let inv = invByCity.get(k);
    if (!inv) {
      inv = new Map<string, number>();
      invByCity.set(k, inv);
    }
    inv.set(r.resource, r.amount);
    existingResKeys.add(`${k},${r.resource}`);
  }

  // Pré-cálculo de cada cidade: produtividade, comida, dinheiro, cultura,
  // teto de população e o estoque de recursos após coleta/consumo.
  interface CityCalc {
    effProduction: number;
    foodProduction: number;
    foodCapacity: number;
    moneyGain: number;
    cultureGain: number;
    researchGain: number;
    happiness: number;
    popCapBonus: number;
    /** Recursos tocados (coletados/consumidos) → quantidade final no estoque. */
    resourceFinal: Map<string, number>;
  }
  const cityCalc = new Map<string, CityCalc>();
  for (const c of cities) {
    const k = `${c.x},${c.y}`;
    const align = alignOf(c.ownerCode);
    const lm = lawOf(c.ownerCode);
    const factory = FACTORY_BY_ALIGNMENT[align];
    const econ = ALIGNMENT_ECONOMY[align];
    const bonus = bonusByFaction.get(c.ownerCode) ?? {
      commercial: 0,
      industrial: 0,
    };
    const cons = consByCity.get(k) ?? [];
    const inv = invByCity.get(k) ?? new Map<string, number>();

    let factories = 0;
    let granaries = 0;
    let armazens = 0;
    let foodProduction = cityFoodProduction(c);
    let cultureGain = cityBaseCulture(c);
    // Pesquisa: as cidades dos estados independentes a geram passivamente.
    let researchGain = align === 'INDEPENDENTE' ? INDEPENDENT_CITY_RESEARCH : 0;
    let happinessBonus = 0;
    let popCapBonus = 0;
    let commercialMoney = 0;
    const collected = new Map<string, number>();
    // A cidade extrai um pouco do recurso local do seu próprio tile.
    const cityProv = provByTile.get(k);
    if (cityProv && cityProv.resource !== ResourceType.TERRAS_AGRICOLAS) {
      const rare = resourceInfo(cityProv.resource).tier === 'RARO';
      const yield_ = cityResourceYield(c.isCapital, rare);
      if (yield_ > 0) {
        collected.set(cityProv.resource, yield_);
      }
    }
    for (const con of cons) {
      const def = CONSTRUCTIONS[con.kind];
      if (con.kind === 'FABRICA') factories++;
      else if (con.kind === 'CELEIRO') granaries++;
      else if (con.kind === 'ARMAZEM') armazens++;
      else if (con.kind === 'FAZENDA') {
        const prov = provByTile.get(`${con.x},${con.y}`);
        if (prov) foodProduction += farmFood(prov);
      } else if (con.kind === 'PASTO') {
        foodProduction += pastureFood(con.variant);
        if (con.variant === 'GADO') {
          collected.set('COURO', (collected.get('COURO') ?? 0) + PASTURE_PRODUCT_OUTPUT);
        } else if (con.variant === 'OVELHA') {
          collected.set('LA', (collected.get('LA') ?? 0) + PASTURE_PRODUCT_OUTPUT);
        }
      } else if (con.kind === 'MINA') {
        const prov = provByTile.get(`${con.x},${con.y}`);
        if (prov) {
          // As leis podem reforçar (ou restringir) a coleta das minas.
          const mined = Math.round(
            mineOutput(prov.resource) * (1 + lm.MINE_PCT / 100),
          );
          collected.set(
            prov.resource,
            (collected.get(prov.resource) ?? 0) + mined,
          );
        }
      } else if (def.collects) {
        collected.set(
          def.collects.resource,
          (collected.get(def.collects.resource) ?? 0) + def.collects.amount,
        );
      }
      if (con.kind === 'CONJUNTO' || con.kind === 'AREA_URBANA') {
        popCapBonus += constructionPopCap(con.kind, align);
      }
      if (con.kind === 'MUSEU' || con.kind === 'TEATRO') {
        cultureGain += def.culturePerTurn ?? 0;
      }
      researchGain += def.researchPerTurn ?? 0;
      happinessBonus += def.happiness ?? 0;
      commercialMoney += constructionMoneyPerTurn(con.kind, align);
    }

    // Coleta de recursos → estoque, respeitando os tetos (com os armazéns).
    const resourceFinal = new Map<string, number>();
    for (const [res, amt] of collected) {
      const cap = Math.round(
        resourceCapacity(res, armazens) * (1 + lm.STORAGE_PCT / 100),
      );
      const final = Math.min(cap, (inv.get(res) ?? 0) + amt);
      inv.set(res, final);
      resourceFinal.set(res, final);
    }
    // Usinas consomem combustível do estoque e geram energia.
    let energy = 0;
    for (const con of cons) {
      const def = CONSTRUCTIONS[con.kind];
      if (!def.fuel || def.energyOutput == null) continue;
      const have = inv.get(def.fuel.resource) ?? 0;
      if (have >= def.fuel.amount) {
        const left = have - def.fuel.amount;
        inv.set(def.fuel.resource, left);
        resourceFinal.set(def.fuel.resource, left);
        energy += def.energyOutput;
      }
    }
    // As leis podem reforçar ou racionar a energia gerada pelas usinas.
    if (energy > 0 && lm.ENERGY_PCT !== 0) {
      energy = Math.max(0, Math.round(energy * (1 + lm.ENERGY_PCT / 100)));
    }
    // Consumidores de energia atendidos por ordem de construção.
    for (const con of cons) {
      const def = CONSTRUCTIONS[con.kind];
      if (def.energyCost == null) continue;
      if (energy >= def.energyCost) {
        energy -= def.energyCost;
        cultureGain += def.culturePerTurn ?? 0;
      }
    }

    const effProduction = Math.round(
      (cityProduction(c) + factories * factory.productivity) *
        (1 + lm.PRODUCTION_PCT / 100),
    );
    const foodCapacity = cityFoodCapacity(c, granaries);
    const tax = clampTax(
      factionByCode.get(c.ownerCode)?.taxLevel ?? 'MEDIO',
      align,
    );
    // A prosperidade multiplica a renda de impostos e de zonas comerciais.
    const prosMult = prosperityIncomeMultiplier(
      factionByCode.get(c.ownerCode)?.prosperity ?? 40,
    );
    const moneyGain =
      Math.round(
        cityTaxIncome(c.population, tax, align) *
          prosMult *
          (1 + lm.TAX_PCT / 100),
      ) +
      Math.round(
        factories *
          factory.money *
          econ.industrialMult *
          (1 + bonus.industrial) *
          (1 + lm.FACTORY_PCT / 100),
      ) +
      Math.round(
        commercialMoney *
          econ.commercialMult *
          (1 + bonus.commercial) *
          prosMult *
          (1 + lm.COMMERCIAL_PCT / 100),
      );

    cityCalc.set(k, {
      effProduction,
      foodProduction: Math.round(foodProduction * (1 + lm.FOOD_PCT / 100)),
      foodCapacity,
      moneyGain,
      cultureGain: Math.round(cultureGain * (1 + lm.CULTURE_PCT / 100)),
      researchGain: Math.round(researchGain * (1 + lm.RESEARCH_PCT / 100)),
      happiness: cityHappiness(tax, happinessBonus + lm.HAPPINESS_FLAT),
      popCapBonus,
      resourceFinal,
    });
  }

  // Felicidade da facção = média da felicidade das suas cidades (sem cidades,
  // a base do imposto).
  const factionHappiness = new Map<string, number>();
  {
    const sum = new Map<string, number>();
    const count = new Map<string, number>();
    for (const c of cities) {
      const h = cityCalc.get(`${c.x},${c.y}`)?.happiness ?? 0;
      sum.set(c.ownerCode, (sum.get(c.ownerCode) ?? 0) + h);
      count.set(c.ownerCode, (count.get(c.ownerCode) ?? 0) + 1);
    }
    for (const f of factions) {
      const n = count.get(f.code) ?? 0;
      factionHappiness.set(
        f.code,
        n > 0
          ? (sum.get(f.code) ?? 0) / n
          : happinessFor(clampTax(f.taxLevel, alignOf(f.code))),
      );
    }
  }
  /** Produção efetiva de uma cidade (base + população + zonas de fábrica). */
  const effProdAt = (k: string): number => cityCalc.get(k)?.effProduction ?? 0;

  // Processa a fila de recrutamento (tropas/colonos) — uma por cidade. Avança
  // a primeira ordem pela produção efetiva da cidade.
  const orders = await loadRecruitOrders(saveId);
  const frontByTile = new Map<string, RecruitOrder>();
  for (const o of orders) {
    const k = `${o.x},${o.y}`;
    if (!frontByTile.has(k)) frontByTile.set(k, o); // 1ª da fila (ordenada por id)
  }
  const orderProgress: { id: number; prodDone: number }[] = [];
  const finishedOrders: number[] = [];
  const newTroops: {
    x: number;
    y: number;
    ownerCode: string;
    kind: TroopKind;
  }[] = [];
  // Colonos concluídos viram (ou reforçam) um esquadrão de colonos no tile.
  const newColonos: { x: number; y: number; ownerCode: string }[] = [];
  for (const [k, front] of frontByTile) {
    if (!provByTile.get(k)) continue;
    const done = front.prodDone + effProdAt(k);
    if (done >= front.prodCost) {
      finishedOrders.push(front.id);
      if (front.kind === 'COLONO') {
        newColonos.push({ x: front.x, y: front.y, ownerCode: front.ownerCode });
      } else {
        newTroops.push({
          x: front.x,
          y: front.y,
          ownerCode: front.ownerCode,
          kind: front.kind,
        });
      }
    } else {
      orderProgress.push({ id: front.id, prodDone: done });
    }
  }

  // Processa a fila de construção — uma por cidade, em paralelo à de tropas.
  const cFrontByCity = new Map<string, ConstructionOrder>();
  for (const o of constructionOrders) {
    const k = `${o.cityX},${o.cityY}`;
    if (!cFrontByCity.has(k)) cFrontByCity.set(k, o);
  }
  const cOrderProgress: { id: number; prodDone: number }[] = [];
  const cFinished: number[] = [];
  const newConstructions: {
    x: number;
    y: number;
    cityX: number;
    cityY: number;
    ownerCode: string;
    kind: string;
    variant: string | null;
  }[] = [];
  for (const [k, front] of cFrontByCity) {
    const done = front.prodDone + effProdAt(k);
    if (done >= front.prodCost) {
      cFinished.push(front.id);
      newConstructions.push({
        x: front.targetX,
        y: front.targetY,
        cityX: front.cityX,
        cityY: front.cityY,
        ownerCode: front.ownerCode,
        kind: front.kind,
        variant: front.variant,
      });
    } else {
      cOrderProgress.push({ id: front.id, prodDone: done });
    }
  }

  // Processa a fila de estradas — uma por cidade, em paralelo às outras.
  const roadOrders = await loadRoadOrders(saveId);
  const rFrontByCity = new Map<string, RoadOrder>();
  for (const o of roadOrders) {
    const k = `${o.cityX},${o.cityY}`;
    if (!rFrontByCity.has(k)) rFrontByCity.set(k, o);
  }
  const rOrderProgress: { id: number; prodDone: number }[] = [];
  const rFinished: number[] = [];
  const newRoads: { kind: RoadKind; path: { x: number; y: number }[] }[] = [];
  for (const [k, front] of rFrontByCity) {
    const done = front.prodDone + effProdAt(k);
    if (done >= front.prodCost) {
      rFinished.push(front.id);
      newRoads.push({ kind: front.kind, path: front.path });
    } else {
      rOrderProgress.push({ id: front.id, prodDone: done });
    }
  }

  // Ciclo de turno das cidades: comida, crescimento da população e manpower.
  const ownedTilesByFaction = new Map<string, Set<string>>();
  for (const p of provinces) {
    if (!p.ownerCode) continue;
    let set = ownedTilesByFaction.get(p.ownerCode);
    if (!set) {
      set = new Set<string>();
      ownedTilesByFaction.set(p.ownerCode, set);
    }
    set.add(`${p.x},${p.y}`);
  }
  const cityUpdates: {
    id: number;
    population: number;
    food: number;
    manpowerCap: number;
  }[] = [];
  /** Manpower que as cidades concedem à facção neste turno (crescimento). */
  const cityManpowerGain = new Map<string, number>();
  /** Dinheiro que as cidades rendem à facção neste turno. */
  const cityMoneyGain = new Map<string, number>();
  /** Cultura que as cidades rendem à facção neste turno. */
  const cityCultureGain = new Map<string, number>();
  /** Pesquisa que as cidades rendem à facção neste turno. */
  const cityResearchGain = new Map<string, number>();
  for (const c of cities) {
    const calc = cityCalc.get(`${c.x},${c.y}`)!;
    const lm = lawOf(c.ownerCode);
    cityMoneyGain.set(
      c.ownerCode,
      (cityMoneyGain.get(c.ownerCode) ?? 0) + calc.moneyGain,
    );
    cityCultureGain.set(
      c.ownerCode,
      (cityCultureGain.get(c.ownerCode) ?? 0) + calc.cultureGain,
    );
    cityResearchGain.set(
      c.ownerCode,
      (cityResearchGain.get(c.ownerCode) ?? 0) + calc.researchGain,
    );
    const prod = calc.foodProduction;
    let cons = cityFoodConsumption(c.population);
    // Cidade comum sem conexão à facção paga +30% de comida.
    if (
      !c.isCapital &&
      !isCityConnected(c, cities, ownedTilesByFaction.get(c.ownerCode) ?? new Set())
    ) {
      cons = Math.ceil(cons * DISCONNECT_FOOD_PENALTY);
    }
    let food = Math.min(calc.foodCapacity, c.food + prod);
    let population = c.population;
    // A felicidade da cidade acelera/freia o crescimento e o decaimento.
    const happMod = happinessGrowthModifier(calc.happiness);
    if (food >= cons) {
      food -= cons;
      // Cada ponto de comida em excedente faz a população crescer 1% — a
      // felicidade amplia (ou reduz) esse crescimento.
      const surplus = prod - cons;
      if (surplus > 0) {
        const growth =
          population *
          (surplus / 100) *
          (1 + happMod) *
          (1 + lm.POP_GROWTH_PCT / 100);
        population = Math.round(population + growth);
      }
    } else {
      // Sem comida para o mínimo: a cidade perde 3% da população — a felicidade
      // alta freia a perda, a baixa a acelera.
      food = 0;
      const loss = population * STARVATION_LOSS * (1 - happMod);
      population = Math.max(0, Math.round(population - loss));
    }
    // A população não cresce além do teto da cidade (+ conjuntos/áreas urbanas
    // e os modificadores de teto das leis).
    population = Math.min(
      Math.round(
        (cityPopCap(c) + calc.popCapBonus) * (1 + lm.POP_CAP_PCT / 100),
      ),
      population,
    );
    // Manpower é uma catraca: 1% da população, e só sobe quando ela cresce.
    let manpowerCap = c.manpowerCap;
    const newCap = cityManpower(population);
    if (newCap > manpowerCap) {
      cityManpowerGain.set(
        c.ownerCode,
        (cityManpowerGain.get(c.ownerCode) ?? 0) + (newCap - manpowerCap),
      );
      manpowerCap = newCap;
    }
    cityUpdates.push({ id: c.id, population, food, manpowerCap });
  }

  // Recuperação por turno dos esquadrões:
  // - vida: só em território da própria facção (comandante e tropas);
  // - moral: para esquadrões parados (sem lutar nem mover), +5% — o dobro se
  //   estiverem num tile da própria facção.
  const cmdHeal: { id: number; hp: number }[] = [];
  const troopHeal: { id: number; hp: number }[] = [];
  const moralRegen: { id: number; moral: number }[] = [];
  for (const s of squads) {
    const prov = provByTile.get(`${s.x},${s.y}`);
    const onOwnTile = !!prov && prov.ownerCode === s.ownerCode;
    if (onOwnTile) {
      const newCmdHp = Math.min(
        s.commander.maxHp,
        s.commander.hp + HP_REGEN_PER_TURN,
      );
      if (newCmdHp !== s.commander.hp) cmdHeal.push({ id: s.id, hp: newCmdHp });
      for (const t of s.troops) {
        const newHp = Math.min(t.maxHp, t.hp + HP_REGEN_PER_TURN);
        if (newHp !== t.hp) troopHeal.push({ id: t.id, hp: newHp });
      }
    }
    const idle = s.lastMovedTurn !== save.turn && s.attacksUsed === 0;
    if (idle) {
      const gain = onOwnTile ? MORAL_REGEN_OWN_TILE : MORAL_REGEN;
      const newMoral = Math.min(MORAL_MAX, s.moral + gain);
      if (newMoral !== s.moral) moralRegen.push({ id: s.id, moral: newMoral });
    }
  }

  // Boost de prosperidade das cidades ligadas por estrada/ferrovia.
  const allRoadTiles = new Set<string>();
  const railTiles = new Set<string>();
  for (const p of provinces) {
    if (!p.road) continue;
    allRoadTiles.add(`${p.x},${p.y}`);
    if (p.road === 'RAIL') railTiles.add(`${p.x},${p.y}`);
  }
  const roadConn = connectedCities(cities, allRoadTiles);
  const railConn = connectedCities(cities, railTiles);
  const roadProsperity = new Map<string, number>();
  for (const c of cities) {
    const k = `${c.x},${c.y}`;
    const b = railConn.has(k)
      ? RAIL_PROSPERITY
      : roadConn.has(k)
        ? ROAD_PROSPERITY
        : 0;
    if (b > 0) {
      roadProsperity.set(c.ownerCode, (roadProsperity.get(c.ownerCode) ?? 0) + b);
    }
  }

  // Prosperidade de cada facção: cresce devagar (mais rápido com imposto baixo
  // e com construções/estradas) e decai se ficar acima do teto.
  const prosperityNext = new Map<string, number>();
  for (const f of factions) {
    const align = alignOf(f.code);
    const tax = clampTax(f.taxLevel, align);
    const cap = prosperityCap(
      align,
      factionHappiness.get(f.code) ?? happinessFor(tax),
    );
    let consBonus = roadProsperity.get(f.code) ?? 0;
    for (const con of constructions) {
      if (con.ownerCode === f.code) {
        consBonus += CONSTRUCTIONS[con.kind].prosperityGrowth ?? 0;
      }
    }
    let p = f.prosperity;
    if (p > cap) {
      p = Math.max(cap, p - PROSPERITY_DECAY);
    } else {
      const growth =
        PROSPERITY_BASE_GROWTH * prosperityGrowthMult(tax) * (1 + consBonus) +
        lawOf(f.code).PROSPERITY_GROWTH_FLAT;
      p = Math.min(cap, Math.max(PROSPERITY_MIN, p + growth));
    }
    prosperityNext.set(f.code, p);
  }

  // População total de cada facção — base do custo da Lei de Seguridade Social.
  const factionPop = new Map<string, number>();
  for (const c of cities) {
    factionPop.set(
      c.ownerCode,
      (factionPop.get(c.ownerCode) ?? 0) + c.population,
    );
  }

  const turn = save.turn + 1;
  await db.execute('BEGIN');
  try {
    for (const f of factions) {
      const lm = lawOf(f.code);
      const up = upkeep.get(f.code) ?? 0;
      // Manpower vem do crescimento das cidades, ajustado pelas leis.
      const mpGain = Math.round(
        (cityManpowerGain.get(f.code) ?? 0) * (1 + lm.MANPOWER_PCT / 100),
      );
      // Custo por turno da seguridade social — cresce com a população.
      const welfare = Math.round(
        (lm.WELFARE_PER_100K * (factionPop.get(f.code) ?? 0)) / 100_000,
      );
      // Renda das cidades + dinheiro fixo das leis (e o custo da seguridade).
      const income =
        (cityMoneyGain.get(f.code) ?? 0) + lm.MONEY_FLAT + welfare;
      const cultureGain = cityCultureGain.get(f.code) ?? 0;
      const researchGain = cityResearchGain.get(f.code) ?? 0;
      // Cultura e pesquisa vêm das cidades (base + construções).
      f.culture += cultureGain;
      f.researchPoints += researchGain;
      f.manpower += mpGain;
      // A influência vem das leis (ex.: Lei do Corpo Diplomático).
      f.influence += lm.INFLUENCE_FLAT;
      // Renda das cidades menos a manutenção; o dinheiro não fica negativo.
      f.money = Math.max(0, f.money + income - up);
      f.prosperity = prosperityNext.get(f.code) ?? f.prosperity;
      await db.execute(
        `UPDATE factions SET money = ?, influence = ?, manpower = ?,
           research_points = ?, culture = ?, prosperity = ?
         WHERE save_id = ? AND code = ?`,
        [
          f.money,
          f.influence,
          f.manpower,
          f.researchPoints,
          f.culture,
          f.prosperity,
          saveId,
          f.code,
        ],
      );
    }
    // Aplica o ciclo de turno das cidades (comida, população, manpower-teto).
    for (const u of cityUpdates) {
      await db.execute(
        'UPDATE cities SET population = ?, food = ?, manpower_cap = ? WHERE id = ?',
        [u.population, u.food, u.manpowerCap, u.id],
      );
    }
    // Avança / conclui a fila de recrutamento.
    for (const u of orderProgress) {
      await db.execute('UPDATE recruit_orders SET prod_done = ? WHERE id = ?', [
        u.prodDone,
        u.id,
      ]);
    }
    for (const id of finishedOrders) {
      await db.execute('DELETE FROM recruit_orders WHERE id = ?', [id]);
    }
    for (const t of newTroops) {
      const troop = TROOP_TYPES[t.kind];
      // Tropa formada numa cidade com Quartel nasce já com experiência.
      const hasBarracks = (consByCity.get(`${t.x},${t.y}`) ?? []).some(
        (con) => con.kind === 'BARRACKS',
      );
      const xp = hasBarracks ? BARRACKS_TROOP_XP : 0;
      await db.execute(
        `INSERT INTO city_troops (save_id, x, y, owner_code, kind, hp, max_hp, xp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saveId, t.x, t.y, t.ownerCode, t.kind, troop.hp, troop.hp, xp],
      );
    }
    // Colonos concluídos entram num esquadrão de colonos do tile (criando um
    // novo, ou reforçando o que a facção já tiver ali).
    for (const c of newColonos) {
      const existing = await db.select<{ id: number }[]>(
        `SELECT id FROM settler_squads
          WHERE save_id = ? AND owner_code = ? AND x = ? AND y = ? LIMIT 1`,
        [saveId, c.ownerCode, c.x, c.y],
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
          [saveId, c.ownerCode, c.x, c.y, turn],
        );
      }
    }
    // Avança / conclui a fila de construção de cada cidade.
    for (const u of cOrderProgress) {
      await db.execute(
        'UPDATE construction_orders SET prod_done = ? WHERE id = ?',
        [u.prodDone, u.id],
      );
    }
    for (const id of cFinished) {
      await db.execute('DELETE FROM construction_orders WHERE id = ?', [id]);
    }
    for (const nc of newConstructions) {
      await db.execute(
        `INSERT INTO constructions
           (save_id, x, y, city_x, city_y, owner_code, kind, variant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saveId, nc.x, nc.y, nc.cityX, nc.cityY, nc.ownerCode, nc.kind, nc.variant],
      );
    }
    // Avança / conclui a fila de estradas — os tiles do caminho viram via.
    for (const u of rOrderProgress) {
      await db.execute('UPDATE road_orders SET prod_done = ? WHERE id = ?', [
        u.prodDone,
        u.id,
      ]);
    }
    for (const id of rFinished) {
      await db.execute('DELETE FROM road_orders WHERE id = ?', [id]);
    }
    for (const r of newRoads) {
      for (const tile of r.path) {
        await db.execute(
          'UPDATE provinces SET road = ? WHERE save_id = ? AND x = ? AND y = ?',
          [r.kind, saveId, tile.x, tile.y],
        );
      }
    }
    // Grava o estoque de recursos das cidades após coleta e consumo.
    for (const c of cities) {
      const finalMap = cityCalc.get(`${c.x},${c.y}`)?.resourceFinal;
      if (!finalMap || finalMap.size === 0) continue;
      for (const [resource, amount] of finalMap) {
        if (existingResKeys.has(`${c.x},${c.y},${resource}`)) {
          await db.execute(
            `UPDATE city_resources SET amount = ?
              WHERE save_id = ? AND x = ? AND y = ? AND resource = ?`,
            [amount, saveId, c.x, c.y, resource],
          );
        } else if (amount > 0) {
          await db.execute(
            `INSERT INTO city_resources (save_id, x, y, resource, amount)
             VALUES (?, ?, ?, ?, ?)`,
            [saveId, c.x, c.y, resource, amount],
          );
        }
      }
    }
    // Recupera a vida dos esquadrões em território próprio.
    for (const h of cmdHeal) {
      await db.execute('UPDATE squads SET cmd_hp = ? WHERE id = ?', [
        h.hp,
        h.id,
      ]);
    }
    for (const h of troopHeal) {
      await db.execute('UPDATE squad_troops SET hp = ? WHERE id = ?', [
        h.hp,
        h.id,
      ]);
    }
    for (const m of moralRegen) {
      await db.execute('UPDATE squads SET moral = ? WHERE id = ?', [
        m.moral,
        m.id,
      ]);
    }
    // Devolve a todos os esquadrões os seus ataques e movimentos do turno.
    await db.execute(
      'UPDATE squads SET attacks_used = 0, moves_used = 0, move_allowance = 1 WHERE save_id = ?',
      [saveId],
    );
    await db.execute('UPDATE saves SET turn = ?, updated_at = ? WHERE id = ?', [
      turn,
      new Date().toISOString(),
      saveId,
    ]);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }

  return { turn, factions };
}

/**
 * Toma um território neutro já **sem defensores**: ele passa a pertencer à
 * facção. Se `devastate` for `true`, o território é **arrasado** — toda a sua
 * produção por turno (manpower, recurso, produção, pesquisa e cultura) é
 * zerada. Devolve a província atualizada.
 */
export async function takeTerritory(
  provinceId: number,
  ownerCode: string,
  devastate: boolean,
): Promise<Province> {
  await ensureSchema();
  const db = await getDb();
  if (devastate) {
    await db.execute(
      `UPDATE provinces
         SET owner_code = ?, defender_hp = 0,
             manpower_prod = 0, resource_prod = 0, production = 0,
             research_prod = 0, culture_prod = 0
       WHERE id = ?`,
      [ownerCode, provinceId],
    );
  } else {
    await db.execute(
      'UPDATE provinces SET owner_code = ?, defender_hp = 0 WHERE id = ?',
      [ownerCode, provinceId],
    );
  }
  const rows = await db.select<ProvinceRow[]>(
    'SELECT * FROM provinces WHERE id = ?',
    [provinceId],
  );
  return rowToProvince(rows[0]);
}
