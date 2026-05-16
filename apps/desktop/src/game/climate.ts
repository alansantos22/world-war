/**
 * Sistema de clima do jogo.
 *
 * Cada província fica num **hemisfério** (Norte/Sul) e numa **zona de clima**
 * (tropical, desértico, ameno ou gelado). As **estações do ano** são opostas
 * entre os hemisférios. As **zonas sísmicas** (anéis de fogo) e os **vulcões**
 * formam o mapa de placas tectônicas.
 *
 * Por enquanto isso é só o **mapa de dados**: os eventos e os buffs/debuffs
 * que vão usar esse sistema ainda serão implementados.
 */

/** Zona de clima de uma província. */
export enum ClimateZone {
  TROPICAL = 'TROPICAL',
  DESERTICO = 'DESERTICO',
  AMENO = 'AMENO',
  GELADO = 'GELADO',
}

/** Hemisfério de uma província. */
export type Hemisphere = 'N' | 'S';

/** Estação do ano. */
export enum Season {
  PRIMAVERA = 'PRIMAVERA',
  VERAO = 'VERAO',
  OUTONO = 'OUTONO',
  INVERNO = 'INVERNO',
}

export interface ClimateInfo {
  key: ClimateZone;
  label: string;
  icon: string;
  color: string;
  description: string;
}

/** Catálogo das zonas de clima. */
export const CLIMATES: Record<ClimateZone, ClimateInfo> = {
  [ClimateZone.TROPICAL]: {
    key: ClimateZone.TROPICAL,
    label: 'Tropical',
    icon: '🌴',
    color: '#2f9e54',
    description: 'Quente e úmido o ano todo, perto da linha do equador.',
  },
  [ClimateZone.DESERTICO]: {
    key: ClimateZone.DESERTICO,
    label: 'Desértico',
    icon: '🏜️',
    color: '#d9a441',
    description: 'Árido e seco, com grandes extremos de temperatura.',
  },
  [ClimateZone.AMENO]: {
    key: ClimateZone.AMENO,
    label: 'Ameno',
    icon: '🌳',
    color: '#5a8f6b',
    description: 'Clima temperado, com as quatro estações bem marcadas.',
  },
  [ClimateZone.GELADO]: {
    key: ClimateZone.GELADO,
    label: 'Gelado',
    icon: '❄️',
    color: '#9fc4d8',
    description: 'Frio intenso, típico das regiões polares.',
  },
};

export function climateInfo(key: ClimateZone): ClimateInfo {
  return CLIMATES[key];
}

/** Zonas de clima na ordem do equador para os polos (útil p/ legenda). */
export const CLIMATE_LIST: ClimateInfo[] = [
  CLIMATES[ClimateZone.TROPICAL],
  CLIMATES[ClimateZone.DESERTICO],
  CLIMATES[ClimateZone.AMENO],
  CLIMATES[ClimateZone.GELADO],
];

export interface SeasonInfo {
  key: Season;
  label: string;
  icon: string;
}

/** Catálogo das estações. */
export const SEASONS: Record<Season, SeasonInfo> = {
  [Season.PRIMAVERA]: { key: Season.PRIMAVERA, label: 'Primavera', icon: '🌸' },
  [Season.VERAO]: { key: Season.VERAO, label: 'Verão', icon: '☀️' },
  [Season.OUTONO]: { key: Season.OUTONO, label: 'Outono', icon: '🍂' },
  [Season.INVERNO]: { key: Season.INVERNO, label: 'Inverno', icon: '☃️' },
};

/** Estação no hemisfério Norte para cada mês (índice 0 = Janeiro). */
const NORTH_SEASON: Season[] = [
  Season.INVERNO, // Jan
  Season.INVERNO, // Fev
  Season.PRIMAVERA, // Mar
  Season.PRIMAVERA, // Abr
  Season.PRIMAVERA, // Mai
  Season.VERAO, // Jun
  Season.VERAO, // Jul
  Season.VERAO, // Ago
  Season.OUTONO, // Set
  Season.OUTONO, // Out
  Season.OUTONO, // Nov
  Season.INVERNO, // Dez
];

/** Estação oposta — o hemisfério Sul vive o oposto do Norte. */
const OPPOSITE: Record<Season, Season> = {
  [Season.PRIMAVERA]: Season.OUTONO,
  [Season.OUTONO]: Season.PRIMAVERA,
  [Season.VERAO]: Season.INVERNO,
  [Season.INVERNO]: Season.VERAO,
};

/** Estação do ano de um hemisfério, dado o mês (0–11). */
export function seasonForMonth(month: number, hemisphere: Hemisphere): Season {
  const north = NORTH_SEASON[month];
  return hemisphere === 'N' ? north : OPPOSITE[north];
}
