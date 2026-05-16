import { getDb } from '../db';
import { generateMap, GeneratedProvince } from './map-generator';
import { NATIONS } from './nations';
import { ResourceType } from './enums';

/** Uma província do mapa já persistida (1 célula de terra, com id do banco). */
export interface Province {
  id: number;
  x: number;
  y: number;
  continent: string;
  name: string;
  resource: ResourceType;
  ownerCode: string | null;
  isCapital: boolean;
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
}

/** Cria a tabela de províncias (e limpa tabelas obsoletas de versões antigas). */
async function ensureSchema(): Promise<void> {
  const db = await getDb();
  // Limpa o modelo antigo (regiões em cluster) e a tabela de teste.
  await db.execute('DROP TABLE IF EXISTS regions');
  await db.execute('DROP TABLE IF EXISTS smoke_test');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS provinces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      x           INTEGER NOT NULL,
      y           INTEGER NOT NULL,
      continent   TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      resource    TEXT    NOT NULL,
      owner_code  TEXT,
      is_capital  INTEGER NOT NULL DEFAULT 0
    )
  `);
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
  };
}

/** Insere todas as províncias numa única transação (rápido). */
async function insertProvinces(provinces: GeneratedProvince[]): Promise<void> {
  const db = await getDb();
  await db.execute('BEGIN');
  try {
    for (const p of provinces) {
      await db.execute(
        'INSERT INTO provinces (x, y, continent, name, resource, owner_code, is_capital) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.x, p.y, p.continent, p.name, p.resource, p.ownerCode, p.isCapital ? 1 : 0],
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

async function readProvinces(): Promise<Province[]> {
  const db = await getDb();
  const rows = await db.select<ProvinceRow[]>(
    'SELECT * FROM provinces ORDER BY id',
  );
  return rows.map(rowToProvince);
}

/** Carrega o mapa do banco; se ainda não houver, gera um novo e salva. */
export async function loadOrCreateMap(): Promise<Province[]> {
  await ensureSchema();
  let provinces = await readProvinces();
  if (provinces.length === 0) {
    await insertProvinces(generateMap(NATIONS).provinces);
    provinces = await readProvinces();
  }
  return provinces;
}

/** Apaga o mapa atual e gera um novo (botão "Novo mapa"). */
export async function regenerateMap(): Promise<Province[]> {
  await ensureSchema();
  const db = await getDb();
  await db.execute('DELETE FROM provinces');
  await insertProvinces(generateMap(NATIONS).provinces);
  return readProvinces();
}
