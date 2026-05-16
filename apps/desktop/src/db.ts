import Database from '@tauri-apps/plugin-sql';

/**
 * Banco SQLite local do jogo desktop. O arquivo fica no diretório de dados
 * do app (resolvido pelo Tauri), então cada instalação tem seu próprio save.
 */
const DB_URL = 'sqlite:world-war.db';

let instance: Database | null = null;

/** Abre (ou cria) o banco SQLite local e reaproveita a conexão. */
export async function getDb(): Promise<Database> {
  if (!instance) {
    instance = await Database.load(DB_URL);
  }
  return instance;
}
