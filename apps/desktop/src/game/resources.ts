import { ResourceType } from './enums';
import { ClimateZone } from './climate';

export type ResourceTier = 'RARO' | 'COMUM';

export interface ResourceInfo {
  key: ResourceType;
  label: string;
  tier: ResourceTier;
  /** Quanto maior, mais raro. Usado para ordenar e equilibrar a distribuição. */
  rarityRank: number;
  color: string;
  icon: string;
  /** Efeito no jogo (parte ainda será implementada futuramente). */
  effect: string;
}

/**
 * Catálogo de recursos especiais.
 * Ordem de raridade (do mais raro ao menos raro entre os raros):
 * Nióbio > Urânio > Prata > Ouro > Petróleo.
 */
export const RESOURCES: Record<ResourceType, ResourceInfo> = {
  [ResourceType.NIOBIO]: {
    key: ResourceType.NIOBIO,
    label: 'Nióbio',
    tier: 'RARO',
    rarityRank: 100,
    color: '#9b59b6',
    icon: '💜',
    effect:
      'Liga estratégica para armamento de elite. Recurso extremamente raro.',
  },
  [ResourceType.URANIO]: {
    key: ResourceType.URANIO,
    label: 'Urânio',
    tier: 'RARO',
    rarityRank: 80,
    color: '#27ae60',
    icon: '☢️',
    effect: 'Necessário para armas avançadas e energia. Recurso muito raro.',
  },
  [ResourceType.PRATA]: {
    key: ResourceType.PRATA,
    label: 'Prata',
    tier: 'RARO',
    rarityRank: 60,
    color: '#bdc3c7',
    icon: '🥈',
    effect: 'Metal precioso com bom valor de exportação.',
  },
  [ResourceType.OURO]: {
    key: ResourceType.OURO,
    label: 'Ouro',
    tier: 'RARO',
    rarityRank: 55,
    color: '#f1c40f',
    icon: '🥇',
    effect: 'Metal precioso de altíssimo valor de exportação.',
  },
  [ResourceType.PETROLEO]: {
    key: ResourceType.PETROLEO,
    label: 'Petróleo',
    tier: 'RARO',
    rarityRank: 40,
    color: '#34404f',
    icon: '🛢️',
    effect:
      'Combustível para a máquina de guerra. O menos raro entre os recursos raros.',
  },
  [ResourceType.MADEIRA]: {
    key: ResourceType.MADEIRA,
    label: 'Madeira',
    tier: 'COMUM',
    rarityRank: 20,
    color: '#8e6e3a',
    icon: '🪵',
    effect: 'Matéria-prima básica para construção.',
  },
  [ResourceType.FERRO]: {
    key: ResourceType.FERRO,
    label: 'Ferro',
    tier: 'COMUM',
    rarityRank: 18,
    color: '#7f8c8d',
    icon: '⛓️',
    effect: 'Matéria-prima essencial para a produção de armas.',
  },
  [ResourceType.CARVAO]: {
    key: ResourceType.CARVAO,
    label: 'Carvão',
    tier: 'COMUM',
    rarityRank: 17,
    color: '#2c2f36',
    icon: '⚫',
    effect: 'Combustível para usinas de energia a carvão.',
  },
  [ResourceType.BAUXITA]: {
    key: ResourceType.BAUXITA,
    label: 'Bauxita',
    tier: 'COMUM',
    rarityRank: 16,
    color: '#c0673a',
    icon: '🪨',
    effect: 'Minério usado na produção de alumínio.',
  },
  [ResourceType.COBRE]: {
    key: ResourceType.COBRE,
    label: 'Cobre',
    tier: 'COMUM',
    rarityRank: 14,
    color: '#d35400',
    icon: '🟠',
    effect: 'Metal usado em munição e componentes eletrônicos.',
  },
  [ResourceType.TERRAS_AGRICOLAS]: {
    key: ResourceType.TERRAS_AGRICOLAS,
    label: 'Terras Agrícolas',
    tier: 'COMUM',
    rarityRank: 12,
    color: '#27843a',
    icon: '🌾',
    effect: 'Solo fértil que concede bônus de produção de comida.',
  },
};

export function resourceInfo(key: ResourceType): ResourceInfo {
  return RESOURCES[key];
}

/**
 * Multiplicador da **produção do recurso local** conforme o clima da
 * província. Recursos/combinações sem entrada usam 1× (sem bônus).
 */
const CLIMATE_BOOST: Partial<
  Record<ResourceType, Partial<Record<ClimateZone, number>>>
> = {
  [ResourceType.TERRAS_AGRICOLAS]: {
    [ClimateZone.AMENO]: 2,
    [ClimateZone.TROPICAL]: 1.5,
    [ClimateZone.GELADO]: 0.75,
    [ClimateZone.DESERTICO]: 0.5,
  },
  [ResourceType.MADEIRA]: {
    [ClimateZone.TROPICAL]: 2,
    [ClimateZone.AMENO]: 1,
    [ClimateZone.GELADO]: 0.75,
    [ClimateZone.DESERTICO]: 0.5,
  },
  [ResourceType.PETROLEO]: {
    [ClimateZone.DESERTICO]: 1.75,
    [ClimateZone.GELADO]: 1.5,
  },
};

/**
 * Multiplicador da produção do recurso local de uma província. Depende do
 * clima — e, no caso do Nióbio, do continente (2× na América do Sul, `S`).
 */
export function resourceBoost(
  resource: ResourceType,
  climate: ClimateZone,
  continent: string,
): number {
  if (resource === ResourceType.NIOBIO) {
    return continent === 'S' ? 2 : 1;
  }
  return CLIMATE_BOOST[resource]?.[climate] ?? 1;
}
