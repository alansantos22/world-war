/**
 * Valores econômicos do jogo: o que cada **facção** acumula e o que cada
 * **território** (província) produz.
 *
 * Por enquanto são apenas estoques/produções estáticos — turnos e economia
 * (que farão esses números evoluírem) ainda serão implementados.
 */

// ===== Facção =====

/** Os quatro valores que toda facção (nação) acumula. */
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
}

/** Valores iniciais de toda facção ao começar uma partida. */
export const STARTING_FACTION: Omit<FactionState, 'code'> = {
  money: 1000,
  influence: 100,
  manpower: 10000,
  researchPoints: 0,
};

/** Catálogo de exibição de um valor (facção ou território) na HUD. */
export interface StatInfo {
  label: string;
  icon: string;
  color: string;
}

/** Os quatro valores de uma facção, na ordem em que aparecem na HUD. */
export const FACTION_STATS: (StatInfo & { key: keyof Omit<FactionState, 'code'> })[] = [
  { key: 'money', label: 'Dinheiro', icon: '💰', color: '#e8c14a' },
  { key: 'influence', label: 'Influência', icon: '🎖️', color: '#5b9fd1' },
  { key: 'manpower', label: 'Manpower', icon: '🪖', color: '#cf6b4a' },
  { key: 'researchPoints', label: 'Pesquisa', icon: '🔬', color: '#7fb86b' },
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
}

/** Os quatro valores de um território, na ordem em que aparecem na HUD. */
export const TERRITORY_STATS: (StatInfo & { key: keyof TerritoryProduction })[] = [
  { key: 'manpowerProduction', label: 'Manpower / turno', icon: '🪖', color: '#cf6b4a' },
  { key: 'resourceProduction', label: 'Recurso local', icon: '📦', color: '#c9a24a' },
  { key: 'production', label: 'Produção', icon: '🏭', color: '#8aa0b8' },
  { key: 'researchProduction', label: 'Pesquisa / turno', icon: '🔬', color: '#7fb86b' },
];
