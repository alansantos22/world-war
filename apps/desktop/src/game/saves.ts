import { getDb } from '../db';
import { ensureSchema } from './world';
import { NATIONS, CUSTOM_NATION_CODE } from './nations';

/** Resumo de uma partida salva, exibido na tela "Carregar jogo". */
export interface SaveSummary {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  provinceCount: number;
  /** Nome da nação controlada pelo jogador (ou `null` em saves antigos). */
  playerNationName: string | null;
  /** Cor da nação do jogador. */
  playerColor: string | null;
  /** Semente da bandeira da nação do jogador. */
  flagSeed: string | null;
}

interface SaveRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  player_code: string | null;
  custom_name: string | null;
  custom_color: string | null;
  province_count: number;
}

/** Lista todas as partidas salvas, da mais recente para a mais antiga. */
export async function listSaves(): Promise<SaveSummary[]> {
  await ensureSchema();
  const db = await getDb();
  const rows = await db.select<SaveRow[]>(`
    SELECT s.id, s.name, s.created_at, s.updated_at,
           s.player_code, s.custom_name, s.custom_color,
           (SELECT COUNT(*) FROM provinces p WHERE p.save_id = s.id)
             AS province_count
    FROM saves s
    ORDER BY s.updated_at DESC
  `);
  return rows.map((r) => {
    let playerNationName: string | null = null;
    let playerColor: string | null = null;
    let flagSeed: string | null = null;
    if (r.player_code === CUSTOM_NATION_CODE) {
      playerNationName = r.custom_name;
      playerColor = r.custom_color;
      flagSeed = r.custom_name;
    } else if (r.player_code) {
      const nation = NATIONS.find((n) => n.code === r.player_code);
      if (nation) {
        playerNationName = nation.name;
        playerColor = nation.color;
        flagSeed = nation.code;
      }
    }
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      provinceCount: r.province_count,
      playerNationName,
      playerColor,
      flagSeed,
    };
  });
}

/** Apaga uma partida, as suas províncias e as suas facções. */
export async function deleteSave(id: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM provinces WHERE save_id = ?', [id]);
  await db.execute('DELETE FROM factions WHERE save_id = ?', [id]);
  await db.execute('DELETE FROM saves WHERE id = ?', [id]);
}

/**
 * Renomeia uma partida e atualiza o horário de modificação. É também o que
 * o botão "Salvar jogo" usa: confirma o estado atual como salvo.
 */
export async function renameSave(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE saves SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    new Date().toISOString(),
    id,
  ]);
}
