export enum ItemType {
  FOOD = 'FOOD',
  WEAPON = 'WEAPON',
}

export enum CompanyType {
  FOOD = 'FOOD',
  WEAPON = 'WEAPON',
}

export enum BattleStatus {
  OPEN = 'OPEN',
  FINISHED = 'FINISHED',
}

export enum BattleSide {
  ATTACKER = 'ATTACKER',
  DEFENDER = 'DEFENDER',
}

/** Recurso especial de uma regiao (1 por regiao). */
export enum ResourceType {
  // Raros (dificeis de existir)
  PETROLEO = 'PETROLEO',
  URANIO = 'URANIO',
  OURO = 'OURO',
  PRATA = 'PRATA',
  NIOBIO = 'NIOBIO',
  // Comuns
  MADEIRA = 'MADEIRA',
  FERRO = 'FERRO',
  BAUXITA = 'BAUXITA',
  COBRE = 'COBRE',
  TERRAS_AGRICOLAS = 'TERRAS_AGRICOLAS',
}
