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
  squadUpkeep,
  TROOP_TYPES,
  type RecruitOrder,
  type TroopKind,
} from './squads';

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
  /** Força de batalha a derrubar para tomar o território de forma hostil. */
  battleForce: number;
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
  battle_force: number;
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
      cmd_xp          INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Tropas de cada esquadrão (o comandante é parte do próprio esquadrão).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS squad_troops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_id  INTEGER NOT NULL,
      kind      TEXT    NOT NULL,
      force     INTEGER NOT NULL,
      hp        INTEGER NOT NULL,
      max_hp    INTEGER NOT NULL
    )
  `);

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
        battle_force  INTEGER NOT NULL DEFAULT 0,
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
    'battle_force',
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
    battleForce: r.battle_force,
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
            climate, seismic, volcano, battle_force, conquered)
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
          p.battleForce,
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

  await insertProvinces(saveId, generateMap(buildSeeds(customContinent)).provinces);
  const codes = isCustom ? [...NATION_CODES, CUSTOM_NATION_CODE] : NATION_CODES;
  await insertFactions(saveId, codes);
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
  return readProvinces(saveId);
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
  await db.execute('DELETE FROM squads WHERE save_id = ?', [saveId]);
  await insertProvinces(
    saveId,
    generateMap(buildSeeds(save.customNation?.continent ?? null)).provinces,
  );
  await touchSave(saveId);
  return readProvinces(saveId);
}

/** O que `advanceTurn` devolve: o novo turno e as facções atualizadas. */
export interface TurnResult {
  turn: number;
  factions: FactionState[];
}

/**
 * Avança a partida em um turno:
 *
 * - cada facção recebe o **manpower**, os **pontos de pesquisa** e a
 *   **cultura** produzidos pelas suas províncias (as capitais produzem o
 *   dobro — ver `map-generator`);
 * - cada facção paga a **manutenção** dos seus esquadrões em **dinheiro**
 *   (comandante + tropas — ver `squadUpkeep`);
 * - a **fila de recrutamento** de cada cidade avança: a produção da província
 *   é gasta na primeira tropa da fila e, quando concluída, ela entra no
 *   esquadrão alvo.
 *
 * A influência ainda não tem fonte de produção, então não muda.
 */
export async function advanceTurn(saveId: number): Promise<TurnResult> {
  await ensureSchema();
  const db = await getDb();
  const save = await getSave(saveId);
  const provinces = await readProvinces(saveId);
  const factions = await loadFactions(saveId);

  // Soma, por facção, a produção das suas províncias.
  const gain = new Map<
    string,
    { manpower: number; research: number; culture: number }
  >();
  for (const p of provinces) {
    if (!p.ownerCode) continue;
    const g =
      gain.get(p.ownerCode) ?? { manpower: 0, research: 0, culture: 0 };
    g.manpower += p.manpowerProduction;
    g.research += p.researchProduction;
    g.culture += p.cultureProduction;
    gain.set(p.ownerCode, g);
  }

  // Soma, por facção, a manutenção dos seus esquadrões (comandante + tropas).
  const squads = await loadSquads(saveId);
  const upkeep = new Map<string, number>();
  for (const s of squads) {
    upkeep.set(s.ownerCode, (upkeep.get(s.ownerCode) ?? 0) + squadUpkeep(s));
  }

  // Processa a fila de recrutamento: a produção de cada cidade avança a
  // primeira ordem da sua fila; tropas concluídas entram no esquadrão alvo.
  const orders = await loadRecruitOrders(saveId);
  const provByTile = new Map(provinces.map((p) => [`${p.x},${p.y}`, p]));
  const squadById = new Map(squads.map((s) => [s.id, s]));
  const frontByTile = new Map<string, RecruitOrder>();
  for (const o of orders) {
    const k = `${o.x},${o.y}`;
    if (!frontByTile.has(k)) frontByTile.set(k, o); // 1ª da fila (ordenada por id)
  }
  const orderProgress: { id: number; prodDone: number }[] = [];
  const finishedOrders: number[] = [];
  const newTroops: { squadId: number; kind: TroopKind }[] = [];
  for (const [k, front] of frontByTile) {
    const prov = provByTile.get(k);
    if (!prov) continue;
    const done = front.prodDone + prov.production;
    if (done >= front.prodCost) {
      finishedOrders.push(front.id);
      // Só entrega a tropa se o esquadrão alvo ainda existir.
      if (squadById.has(front.squadId)) {
        newTroops.push({ squadId: front.squadId, kind: front.kind });
      }
    } else {
      orderProgress.push({ id: front.id, prodDone: done });
    }
  }

  const turn = save.turn + 1;
  await db.execute('BEGIN');
  try {
    for (const f of factions) {
      const g = gain.get(f.code);
      const up = upkeep.get(f.code) ?? 0;
      if (!g && !up) continue;
      if (g) {
        f.manpower += g.manpower;
        f.researchPoints += g.research;
        f.culture += g.culture;
      }
      // O dinheiro não pode ficar negativo: a manutenção é limitada ao caixa.
      if (up) f.money = Math.max(0, f.money - up);
      await db.execute(
        `UPDATE factions SET money = ?, manpower = ?, research_points = ?, culture = ?
         WHERE save_id = ? AND code = ?`,
        [f.money, f.manpower, f.researchPoints, f.culture, saveId, f.code],
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
        `INSERT INTO squad_troops (squad_id, kind, force, hp, max_hp)
         VALUES (?, ?, ?, ?, ?)`,
        [t.squadId, t.kind, troop.force, troop.hp, troop.hp],
      );
    }
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
