/**
 * Valores econômicos do jogo: o que cada **facção** acumula e o que cada
 * **território** (província) produz.
 *
 * Por enquanto são apenas estoques/produções estáticos — turnos e economia
 * (que farão esses números evoluírem) ainda serão implementados.
 */

import type { AlignmentId } from './alignments';

// ===== Facção =====

/** Os valores que toda facção (nação) acumula. */
export interface FactionState {
  /** Código da nação dona (igual a `Nation.code`). */
  code: string;
  /** Dinheiro no tesouro nacional. */
  money: number;
  /** Influência política. */
  influence: number;
  /** Manpower disponível (população mobilizável). */
  manpower: number;
  /** Pontos de pesquisa acumulados. */
  researchPoints: number;
  /** Cultura acumulada. */
  culture: number;
  /** Nível de imposto cobrado da população (ver `TAX_LEVELS`). */
  taxLevel: TaxLevel;
  /** Prosperidade da nação (0–100) — multiplica a renda (ver `prosperity`). */
  prosperity: number;
}

/**
 * Valores iniciais de toda facção ao começar uma partida. O **manpower**
 * começa em 0: ele passa a vir das **cidades** (1% da população — ver
 * `cities.ts`), e a capital de cada nação semeia o manpower inicial.
 */
export const STARTING_FACTION: Omit<FactionState, 'code'> = {
  money: 1000,
  influence: 100,
  manpower: 0,
  researchPoints: 0,
  culture: 0,
  taxLevel: 'MEDIO',
  // Valor real é definido por direcionamento em `insertFactions` (ver `initialProsperity`).
  prosperity: 40,
};

/** Catálogo de exibição de um valor (facção ou território) na HUD. */
export interface StatInfo {
  label: string;
  icon: string;
  color: string;
}

/** Os valores numéricos de uma facção mostrados na HUD. */
export type FactionStatKey =
  | 'money'
  | 'influence'
  | 'manpower'
  | 'researchPoints'
  | 'culture';

/** Os valores de uma facção, na ordem em que aparecem na HUD. */
export const FACTION_STATS: (StatInfo & { key: FactionStatKey })[] = [
  { key: 'money', label: 'Dinheiro', icon: '💰', color: '#e8c14a' },
  { key: 'influence', label: 'Influência', icon: '🎖️', color: '#5b9fd1' },
  { key: 'manpower', label: 'Manpower', icon: '🪖', color: '#cf6b4a' },
  { key: 'researchPoints', label: 'Pesquisa', icon: '🔬', color: '#7fb86b' },
  { key: 'culture', label: 'Cultura', icon: '🎭', color: '#b884d0' },
];

// ===== Território =====

/** O que um território (província) produz por turno. */
export interface TerritoryProduction {
  /** Manpower gerado por turno. */
  manpowerProduction: number;
  /** Produção do recurso local por turno. */
  resourceProduction: number;
  /** Produção industrial (estilo Civilization — futuras tropas/construções). */
  production: number;
  /** Pontos de pesquisa gerados por turno. */
  researchProduction: number;
  /** Cultura gerada por turno. */
  cultureProduction: number;
}

/**
 * Os valores de um território, na ordem em que aparecem na HUD. O manpower
 * **não** aparece aqui: ele passa a ser gerado pelas cidades (ver `cities.ts`),
 * não pelas províncias.
 */
export const TERRITORY_STATS: (StatInfo & { key: keyof TerritoryProduction })[] = [
  { key: 'resourceProduction', label: 'Recurso local', icon: '📦', color: '#c9a24a' },
  { key: 'production', label: 'Produção', icon: '🏭', color: '#8aa0b8' },
  { key: 'researchProduction', label: 'Pesquisa / turno', icon: '🔬', color: '#7fb86b' },
  { key: 'cultureProduction', label: 'Cultura / turno', icon: '🎭', color: '#b884d0' },
];

// ===== Impostos e economia =====

/** Níveis de imposto que uma facção pode cobrar da população. */
export type TaxLevel = 'MINIMO' | 'MEDIO' | 'ALTO' | 'EXTREMO';

export interface TaxInfo {
  id: TaxLevel;
  label: string;
  /** Multiplica a renda-base de imposto (médio = 1×). */
  moneyMultiplier: number;
  /** Modificador de felicidade, em pontos percentuais. */
  happinessModifier: number;
}

/** Catálogo dos níveis de imposto. */
export const TAX_LEVELS: Record<TaxLevel, TaxInfo> = {
  MINIMO: { id: 'MINIMO', label: 'Mínimo', moneyMultiplier: 0.5, happinessModifier: 30 },
  MEDIO: { id: 'MEDIO', label: 'Médio', moneyMultiplier: 1, happinessModifier: 5 },
  ALTO: { id: 'ALTO', label: 'Alto', moneyMultiplier: 1.3, happinessModifier: -15 },
  EXTREMO: {
    id: 'EXTREMO',
    label: 'Extremamente alto',
    moneyMultiplier: 1.7,
    happinessModifier: -40,
  },
};

/** Ordem dos níveis de imposto, do mais baixo ao mais alto. */
export const TAX_ORDER: TaxLevel[] = ['MINIMO', 'MEDIO', 'ALTO', 'EXTREMO'];

/** Teto de imposto que cada direcionamento permite. */
export const MAX_TAX_BY_ALIGNMENT: Record<AlignmentId, TaxLevel> = {
  REPUBLICA: 'MEDIO',
  IMPERIO: 'ALTO',
  COMUNISTA: 'EXTREMO',
  INDEPENDENTE: 'MINIMO',
};

/** Níveis de imposto que um direcionamento permite usar. */
export function allowedTaxLevels(alignment: AlignmentId): TaxLevel[] {
  const cap = TAX_ORDER.indexOf(MAX_TAX_BY_ALIGNMENT[alignment]);
  return TAX_ORDER.slice(0, cap + 1);
}

/** Garante que um nível de imposto respeita o teto do direcionamento. */
export function clampTax(level: TaxLevel, alignment: AlignmentId): TaxLevel {
  const allowed = allowedTaxLevels(alignment);
  return allowed.includes(level) ? level : allowed[allowed.length - 1];
}

/** Modificadores de economia conferidos pelo direcionamento político. */
export interface AlignmentEconomy {
  /** Multiplica a renda de imposto da população. */
  taxMult: number;
  /** Multiplica os ganhos de dinheiro de zonas comerciais. */
  commercialMult: number;
  /** Multiplica os ganhos de dinheiro de zonas industriais. */
  industrialMult: number;
  /** Multiplica os ganhos de dinheiro de zonas agrícolas. */
  agriculturalMult: number;
}

export const ALIGNMENT_ECONOMY: Record<AlignmentId, AlignmentEconomy> = {
  REPUBLICA: { taxMult: 1, commercialMult: 1, industrialMult: 1, agriculturalMult: 1 },
  IMPERIO: { taxMult: 1, commercialMult: 1, industrialMult: 1, agriculturalMult: 1 },
  // Empobrecimento: impostos e zonas rendem bem menos.
  COMUNISTA: {
    taxMult: 0.4,
    commercialMult: 0.4,
    industrialMult: 0.5,
    agriculturalMult: 1,
  },
  // Economia liberal: zonas rendem mais.
  INDEPENDENTE: {
    taxMult: 1,
    commercialMult: 1.2,
    industrialMult: 1.1,
    agriculturalMult: 1.1,
  },
};

/** Renda-base de dinheiro por habitante (1 dinheiro a cada 250 de população). */
export const MONEY_PER_POP = 1 / 250;

/** Produtividade e dinheiro que uma zona de fábricas rende por direcionamento. */
export const FACTORY_BY_ALIGNMENT: Record<
  AlignmentId,
  { productivity: number; money: number }
> = {
  COMUNISTA: { productivity: 15, money: 0 },
  IMPERIO: { productivity: 12, money: 0 },
  REPUBLICA: { productivity: 8, money: 500 },
  INDEPENDENTE: { productivity: 5, money: 1400 },
};

/**
 * Bônus de ganhos conferidos pelas construções financeiras de uma facção
 * (Banco Nacional, Bolsa de valores e Agências bancárias). Aplicados **por
 * cima** dos modificadores de direcionamento.
 */
export interface AreaBonus {
  /** Fração somada aos ganhos das zonas comerciais. */
  commercial: number;
  /** Fração somada aos ganhos das zonas industriais. */
  industrial: number;
}

/**
 * Bônus de ganhos de uma facção: o Banco Nacional reforça as zonas comerciais
 * (+30% em império/república, +20% nos demais); a Bolsa de valores reforça
 * comércio e indústria (+15%, ou +30% nos estados independentes); cada Agência
 * bancária soma +10% a ambos.
 */
export function areaBonus(
  alignment: AlignmentId,
  hasBank: boolean,
  hasStock: boolean,
  bankBranches: number,
): AreaBonus {
  let commercial = 0;
  let industrial = 0;
  if (hasBank) {
    commercial +=
      alignment === 'REPUBLICA' || alignment === 'IMPERIO' ? 0.3 : 0.2;
  }
  if (hasStock) {
    const s = alignment === 'INDEPENDENTE' ? 0.3 : 0.15;
    commercial += s;
    industrial += s;
  }
  commercial += bankBranches * 0.1;
  industrial += bankBranches * 0.1;
  return { commercial, industrial };
}

/** Felicidade-base de uma facção, antes do modificador do imposto. */
export const BASE_HAPPINESS = 50;

/** Felicidade-base resultante de um nível de imposto (0–100). */
export function happinessFor(tax: TaxLevel): number {
  const h = BASE_HAPPINESS + TAX_LEVELS[tax].happinessModifier;
  return Math.max(0, Math.min(100, h));
}

/**
 * Felicidade de uma **cidade**: a base do imposto mais os pontos de felicidade
 * das suas construções (templo, museu, teatro, rádio, TV). A felicidade da
 * **facção** é a média das felicidades das suas cidades.
 */
export function cityHappiness(
  tax: TaxLevel,
  constructionHappiness: number,
): number {
  return Math.max(
    0,
    Math.min(100, BASE_HAPPINESS + TAX_LEVELS[tax].happinessModifier + constructionHappiness),
  );
}

/**
 * Renda de imposto de uma cidade por turno: `1` de dinheiro a cada `250` de
 * população, ajustada pelo nível de imposto e pelo direcionamento.
 */
export function cityTaxIncome(
  population: number,
  tax: TaxLevel,
  alignment: AlignmentId,
): number {
  const base = population * MONEY_PER_POP;
  return Math.round(
    base * TAX_LEVELS[tax].moneyMultiplier * ALIGNMENT_ECONOMY[alignment].taxMult,
  );
}

// ===== Prosperidade =====

/**
 * A **prosperidade** (0–100) é um valor da facção que multiplica a renda de
 * impostos e de zonas comerciais. Cresce devagar a cada turno e tem um teto
 * que depende do direcionamento político e da felicidade.
 */

/** Teto-base de prosperidade de cada direcionamento. */
export const PROSPERITY_MAX_BY_ALIGNMENT: Record<AlignmentId, number> = {
  REPUBLICA: 90,
  IMPERIO: 85,
  COMUNISTA: 60,
  INDEPENDENTE: 100,
};

/** Crescimento-base de prosperidade por turno. */
export const PROSPERITY_BASE_GROWTH = 0.1;
/** Prosperidade mínima (a queda nunca passa disto). */
export const PROSPERITY_MIN = 10;
/** Quanto a prosperidade decai por turno quando está acima do teto. */
export const PROSPERITY_DECAY = 0.5;

/**
 * Teto efetivo de prosperidade: o teto do direcionamento menos a penalidade de
 * felicidade — `−5` se a felicidade está abaixo de 100, `−20` se abaixo de 50.
 */
export function prosperityCap(
  alignment: AlignmentId,
  happiness: number,
): number {
  const base = PROSPERITY_MAX_BY_ALIGNMENT[alignment];
  const penalty = happiness < 50 ? 20 : happiness < 100 ? 5 : 0;
  return Math.max(PROSPERITY_MIN, base - penalty);
}

/** Prosperidade inicial de uma facção, conforme o direcionamento. */
export function initialProsperity(alignment: AlignmentId): number {
  const fraction =
    alignment === 'INDEPENDENTE' ? 0.7 : alignment === 'COMUNISTA' ? 0.3 : 0.4;
  return Math.round(PROSPERITY_MAX_BY_ALIGNMENT[alignment] * fraction);
}

/** Multiplicador do crescimento de prosperidade conferido pelo nível de imposto. */
export function prosperityGrowthMult(tax: TaxLevel): number {
  if (tax === 'MINIMO') return 1.2;
  if (tax === 'ALTO') return 0.75;
  if (tax === 'EXTREMO') return 0.4;
  return 1; // MEDIO
}

/**
 * Multiplicador da renda (impostos e zonas comerciais) conferido pela
 * prosperidade — quanto mais próspera a nação, mais ela arrecada.
 */
export function prosperityIncomeMultiplier(prosperity: number): number {
  if (prosperity <= 10) return 0.3;
  if (prosperity <= 25) return 0.5;
  if (prosperity <= 40) return 0.75;
  if (prosperity <= 50) return 0.9;
  if (prosperity <= 60) return 1;
  if (prosperity <= 70) return 1.1;
  if (prosperity <= 80) return 1.2;
  if (prosperity <= 85) return 1.35;
  if (prosperity <= 90) return 1.5;
  if (prosperity < 100) return 1.7;
  return 2;
}
