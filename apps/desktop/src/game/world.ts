import { getDb } from '../db';
import {
  generateMap,
  GeneratedProvince,
  CapitalSeed,
  continentCells,
} from './map-generator';
import { NATIONS, NATION_CODES, Nation, CUSTOM_NATION_CODE } from './nations';
import { AlignmentId } from './alignments';
import { ResourceType } from './enums';
import {
  FactionState,
  STARTING_FACTION,
  TerritoryProduction,
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
  type RecruitOrder,
  type TroopKind,
} from './squads';
import {
  cityFoodConsumption,
  cityFoodProduction,
  cityManpower,
  cityStorage,
  loadCities,
  CAPITAL_START_FOOD,
  CAPITAL_START_POP,
  DISCONNECT_FOOD_PENALTY,
  STARVATION_LOSS,
  type City,
} from './cities';

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
}

interface FactionRow {
  code: string;
  money: number;
  influence: number;
  manpower: number;
  research_points: number;
  culture: number;
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
      player_code      TEXT,
      custom_name      TEXT,
      custom_color     TEXT,
      custom_alignment TEXT,
      custom_continent TEXT
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
      culture         INTEGER NOT NULL DEFAULT 0
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
      name            TEXT
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
      prod_done  INTEGER NOT NULL DEFAULT 0
    )
  `);

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
      founded_turn INTEGER NOT NULL DEFAULT 1
    )
  `);

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
        conquered     INTEGER NOT NULL DEFAULT 0
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

/** Cria as facções de uma partida, todas com os valores iniciais padrão. */
async function insertFactions(saveId: number, codes: string[]): Promise<void> {
  const db = await getDb();
  const s = STARTING_FACTION;
  for (const code of codes) {
    await db.execute(
      `INSERT INTO factions
         (save_id, code, money, influence, manpower, research_points, culture)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        saveId,
        code,
        s.money,
        s.influence,
        s.manpower,
        s.researchPoints,
        s.culture,
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
  const seeds: CapitalSeed[] = [...NATIONS];
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
        custom_name, custom_color, custom_alignment, custom_continent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      now,
      now,
      playerCode,
      isCustom ? choice.name : null,
      isCustom ? choice.color : null,
      isCustom ? choice.alignment : null,
      customContinent,
    ],
  );
  const saveId = res.lastInsertId;
  if (saveId == null) throw new Error('Falha ao criar a partida.');

  const map = generateMap(buildSeeds(customContinent));
  await insertProvinces(saveId, map.provinces);
  const codes = isCustom ? [...NATION_CODES, CUSTOM_NATION_CODE] : NATION_CODES;
  await insertFactions(saveId, codes);
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
  if (missing.length > 0) await insertFactions(saveId, missing);

  const rows = await db.select<FactionRow[]>(
    'SELECT * FROM factions WHERE save_id = ?',
    [saveId],
  );
  return rows.map(rowToFaction);
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
  // As cidades e os esquadrões de colonos também ficavam sobre o mapa antigo.
  await db.execute('DELETE FROM cities WHERE save_id = ?', [saveId]);
  await db.execute('DELETE FROM settler_squads WHERE save_id = ?', [saveId]);
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
 * - cada facção recebe os **pontos de pesquisa** e a **cultura** produzidos
 *   pelas suas províncias (as capitais produzem o dobro — ver `map-generator`);
 * - cada **cidade** processa o seu ciclo: produz/consome **comida**, cresce ou
 *   encolhe de **população** e concede **manpower** à facção (1% da população,
 *   só quando a população cresce — ver `cities.ts`);
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
 * A influência ainda não tem fonte de produção, então não muda.
 */
export async function advanceTurn(saveId: number): Promise<TurnResult> {
  await ensureSchema();
  const db = await getDb();
  const save = await getSave(saveId);
  const provinces = await readProvinces(saveId);
  const factions = await loadFactions(saveId);

  // Soma, por facção, a pesquisa e a cultura das suas províncias. O manpower
  // **não** vem mais das províncias — agora é gerado pelas cidades.
  const gain = new Map<string, { research: number; culture: number }>();
  for (const p of provinces) {
    if (!p.ownerCode) continue;
    const g = gain.get(p.ownerCode) ?? { research: 0, culture: 0 };
    g.research += p.researchProduction;
    g.culture += p.cultureProduction;
    gain.set(p.ownerCode, g);
  }

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

  // Processa a fila de recrutamento: a produção de cada cidade avança a
  // primeira ordem da sua fila; a tropa concluída entra no inventário da
  // cidade (ver `city_troops`).
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
    const prov = provByTile.get(k);
    if (!prov) continue;
    const done = front.prodDone + prov.production;
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

  // Ciclo de turno das cidades: comida, crescimento da população e manpower.
  const cities = await loadCities(saveId);
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
  for (const c of cities) {
    const prod = cityFoodProduction(c);
    let cons = cityFoodConsumption(c.population);
    // Cidade comum sem conexão à facção paga +30% de comida.
    if (
      !c.isCapital &&
      !isCityConnected(c, cities, ownedTilesByFaction.get(c.ownerCode) ?? new Set())
    ) {
      cons = Math.ceil(cons * DISCONNECT_FOOD_PENALTY);
    }
    let food = Math.min(cityStorage(c), c.food + prod);
    let population = c.population;
    if (food >= cons) {
      food -= cons;
      // Cada ponto de comida em excedente faz a população crescer 1%.
      const surplus = prod - cons;
      if (surplus > 0) {
        population = Math.round(population * (1 + surplus / 100));
      }
    } else {
      // Sem comida para o mínimo: a cidade perde 3% da população.
      food = 0;
      population = Math.round(population * (1 - STARVATION_LOSS));
    }
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

  const turn = save.turn + 1;
  await db.execute('BEGIN');
  try {
    for (const f of factions) {
      const g = gain.get(f.code);
      const up = upkeep.get(f.code) ?? 0;
      const mpGain = cityManpowerGain.get(f.code) ?? 0;
      if (!g && !up && !mpGain) continue;
      if (g) {
        f.researchPoints += g.research;
        f.culture += g.culture;
      }
      // Manpower vem do crescimento das cidades (1% da nova população).
      f.manpower += mpGain;
      // O dinheiro não pode ficar negativo: a manutenção é limitada ao caixa.
      if (up) f.money = Math.max(0, f.money - up);
      await db.execute(
        `UPDATE factions SET money = ?, manpower = ?, research_points = ?, culture = ?
         WHERE save_id = ? AND code = ?`,
        [f.money, f.manpower, f.researchPoints, f.culture, saveId, f.code],
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
      await db.execute(
        `INSERT INTO city_troops (save_id, x, y, owner_code, kind, hp, max_hp, xp)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [saveId, t.x, t.y, t.ownerCode, t.kind, troop.hp, troop.hp],
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
    // Devolve a todos os esquadrões os seus ataques do turno.
    await db.execute('UPDATE squads SET attacks_used = 0 WHERE save_id = ?', [
      saveId,
    ]);
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
