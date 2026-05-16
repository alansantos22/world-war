import { AlignmentId } from './alignments';

/**
 * As 13 nações (facções) do jogo.
 *
 * `continent` + `capital` indicam onde fica a capital no mapa (a célula real
 * mais próxima dessas coordenadas vira a província-capital da nação).
 * Os continentes: N=América do Norte, S=América do Sul, E=Europa,
 * A=África, I=Ásia, O=Oceania.
 */

export interface Nation {
  /** Código curto, usado como dono das províncias. */
  code: string;
  /** Nome da facção no jogo. */
  name: string;
  /** País/região do mundo real correspondente. */
  realWorld: string;
  /** Cor no mapa político. */
  color: string;
  /** Direcionamento político da nação. */
  alignment: AlignmentId;
  /** Continente onde fica a capital. */
  continent: string;
  /** Coordenada aproximada da capital na grade do mapa. */
  capital: { col: number; row: number };
}

export const NATIONS: Nation[] = [
  {
    code: 'BRA',
    name: 'Império do Brasil',
    realWorld: 'Brasil',
    color: '#2e8b3d',
    alignment: 'IMPERIO',
    continent: 'S',
    capital: { col: 15, row: 14 },
  },
  {
    code: 'URU',
    name: 'União das Repúblicas Americanas',
    realWorld: 'América do Norte',
    color: '#3b6fb5',
    alignment: 'REPUBLICA',
    continent: 'N',
    capital: { col: 10, row: 6 },
  },
  {
    code: 'GBR',
    name: 'Império Britânico',
    realWorld: 'Reino Unido',
    color: '#b03b3b',
    alignment: 'IMPERIO',
    continent: 'E',
    capital: { col: 24, row: 3 },
  },
  {
    code: 'CHN',
    name: 'Império da China',
    realWorld: 'China',
    color: '#e6b422',
    alignment: 'IMPERIO',
    continent: 'I',
    capital: { col: 40, row: 9 },
  },
  {
    code: 'JPN',
    name: 'Império do Japão',
    realWorld: 'Japão',
    color: '#d6457f',
    alignment: 'IMPERIO',
    continent: 'I',
    capital: { col: 45, row: 6 },
  },
  {
    code: 'USS',
    name: 'URSS',
    realWorld: 'União Soviética',
    color: '#b51e1e',
    alignment: 'COMUNISTA',
    continent: 'I',
    capital: { col: 38, row: 3 },
  },
  {
    code: 'FRA',
    name: 'União das Repúblicas Francesas',
    realWorld: 'França',
    color: '#5b7fd1',
    alignment: 'REPUBLICA',
    continent: 'E',
    capital: { col: 25, row: 5 },
  },
  {
    code: 'IBR',
    name: 'Reino da Ibéria',
    realWorld: 'Portugal e Espanha',
    color: '#d97a2e',
    alignment: 'IMPERIO',
    continent: 'E',
    capital: { col: 25, row: 6 },
  },
  {
    code: 'GER',
    name: 'Império Germânico',
    realWorld: 'Alemanha',
    color: '#8a909a',
    alignment: 'IMPERIO',
    continent: 'E',
    capital: { col: 28, row: 3 },
  },
  {
    code: 'ZAF',
    name: 'União dos Estados Libertos',
    realWorld: 'África do Sul',
    color: '#2aa198',
    alignment: 'INDEPENDENTE',
    continent: 'A',
    capital: { col: 26, row: 18 },
  },
  {
    code: 'EGY',
    name: 'Sultanato Mameluco',
    realWorld: 'Egito',
    color: '#b9863f',
    alignment: 'IMPERIO',
    continent: 'A',
    capital: { col: 29, row: 8 },
  },
  {
    code: 'PER',
    name: 'Pérsia',
    realWorld: 'Irã',
    color: '#8e5fc4',
    alignment: 'IMPERIO',
    continent: 'I',
    capital: { col: 34, row: 8 },
  },
  {
    code: 'MKD',
    name: 'Macedônia',
    realWorld: 'Grécia e Macedônia do Norte',
    color: '#4a9ec4',
    alignment: 'REPUBLICA',
    continent: 'E',
    capital: { col: 29, row: 4 },
  },
];

export const NATION_CODES: string[] = NATIONS.map((n) => n.code);

const BY_CODE = new Map(NATIONS.map((n) => [n.code, n]));

export function nationByCode(code: string | null): Nation | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

/**
 * Código reservado para a nação **personalizada** criada pelo jogador.
 * Não colide com nenhum dos códigos das 13 nações fixas.
 */
export const CUSTOM_NATION_CODE = 'PLR';

/**
 * Semente da bandeira de uma nação: as nações fixas usam o código; a nação
 * personalizada usa o nome (assim cada partida personalizada tem desenho
 * próprio).
 */
export function flagSeed(nation: Nation): string {
  return nation.code === CUSTOM_NATION_CODE ? nation.name : nation.code;
}
