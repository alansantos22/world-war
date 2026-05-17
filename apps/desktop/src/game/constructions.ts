/**
 * Setores e construções (estilo Civilization).
 *
 * Cada tile da **zona de influência** de uma cidade pode ser **especializado**
 * num **setor** e, então, receber **construções** daquele setor — fazendas,
 * minas, fábricas, usinas, conjuntos habitacionais, bancos etc. As construções
 * entram numa **fila própria por cidade** e, ao ficarem prontas, produzem
 * comida, recursos, dinheiro, cultura e energia. Ver `GAME_DESIGN.md`.
 *
 * O catálogo já prevê o **sistema de pesquisa** futuro: cada construção tem o
 * campo `requiresResearch` (hoje sempre `null` — tudo destravado).
 */

import { getDb } from '../db';
import { ResourceType } from './enums';
import { ClimateZone } from './climate';
import { resourceInfo, resourceBoost } from './resources';
import type { AlignmentId } from './alignments';

// ===== Setores =====

/** Os setores em que um tile pode ser especializado. */
export type Sector =
  | 'AGRICOLA'
  | 'INDUSTRIAL'
  | 'URBANO'
  | 'COMERCIAL'
  | 'RELIGIOSO'
  | 'MILITAR'
  | 'PESQUISA';

export interface SectorInfo {
  id: Sector;
  label: string;
  icon: string;
}

export const SECTORS: Record<Sector, SectorInfo> = {
  AGRICOLA: { id: 'AGRICOLA', label: 'Agrícola', icon: '🌾' },
  INDUSTRIAL: { id: 'INDUSTRIAL', label: 'Industrial', icon: '🏭' },
  URBANO: { id: 'URBANO', label: 'Urbano', icon: '🏙️' },
  COMERCIAL: { id: 'COMERCIAL', label: 'Comercial', icon: '🏬' },
  RELIGIOSO: { id: 'RELIGIOSO', label: 'Religioso', icon: '⛪' },
  MILITAR: { id: 'MILITAR', label: 'Militar', icon: '🏰' },
  PESQUISA: { id: 'PESQUISA', label: 'Pesquisa', icon: '🔬' },
};

export const SECTOR_LIST: SectorInfo[] = Object.values(SECTORS);

/** Direcionamentos políticos em que um setor não pode ser escolhido. */
export const SECTOR_FORBIDDEN: Partial<Record<Sector, AlignmentId[]>> = {
  RELIGIOSO: ['COMUNISTA'],
};

/** `true` se um setor é proibido para um direcionamento político. */
export function isSectorForbidden(
  sector: Sector,
  alignment: AlignmentId,
): boolean {
  return SECTOR_FORBIDDEN[sector]?.includes(alignment) ?? false;
}

// ===== Construções =====

/** Tipos de construção. */
export type ConstructionKind =
  // Agrícola
  | 'FAZENDA'
  | 'CELEIRO'
  | 'PASTO'
  // Industrial
  | 'MINA'
  | 'FABRICA'
  | 'ARMAZEM'
  | 'MADEIREIRA'
  | 'OLEODUTO'
  | 'USINA_CARVAO'
  | 'USINA_NUCLEAR'
  | 'USINA_PETROLEO'
  // Urbano
  | 'CONJUNTO'
  | 'AREA_URBANA'
  | 'MUSEU'
  | 'TEATRO'
  | 'CENTRO_POLICIAL'
  | 'PROPAGANDA'
  | 'RADIO'
  | 'TV'
  // Comercial
  | 'MERCADO_LOCAL'
  | 'SHOPPING'
  | 'ZONA_COMERCIAL'
  | 'BANCO'
  | 'BOLSA'
  | 'AGENCIA_BANCARIA'
  | 'MERCADO_EXTERIOR'
  | 'MERCADO_MILITAR'
  // Religioso
  | 'TEMPLO'
  | 'CATEDRAL'
  | 'MONUMENTO'
  // Militar
  | 'BARRACKS'
  | 'ACADEMIA'
  | 'FAB_ARMAMENTO'
  | 'FAB_ARMADURA'
  | 'FORTIFICACAO'
  | 'MURALHA'
  | 'SILO_MISSEIS'
  // Pesquisa
  | 'ESCOLA'
  | 'BIBLIOTECA'
  | 'OBSERVATORIO'
  | 'UNIVERSIDADE'
  | 'LAB_MILITAR'
  | 'CENTRO_PESQUISA';

/** Variantes do pasto — o rebanho criado. */
export type PastureVariant = 'GADO' | 'OVELHA' | 'PORCO';

export interface ConstructionType {
  kind: ConstructionKind;
  label: string;
  icon: string;
  sector: Sector;
  /** Custo de produção (a cidade constrói ao longo de vários turnos). */
  prodCost: number;
  /** Custo de dinheiro (cobrado da facção ao enfileirar). */
  moneyCost: number;
  /** Manutenção em dinheiro cobrada da facção a cada turno (construção pronta). */
  upkeep: number;
  /** Máximo dessa construção por tile. */
  maxPerTile: number;
  /** Máximo dessa construção por **facção** (construções nacionais). */
  maxPerFaction?: number;
  /** Direcionamentos políticos em que a construção é proibida. */
  forbidden?: AlignmentId[];
  /** Construção que precisa existir na facção para destravar esta. */
  requires?: ConstructionKind;
  description: string;
  /** Pesquisa necessária para destravar — `null` enquanto não há pesquisa. */
  requiresResearch: string | null;
  /** Cultura gerada por turno. */
  culturePerTurn?: number;
  /** Pontos de pesquisa gerados por turno. */
  researchPerTurn?: number;
  /** Dinheiro gerado por turno. */
  moneyPerTurn?: number;
  /**
   * Fração somada ao crescimento de prosperidade da facção (pode ser negativa
   * — moradia adensada reduz a prosperidade). Ver `economy.ts`.
   */
  prosperityGrowth?: number;
  /** Pontos de felicidade que a construção soma à cidade. */
  happiness?: number;
  /** Pontos de energia gerados (usinas). */
  energyOutput?: number;
  /** Pontos de energia consumidos para funcionar. */
  energyCost?: number;
  /** Aumento-base do teto de população. */
  popCap?: number;
  /** Recurso coletado por turno (madeireira, oleoduto). */
  collects?: { resource: ResourceType; amount: number };
  /** Combustível consumido por turno (usinas). */
  fuel?: { resource: ResourceType; amount: number };
  /**
   * Recursos do **estoque da cidade** consumidos ao enfileirar a construção
   * (além do dinheiro). A cidade precisa ter o estoque na hora; é devolvido se
   * a ordem for cancelada. Ferro e madeira são os mais usados.
   */
  resourceCost?: Partial<Record<ResourceType, number>>;
}

/** Catálogo das construções. */
export const CONSTRUCTIONS: Record<ConstructionKind, ConstructionType> = {
  // ===== Agrícola =====
  FAZENDA: {
    kind: 'FAZENDA',
    label: 'Fazenda',
    icon: '🌾',
    sector: 'AGRICOLA',
    prodCost: 450,
    moneyCost: 2500,
    upkeep: 40,
    maxPerTile: 1,
    description:
      'Produz 5 de comida — ×3 e com bônus de clima num tile de Terras Agrícolas.',
    requiresResearch: null,
  },
  CELEIRO: {
    kind: 'CELEIRO',
    label: 'Celeiro',
    icon: '🛖',
    sector: 'AGRICOLA',
    prodCost: 350,
    moneyCost: 1000,
    upkeep: 20,
    resourceCost: { [ResourceType.MADEIRA]: 16 },
    maxPerTile: 2,
    description: '+20% na capacidade de estoque de comida da cidade.',
    requiresResearch: null,
  },
  PASTO: {
    kind: 'PASTO',
    label: 'Pasto',
    icon: '🐄',
    sector: 'AGRICOLA',
    prodCost: 600,
    moneyCost: 4000,
    upkeep: 50,
    maxPerTile: 1,
    description:
      'Produz 5 de comida. Gado dá couro, ovelha dá lã, porco dá +2 de comida.',
    requiresResearch: null,
  },
  // ===== Industrial =====
  MINA: {
    kind: 'MINA',
    label: 'Mina',
    icon: '⛏️',
    sector: 'INDUSTRIAL',
    prodCost: 600,
    moneyCost: 6500,
    upkeep: 80,
    resourceCost: { [ResourceType.MADEIRA]: 8 },
    maxPerTile: 1,
    description:
      'Extrai o recurso mineral do tile (3/turno; recursos raros 1/turno).',
    requiresResearch: null,
  },
  FABRICA: {
    kind: 'FABRICA',
    label: 'Zona de fábricas',
    icon: '🏭',
    sector: 'INDUSTRIAL',
    prodCost: 700,
    moneyCost: 5000,
    upkeep: 120,
    resourceCost: { [ResourceType.FERRO]: 16, [ResourceType.MADEIRA]: 8 },
    maxPerTile: 1,
    description:
      'Aumenta a produtividade da cidade (e o dinheiro, conforme o direcionamento).',
    requiresResearch: null,
  },
  ARMAZEM: {
    kind: 'ARMAZEM',
    label: 'Armazém',
    icon: '📦',
    sector: 'INDUSTRIAL',
    prodCost: 500,
    moneyCost: 3500,
    upkeep: 40,
    resourceCost: { [ResourceType.MADEIRA]: 20 },
    maxPerTile: 2,
    description:
      '+50% na capacidade de minérios, madeira e petróleo da cidade.',
    requiresResearch: null,
  },
  MADEIREIRA: {
    kind: 'MADEIREIRA',
    label: 'Madeireira',
    icon: '🪵',
    sector: 'INDUSTRIAL',
    prodCost: 600,
    moneyCost: 4000,
    upkeep: 50,
    resourceCost: { [ResourceType.FERRO]: 6 },
    maxPerTile: 1,
    description: 'Coleta 2 de madeira por turno (tile de Madeira).',
    requiresResearch: null,
    collects: { resource: ResourceType.MADEIRA, amount: 2 },
  },
  OLEODUTO: {
    kind: 'OLEODUTO',
    label: 'Oleoduto',
    icon: '🛢️',
    sector: 'INDUSTRIAL',
    prodCost: 1200,
    moneyCost: 15000,
    upkeep: 130,
    resourceCost: { [ResourceType.FERRO]: 22 },
    maxPerTile: 1,
    description: 'Coleta 2 de petróleo por turno (tile de Petróleo).',
    requiresResearch: null,
    collects: { resource: ResourceType.PETROLEO, amount: 2 },
  },
  USINA_CARVAO: {
    kind: 'USINA_CARVAO',
    label: 'Usina a carvão',
    icon: '⚫',
    sector: 'INDUSTRIAL',
    prodCost: 1000,
    moneyCost: 11000,
    upkeep: 150,
    resourceCost: { [ResourceType.FERRO]: 14, [ResourceType.MADEIRA]: 6 },
    maxPerTile: 1,
    description: 'Consome 2 de carvão por turno e gera 10 de energia.',
    requiresResearch: null,
    energyOutput: 10,
    fuel: { resource: ResourceType.CARVAO, amount: 2 },
  },
  USINA_NUCLEAR: {
    kind: 'USINA_NUCLEAR',
    label: 'Usina nuclear',
    icon: '☢️',
    sector: 'INDUSTRIAL',
    prodCost: 4000,
    moneyCost: 45000,
    upkeep: 500,
    resourceCost: { [ResourceType.FERRO]: 24, [ResourceType.URANIO]: 5 },
    maxPerTile: 1,
    description: 'Consome 1 de urânio por turno e gera 45 de energia.',
    requiresResearch: null,
    energyOutput: 45,
    fuel: { resource: ResourceType.URANIO, amount: 1 },
  },
  USINA_PETROLEO: {
    kind: 'USINA_PETROLEO',
    label: 'Usina de petróleo',
    icon: '🔥',
    sector: 'INDUSTRIAL',
    prodCost: 1500,
    moneyCost: 24000,
    upkeep: 260,
    resourceCost: { [ResourceType.FERRO]: 18 },
    maxPerTile: 1,
    description: 'Consome 1 de petróleo por turno e gera 20 de energia.',
    requiresResearch: null,
    energyOutput: 20,
    fuel: { resource: ResourceType.PETROLEO, amount: 1 },
  },
  // ===== Urbano =====
  CONJUNTO: {
    kind: 'CONJUNTO',
    label: 'Conjunto habitacional',
    icon: '🏘️',
    sector: 'URBANO',
    prodCost: 900,
    moneyCost: 12000,
    upkeep: 100,
    resourceCost: { [ResourceType.MADEIRA]: 22, [ResourceType.FERRO]: 10 },
    maxPerTile: 2,
    description:
      '+500 mil no teto de população (+750 mil no comunismo).',
    requiresResearch: null,
    popCap: 500_000,
    prosperityGrowth: -0.03,
  },
  AREA_URBANA: {
    kind: 'AREA_URBANA',
    label: 'Área urbana',
    icon: '🏙️',
    sector: 'URBANO',
    prodCost: 1200,
    moneyCost: 8000,
    upkeep: 80,
    resourceCost: { [ResourceType.MADEIRA]: 16, [ResourceType.FERRO]: 14 },
    maxPerTile: 1,
    forbidden: ['COMUNISTA'],
    description:
      '+500 mil no teto de população (+800 mil nos estados independentes).',
    requiresResearch: null,
    popCap: 500_000,
    prosperityGrowth: -0.02,
  },
  MUSEU: {
    kind: 'MUSEU',
    label: 'Museu',
    icon: '🏛️',
    sector: 'URBANO',
    prodCost: 250,
    moneyCost: 4500,
    upkeep: 55,
    maxPerTile: 1,
    description: 'Gera 2 de cultura por turno (relíquias e felicidade em breve).',
    requiresResearch: null,
    culturePerTurn: 2,
    prosperityGrowth: 0.03,
    happiness: 2,
  },
  TEATRO: {
    kind: 'TEATRO',
    label: 'Teatro',
    icon: '🎭',
    sector: 'URBANO',
    prodCost: 230,
    moneyCost: 3000,
    upkeep: 45,
    maxPerTile: 1,
    description: 'Gera 5 de cultura por turno.',
    requiresResearch: null,
    culturePerTurn: 5,
    prosperityGrowth: 0.03,
    happiness: 4,
  },
  CENTRO_POLICIAL: {
    kind: 'CENTRO_POLICIAL',
    label: 'Centro policial',
    icon: '🚓',
    sector: 'URBANO',
    prodCost: 300,
    moneyCost: 3500,
    upkeep: 60,
    maxPerTile: 1,
    description: 'Aumenta a ordem e a lealdade da cidade (em breve).',
    requiresResearch: null,
  },
  PROPAGANDA: {
    kind: 'PROPAGANDA',
    label: 'Agência de propaganda',
    icon: '📢',
    sector: 'URBANO',
    prodCost: 400,
    moneyCost: 6000,
    upkeep: 90,
    maxPerTile: 1,
    forbidden: ['INDEPENDENTE'],
    description: 'Aumenta a ordem e a lealdade da cidade (em breve).',
    requiresResearch: null,
  },
  RADIO: {
    kind: 'RADIO',
    label: 'Emissora de rádio',
    icon: '📻',
    sector: 'URBANO',
    prodCost: 400,
    moneyCost: 2500,
    upkeep: 40,
    maxPerTile: 1,
    description: 'Gera 4 de cultura por turno. Consome 1 de energia.',
    requiresResearch: null,
    culturePerTurn: 4,
    energyCost: 1,
    happiness: 3,
  },
  TV: {
    kind: 'TV',
    label: 'Emissora de TV',
    icon: '📺',
    sector: 'URBANO',
    prodCost: 500,
    moneyCost: 4500,
    upkeep: 70,
    maxPerTile: 1,
    description: 'Gera 7 de cultura por turno. Consome 1 de energia.',
    requiresResearch: null,
    culturePerTurn: 7,
    energyCost: 1,
    happiness: 5,
  },
  // ===== Comercial =====
  MERCADO_LOCAL: {
    kind: 'MERCADO_LOCAL',
    label: 'Mercado local',
    icon: '🏪',
    sector: 'COMERCIAL',
    prodCost: 450,
    moneyCost: 5000,
    upkeep: 80,
    maxPerTile: 1,
    description: 'Gera 500 de dinheiro por turno.',
    requiresResearch: null,
    moneyPerTurn: 500,
    prosperityGrowth: 0.02,
  },
  SHOPPING: {
    kind: 'SHOPPING',
    label: 'Shopping center',
    icon: '🏬',
    sector: 'COMERCIAL',
    prodCost: 600,
    moneyCost: 9500,
    upkeep: 130,
    resourceCost: { [ResourceType.MADEIRA]: 14, [ResourceType.FERRO]: 8 },
    maxPerTile: 1,
    forbidden: ['COMUNISTA'],
    description: 'Gera 900 de dinheiro por turno.',
    requiresResearch: null,
    moneyPerTurn: 900,
    prosperityGrowth: 0.04,
  },
  ZONA_COMERCIAL: {
    kind: 'ZONA_COMERCIAL',
    label: 'Zona comercial',
    icon: '🏙️',
    sector: 'COMERCIAL',
    prodCost: 600,
    moneyCost: 16000,
    upkeep: 190,
    resourceCost: { [ResourceType.FERRO]: 14, [ResourceType.MADEIRA]: 12 },
    maxPerTile: 1,
    forbidden: ['COMUNISTA'],
    description:
      'Gera 1.250 de dinheiro por turno (1.700 nos estados independentes).',
    requiresResearch: null,
    moneyPerTurn: 1250,
    prosperityGrowth: 0.05,
  },
  BANCO: {
    kind: 'BANCO',
    label: 'Banco Nacional',
    icon: '🏦',
    sector: 'COMERCIAL',
    prodCost: 650,
    moneyCost: 30000,
    upkeep: 300,
    resourceCost: { [ResourceType.FERRO]: 14, [ResourceType.MADEIRA]: 8 },
    maxPerTile: 1,
    maxPerFaction: 1,
    forbidden: ['INDEPENDENTE'],
    description:
      '+30% (império/república) ou +20% nos ganhos das zonas comerciais.',
    requiresResearch: null,
    prosperityGrowth: 0.06,
  },
  BOLSA: {
    kind: 'BOLSA',
    label: 'Bolsa de valores',
    icon: '📈',
    sector: 'COMERCIAL',
    prodCost: 500,
    moneyCost: 50000,
    upkeep: 420,
    resourceCost: { [ResourceType.FERRO]: 12 },
    maxPerTile: 1,
    maxPerFaction: 1,
    forbidden: ['COMUNISTA'],
    description:
      '+15% (+30% nos estados independentes) nos ganhos comerciais e industriais.',
    requiresResearch: null,
    prosperityGrowth: 0.07,
  },
  AGENCIA_BANCARIA: {
    kind: 'AGENCIA_BANCARIA',
    label: 'Agência bancária',
    icon: '🏧',
    sector: 'COMERCIAL',
    prodCost: 150,
    moneyCost: 8000,
    upkeep: 100,
    maxPerTile: 1,
    requires: 'BANCO',
    description: '+10% nos ganhos comerciais e industriais da facção.',
    requiresResearch: null,
  },
  MERCADO_EXTERIOR: {
    kind: 'MERCADO_EXTERIOR',
    label: 'Mercado exterior',
    icon: '🌐',
    sector: 'COMERCIAL',
    prodCost: 300,
    moneyCost: 6000,
    upkeep: 80,
    maxPerTile: 1,
    maxPerFaction: 1,
    description: 'Permite comércio de recursos com outras facções (em breve).',
    requiresResearch: null,
  },
  MERCADO_MILITAR: {
    kind: 'MERCADO_MILITAR',
    label: 'Mercado militar',
    icon: '🎖️',
    sector: 'COMERCIAL',
    prodCost: 200,
    moneyCost: 4000,
    upkeep: 60,
    maxPerTile: 1,
    maxPerFaction: 1,
    description: 'Permite comprar tropas e armas de outras facções (em breve).',
    requiresResearch: null,
  },
  // ===== Religioso =====
  TEMPLO: {
    kind: 'TEMPLO',
    label: 'Templo',
    icon: '⛩️',
    sector: 'RELIGIOSO',
    prodCost: 200,
    moneyCost: 2500,
    upkeep: 35,
    maxPerTile: 1,
    description: 'Aumenta a felicidade da cidade; ordem e influência religiosa em breve.',
    requiresResearch: null,
    happiness: 3,
  },
  CATEDRAL: {
    kind: 'CATEDRAL',
    label: 'Catedral',
    icon: '⛪',
    sector: 'RELIGIOSO',
    prodCost: 600,
    moneyCost: 12000,
    upkeep: 120,
    resourceCost: { [ResourceType.FERRO]: 14, [ResourceType.MADEIRA]: 16 },
    maxPerTile: 1,
    description: 'Aumenta a ordem e muito a influência religiosa (em breve).',
    requiresResearch: null,
  },
  MONUMENTO: {
    kind: 'MONUMENTO',
    label: 'Monumento',
    icon: '🗿',
    sector: 'RELIGIOSO',
    prodCost: 500,
    moneyCost: 10000,
    upkeep: 100,
    maxPerTile: 1,
    description: 'Aumenta a influência religiosa da facção (em breve).',
    requiresResearch: null,
  },
  // ===== Militar =====
  BARRACKS: {
    kind: 'BARRACKS',
    label: 'Quartel',
    icon: '🪖',
    sector: 'MILITAR',
    prodCost: 550,
    moneyCost: 6500,
    upkeep: 80,
    resourceCost: { [ResourceType.MADEIRA]: 12, [ResourceType.FERRO]: 8 },
    maxPerTile: 1,
    description:
      'As tropas da cidade custam +10% de produção, mas nascem com 5 de experiência.',
    requiresResearch: null,
  },
  ACADEMIA: {
    kind: 'ACADEMIA',
    label: 'Academia Militar',
    icon: '🎓',
    sector: 'MILITAR',
    prodCost: 500,
    moneyCost: 10000,
    upkeep: 110,
    resourceCost: { [ResourceType.MADEIRA]: 14, [ResourceType.FERRO]: 8 },
    maxPerTile: 1,
    description:
      'Comandantes montados na cidade nascem com 2★ (chance de 3★/4★) e 15 de experiência.',
    requiresResearch: null,
  },
  FAB_ARMAMENTO: {
    kind: 'FAB_ARMAMENTO',
    label: 'Fábrica de armamento',
    icon: '🔫',
    sector: 'MILITAR',
    prodCost: 1100,
    moneyCost: 15000,
    upkeep: 160,
    resourceCost: { [ResourceType.FERRO]: 20 },
    maxPerTile: 1,
    description: 'Libera a produção de armas (em breve). Consome 2 de energia.',
    requiresResearch: null,
    energyCost: 2,
  },
  FAB_ARMADURA: {
    kind: 'FAB_ARMADURA',
    label: 'Fábrica de armaduras',
    icon: '🛡️',
    sector: 'MILITAR',
    prodCost: 1200,
    moneyCost: 19000,
    upkeep: 190,
    resourceCost: { [ResourceType.FERRO]: 24 },
    maxPerTile: 1,
    description:
      'Libera a produção de armaduras (em breve). Consome 2 de energia.',
    requiresResearch: null,
    energyCost: 2,
  },
  FORTIFICACAO: {
    kind: 'FORTIFICACAO',
    label: 'Fortificação',
    icon: '🏯',
    sector: 'MILITAR',
    prodCost: 2500,
    moneyCost: 28000,
    upkeep: 260,
    resourceCost: { [ResourceType.FERRO]: 22, [ResourceType.MADEIRA]: 10 },
    maxPerTile: 1,
    description: 'Reforça a defesa da cidade no cerco (em breve).',
    requiresResearch: null,
  },
  MURALHA: {
    kind: 'MURALHA',
    label: 'Muralhas de concreto',
    icon: '🧱',
    sector: 'MILITAR',
    prodCost: 4000,
    moneyCost: 40000,
    upkeep: 360,
    resourceCost: { [ResourceType.FERRO]: 28 },
    maxPerTile: 1,
    description: 'Reforça muito a defesa da cidade no cerco (em breve).',
    requiresResearch: null,
  },
  SILO_MISSEIS: {
    kind: 'SILO_MISSEIS',
    label: 'Silo de mísseis',
    icon: '🚀',
    sector: 'MILITAR',
    prodCost: 2500,
    moneyCost: 26000,
    upkeep: 250,
    resourceCost: { [ResourceType.FERRO]: 24, [ResourceType.COBRE]: 8 },
    maxPerTile: 1,
    description: 'Armazena e lança mísseis contra inimigos (em breve).',
    requiresResearch: null,
  },
  // ===== Pesquisa =====
  ESCOLA: {
    kind: 'ESCOLA',
    label: 'Escola',
    icon: '🏫',
    sector: 'PESQUISA',
    prodCost: 150,
    moneyCost: 1500,
    upkeep: 25,
    maxPerTile: 1,
    forbidden: ['INDEPENDENTE'],
    description: 'Gera 2 de pesquisa por turno. Pode ser erguida na cidade.',
    requiresResearch: null,
    researchPerTurn: 2,
  },
  BIBLIOTECA: {
    kind: 'BIBLIOTECA',
    label: 'Biblioteca',
    icon: '📚',
    sector: 'PESQUISA',
    prodCost: 220,
    moneyCost: 2800,
    upkeep: 35,
    maxPerTile: 1,
    forbidden: ['INDEPENDENTE'],
    description: 'Gera 3 de pesquisa por turno. Pode ser erguida na cidade.',
    requiresResearch: null,
    researchPerTurn: 3,
  },
  OBSERVATORIO: {
    kind: 'OBSERVATORIO',
    label: 'Observatório',
    icon: '🔭',
    sector: 'PESQUISA',
    prodCost: 380,
    moneyCost: 5500,
    upkeep: 55,
    maxPerTile: 1,
    description: 'Gera 5 de pesquisa por turno.',
    requiresResearch: null,
    researchPerTurn: 5,
  },
  UNIVERSIDADE: {
    kind: 'UNIVERSIDADE',
    label: 'Universidade',
    icon: '🎓',
    sector: 'PESQUISA',
    prodCost: 650,
    moneyCost: 9500,
    upkeep: 100,
    resourceCost: { [ResourceType.MADEIRA]: 16, [ResourceType.FERRO]: 8 },
    maxPerTile: 1,
    description: 'Gera 8 de pesquisa por turno.',
    requiresResearch: null,
    researchPerTurn: 8,
    prosperityGrowth: 0.02,
  },
  LAB_MILITAR: {
    kind: 'LAB_MILITAR',
    label: 'Laboratório militar',
    icon: '🧪',
    sector: 'PESQUISA',
    prodCost: 950,
    moneyCost: 14000,
    upkeep: 150,
    resourceCost: { [ResourceType.FERRO]: 12, [ResourceType.COBRE]: 8 },
    maxPerTile: 1,
    description: 'Gera 12 de pesquisa por turno.',
    requiresResearch: null,
    researchPerTurn: 12,
  },
  CENTRO_PESQUISA: {
    kind: 'CENTRO_PESQUISA',
    label: 'Centro de pesquisas',
    icon: '🔬',
    sector: 'PESQUISA',
    prodCost: 1150,
    moneyCost: 18000,
    upkeep: 180,
    resourceCost: { [ResourceType.FERRO]: 16, [ResourceType.COBRE]: 10 },
    maxPerTile: 1,
    description: 'Gera 15 de pesquisa por turno.',
    requiresResearch: null,
    researchPerTurn: 15,
  },
};

export const CONSTRUCTION_LIST: ConstructionType[] = Object.values(CONSTRUCTIONS);

/**
 * Construções que podem ser erguidas **direto no tile da cidade** (sem precisar
 * de um tile de setor) — o centro urbano, estilo *Civilization*.
 */
export const CITY_BUILDABLE: ReadonlySet<ConstructionKind> = new Set<ConstructionKind>([
  'MUSEU',
  'TEATRO',
  'ESCOLA',
  'BIBLIOTECA',
  'AREA_URBANA',
  'CONJUNTO',
  'RADIO',
  'TV',
  'SHOPPING',
  'MERCADO_LOCAL',
  'TEMPLO',
]);

/** `true` se a construção pode ser erguida no tile da cidade. */
export function isCityBuildable(kind: ConstructionKind): boolean {
  return CITY_BUILDABLE.has(kind);
}

// ===== Constantes de produção =====

/** Comida-base de uma fazenda. */
export const FARM_FOOD = 5;
/** Multiplicador de uma fazenda num tile de Terras Agrícolas. */
export const FARMLAND_MULTIPLIER = 3;
/** Comida-base de um pasto. */
export const PASTURE_FOOD = 5;
/** Comida extra de um pasto de porcos. */
export const PASTURE_PORCO_BONUS = 2;
/** Produtos (couro/lã) que um pasto de gado/ovelha rende por turno. */
export const PASTURE_PRODUCT_OUTPUT = 2;
/** Aumento de capacidade de comida por celeiro. */
export const GRANARY_CAPACITY_BONUS = 0.2;
/** Recurso minerado por turno — minerais comuns e raros. */
export const MINE_NORMAL_OUTPUT = 3;
export const MINE_RARE_OUTPUT = 1;
/** Custo de uma mina num tile de recurso raro. */
export const MINE_RARE_COST = { prodCost: 2000, moneyCost: 15000 };

/** Variantes do pasto, para a interface. */
export const PASTURE_VARIANTS: {
  id: PastureVariant;
  label: string;
  icon: string;
  effect: string;
}[] = [
  { id: 'GADO', label: 'Gado', icon: '🐄', effect: '+2 de couro por turno' },
  { id: 'OVELHA', label: 'Ovelha', icon: '🐑', effect: '+2 de lã por turno' },
  { id: 'PORCO', label: 'Porco', icon: '🐖', effect: '+2 de comida por turno' },
];

// ===== Armazenamento de recursos =====

/** Capacidade-base de estoque de cada recurso (sem armazéns). */
export const RESOURCE_STORAGE: Record<string, number> = {
  [ResourceType.FERRO]: 30,
  [ResourceType.CARVAO]: 30,
  [ResourceType.BAUXITA]: 30,
  [ResourceType.COBRE]: 30,
  [ResourceType.NIOBIO]: 10,
  [ResourceType.URANIO]: 10,
  [ResourceType.PRATA]: 10,
  [ResourceType.OURO]: 10,
  [ResourceType.PETROLEO]: 15,
  [ResourceType.MADEIRA]: 40,
  COURO: 30,
  LA: 30,
};

/** Aumento de capacidade por armazém. */
export const ARMAZEM_BONUS = 0.5;

/** `true` se o Armazém aumenta a capacidade desse recurso (não couro/lã). */
export function armazemAffects(resource: string): boolean {
  return resource !== 'COURO' && resource !== 'LA';
}

/** Capacidade de estoque de um recurso numa cidade, contando os armazéns. */
export function resourceCapacity(resource: string, armazens: number): number {
  const base = RESOURCE_STORAGE[resource] ?? 30;
  if (!armazemAffects(resource)) return base;
  return Math.round(base * (1 + ARMAZEM_BONUS * armazens));
}

// ===== Produtos (recursos não-minerais do inventário) =====

/** Produtos do rebanho — guardados no inventário da cidade junto dos minerais. */
export type Product = 'COURO' | 'LA';

export const PRODUCTS: Record<Product, { label: string; icon: string }> = {
  COURO: { label: 'Couro', icon: '🟫' },
  LA: { label: 'Lã', icon: '🧶' },
};

/** Rótulo e ícone de um item do inventário da cidade (mineral ou produto). */
export function resourceLabel(key: string): { label: string; icon: string } {
  if (key in PRODUCTS) return PRODUCTS[key as Product];
  const info = resourceInfo(key as ResourceType);
  return { label: info.label, icon: info.icon };
}

// ===== Helpers de cálculo =====

/** `true` se o recurso do tile pode ser minerado (exclui madeira e terras). */
export function isMineable(resource: ResourceType): boolean {
  return (
    resource !== ResourceType.MADEIRA &&
    resource !== ResourceType.TERRAS_AGRICOLAS
  );
}

/** `true` se a construção é proibida para um direcionamento político. */
export function isConstructionForbidden(
  kind: ConstructionKind,
  alignment: AlignmentId,
): boolean {
  return CONSTRUCTIONS[kind].forbidden?.includes(alignment) ?? false;
}

/**
 * Custo de produção e dinheiro de uma construção. Varia com o tile (mina em
 * recurso raro) e com o direcionamento (área urbana e zona comercial são de
 * graça em dinheiro nos estados independentes, mas custam mais produção).
 */
export function constructionCost(
  kind: ConstructionKind,
  alignment: AlignmentId,
  resource?: ResourceType,
): { prodCost: number; moneyCost: number } {
  if (kind === 'MINA' && resource && resourceInfo(resource).tier === 'RARO') {
    return { ...MINE_RARE_COST };
  }
  if (kind === 'AREA_URBANA' && alignment === 'INDEPENDENTE') {
    return { prodCost: 1600, moneyCost: 0 };
  }
  if (kind === 'ZONA_COMERCIAL' && alignment === 'INDEPENDENTE') {
    return { prodCost: 1200, moneyCost: 0 };
  }
  const c = CONSTRUCTIONS[kind];
  return { prodCost: c.prodCost, moneyCost: c.moneyCost };
}

/** Aumento de teto de população de uma construção, conforme o direcionamento. */
export function constructionPopCap(
  kind: ConstructionKind,
  alignment: AlignmentId,
): number {
  if (kind === 'CONJUNTO') return alignment === 'COMUNISTA' ? 750_000 : 500_000;
  if (kind === 'AREA_URBANA') {
    return alignment === 'INDEPENDENTE' ? 800_000 : 500_000;
  }
  return CONSTRUCTIONS[kind].popCap ?? 0;
}

/** Limite por tile de uma construção, conforme o direcionamento. */
export function constructionMaxPerTile(
  kind: ConstructionKind,
  alignment: AlignmentId,
): number {
  if (kind === 'CONJUNTO' && alignment === 'COMUNISTA') return 4;
  return CONSTRUCTIONS[kind].maxPerTile;
}

/** Dinheiro por turno de uma construção, conforme o direcionamento. */
export function constructionMoneyPerTurn(
  kind: ConstructionKind,
  alignment: AlignmentId,
): number {
  if (kind === 'ZONA_COMERCIAL') {
    return alignment === 'INDEPENDENTE' ? 1700 : 1250;
  }
  return CONSTRUCTIONS[kind].moneyPerTurn ?? 0;
}

/** Comida que uma fazenda rende num tile (×3 e bônus de clima em terras). */
export function farmFood(province: {
  resource: ResourceType;
  climate: ClimateZone;
  continent: string;
}): number {
  if (province.resource === ResourceType.TERRAS_AGRICOLAS) {
    return Math.round(
      FARM_FOOD *
        FARMLAND_MULTIPLIER *
        resourceBoost(province.resource, province.climate, province.continent),
    );
  }
  return FARM_FOOD;
}

/** Comida que um pasto rende (porco dá comida extra). */
export function pastureFood(variant: PastureVariant | null): number {
  return PASTURE_FOOD + (variant === 'PORCO' ? PASTURE_PORCO_BONUS : 0);
}

/** Recurso minerado por turno por uma mina no tile dado. */
export function mineOutput(resource: ResourceType): number {
  return resourceInfo(resource).tier === 'RARO'
    ? MINE_RARE_OUTPUT
    : MINE_NORMAL_OUTPUT;
}

// ===== Construções erguidas =====

/** Uma construção já erguida num tile. */
export interface Construction {
  id: number;
  x: number;
  y: number;
  /** Cidade a que a construção pertence (recebe a sua produção). */
  cityX: number;
  cityY: number;
  ownerCode: string;
  kind: ConstructionKind;
  /** Variante do pasto, ou `null`. */
  variant: PastureVariant | null;
}

interface ConstructionRow {
  id: number;
  x: number;
  y: number;
  city_x: number;
  city_y: number;
  owner_code: string;
  kind: string;
  variant: string | null;
}

function rowToConstruction(r: ConstructionRow): Construction {
  return {
    id: r.id,
    x: r.x,
    y: r.y,
    cityX: r.city_x,
    cityY: r.city_y,
    ownerCode: r.owner_code,
    kind: r.kind as ConstructionKind,
    variant: (r.variant as PastureVariant | null) ?? null,
  };
}

/** Carrega as construções erguidas de uma partida. */
export async function loadConstructions(
  saveId: number,
): Promise<Construction[]> {
  const db = await getDb();
  const rows = await db.select<ConstructionRow[]>(
    'SELECT * FROM constructions WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToConstruction);
}

// ===== Fila de construção =====

/** Uma ordem na fila de construção de uma cidade. */
export interface ConstructionOrder {
  id: number;
  /** Cidade dona da fila. */
  cityX: number;
  cityY: number;
  /** Tile onde a construção será erguida. */
  targetX: number;
  targetY: number;
  ownerCode: string;
  kind: ConstructionKind;
  variant: PastureVariant | null;
  prodCost: number;
  prodDone: number;
  /** Dinheiro pago ao enfileirar (devolvido se cancelada). */
  moneyCost: number;
}

interface ConstructionOrderRow {
  id: number;
  save_id: number;
  city_x: number;
  city_y: number;
  target_x: number;
  target_y: number;
  owner_code: string;
  kind: string;
  variant: string | null;
  prod_cost: number;
  prod_done: number;
  money_cost: number;
}

function rowToOrder(r: ConstructionOrderRow): ConstructionOrder {
  return {
    id: r.id,
    cityX: r.city_x,
    cityY: r.city_y,
    targetX: r.target_x,
    targetY: r.target_y,
    ownerCode: r.owner_code,
    kind: r.kind as ConstructionKind,
    variant: (r.variant as PastureVariant | null) ?? null,
    prodCost: r.prod_cost,
    prodDone: r.prod_done,
    moneyCost: r.money_cost ?? 0,
  };
}

/** Carrega as ordens de construção de uma partida (em ordem de fila). */
export async function loadConstructionOrders(
  saveId: number,
): Promise<ConstructionOrder[]> {
  const db = await getDb();
  const rows = await db.select<ConstructionOrderRow[]>(
    'SELECT * FROM construction_orders WHERE save_id = ? ORDER BY id',
    [saveId],
  );
  return rows.map(rowToOrder);
}

/**
 * Quantas construções de um tipo um tile já tem — contando as **erguidas** e
 * as que estão **na fila**. Usado para respeitar o limite por tile.
 */
export async function constructionsOnTile(
  saveId: number,
  x: number,
  y: number,
  kind: ConstructionKind,
): Promise<number> {
  const db = await getDb();
  const built = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM constructions WHERE save_id = ? AND x = ? AND y = ? AND kind = ?',
    [saveId, x, y, kind],
  );
  const queued = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM construction_orders
      WHERE save_id = ? AND target_x = ? AND target_y = ? AND kind = ?`,
    [saveId, x, y, kind],
  );
  return (built[0]?.n ?? 0) + (queued[0]?.n ?? 0);
}

/** `true` se uma cidade tem (ao menos uma) construção erguida de um tipo. */
export async function cityHasConstruction(
  saveId: number,
  cityX: number,
  cityY: number,
  kind: ConstructionKind,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM constructions
      WHERE save_id = ? AND city_x = ? AND city_y = ? AND kind = ?`,
    [saveId, cityX, cityY, kind],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Quantas construções de um tipo uma facção já tem (erguidas + na fila). */
export async function constructionsOfFaction(
  saveId: number,
  ownerCode: string,
  kind: ConstructionKind,
): Promise<number> {
  const db = await getDb();
  const built = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM constructions WHERE save_id = ? AND owner_code = ? AND kind = ?',
    [saveId, ownerCode, kind],
  );
  const queued = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM construction_orders WHERE save_id = ? AND owner_code = ? AND kind = ?',
    [saveId, ownerCode, kind],
  );
  return (built[0]?.n ?? 0) + (queued[0]?.n ?? 0);
}

/**
 * Define (ou troca) o setor de um tile. Só é possível trocar o setor de um
 * tile que **não tem construções** nem ordens de construção pendentes.
 */
export async function assignSector(
  saveId: number,
  x: number,
  y: number,
  sector: Sector | null,
  alignment?: AlignmentId,
): Promise<void> {
  const db = await getDb();
  if (sector && alignment && isSectorForbidden(sector, alignment)) {
    throw new Error(
      `O setor ${SECTORS[sector].label} não é permitido pelo seu direcionamento.`,
    );
  }
  const built = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM constructions WHERE save_id = ? AND x = ? AND y = ?',
    [saveId, x, y],
  );
  const queued = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM construction_orders WHERE save_id = ? AND target_x = ? AND target_y = ?',
    [saveId, x, y],
  );
  if ((built[0]?.n ?? 0) + (queued[0]?.n ?? 0) > 0) {
    throw new Error(
      'Não dá para trocar o setor de um tile que já tem construções.',
    );
  }
  await db.execute(
    'UPDATE provinces SET sector = ? WHERE save_id = ? AND x = ? AND y = ?',
    [sector, saveId, x, y],
  );
}

/**
 * Enfileira uma construção na fila de uma cidade. Cobra o **dinheiro** da
 * facção na hora; a **produção** é gasta turno a turno. Valida o limite por
 * tile, o limite por facção, a construção pré-requisito e os direcionamentos
 * proibidos.
 */
export async function queueConstruction(
  saveId: number,
  ownerCode: string,
  alignment: AlignmentId,
  cityX: number,
  cityY: number,
  targetX: number,
  targetY: number,
  kind: ConstructionKind,
  variant: PastureVariant | null,
  resource?: ResourceType,
): Promise<void> {
  const db = await getDb();
  const def = CONSTRUCTIONS[kind];
  const cost = constructionCost(kind, alignment, resource);

  if (isConstructionForbidden(kind, alignment)) {
    throw new Error(`${def.label} não é permitida pelo seu direcionamento.`);
  }
  if (def.requires) {
    const have = await constructionsOfFaction(saveId, ownerCode, def.requires);
    if (have === 0) {
      throw new Error(
        `${def.label} exige antes: ${CONSTRUCTIONS[def.requires].label}.`,
      );
    }
  }
  if (def.maxPerFaction != null) {
    const have = await constructionsOfFaction(saveId, ownerCode, kind);
    if (have >= def.maxPerFaction) {
      throw new Error(
        `A facção só pode ter ${def.maxPerFaction} ${def.label.toLowerCase()}.`,
      );
    }
  }
  const onTile = await constructionsOnTile(saveId, targetX, targetY, kind);
  const tileLimit = constructionMaxPerTile(kind, alignment);
  if (onTile >= tileLimit) {
    throw new Error(
      `Este tile já atingiu o limite de ${def.label.toLowerCase()} (${tileLimit}).`,
    );
  }

  const rows = await db.select<{ money: number }[]>(
    'SELECT money FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  if (!rows[0] || rows[0].money < cost.moneyCost) {
    throw new Error(`Dinheiro insuficiente (${cost.moneyCost}).`);
  }

  // Recursos do estoque da cidade consumidos ao enfileirar.
  const resCost = def.resourceCost;
  if (resCost) {
    const resRows = await db.select<{ resource: string; amount: number }[]>(
      'SELECT resource, amount FROM city_resources WHERE save_id = ? AND x = ? AND y = ?',
      [saveId, cityX, cityY],
    );
    const stock = new Map(resRows.map((r) => [r.resource, r.amount]));
    for (const [res, need] of Object.entries(resCost)) {
      const have = stock.get(res) ?? 0;
      if (have < (need as number)) {
        const info = resourceLabel(res);
        throw new Error(
          `${def.label} exige ${need} de ${info.label} no estoque da cidade (tem ${have}).`,
        );
      }
    }
  }

  await db.execute('BEGIN');
  try {
    if (cost.moneyCost > 0) {
      await db.execute(
        'UPDATE factions SET money = money - ? WHERE save_id = ? AND code = ?',
        [cost.moneyCost, saveId, ownerCode],
      );
    }
    if (resCost) {
      for (const [res, need] of Object.entries(resCost)) {
        await db.execute(
          `UPDATE city_resources SET amount = amount - ?
            WHERE save_id = ? AND x = ? AND y = ? AND resource = ?`,
          [need, saveId, cityX, cityY, res],
        );
      }
    }
    await db.execute(
      `INSERT INTO construction_orders
         (save_id, city_x, city_y, target_x, target_y, owner_code, kind,
          variant, prod_cost, prod_done, money_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        saveId,
        cityX,
        cityY,
        targetX,
        targetY,
        ownerCode,
        kind,
        variant,
        cost.prodCost,
        cost.moneyCost,
      ],
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Cancela uma ordem de construção e devolve o dinheiro pago e os recursos
 * consumidos ao enfileirar (a devolução respeita a capacidade de estoque da
 * cidade — o excedente é perdido).
 */
export async function cancelConstruction(orderId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<ConstructionOrderRow[]>(
    'SELECT * FROM construction_orders WHERE id = ?',
    [orderId],
  );
  const o = rows[0];
  if (!o) return;
  await db.execute('BEGIN');
  try {
    if ((o.money_cost ?? 0) > 0) {
      await db.execute(
        'UPDATE factions SET money = money + ? WHERE save_id = ? AND code = ?',
        [o.money_cost, o.save_id, o.owner_code],
      );
    }
    const resCost = CONSTRUCTIONS[o.kind as ConstructionKind].resourceCost;
    if (resCost) {
      const arm = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM constructions
          WHERE save_id = ? AND city_x = ? AND city_y = ? AND kind = 'ARMAZEM'`,
        [o.save_id, o.city_x, o.city_y],
      );
      const armazens = arm[0]?.n ?? 0;
      for (const [res, amt] of Object.entries(resCost)) {
        const cap = resourceCapacity(res, armazens);
        const cur = await db.select<{ amount: number }[]>(
          `SELECT amount FROM city_resources
            WHERE save_id = ? AND x = ? AND y = ? AND resource = ?`,
          [o.save_id, o.city_x, o.city_y, res],
        );
        if (cur[0]) {
          const next = Math.min(cap, cur[0].amount + (amt as number));
          await db.execute(
            `UPDATE city_resources SET amount = ?
              WHERE save_id = ? AND x = ? AND y = ? AND resource = ?`,
            [next, o.save_id, o.city_x, o.city_y, res],
          );
        } else {
          await db.execute(
            `INSERT INTO city_resources (save_id, x, y, resource, amount)
             VALUES (?, ?, ?, ?, ?)`,
            [o.save_id, o.city_x, o.city_y, res, Math.min(cap, amt as number)],
          );
        }
      }
    }
    await db.execute('DELETE FROM construction_orders WHERE id = ?', [orderId]);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}
