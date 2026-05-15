/**
 * Constantes de balanceamento do jogo.
 * Ajuste estes valores para alterar o ritmo da partida.
 */
export const GameConfig = {
  // Energia
  MAX_ENERGY: 100,
  ENERGY_REGEN_PER_MIN: 1, // +1 de energia por minuto
  WORK_ENERGY_COST: 10,
  TRAIN_ENERGY_COST: 10,
  FIGHT_ENERGY_COST: 10,

  // Trabalho
  WORK_BASE_PAY: 8, // dinheiro = WORK_BASE_PAY * qualidade da empresa
  WORK_XP: 5,

  // Treino
  TRAIN_STRENGTH_GAIN: 0.5,
  TRAIN_XP: 3,

  // Combate
  FIGHT_XP_DIVISOR: 10, // xp ganho = dano / divisor
  WEAPON_BONUS_PER_QUALITY: 0.2, // +20% de dano por qualidade da arma

  // Progressao
  STARTING_MONEY: 25,
  STARTING_GOLD: 5,
  STARTING_STRENGTH: 10,
  GOLD_PER_LEVEL: 2,

  // Comida: energia restaurada por unidade = qualidade * FOOD_ENERGY_PER_QUALITY
  FOOD_ENERGY_PER_QUALITY: 10,
};

/** XP acumulado necessario para atingir determinado nivel. */
export function xpForLevel(level: number): number {
  // nivel 2 = 100, nivel 3 = 250, nivel 4 = 450 ...
  return Math.round(50 * (level - 1) * level);
}
