/**
 * Sistema de **leis** — as facções governam por *cards* de leis.
 *
 * Cada lei é um **card** com uma das três qualidades:
 *
 * - **Boa**   — só traz buffs (normais ou altos);
 * - **Neutra**— traz um buff em troca de um debuff (ex.: "Nação Pacifista");
 * - **Ruim**  — só traz debuffs (normais ou altos).
 *
 * Uma facção tem **espaços de lei** divididos igualmente entre as três
 * qualidades: começa com `1` espaço de cada (3 leis ativas) e pode abrir mais
 * dois níveis — `2` de cada (6 leis) e `3` de cada (9 leis). O equilíbrio é
 * obrigatório: nunca dá para ter mais leis boas do que neutras ou ruins.
 *
 * Leis novas saem de **pacotes** comprados com **cultura** (estilo figurinha
 * de banca): o pacote sorteia uma carta — boa, neutra ou ruim — que vai para o
 * **inventário**. O jogador então pode trocar uma lei ativa por outra do
 * inventário, desde que a qualidade do espaço seja respeitada.
 *
 * Anti-trapaça: todas as funções recarregam o estado do banco e **recalculam**
 * custo, sorteio e validações. A UI nunca envia custo, carta sorteada nem
 * resultado — só dispara a ação.
 *
 * NOTA: o **catálogo** abaixo é um conjunto-semente de exemplo. Os efeitos são,
 * por enquanto, apenas descritivos (`LawEffectLine`) — o sistema numérico que
 * aplica os modificadores na economia/combate virá junto do design das leis
 * em si. Ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';
import type Database from '@tauri-apps/plugin-sql';

// ===== Qualidade das leis =====

/** Qualidade de uma lei: boa (só buff), neutra (buff + debuff) ou ruim (só debuff). */
export type LawQuality = 'BOA' | 'NEUTRA' | 'RUIM';

/** Intensidade de uma lei boa/ruim — buff/debuff normal ou alto. */
export type LawMagnitude = 'NORMAL' | 'ALTA';

export interface LawQualityInfo {
  id: LawQuality;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const LAW_QUALITIES: Record<LawQuality, LawQualityInfo> = {
  BOA: {
    id: 'BOA',
    label: 'Boa',
    icon: '🟢',
    color: '#5eae5e',
    description: 'Só traz buffs — podem ser normais ou muito altos.',
  },
  NEUTRA: {
    id: 'NEUTRA',
    label: 'Neutra',
    icon: '🟡',
    color: '#d2a73e',
    description: 'Traz um buff em troca de um debuff.',
  },
  RUIM: {
    id: 'RUIM',
    label: 'Ruim',
    icon: '🔴',
    color: '#c0533f',
    description: 'Só traz debuffs — podem ser normais ou muito altos.',
  },
};

/** As qualidades na ordem em que aparecem na interface. */
export const LAW_QUALITY_LIST: LawQualityInfo[] = [
  LAW_QUALITIES.BOA,
  LAW_QUALITIES.NEUTRA,
  LAW_QUALITIES.RUIM,
];

// ===== Catálogo de leis =====

/**
 * Uma linha de efeito de uma lei — texto exibido no card. `good` controla só a
 * cor (verde = buff, vermelho = debuff). O sistema numérico que de fato aplica
 * o efeito virá com o design das leis.
 */
export interface LawEffectLine {
  text: string;
  good: boolean;
}

/** Identificador de uma lei do catálogo. */
export type LawId =
  // Boas
  | 'INCENTIVO_FISCAL'
  | 'SERVICO_MILITAR'
  | 'BOLSA_ABERTA'
  | 'IDADE_DE_OURO'
  // Neutras
  | 'NACAO_PACIFISTA'
  | 'ECONOMIA_PLANEJADA'
  | 'FRONTEIRAS_ABERTAS'
  | 'ESTADO_LAICO'
  // Ruins
  | 'CORRUPCAO'
  | 'ISOLAMENTO'
  | 'CRISE_ENERGETICA'
  | 'REVOLTA_POPULAR';

/** Um card de lei do catálogo. */
export interface LawCard {
  id: LawId;
  name: string;
  quality: LawQuality;
  /** Intensidade — relevante para leis boas/ruins; neutras são sempre `NORMAL`. */
  magnitude: LawMagnitude;
  icon: string;
  /** Texto de ambientação, sem efeito mecânico. */
  flavor: string;
  /** Efeitos exibidos no card (descritivos por enquanto). */
  effects: LawEffectLine[];
}

/**
 * Catálogo-semente de leis. É de propósito enxuto: a lista definitiva de leis
 * (e os seus efeitos numéricos) será desenhada numa tarefa futura.
 */
export const LAW_CARDS: Record<LawId, LawCard> = {
  // ===== Boas =====
  INCENTIVO_FISCAL: {
    id: 'INCENTIVO_FISCAL',
    name: 'Incentivo Fiscal',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '💸',
    flavor: 'Um Estado que arrecada bem governa com folga.',
    effects: [{ text: '+10% de renda de impostos', good: true }],
  },
  SERVICO_MILITAR: {
    id: 'SERVICO_MILITAR',
    name: 'Serviço Militar Obrigatório',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎖️',
    flavor: 'Toda nação precisa de braços prontos para a guerra.',
    effects: [{ text: '+15% de manpower nas cidades', good: true }],
  },
  BOLSA_ABERTA: {
    id: 'BOLSA_ABERTA',
    name: 'Mercado Livre',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '📈',
    flavor: 'Comércio sem amarras enriquece a nação inteira.',
    effects: [{ text: '+25% de renda das zonas comerciais', good: true }],
  },
  IDADE_DE_OURO: {
    id: 'IDADE_DE_OURO',
    name: 'Idade de Ouro',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '✨',
    flavor: 'As artes e a ciência florescem sob um povo confiante.',
    effects: [{ text: '+30% de cultura por turno', good: true }],
  },
  // ===== Neutras =====
  NACAO_PACIFISTA: {
    id: 'NACAO_PACIFISTA',
    name: 'Nação Pacifista',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🕊️',
    flavor: 'Um exército só de defesa, mas barato de sustentar.',
    effects: [
      { text: '−50% de manutenção das tropas', good: true },
      { text: 'Não pode recrutar esquadrões ofensivos', good: false },
    ],
  },
  ECONOMIA_PLANEJADA: {
    id: 'ECONOMIA_PLANEJADA',
    name: 'Economia Planejada',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🏛️',
    flavor: 'O Estado dita a produção — eficiente, mas pouco lucrativa.',
    effects: [
      { text: '+20% de produção nas cidades', good: true },
      { text: '−15% de renda de impostos', good: false },
    ],
  },
  FRONTEIRAS_ABERTAS: {
    id: 'FRONTEIRAS_ABERTAS',
    name: 'Fronteiras Abertas',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🌐',
    flavor: 'O comércio entra livre — e as ideias estrangeiras também.',
    effects: [
      { text: '+15% de renda das zonas comerciais', good: true },
      { text: '−10 de felicidade', good: false },
    ],
  },
  ESTADO_LAICO: {
    id: 'ESTADO_LAICO',
    name: 'Estado Laico',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '⚖️',
    flavor: 'A razão acima da fé — para o bem e para o mal.',
    effects: [
      { text: '+10% de pesquisa por turno', good: true },
      { text: '−20% de influência religiosa', good: false },
    ],
  },
  // ===== Ruins =====
  CORRUPCAO: {
    id: 'CORRUPCAO',
    name: 'Corrupção Endêmica',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🐀',
    flavor: 'Parte do tesouro some antes mesmo de ser contado.',
    effects: [{ text: '−15% de renda de impostos', good: false }],
  },
  ISOLAMENTO: {
    id: 'ISOLAMENTO',
    name: 'Isolamento Diplomático',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚧',
    flavor: 'Sem aliados, sem comércio, sem ajuda.',
    effects: [{ text: '−20% de renda das zonas comerciais', good: false }],
  },
  CRISE_ENERGETICA: {
    id: 'CRISE_ENERGETICA',
    name: 'Crise Energética',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '⚡',
    flavor: 'As luzes piscam e as fábricas param.',
    effects: [{ text: '−30% de produção de energia das usinas', good: false }],
  },
  REVOLTA_POPULAR: {
    id: 'REVOLTA_POPULAR',
    name: 'Revolta Popular',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '✊',
    flavor: 'O povo nas ruas não trabalha nem paga imposto.',
    effects: [{ text: '−25 de felicidade', good: false }],
  },
};

/** Todas as leis do catálogo, em lista. */
export const LAW_LIST: LawCard[] = Object.values(LAW_CARDS);

/** As leis do catálogo de uma dada qualidade. */
export function lawsOfQuality(quality: LawQuality): LawCard[] {
  return LAW_LIST.filter((c) => c.quality === quality);
}

/** `true` se `id` é uma lei válida do catálogo. */
export function isLawId(id: string): id is LawId {
  return id in LAW_CARDS;
}

// ===== Constantes do sistema =====

/** Cultura cobrada por pacote de lei. */
export const PACK_COST = 100;

/** Espaços de lei (por qualidade) no nível inicial e no máximo. */
export const MIN_SLOT_TIER = 1;
export const MAX_SLOT_TIER = 3;

/**
 * Custo em cultura para abrir o próximo nível de espaços de lei, indexado pelo
 * nível-alvo. Abrir o 2º nível (3→6 leis) custa 1.000; o 3º (6→9) custa 5.000.
 */
export const SLOT_EXPANSION_COST: Record<number, number> = {
  2: 1000,
  3: 5000,
};

/**
 * Chances do sorteio de um pacote, por qualidade. Cartas boas são as mais
 * raras — o pacote é uma aposta. As frações somam `1`.
 */
export const PACK_WEIGHTS: Record<LawQuality, number> = {
  BOA: 0.25,
  NEUTRA: 0.35,
  RUIM: 0.4,
};

/** Custo para abrir o próximo nível de espaços, ou `null` se já está no máximo. */
export function nextSlotExpansion(
  currentTier: number,
): { tier: number; cost: number } | null {
  if (currentTier >= MAX_SLOT_TIER) return null;
  const tier = currentTier + 1;
  return { tier, cost: SLOT_EXPANSION_COST[tier] };
}

// ===== Estado de leis de uma facção =====

/** Uma carta no inventário de uma facção (com a quantidade de cópias). */
export interface LawInventoryEntry {
  lawId: LawId;
  count: number;
}

/** Uma lei ativa, ocupando um espaço. */
export interface ActiveLaw {
  quality: LawQuality;
  /** Índice do espaço dentro da qualidade (0 a `slotTier - 1`). */
  slotIndex: number;
  lawId: LawId;
}

/** O estado completo de leis de uma facção. */
export interface FactionLaws {
  /** Espaços por qualidade — 1, 2 ou 3 (total de leis ativas = `slotTier × 3`). */
  slotTier: number;
  /** Leis ativas, ocupando os espaços. */
  active: ActiveLaw[];
  /** Cartas do inventário (inclui as ativas — é a coleção completa). */
  inventory: LawInventoryEntry[];
}

// ===== Sorteios =====

/** Sorteia uma lei de uma qualidade dentre o catálogo. */
function randomLawOfQuality(quality: LawQuality): LawId {
  const pool = lawsOfQuality(quality);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** Sorteia a qualidade de uma carta de pacote, conforme `PACK_WEIGHTS`. */
function rollPackQuality(): LawQuality {
  const r = Math.random();
  if (r < PACK_WEIGHTS.BOA) return 'BOA';
  if (r < PACK_WEIGHTS.BOA + PACK_WEIGHTS.NEUTRA) return 'NEUTRA';
  return 'RUIM';
}

// ===== Persistência =====

/** Soma uma cópia de uma carta ao inventário de uma facção (upsert). */
async function addToInventory(
  db: Database,
  saveId: number,
  ownerCode: string,
  lawId: LawId,
): Promise<void> {
  const rows = await db.select<{ id: number }[]>(
    'SELECT id FROM law_inventory WHERE save_id = ? AND owner_code = ? AND law_id = ?',
    [saveId, ownerCode, lawId],
  );
  if (rows[0]) {
    await db.execute(
      'UPDATE law_inventory SET count = count + 1 WHERE id = ?',
      [rows[0].id],
    );
  } else {
    await db.execute(
      `INSERT INTO law_inventory (save_id, owner_code, law_id, count)
       VALUES (?, ?, ?, 1)`,
      [saveId, ownerCode, lawId],
    );
  }
}

/**
 * Garante que uma facção tem o seu conjunto inicial de leis: `1` carta de cada
 * qualidade (boa, neutra e ruim), sorteada e já colocada no seu espaço. Não
 * faz nada se a facção já foi semeada.
 */
export async function ensureFactionLaws(
  saveId: number,
  ownerCode: string,
): Promise<void> {
  const db = await getDb();
  const have = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM active_laws WHERE save_id = ? AND owner_code = ?',
    [saveId, ownerCode],
  );
  if ((have[0]?.n ?? 0) > 0) return;

  await db.execute('BEGIN');
  try {
    for (const q of LAW_QUALITY_LIST) {
      const lawId = randomLawOfQuality(q.id);
      await addToInventory(db, saveId, ownerCode, lawId);
      await db.execute(
        `INSERT INTO active_laws (save_id, owner_code, quality, slot_index, law_id)
         VALUES (?, ?, ?, 0, ?)`,
        [saveId, ownerCode, q.id, lawId],
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/** Carrega o estado de leis de uma facção (semeia o conjunto inicial se preciso). */
export async function loadFactionLaws(
  saveId: number,
  ownerCode: string,
): Promise<FactionLaws> {
  await ensureFactionLaws(saveId, ownerCode);
  const db = await getDb();

  const fac = await db.select<{ law_slot_tier: number }[]>(
    'SELECT law_slot_tier FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const slotTier = fac[0]?.law_slot_tier ?? MIN_SLOT_TIER;

  const activeRows = await db.select<
    { quality: string; slot_index: number; law_id: string }[]
  >(
    `SELECT quality, slot_index, law_id FROM active_laws
      WHERE save_id = ? AND owner_code = ? ORDER BY quality, slot_index`,
    [saveId, ownerCode],
  );
  const invRows = await db.select<{ law_id: string; count: number }[]>(
    `SELECT law_id, count FROM law_inventory
      WHERE save_id = ? AND owner_code = ? AND count > 0 ORDER BY law_id`,
    [saveId, ownerCode],
  );

  return {
    slotTier,
    active: activeRows
      .filter((r) => isLawId(r.law_id))
      .map((r) => ({
        quality: r.quality as LawQuality,
        slotIndex: r.slot_index,
        lawId: r.law_id as LawId,
      })),
    inventory: invRows
      .filter((r) => isLawId(r.law_id))
      .map((r) => ({ lawId: r.law_id as LawId, count: r.count })),
  };
}

/**
 * Compra e abre um **pacote de leis**: cobra `PACK_COST` de cultura, sorteia
 * uma carta e a soma ao inventário da facção. Devolve a carta sorteada para a
 * UI animar a abertura. O sorteio é feito aqui — a UI não o recebe pronto.
 */
export async function openLawPack(
  saveId: number,
  ownerCode: string,
): Promise<LawId> {
  const db = await getDb();
  const rows = await db.select<{ culture: number }[]>(
    'SELECT culture FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  if (!rows[0]) throw new Error('Facção não encontrada.');
  if (rows[0].culture < PACK_COST) {
    throw new Error(`Cultura insuficiente — um pacote custa ${PACK_COST}.`);
  }

  const quality = rollPackQuality();
  const lawId = randomLawOfQuality(quality);

  await db.execute('BEGIN');
  try {
    await db.execute(
      'UPDATE factions SET culture = culture - ? WHERE save_id = ? AND code = ?',
      [PACK_COST, saveId, ownerCode],
    );
    await addToInventory(db, saveId, ownerCode, lawId);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
  return lawId;
}

/**
 * Coloca uma lei do inventário num espaço ativo, trocando a lei que estava lá.
 * Valida: o espaço existe (índice `< slotTier`), a qualidade da carta bate com
 * a do espaço, a carta está no inventário e não está ativa em outro espaço.
 */
export async function setActiveLaw(
  saveId: number,
  ownerCode: string,
  quality: LawQuality,
  slotIndex: number,
  lawId: string,
): Promise<void> {
  const db = await getDb();
  if (!isLawId(lawId)) throw new Error('Lei desconhecida.');
  const card = LAW_CARDS[lawId];
  if (card.quality !== quality) {
    throw new Error(
      `Uma lei ${LAW_QUALITIES[card.quality].label.toLowerCase()} não cabe num espaço ${LAW_QUALITIES[quality].label.toLowerCase()}.`,
    );
  }

  const fac = await db.select<{ law_slot_tier: number }[]>(
    'SELECT law_slot_tier FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const slotTier = fac[0]?.law_slot_tier ?? MIN_SLOT_TIER;
  if (slotIndex < 0 || slotIndex >= slotTier) {
    throw new Error('Espaço de lei inválido.');
  }

  const inv = await db.select<{ count: number }[]>(
    'SELECT count FROM law_inventory WHERE save_id = ? AND owner_code = ? AND law_id = ?',
    [saveId, ownerCode, lawId],
  );
  if (!inv[0] || inv[0].count < 1) {
    throw new Error('Você não tem essa carta no inventário.');
  }

  const dup = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM active_laws
      WHERE save_id = ? AND owner_code = ? AND law_id = ?
        AND NOT (quality = ? AND slot_index = ?)`,
    [saveId, ownerCode, lawId, quality, slotIndex],
  );
  if ((dup[0]?.n ?? 0) > 0) {
    throw new Error('Essa lei já está ativa em outro espaço.');
  }

  const updated = await db.execute(
    `UPDATE active_laws SET law_id = ?
      WHERE save_id = ? AND owner_code = ? AND quality = ? AND slot_index = ?`,
    [lawId, saveId, ownerCode, quality, slotIndex],
  );
  if (updated.rowsAffected === 0) {
    throw new Error('Espaço de lei não encontrado.');
  }
}

/**
 * Abre o próximo nível de espaços de lei: cobra a cultura de `SLOT_EXPANSION_COST`
 * e cria um espaço novo de **cada** qualidade — o equilíbrio é mantido. Cada
 * espaço novo já nasce preenchido com uma carta sorteada (também somada ao
 * inventário). Devolve o novo nível e as cartas sorteadas para a UI animar.
 */
export async function expandLawSlots(
  saveId: number,
  ownerCode: string,
): Promise<{ tier: number; drawn: LawId[] }> {
  const db = await getDb();
  const fac = await db.select<{ culture: number; law_slot_tier: number }[]>(
    'SELECT culture, law_slot_tier FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  if (!fac[0]) throw new Error('Facção não encontrada.');

  const current = fac[0].law_slot_tier;
  const next = nextSlotExpansion(current);
  if (!next) throw new Error('Você já abriu todos os espaços de lei.');
  if (fac[0].culture < next.cost) {
    throw new Error(`Cultura insuficiente — abrir custa ${next.cost}.`);
  }

  const drawn: LawId[] = [];
  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE factions SET culture = culture - ?, law_slot_tier = ?
        WHERE save_id = ? AND code = ?`,
      [next.cost, next.tier, saveId, ownerCode],
    );
    // O índice do espaço novo é `current` (0-based: o nível 1 tem o índice 0).
    for (const q of LAW_QUALITY_LIST) {
      const lawId = randomLawOfQuality(q.id);
      drawn.push(lawId);
      await addToInventory(db, saveId, ownerCode, lawId);
      await db.execute(
        `INSERT INTO active_laws (save_id, owner_code, quality, slot_index, law_id)
         VALUES (?, ?, ?, ?, ?)`,
        [saveId, ownerCode, q.id, current, lawId],
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
  return { tier: next.tier, drawn };
}
