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
 * EFEITOS: cada lei traz **efeitos estruturados** (`LawEffect` — `kind` +
 * `value`). `loadLawModifiers` soma os efeitos das leis ativas de uma facção
 * num `LawModifiers`, que o `advanceTurn` aplica na economia do turno. O texto
 * exibido no card é **gerado** a partir do efeito (ver `lawEffectLine`).
 * Os efeitos de **combate** e de **custo por ação** ainda serão ligados.
 *
 * São 90 leis (30 boas, 30 neutras, 30 ruins). Onze são "leis engraçadas"
 * inspiradas em leis reais, mas o texto é sempre deste mundo. Ver `GAME_DESIGN.md`.
 */

import { getDb } from '../db';
import { CUSTOM_NATION_CODE } from './nations';
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

// ===== Efeitos das leis =====

/**
 * O que um efeito de lei modifica. `*_PCT` são modificadores percentuais
 * (somados entre leis: +25 e −15 = +10%); `*_FLAT` são valores absolutos.
 */
export type LawEffectKind =
  | 'TAX_PCT'
  | 'COMMERCIAL_PCT'
  | 'FACTORY_PCT'
  | 'PRODUCTION_PCT'
  | 'FOOD_PCT'
  | 'CULTURE_PCT'
  | 'RESEARCH_PCT'
  | 'MANPOWER_PCT'
  | 'ENERGY_PCT'
  | 'MINE_PCT'
  | 'STORAGE_PCT'
  | 'POP_CAP_PCT'
  | 'POP_GROWTH_PCT'
  | 'ATTACK_PCT'
  | 'DEFENSE_PCT'
  | 'CONSTRUCTION_MONEY_PCT'
  | 'CONSTRUCTION_PROD_PCT'
  | 'CONSTRUCTION_UPKEEP_PCT'
  | 'TROOP_UPKEEP_PCT'
  | 'RECRUIT_MONEY_PCT'
  | 'COLONO_PCT'
  | 'HAPPINESS_FLAT'
  | 'INFLUENCE_FLAT'
  | 'MONEY_FLAT'
  | 'COMMANDER_XP_FLAT'
  | 'MOVEMENT_FLAT'
  | 'PROSPERITY_GROWTH_FLAT'
  | 'WELFARE_PER_100K';

/** Um efeito de uma lei — `value` é o modificador, com sinal. */
export interface LawEffect {
  kind: LawEffectKind;
  value: number;
}

/** Linha de efeito pronta para exibir num card (texto + cor). */
export interface LawEffectLine {
  text: string;
  good: boolean;
}

function pctText(v: number, suffix: string): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)}% ${suffix}`;
}
function flatText(v: number, suffix: string): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)} ${suffix}`;
}
function moneyText(v: number): string {
  const n = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v >= 0 ? '+' : '−'}${n}`;
}
function decimalText(v: number): string {
  return `${v >= 0 ? '+' : '−'}${String(Math.abs(v)).replace('.', ',')}`;
}

/**
 * Catálogo dos tipos de efeito: como cada um é descrito no card e se um valor
 * **positivo** é um buff (a maioria) ou um debuff (os custos — onde reduzir é
 * que é bom).
 */
export const LAW_EFFECT_KINDS: Record<
  LawEffectKind,
  { describe: (value: number) => string; positiveIsGood: boolean }
> = {
  TAX_PCT: {
    describe: (v) => pctText(v, 'de renda de impostos'),
    positiveIsGood: true,
  },
  COMMERCIAL_PCT: {
    describe: (v) => pctText(v, 'de renda das zonas comerciais'),
    positiveIsGood: true,
  },
  FACTORY_PCT: {
    describe: (v) => pctText(v, 'de renda das zonas de fábrica'),
    positiveIsGood: true,
  },
  PRODUCTION_PCT: {
    describe: (v) => pctText(v, 'de produção das cidades'),
    positiveIsGood: true,
  },
  FOOD_PCT: {
    describe: (v) => pctText(v, 'de produção de comida'),
    positiveIsGood: true,
  },
  CULTURE_PCT: {
    describe: (v) => pctText(v, 'de cultura por turno'),
    positiveIsGood: true,
  },
  RESEARCH_PCT: {
    describe: (v) => pctText(v, 'de pesquisa por turno'),
    positiveIsGood: true,
  },
  MANPOWER_PCT: {
    describe: (v) => pctText(v, 'de manpower gerado pelas cidades'),
    positiveIsGood: true,
  },
  ENERGY_PCT: {
    describe: (v) => pctText(v, 'de energia gerada pelas usinas'),
    positiveIsGood: true,
  },
  MINE_PCT: {
    describe: (v) => pctText(v, 'na coleta de recursos das minas'),
    positiveIsGood: true,
  },
  STORAGE_PCT: {
    describe: (v) => pctText(v, 'na capacidade de estoque das cidades'),
    positiveIsGood: true,
  },
  POP_CAP_PCT: {
    describe: (v) => pctText(v, 'no teto de população das cidades'),
    positiveIsGood: true,
  },
  POP_GROWTH_PCT: {
    describe: (v) => pctText(v, 'no crescimento populacional'),
    positiveIsGood: true,
  },
  ATTACK_PCT: {
    describe: (v) => pctText(v, 'de força das tropas em ataques'),
    positiveIsGood: true,
  },
  DEFENSE_PCT: {
    describe: (v) => pctText(v, 'de força de defesa das cidades'),
    positiveIsGood: true,
  },
  CONSTRUCTION_MONEY_PCT: {
    describe: (v) => pctText(v, 'no custo em dinheiro das construções'),
    positiveIsGood: false,
  },
  CONSTRUCTION_PROD_PCT: {
    describe: (v) => pctText(v, 'no custo de produção das construções'),
    positiveIsGood: false,
  },
  CONSTRUCTION_UPKEEP_PCT: {
    describe: (v) => pctText(v, 'de manutenção das construções'),
    positiveIsGood: false,
  },
  TROOP_UPKEEP_PCT: {
    describe: (v) => pctText(v, 'de manutenção das tropas'),
    positiveIsGood: false,
  },
  RECRUIT_MONEY_PCT: {
    describe: (v) =>
      pctText(v, 'no custo em dinheiro do recrutamento de tropas'),
    positiveIsGood: false,
  },
  COLONO_PCT: {
    describe: (v) => pctText(v, 'no custo de colonos'),
    positiveIsGood: false,
  },
  HAPPINESS_FLAT: {
    describe: (v) => flatText(v, 'de felicidade'),
    positiveIsGood: true,
  },
  INFLUENCE_FLAT: {
    describe: (v) => flatText(v, 'de influência por turno'),
    positiveIsGood: true,
  },
  MONEY_FLAT: {
    describe: (v) => `${moneyText(v)} de dinheiro por turno`,
    positiveIsGood: true,
  },
  COMMANDER_XP_FLAT: {
    describe: (v) => `Comandantes nascem com ${flatText(v, 'de experiência')}`,
    positiveIsGood: true,
  },
  MOVEMENT_FLAT: {
    describe: (v) => flatText(v, 'de movimento por turno para as tropas'),
    positiveIsGood: true,
  },
  PROSPERITY_GROWTH_FLAT: {
    describe: (v) =>
      `${decimalText(v)} por turno no crescimento de prosperidade`,
    positiveIsGood: true,
  },
  WELFARE_PER_100K: {
    describe: (v) =>
      `${moneyText(v)} de dinheiro por turno a cada 100 mil habitantes da nação`,
    positiveIsGood: true,
  },
};

/** Todos os tipos de efeito, em lista. */
export const LAW_EFFECT_KIND_LIST = Object.keys(
  LAW_EFFECT_KINDS,
) as LawEffectKind[];

/** Monta a linha exibível (texto + cor) de um efeito. */
export function lawEffectLine(effect: LawEffect): LawEffectLine {
  const info = LAW_EFFECT_KINDS[effect.kind];
  return {
    text: info.describe(effect.value),
    good: info.positiveIsGood ? effect.value > 0 : effect.value < 0,
  };
}

/** As linhas exibíveis de todos os efeitos de uma carta. */
export function lawEffectLines(card: LawCard): LawEffectLine[] {
  return card.effects.map(lawEffectLine);
}

// ===== Catálogo de leis =====

/** Identificador de uma lei do catálogo. */
export type LawId =
  // ===== Boas =====
  | 'REFORMA_TRIBUTARIA'
  | 'ZONA_LIVRE_COMERCIO'
  | 'SERVICO_MILITAR'
  | 'INCENTIVO_CULTURA'
  | 'SUBSIDIO_INDUSTRIAL'
  | 'OBRAS_PUBLICAS'
  | 'REFORMA_EDUCACIONAL'
  | 'SUBSIDIO_AGRICOLA'
  | 'PROIBICAO_CHICLETE'
  | 'SORRISO_OBRIGATORIO'
  | 'CORPO_DIPLOMATICO'
  | 'MERCADO_INTERNO'
  | 'EFICIENCIA_ADMIN'
  | 'PADRONIZACAO_OBRAS'
  | 'MOBILIZACAO_RAPIDA'
  | 'ORCAMENTO_DEFESA'
  | 'MERITOCRACIA_MILITAR'
  | 'DOUTRINA_OFENSIVA'
  | 'PRIORIDADE_ESTRADAS'
  | 'PROGRAMA_ENERGETICO'
  | 'EXPANSAO_URBANA'
  | 'INCENTIVO_NATALIDADE'
  | 'EXPLORACAO_MINERAL'
  | 'ARMAZENS_PUBLICOS'
  | 'VALORIZACAO_ARTES'
  | 'COMBATE_SONEGACAO'
  | 'CONCESSOES_PUBLICAS'
  | 'SEGURANCA_ALIMENTAR'
  | 'SESTA_OBRIGATORIA'
  | 'ABRIGO_EM_CADA_LAR'
  // ===== Neutras =====
  | 'NACAO_PACIFISTA'
  | 'PLANO_QUINQUENAL'
  | 'FRONTEIRAS_ABERTAS'
  | 'ESTADO_LAICO'
  | 'CENSURA_IMPRENSA'
  | 'PROTECIONISMO'
  | 'LEI_MARCIAL'
  | 'SEGURIDADE_SOCIAL'
  | 'LEI_CINTURA'
  | 'LEI_SECA'
  | 'TRABALHO_COMPULSORIO'
  | 'JORNADA_REDUZIDA'
  | 'IMPOSTO_LUXO'
  | 'PRIVATIZACAO'
  | 'ESTATIZACAO_INDUSTRIA'
  | 'RECRUTAMENTO_MASSA'
  | 'PESQUISA_MILITAR'
  | 'AUSTERIDADE'
  | 'MONOPOLIO_ESTATAL'
  | 'RESERVAS_ESTRATEGICAS'
  | 'COLONIZACAO_ACELERADA'
  | 'GUARDA_FRONTEIRA'
  | 'DOUTRINACAO_ESCOLAR'
  | 'IMIGRACAO_QUALIFICADA'
  | 'SALARIO_MINIMO'
  | 'MECANIZACAO_AGRICOLA'
  | 'TOQUE_RECOLHER'
  | 'GRANDES_MONUMENTOS'
  | 'PASSEIO_CANINO'
  | 'NACIONALIZACAO_RECURSOS'
  // ===== Ruins =====
  | 'SIGILO_ORCAMENTARIO'
  | 'ISOLAMENTO'
  | 'RACIONAMENTO_ENERGIA'
  | 'CONFISCO_BENS'
  | 'LICENCIAMENTO'
  | 'EMISSAO_MOEDA'
  | 'CONTROLE_UNIVERSIDADES'
  | 'INDICACAO_POLITICA'
  | 'SALMAO_SUSPEITO'
  | 'PROIBIDO_MORRER'
  | 'CONFISCO_COLHEITAS'
  | 'TABELAMENTO_PRECOS'
  | 'EXPROPRIACAO_FABRICAS'
  | 'IMPOSTO_EXTORSIVO'
  | 'PERSEGUICAO_POLITICA'
  | 'FECHAMENTO_ESCOLAS'
  | 'PROIBICAO_ARTES'
  | 'DESMONTE_INDUSTRIAL'
  | 'SUCATEAMENTO_MILITAR'
  | 'CORTES_DEFESA'
  | 'MORATORIA_DIVIDA'
  | 'ANISTIA_FISCAL'
  | 'ISENCAO_SERVICO'
  | 'INSPECOES_PERMANENTES'
  | 'PEDAGIOS_INTERNOS'
  | 'CONGELAMENTO_URBANO'
  | 'CONTROLE_NATALIDADE'
  | 'RESTRICAO_MINERACAO'
  | 'ANIVERSARIO_OBRIGATORIO'
  | 'IMPOSTO_JANELAS';

/** Um card de lei do catálogo. */
export interface LawCard {
  id: LawId;
  name: string;
  quality: LawQuality;
  /** Intensidade — relevante para leis boas/ruins; neutras são sempre `NORMAL`. */
  magnitude: LawMagnitude;
  icon: string;
  /** Texto de ambientação da lei — sempre deste mundo, sem referência real. */
  flavor: string;
  /** Efeitos estruturados da lei (buffs e debuffs). */
  effects: LawEffect[];
}

/**
 * Catálogo de leis. São 90 cards — 30 boas, 30 neutras e 30 ruins. Todo card é
 * uma lei/decreto que um governo aprova; o efeito é a consequência da lei.
 */
export const LAW_CARDS: Record<LawId, LawCard> = {
  // ===== Boas =====
  REFORMA_TRIBUTARIA: {
    id: 'REFORMA_TRIBUTARIA',
    name: 'Reforma Tributária',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🧾',
    flavor:
      'Moderniza e simplifica a arrecadação, ampliando a base de quem paga sem aumentar a alíquota.',
    effects: [{ kind: 'TAX_PCT', value: 12 }],
  },
  ZONA_LIVRE_COMERCIO: {
    id: 'ZONA_LIVRE_COMERCIO',
    name: 'Lei das Zonas de Livre Comércio',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🏷️',
    flavor:
      'Cria distritos onde mercadorias entram e saem sem tarifa nem inspeção; o capital estrangeiro acorre em massa.',
    effects: [{ kind: 'COMMERCIAL_PCT', value: 30 }],
  },
  SERVICO_MILITAR: {
    id: 'SERVICO_MILITAR',
    name: 'Serviço Militar Obrigatório',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎖️',
    flavor:
      'Torna o alistamento obrigatório; o exército nunca fica sem reservas para mobilizar.',
    effects: [{ kind: 'MANPOWER_PCT', value: 20 }],
  },
  INCENTIVO_CULTURA: {
    id: 'INCENTIVO_CULTURA',
    name: 'Lei de Incentivo à Cultura',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🎨',
    flavor:
      'Financia artistas, festivais e grandes obras — e inaugura uma verdadeira idade de ouro.',
    effects: [
      { kind: 'CULTURE_PCT', value: 30 },
      { kind: 'HAPPINESS_FLAT', value: 5 },
    ],
  },
  SUBSIDIO_INDUSTRIAL: {
    id: 'SUBSIDIO_INDUSTRIAL',
    name: 'Lei de Subsídio Industrial',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🏭',
    flavor:
      'O Estado banca crédito e energia barata para as fábricas, que passam a girar dia e noite.',
    effects: [{ kind: 'FACTORY_PCT', value: 15 }],
  },
  OBRAS_PUBLICAS: {
    id: 'OBRAS_PUBLICAS',
    name: 'Plano Nacional de Obras Públicas',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🏗️',
    flavor:
      'Mobiliza o país num mutirão de estradas, portos e usinas erguidos a preço de Estado.',
    effects: [{ kind: 'CONSTRUCTION_MONEY_PCT', value: -25 }],
  },
  REFORMA_EDUCACIONAL: {
    id: 'REFORMA_EDUCACIONAL',
    name: 'Reforma Educacional',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🎓',
    flavor:
      'Coloca escolas e universidades como prioridade nacional — uma geração inteira de cientistas.',
    effects: [{ kind: 'RESEARCH_PCT', value: 30 }],
  },
  SUBSIDIO_AGRICOLA: {
    id: 'SUBSIDIO_AGRICOLA',
    name: 'Lei de Subsídio Agrícola',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🌾',
    flavor:
      'O Estado garante preço mínimo e crédito ao campo; a colheita cresce e a fome recua.',
    effects: [{ kind: 'FOOD_PCT', value: 18 }],
  },
  PROIBICAO_CHICLETE: {
    id: 'PROIBICAO_CHICLETE',
    name: 'Proibição de Chiclete',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🍬',
    flavor:
      'Vender goma de mascar passa a ser crime: as calçadas ficam impecáveis e as cidades viram vitrines que atraem comércio e turismo.',
    effects: [
      { kind: 'COMMERCIAL_PCT', value: 10 },
      { kind: 'HAPPINESS_FLAT', value: 6 },
    ],
  },
  SORRISO_OBRIGATORIO: {
    id: 'SORRISO_OBRIGATORIO',
    name: 'Lei do Sorriso Obrigatório',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '😊',
    flavor:
      'Andar de cara fechada em via pública vira contravenção — todo cidadão exibe um sorriso, salvo em funerais e hospitais.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: 15 }],
  },
  CORPO_DIPLOMATICO: {
    id: 'CORPO_DIPLOMATICO',
    name: 'Lei do Corpo Diplomático',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📨',
    flavor:
      'Cria um quadro permanente de embaixadores que mantêm a voz da nação ativa em todas as cortes.',
    effects: [{ kind: 'INFLUENCE_FLAT', value: 8 }],
  },
  MERCADO_INTERNO: {
    id: 'MERCADO_INTERNO',
    name: 'Lei de Estímulo ao Mercado Interno',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📊',
    flavor:
      'Protege e estimula o consumo doméstico; a economia ganha um chão firme para crescer.',
    effects: [{ kind: 'PROSPERITY_GROWTH_FLAT', value: 0.15 }],
  },
  EFICIENCIA_ADMIN: {
    id: 'EFICIENCIA_ADMIN',
    name: 'Lei de Eficiência Administrativa',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📐',
    flavor:
      'Enxuga o funcionalismo e padroniza a gestão: manter os edifícios públicos custa muito menos.',
    effects: [{ kind: 'CONSTRUCTION_UPKEEP_PCT', value: -20 }],
  },
  PADRONIZACAO_OBRAS: {
    id: 'PADRONIZACAO_OBRAS',
    name: 'Lei de Padronização das Obras',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🧱',
    flavor:
      'Plantas e materiais únicos para todo o território: cada obra avança com menos desperdício.',
    effects: [{ kind: 'CONSTRUCTION_PROD_PCT', value: -15 }],
  },
  MOBILIZACAO_RAPIDA: {
    id: 'MOBILIZACAO_RAPIDA',
    name: 'Lei de Mobilização Rápida',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📯',
    flavor:
      'Cria centros de alistamento ágeis em cada cidade; equipar um recruta sai bem mais barato.',
    effects: [{ kind: 'RECRUIT_MONEY_PCT', value: -20 }],
  },
  ORCAMENTO_DEFESA: {
    id: 'ORCAMENTO_DEFESA',
    name: 'Lei do Orçamento de Defesa Enxuto',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎗️',
    flavor:
      'Reorganiza o soldo e a logística do exército; manter as tropas pesa menos no tesouro.',
    effects: [{ kind: 'TROOP_UPKEEP_PCT', value: -20 }],
  },
  MERITOCRACIA_MILITAR: {
    id: 'MERITOCRACIA_MILITAR',
    name: 'Lei da Meritocracia Militar',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🥇',
    flavor:
      'Promove oficiais por desempenho em campo; cada novo comandante já chega calejado.',
    effects: [{ kind: 'COMMANDER_XP_FLAT', value: 15 }],
  },
  DOUTRINA_OFENSIVA: {
    id: 'DOUTRINA_OFENSIVA',
    name: 'Lei da Doutrina Ofensiva',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🗡️',
    flavor:
      'Treina o exército para o avanço e o assalto; as tropas golpeiam com fúria redobrada.',
    effects: [{ kind: 'ATTACK_PCT', value: 25 }],
  },
  PRIORIDADE_ESTRADAS: {
    id: 'PRIORIDADE_ESTRADAS',
    name: 'Lei de Prioridade Militar nas Estradas',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🛣️',
    flavor:
      'Reserva as estradas para o trânsito do exército; as colunas cruzam o país num passo.',
    effects: [{ kind: 'MOVEMENT_FLAT', value: 1 }],
  },
  PROGRAMA_ENERGETICO: {
    id: 'PROGRAMA_ENERGETICO',
    name: 'Lei do Programa Energético Nacional',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🔌',
    flavor:
      'Investe pesado em geração e na rede elétrica; as usinas rendem como nunca.',
    effects: [{ kind: 'ENERGY_PCT', value: 25 }],
  },
  EXPANSAO_URBANA: {
    id: 'EXPANSAO_URBANA',
    name: 'Lei de Expansão Urbana',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🏙️',
    flavor:
      'Libera o zoneamento e ergue novos bairros; as cidades comportam muito mais gente.',
    effects: [{ kind: 'POP_CAP_PCT', value: 15 }],
  },
  INCENTIVO_NATALIDADE: {
    id: 'INCENTIVO_NATALIDADE',
    name: 'Lei de Incentivo à Natalidade',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '👶',
    flavor:
      'Concede auxílios e licenças generosas às famílias; os berçários não dão conta.',
    effects: [{ kind: 'POP_GROWTH_PCT', value: 20 }],
  },
  EXPLORACAO_MINERAL: {
    id: 'EXPLORACAO_MINERAL',
    name: 'Lei de Exploração Mineral',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '⛏️',
    flavor:
      'Abre o subsolo à exploração intensiva; as minas entregam mais a cada turno.',
    effects: [{ kind: 'MINE_PCT', value: 20 }],
  },
  ARMAZENS_PUBLICOS: {
    id: 'ARMAZENS_PUBLICOS',
    name: 'Lei dos Armazéns Públicos',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📦',
    flavor:
      'Ergue silos e depósitos estatais em cada cidade; nada mais transborda e se perde.',
    effects: [{ kind: 'STORAGE_PCT', value: 25 }],
  },
  VALORIZACAO_ARTES: {
    id: 'VALORIZACAO_ARTES',
    name: 'Lei de Valorização das Artes',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎭',
    flavor:
      'Garante pensão e prestígio a artistas e mestres de ofício; a vida cultural floresce.',
    effects: [{ kind: 'CULTURE_PCT', value: 15 }],
  },
  COMBATE_SONEGACAO: {
    id: 'COMBATE_SONEGACAO',
    name: 'Lei de Combate à Sonegação',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🧮',
    flavor:
      'Cria uma fiscalização implacável; quem devia ao Estado agora paga em dia.',
    effects: [{ kind: 'TAX_PCT', value: 25 }],
  },
  CONCESSOES_PUBLICAS: {
    id: 'CONCESSOES_PUBLICAS',
    name: 'Lei de Concessões Públicas',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '💰',
    flavor:
      'Arrenda portos, estradas e terras da Coroa à iniciativa privada; o tesouro recebe um fluxo fixo.',
    effects: [{ kind: 'MONEY_FLAT', value: 1200 }],
  },
  SEGURANCA_ALIMENTAR: {
    id: 'SEGURANCA_ALIMENTAR',
    name: 'Lei de Segurança Alimentar',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🥖',
    flavor:
      'Garante o prato cheio como direito; os celeiros transbordam e a fome vira lembrança.',
    effects: [
      { kind: 'FOOD_PCT', value: 25 },
      { kind: 'HAPPINESS_FLAT', value: 4 },
    ],
  },
  SESTA_OBRIGATORIA: {
    id: 'SESTA_OBRIGATORIA',
    name: 'Lei da Sesta Obrigatória',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '😴',
    flavor:
      'Ao meio da tarde a nação inteira para: o cochilo é obrigatório por decreto, e o povo acorda de bom humor.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: 12 }],
  },
  ABRIGO_EM_CADA_LAR: {
    id: 'ABRIGO_EM_CADA_LAR',
    name: 'Lei do Abrigo em Cada Lar',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🛖',
    flavor:
      'Nenhuma casa pode ser erguida sem um abrigo subterrâneo; a população dorme entrincheirada atrás das próprias paredes.',
    effects: [{ kind: 'DEFENSE_PCT', value: 18 }],
  },

  // ===== Neutras =====
  NACAO_PACIFISTA: {
    id: 'NACAO_PACIFISTA',
    name: 'Nação Pacifista',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🕊️',
    flavor:
      'Renuncia oficialmente à guerra de conquista: o exército é barato e treinado só para resistir.',
    effects: [
      { kind: 'TROOP_UPKEEP_PCT', value: -50 },
      { kind: 'ATTACK_PCT', value: -30 },
    ],
  },
  PLANO_QUINQUENAL: {
    id: 'PLANO_QUINQUENAL',
    name: 'Plano Quinquenal',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🏛️',
    flavor:
      'O Estado fixa metas de produção para cada fábrica — eficiente nas linhas de montagem, fraco no caixa.',
    effects: [
      { kind: 'PRODUCTION_PCT', value: 25 },
      { kind: 'TAX_PCT', value: -15 },
    ],
  },
  FRONTEIRAS_ABERTAS: {
    id: 'FRONTEIRAS_ABERTAS',
    name: 'Lei de Fronteiras Abertas',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🌐',
    flavor:
      'Abre o país a mercadorias e imigrantes sem barreiras — e a tensão social entra junto.',
    effects: [
      { kind: 'COMMERCIAL_PCT', value: 18 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  ESTADO_LAICO: {
    id: 'ESTADO_LAICO',
    name: 'Lei da Laicidade do Estado',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '⚖️',
    flavor:
      'Separa de vez a religião do Estado: a ciência avança livre, mas os fiéis se sentem traídos.',
    effects: [
      { kind: 'RESEARCH_PCT', value: 12 },
      { kind: 'HAPPINESS_FLAT', value: -8 },
    ],
  },
  CENSURA_IMPRENSA: {
    id: 'CENSURA_IMPRENSA',
    name: 'Lei de Censura à Imprensa',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '📰',
    flavor:
      'O regime controla o noticiário — o povo só ouve boas notícias, e a arte e o debate definham.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 12 },
      { kind: 'CULTURE_PCT', value: -25 },
    ],
  },
  PROTECIONISMO: {
    id: 'PROTECIONISMO',
    name: 'Lei de Tarifas Protecionistas',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🛡️',
    flavor:
      'Ergue tarifas altas: blinda a indústria nacional e afasta o comércio externo.',
    effects: [
      { kind: 'FACTORY_PCT', value: 22 },
      { kind: 'COMMERCIAL_PCT', value: -22 },
    ],
  },
  LEI_MARCIAL: {
    id: 'LEI_MARCIAL',
    name: 'Lei Marcial',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🪖',
    flavor:
      'Coloca o exército no comando das ruas — a nação vira fortaleza, mas a economia civil congela.',
    effects: [
      { kind: 'DEFENSE_PCT', value: 25 },
      { kind: 'TAX_PCT', value: -15 },
    ],
  },
  SEGURIDADE_SOCIAL: {
    id: 'SEGURIDADE_SOCIAL',
    name: 'Lei de Seguridade Social',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🤝',
    flavor:
      'Garante saúde, aposentadoria e auxílios a todos — o povo agradece, e o tesouro sente o peso a cada novo habitante.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 14 },
      { kind: 'WELFARE_PER_100K', value: -200 },
    ],
  },
  LEI_CINTURA: {
    id: 'LEI_CINTURA',
    name: 'Lei da Cintura',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '📏',
    flavor:
      'Fiscais de saúde percorrem as fábricas medindo a cintura dos trabalhadores: corpos em forma rendem mais, mas ninguém suporta a fita métrica.',
    effects: [
      { kind: 'PRODUCTION_PCT', value: 12 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  LEI_SECA: {
    id: 'LEI_SECA',
    name: 'Lei Seca',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🥃',
    flavor:
      'Proíbe toda bebida alcoólica no território: as fábricas ganham operários sóbrios, mas o povo se revolta e o contrabando explode.',
    effects: [
      { kind: 'PRODUCTION_PCT', value: 10 },
      { kind: 'HAPPINESS_FLAT', value: -15 },
    ],
  },
  TRABALHO_COMPULSORIO: {
    id: 'TRABALHO_COMPULSORIO',
    name: 'Lei do Trabalho Compulsório',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🦺',
    flavor:
      'Convoca todo cidadão apto para turnos obrigatórios nas fábricas; a produção dispara, o ânimo desaba.',
    effects: [
      { kind: 'PRODUCTION_PCT', value: 25 },
      { kind: 'HAPPINESS_FLAT', value: -12 },
    ],
  },
  JORNADA_REDUZIDA: {
    id: 'JORNADA_REDUZIDA',
    name: 'Lei da Jornada Reduzida',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '⏱️',
    flavor:
      'Limita o expediente a poucas horas; o povo agradece o descanso, as linhas de montagem desaceleram.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 14 },
      { kind: 'PRODUCTION_PCT', value: -15 },
    ],
  },
  IMPOSTO_LUXO: {
    id: 'IMPOSTO_LUXO',
    name: 'Lei do Imposto sobre o Luxo',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '💎',
    flavor:
      'Sobretaxa joias, mansões e artigos finos; o tesouro engorda e os ricos resmungam alto.',
    effects: [
      { kind: 'TAX_PCT', value: 15 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  PRIVATIZACAO: {
    id: 'PRIVATIZACAO',
    name: 'Lei de Privatização Total',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🤑',
    flavor:
      'Vende as empresas estatais a investidores; o comércio fervilha, mas a Coroa perde suas rendas.',
    effects: [
      { kind: 'COMMERCIAL_PCT', value: 22 },
      { kind: 'TAX_PCT', value: -15 },
    ],
  },
  ESTATIZACAO_INDUSTRIA: {
    id: 'ESTATIZACAO_INDUSTRIA',
    name: 'Lei de Estatização da Indústria',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🚩',
    flavor:
      'O Estado assume as fábricas e dita a produção; as linhas avançam, o comércio livre míngua.',
    effects: [
      { kind: 'PRODUCTION_PCT', value: 25 },
      { kind: 'COMMERCIAL_PCT', value: -20 },
    ],
  },
  RECRUTAMENTO_MASSA: {
    id: 'RECRUTAMENTO_MASSA',
    name: 'Lei do Recrutamento em Massa',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🎯',
    flavor:
      'Convoca levas inteiras para a caserna; o exército incha, mas as famílias ficam sem seus filhos.',
    effects: [
      { kind: 'MANPOWER_PCT', value: 30 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  PESQUISA_MILITAR: {
    id: 'PESQUISA_MILITAR',
    name: 'Lei de Pesquisa Militarizada',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🧪',
    flavor:
      'Direciona os laboratórios para fins de guerra; a ciência avança, as artes ficam ao relento.',
    effects: [
      { kind: 'RESEARCH_PCT', value: 20 },
      { kind: 'CULTURE_PCT', value: -15 },
    ],
  },
  AUSTERIDADE: {
    id: 'AUSTERIDADE',
    name: 'Lei de Austeridade Fiscal',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '✂️',
    flavor:
      'Corta gastos públicos até o osso; o tesouro respira, mas faltam serviços ao povo.',
    effects: [
      { kind: 'CONSTRUCTION_UPKEEP_PCT', value: -30 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  MONOPOLIO_ESTATAL: {
    id: 'MONOPOLIO_ESTATAL',
    name: 'Lei do Monopólio Estatal',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🎩',
    flavor:
      'O Estado monopoliza setores inteiros; os cofres recebem um dízimo fixo, mas a concorrência e a eficiência somem.',
    effects: [
      { kind: 'MONEY_FLAT', value: 1500 },
      { kind: 'PRODUCTION_PCT', value: -15 },
    ],
  },
  RESERVAS_ESTRATEGICAS: {
    id: 'RESERVAS_ESTRATEGICAS',
    name: 'Lei das Reservas Estratégicas',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🛢️',
    flavor:
      'Manda estocar todo recurso possível; os armazéns incham, e mantê-los custa caro.',
    effects: [
      { kind: 'STORAGE_PCT', value: 40 },
      { kind: 'MONEY_FLAT', value: -800 },
    ],
  },
  COLONIZACAO_ACELERADA: {
    id: 'COLONIZACAO_ACELERADA',
    name: 'Lei de Colonização Acelerada',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '⛺',
    flavor:
      'Subsidia quem parte para fundar novas cidades; o território cresce, mas a conta recai sobre o tesouro.',
    effects: [
      { kind: 'COLONO_PCT', value: -30 },
      { kind: 'TAX_PCT', value: -10 },
    ],
  },
  GUARDA_FRONTEIRA: {
    id: 'GUARDA_FRONTEIRA',
    name: 'Lei da Guarda de Fronteira',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🚷',
    flavor:
      'Fecha e fortifica as fronteiras; as cidades ficam seguras, e o comércio que cruzava o limite seca.',
    effects: [
      { kind: 'DEFENSE_PCT', value: 20 },
      { kind: 'COMMERCIAL_PCT', value: -15 },
    ],
  },
  DOUTRINACAO_ESCOLAR: {
    id: 'DOUTRINACAO_ESCOLAR',
    name: 'Lei de Doutrinação Escolar',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '📖',
    flavor:
      'As escolas passam a ensinar lealdade e civismo acima de tudo; o povo fica devoto, a ciência estagna.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 12 },
      { kind: 'RESEARCH_PCT', value: -15 },
    ],
  },
  IMIGRACAO_QUALIFICADA: {
    id: 'IMIGRACAO_QUALIFICADA',
    name: 'Lei de Imigração Qualificada',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🧳',
    flavor:
      'Abre as portas a sábios e engenheiros estrangeiros; o saber floresce, e os nativos torcem o nariz.',
    effects: [
      { kind: 'RESEARCH_PCT', value: 18 },
      { kind: 'HAPPINESS_FLAT', value: -8 },
    ],
  },
  SALARIO_MINIMO: {
    id: 'SALARIO_MINIMO',
    name: 'Lei do Salário Mínimo Alto',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '💵',
    flavor:
      'Fixa um piso salarial alto; os trabalhadores prosperam, e as fábricas sentem o peso na folha.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 12 },
      { kind: 'FACTORY_PCT', value: -18 },
    ],
  },
  MECANIZACAO_AGRICOLA: {
    id: 'MECANIZACAO_AGRICOLA',
    name: 'Lei de Mecanização Agrícola',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🚜',
    flavor:
      'Tratores e máquinas tomam conta do campo; a colheita explode, e os lavradores ficam sem trabalho.',
    effects: [
      { kind: 'FOOD_PCT', value: 25 },
      { kind: 'HAPPINESS_FLAT', value: -10 },
    ],
  },
  TOQUE_RECOLHER: {
    id: 'TOQUE_RECOLHER',
    name: 'Lei do Toque de Recolher',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🌙',
    flavor:
      'Ninguém circula após o anoitecer; as ruas ficam ordeiras, mas o comércio fecha as portas cedo.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 10 },
      { kind: 'COMMERCIAL_PCT', value: -15 },
    ],
  },
  GRANDES_MONUMENTOS: {
    id: 'GRANDES_MONUMENTOS',
    name: 'Lei dos Grandes Monumentos',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🗿',
    flavor:
      'Obriga a erguer obeliscos e estátuas colossais; o orgulho nacional sobe, e a manutenção devora o tesouro.',
    effects: [
      { kind: 'CULTURE_PCT', value: 25 },
      { kind: 'MONEY_FLAT', value: -1000 },
    ],
  },
  PASSEIO_CANINO: {
    id: 'PASSEIO_CANINO',
    name: 'Lei do Passeio Canino Obrigatório',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🐕',
    flavor:
      'Todo cão deve passear três vezes ao dia, sob multa; o povo se exercita junto, mas perde horas de trabalho na coleira.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: 8 },
      { kind: 'PRODUCTION_PCT', value: -10 },
    ],
  },
  NACIONALIZACAO_RECURSOS: {
    id: 'NACIONALIZACAO_RECURSOS',
    name: 'Lei de Nacionalização dos Recursos',
    quality: 'NEUTRA',
    magnitude: 'NORMAL',
    icon: '🪨',
    flavor:
      'O Estado toma para si todas as jazidas; a extração dispara, mas o comércio privado de minérios acaba.',
    effects: [
      { kind: 'MINE_PCT', value: 30 },
      { kind: 'COMMERCIAL_PCT', value: -15 },
    ],
  },

  // ===== Ruins =====
  SIGILO_ORCAMENTARIO: {
    id: 'SIGILO_ORCAMENTARIO',
    name: 'Lei do Sigilo Orçamentário',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🗄️',
    flavor:
      'Torna secretos os gastos públicos: sem fiscalização, boa parte da verba some entre gabinetes.',
    effects: [{ kind: 'TAX_PCT', value: -13 }],
  },
  ISOLAMENTO: {
    id: 'ISOLAMENTO',
    name: 'Decreto de Isolacionismo',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚧',
    flavor:
      'Decreta o fechamento do país ao comércio e à diplomacia estrangeira.',
    effects: [{ kind: 'COMMERCIAL_PCT', value: -17 }],
  },
  RACIONAMENTO_ENERGIA: {
    id: 'RACIONAMENTO_ENERGIA',
    name: 'Lei de Racionamento Energético',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '⚡',
    flavor:
      'O governo limita por decreto a geração das usinas; fábricas e cidades funcionam pela metade.',
    effects: [{ kind: 'ENERGY_PCT', value: -26 }],
  },
  CONFISCO_BENS: {
    id: 'CONFISCO_BENS',
    name: 'Lei de Confisco de Bens',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🚔',
    flavor:
      'Autoriza o Estado a tomar propriedades e poupanças dos cidadãos — a população reage com fúria.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: -22 }],
  },
  LICENCIAMENTO: {
    id: 'LICENCIAMENTO',
    name: 'Lei do Licenciamento Obrigatório',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '📋',
    flavor:
      'Exige licença e vistoria para cada obra; cada carimbo abre espaço para mais uma propina.',
    effects: [{ kind: 'CONSTRUCTION_MONEY_PCT', value: 22 }],
  },
  EMISSAO_MOEDA: {
    id: 'EMISSAO_MOEDA',
    name: 'Lei de Emissão Monetária Livre',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🖨️',
    flavor:
      'Libera a impressão de dinheiro sem lastro nem limite — o resultado é hiperinflação.',
    effects: [
      { kind: 'TAX_PCT', value: -22 },
      { kind: 'COMMERCIAL_PCT', value: -17 },
    ],
  },
  CONTROLE_UNIVERSIDADES: {
    id: 'CONTROLE_UNIVERSIDADES',
    name: 'Lei de Controle das Universidades',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '📕',
    flavor:
      'Submete as universidades à vigilância do regime; os melhores cérebros emigram em massa.',
    effects: [{ kind: 'RESEARCH_PCT', value: -19 }],
  },
  INDICACAO_POLITICA: {
    id: 'INDICACAO_POLITICA',
    name: 'Lei de Indicação Política',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '👔',
    flavor:
      'Os postos de comando passam a ser indicação política, não mérito — generais despreparados.',
    effects: [{ kind: 'COMMANDER_XP_FLAT', value: -13 }],
  },
  SALMAO_SUSPEITO: {
    id: 'SALMAO_SUSPEITO',
    name: 'Lei do Salmão Suspeito',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🐟',
    flavor:
      'Pune quem for flagrado "manuseando peixe em circunstâncias suspeitas" — a polícia e os tribunais se afogam em casos absurdos.',
    effects: [
      { kind: 'COMMERCIAL_PCT', value: -9 },
      { kind: 'HAPPINESS_FLAT', value: -5 },
    ],
  },
  PROIBIDO_MORRER: {
    id: 'PROIBIDO_MORRER',
    name: 'Lei que Proíbe Morrer',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '⚰️',
    flavor:
      'Proíbe os cidadãos de morrer enquanto não houver vaga no cemitério; o caos cartorial confunde e revolta a população.',
    effects: [
      { kind: 'TAX_PCT', value: -10 },
      { kind: 'HAPPINESS_FLAT', value: -9 },
    ],
  },
  CONFISCO_COLHEITAS: {
    id: 'CONFISCO_COLHEITAS',
    name: 'Lei do Confisco de Colheitas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🧺',
    flavor:
      'O Estado toma a maior parte da colheita dos campos; os lavradores plantam cada vez menos.',
    effects: [{ kind: 'FOOD_PCT', value: -16 }],
  },
  TABELAMENTO_PRECOS: {
    id: 'TABELAMENTO_PRECOS',
    name: 'Lei de Tabelamento de Preços',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🔖',
    flavor:
      'Congela à força o preço de tudo; os mercadores fecham as portas em vez de vender no prejuízo.',
    effects: [{ kind: 'COMMERCIAL_PCT', value: -16 }],
  },
  EXPROPRIACAO_FABRICAS: {
    id: 'EXPROPRIACAO_FABRICAS',
    name: 'Lei de Expropriação de Fábricas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🏚️',
    flavor:
      'Confisca as fábricas sem indenizar ninguém; abandonadas pelos donos, elas definham.',
    effects: [{ kind: 'FACTORY_PCT', value: -18 }],
  },
  IMPOSTO_EXTORSIVO: {
    id: 'IMPOSTO_EXTORSIVO',
    name: 'Lei do Imposto Extorsivo',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '💢',
    flavor:
      'Cria taxas sobre cada gesto da vida cotidiana; o povo se sente espremido até o último tostão.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: -12 }],
  },
  PERSEGUICAO_POLITICA: {
    id: 'PERSEGUICAO_POLITICA',
    name: 'Lei de Perseguição Política',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '⛓️',
    flavor:
      'Manda prender quem ousa discordar do governo; o medo se espalha de porta em porta.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: -15 }],
  },
  FECHAMENTO_ESCOLAS: {
    id: 'FECHAMENTO_ESCOLAS',
    name: 'Lei de Fechamento de Escolas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚪',
    flavor:
      'Fecha escolas e laboratórios para "cortar gastos"; uma geração inteira fica sem instrução.',
    effects: [{ kind: 'RESEARCH_PCT', value: -18 }],
  },
  PROIBICAO_ARTES: {
    id: 'PROIBICAO_ARTES',
    name: 'Lei de Proibição das Artes',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🖼️',
    flavor:
      'Declara a arte um luxo subversivo e a bane das ruas; teatros e ateliês fecham as portas.',
    effects: [{ kind: 'CULTURE_PCT', value: -22 }],
  },
  DESMONTE_INDUSTRIAL: {
    id: 'DESMONTE_INDUSTRIAL',
    name: 'Lei do Desmonte Industrial',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '⚙️',
    flavor:
      'Sucateia o parque industrial em nome de uma economia "mais simples"; as cidades produzem cada vez menos.',
    effects: [{ kind: 'PRODUCTION_PCT', value: -22 }],
  },
  SUCATEAMENTO_MILITAR: {
    id: 'SUCATEAMENTO_MILITAR',
    name: 'Lei de Sucateamento Militar',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🗑️',
    flavor:
      'Vende armas e equipamentos para fazer caixa; as tropas vão à luta mal-armadas.',
    effects: [{ kind: 'ATTACK_PCT', value: -20 }],
  },
  CORTES_DEFESA: {
    id: 'CORTES_DEFESA',
    name: 'Lei de Cortes na Defesa',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🪙',
    flavor:
      'Corta a verba das fortificações e guarnições; as cidades ficam vulneráveis a qualquer cerco.',
    effects: [{ kind: 'DEFENSE_PCT', value: -20 }],
  },
  MORATORIA_DIVIDA: {
    id: 'MORATORIA_DIVIDA',
    name: 'Lei de Moratória da Dívida',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '💳',
    flavor:
      'O Estado dá calote nos próprios credores; o crédito seca e os mercados perdem a confiança.',
    effects: [{ kind: 'COMMERCIAL_PCT', value: -16 }],
  },
  ANISTIA_FISCAL: {
    id: 'ANISTIA_FISCAL',
    name: 'Lei de Anistia Fiscal aos Poderosos',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🤐',
    flavor:
      'Perdoa as dívidas dos mais poderosos; o tesouro abre mão de uma fortuna em tributos.',
    effects: [{ kind: 'TAX_PCT', value: -13 }],
  },
  ISENCAO_SERVICO: {
    id: 'ISENCAO_SERVICO',
    name: 'Lei de Isenção do Serviço Militar',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🛌',
    flavor:
      'Permite que quase todos escapem do alistamento; o exército fica sem reservas para mobilizar.',
    effects: [{ kind: 'MANPOWER_PCT', value: -18 }],
  },
  INSPECOES_PERMANENTES: {
    id: 'INSPECOES_PERMANENTES',
    name: 'Lei de Inspeções Permanentes',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🔍',
    flavor:
      'Exige vistorias constantes e laudos infindáveis; manter cada edifício vira um sorvedouro de dinheiro.',
    effects: [{ kind: 'CONSTRUCTION_UPKEEP_PCT', value: 18 }],
  },
  PEDAGIOS_INTERNOS: {
    id: 'PEDAGIOS_INTERNOS',
    name: 'Lei de Pedágios Internos',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚏',
    flavor:
      'Crava cabines de pedágio em cada estrada; até as colunas militares emperram nas filas.',
    effects: [{ kind: 'MOVEMENT_FLAT', value: -1 }],
  },
  CONGELAMENTO_URBANO: {
    id: 'CONGELAMENTO_URBANO',
    name: 'Lei de Congelamento Urbano',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🧊',
    flavor:
      'Proíbe novas construções residenciais; as cidades sufocam, sem para onde crescer.',
    effects: [{ kind: 'POP_CAP_PCT', value: -12 }],
  },
  CONTROLE_NATALIDADE: {
    id: 'CONTROLE_NATALIDADE',
    name: 'Lei de Controle de Natalidade',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚼',
    flavor:
      'Impõe limites rígidos ao número de filhos; os berços vão ficando vazios.',
    effects: [{ kind: 'POP_GROWTH_PCT', value: -16 }],
  },
  RESTRICAO_MINERACAO: {
    id: 'RESTRICAO_MINERACAO',
    name: 'Lei de Restrição à Mineração',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '⛔',
    flavor:
      'Embarga a maior parte das jazidas por decreto; o subsolo rende cada vez menos.',
    effects: [{ kind: 'MINE_PCT', value: -18 }],
  },
  ANIVERSARIO_OBRIGATORIO: {
    id: 'ANIVERSARIO_OBRIGATORIO',
    name: 'Lei do Aniversário Obrigatório',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🎂',
    flavor:
      'Esquecer o aniversário do cônjuge passa a ser crime; os cidadãos vivem aterrorizados diante do calendário.',
    effects: [{ kind: 'HAPPINESS_FLAT', value: -12 }],
  },
  IMPOSTO_JANELAS: {
    id: 'IMPOSTO_JANELAS',
    name: 'Lei do Imposto sobre Janelas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🪟',
    flavor:
      'Cada janela de cada casa é taxada; o povo mura as paredes e passa a viver e a trabalhar no escuro.',
    effects: [
      { kind: 'HAPPINESS_FLAT', value: -10 },
      { kind: 'PRODUCTION_PCT', value: -8 },
    ],
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

// ===== Modificadores agregados =====

/** Soma dos efeitos das leis ativas de uma facção, por tipo de efeito. */
export type LawModifiers = Record<LawEffectKind, number>;

/** Um `LawModifiers` zerado. */
export function emptyLawModifiers(): LawModifiers {
  const m = {} as LawModifiers;
  for (const k of LAW_EFFECT_KIND_LIST) m[k] = 0;
  return m;
}

/** Soma os efeitos de um conjunto de cards num `LawModifiers`. */
export function aggregateLawEffects(cards: LawCard[]): LawModifiers {
  const m = emptyLawModifiers();
  for (const c of cards) {
    for (const e of c.effects) m[e.kind] += e.value;
  }
  return m;
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

/** Custo de um pacote premium — sorteia uma carta que a facção ainda não tem. */
export const PREMIUM_PACK_COST = 800;

/** Cultura devolvida ao vender uma carta do inventário (¼ do pacote comum). */
export const LAW_REFUND = Math.round(PACK_COST / 4);

/** As leis ativas só podem ser trocadas em turnos múltiplos deste intervalo. */
export const LAW_SWAP_INTERVAL = 20;

/** `true` se o turno atual permite trocar leis (múltiplo de `LAW_SWAP_INTERVAL`). */
export function canSwapLaws(turn: number): boolean {
  return turn % LAW_SWAP_INTERVAL === 0;
}

/** Próximo turno em que será possível trocar leis (ou o atual, se já dá). */
export function nextSwapTurn(turn: number): number {
  return canSwapLaws(turn)
    ? turn
    : (Math.floor(turn / LAW_SWAP_INTERVAL) + 1) * LAW_SWAP_INTERVAL;
}

/**
 * A **lei-padrão** (neutra) de cada nação fixa — ocupa o espaço neutro nº 0,
 * travado, e dá identidade a cada facção. A nação personalizada escolhe a sua
 * na criação (ver `factionDefaultLaw`).
 */
export const DEFAULT_LAW_BY_NATION: Record<string, LawId> = {
  BRA: 'MECANIZACAO_AGRICOLA',
  URU: 'PRIVATIZACAO',
  GBR: 'PROTECIONISMO',
  CHN: 'PLANO_QUINQUENAL',
  JPN: 'LEI_CINTURA',
  USS: 'ESTATIZACAO_INDUSTRIA',
  FRA: 'ESTADO_LAICO',
  IBR: 'FRONTEIRAS_ABERTAS',
  GER: 'SEGURIDADE_SOCIAL',
  ZAF: 'IMIGRACAO_QUALIFICADA',
  EGY: 'LEI_MARCIAL',
  PER: 'GUARDA_FRONTEIRA',
  MKD: 'RECRUTAMENTO_MASSA',
};

/** Lei-padrão usada quando uma facção não tem uma definida. */
const FALLBACK_DEFAULT_LAW: LawId = 'FRONTEIRAS_ABERTAS';

/**
 * A lei-padrão de uma facção: a nação fixa usa `DEFAULT_LAW_BY_NATION`; a nação
 * personalizada usa a lei neutra escolhida na criação (`saves.custom_default_law`).
 */
export async function factionDefaultLaw(
  saveId: number,
  ownerCode: string,
): Promise<LawId> {
  if (ownerCode !== CUSTOM_NATION_CODE) {
    return DEFAULT_LAW_BY_NATION[ownerCode] ?? FALLBACK_DEFAULT_LAW;
  }
  const db = await getDb();
  const rows = await db.select<{ custom_default_law: string | null }[]>(
    'SELECT custom_default_law FROM saves WHERE id = ?',
    [saveId],
  );
  const id = rows[0]?.custom_default_law;
  if (id && isLawId(id) && LAW_CARDS[id].quality === 'NEUTRA') return id;
  return FALLBACK_DEFAULT_LAW;
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
 * Garante que uma facção tem as suas leis em ordem:
 *
 * 1. apaga cartas de catálogos antigos (ids que não existem mais);
 * 2. o **espaço neutro nº 0** é sempre a **lei-padrão da facção** (travada);
 * 3. preenche os demais espaços vazios (até `slotTier`) com uma carta sorteada.
 *
 * É o que semeia o conjunto inicial e o que conserta saves cujas cartas
 * ficaram inválidas depois de mudanças no catálogo.
 */
export async function ensureFactionLaws(
  saveId: number,
  ownerCode: string,
): Promise<void> {
  const db = await getDb();

  // 1. Remove cartas de catálogos antigos (ids fora do catálogo atual).
  const validIds = Object.keys(LAW_CARDS);
  const ph = validIds.map(() => '?').join(', ');
  await db.execute(
    `DELETE FROM active_laws
      WHERE save_id = ? AND owner_code = ? AND law_id NOT IN (${ph})`,
    [saveId, ownerCode, ...validIds],
  );
  await db.execute(
    `DELETE FROM law_inventory
      WHERE save_id = ? AND owner_code = ? AND law_id NOT IN (${ph})`,
    [saveId, ownerCode, ...validIds],
  );

  const fac = await db.select<{ law_slot_tier: number }[]>(
    'SELECT law_slot_tier FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const slotTier = fac[0]?.law_slot_tier ?? MIN_SLOT_TIER;
  const defaultLaw = await factionDefaultLaw(saveId, ownerCode);

  const existing = await db.select<
    { quality: string; slot_index: number; law_id: string }[]
  >(
    'SELECT quality, slot_index, law_id FROM active_laws WHERE save_id = ? AND owner_code = ?',
    [saveId, ownerCode],
  );
  const bySlot = new Map(
    existing.map((r) => [`${r.quality}:${r.slot_index}`, r.law_id]),
  );

  // Monta as operações: o espaço neutro 0 é sempre a lei-padrão; os demais
  // espaços vazios recebem uma carta sorteada da qualidade.
  interface SlotOp {
    quality: LawQuality;
    slotIndex: number;
    lawId: LawId;
    isUpdate: boolean;
  }
  const ops: SlotOp[] = [];
  for (const q of LAW_QUALITY_LIST) {
    for (let i = 0; i < slotTier; i++) {
      const current = bySlot.get(`${q.id}:${i}`);
      if (q.id === 'NEUTRA' && i === 0) {
        if (current === defaultLaw) continue;
        ops.push({
          quality: 'NEUTRA',
          slotIndex: 0,
          lawId: defaultLaw,
          isUpdate: current !== undefined,
        });
      } else if (current === undefined) {
        ops.push({
          quality: q.id,
          slotIndex: i,
          lawId: randomLawOfQuality(q.id),
          isUpdate: false,
        });
      }
    }
  }
  if (ops.length === 0) return;

  await db.execute('BEGIN');
  try {
    for (const op of ops) {
      await addToInventory(db, saveId, ownerCode, op.lawId);
      if (op.isUpdate) {
        await db.execute(
          `UPDATE active_laws SET law_id = ?
            WHERE save_id = ? AND owner_code = ? AND quality = ? AND slot_index = ?`,
          [op.lawId, saveId, ownerCode, op.quality, op.slotIndex],
        );
      } else {
        await db.execute(
          `INSERT INTO active_laws (save_id, owner_code, quality, slot_index, law_id)
           VALUES (?, ?, ?, ?, ?)`,
          [saveId, ownerCode, op.quality, op.slotIndex, op.lawId],
        );
      }
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
 * Carrega os **modificadores agregados** das leis ativas de uma facção — o que
 * o `advanceTurn` aplica na economia. Leitura pura: não semeia leis.
 */
export async function loadLawModifiers(
  saveId: number,
  ownerCode: string,
): Promise<LawModifiers> {
  const db = await getDb();
  const rows = await db.select<{ law_id: string }[]>(
    'SELECT law_id FROM active_laws WHERE save_id = ? AND owner_code = ?',
    [saveId, ownerCode],
  );
  const cards = rows
    .filter((r) => isLawId(r.law_id))
    .map((r) => LAW_CARDS[r.law_id as LawId]);
  return aggregateLawEffects(cards);
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
  // O espaço neutro nº 0 é a lei-padrão da facção — fixa, nunca trocável.
  if (quality === 'NEUTRA' && slotIndex === 0) {
    throw new Error('A lei da nação é fixa e não pode ser trocada.');
  }
  // As leis só podem ser trocadas nas janelas (turnos múltiplos do intervalo).
  const turnRows = await db.select<{ turn: number }[]>(
    'SELECT turn FROM saves WHERE id = ?',
    [saveId],
  );
  const turn = turnRows[0]?.turn ?? 1;
  if (!canSwapLaws(turn)) {
    throw new Error(
      `As leis só mudam a cada ${LAW_SWAP_INTERVAL} turnos — próxima janela no turno ${nextSwapTurn(turn)}.`,
    );
  }
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

/**
 * Vende uma cópia de uma carta do inventário por `LAW_REFUND` de cultura. Não
 * dá para vender uma carta que está em uso por uma lei ativa (o inventário
 * precisa manter, no mínimo, uma cópia de cada lei ativa).
 */
export async function sellLawCard(
  saveId: number,
  ownerCode: string,
  lawId: string,
): Promise<void> {
  const db = await getDb();
  if (!isLawId(lawId)) throw new Error('Lei desconhecida.');

  const inv = await db.select<{ count: number }[]>(
    'SELECT count FROM law_inventory WHERE save_id = ? AND owner_code = ? AND law_id = ?',
    [saveId, ownerCode, lawId],
  );
  const count = inv[0]?.count ?? 0;
  if (count < 1) throw new Error('Você não tem essa carta no inventário.');

  const active = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) AS n FROM active_laws WHERE save_id = ? AND owner_code = ? AND law_id = ?',
    [saveId, ownerCode, lawId],
  );
  if (count <= (active[0]?.n ?? 0)) {
    throw new Error('Essa carta está em uso por uma lei ativa.');
  }

  await db.execute('BEGIN');
  try {
    await db.execute(
      'UPDATE factions SET culture = culture + ? WHERE save_id = ? AND code = ?',
      [LAW_REFUND, saveId, ownerCode],
    );
    if (count - 1 <= 0) {
      await db.execute(
        'DELETE FROM law_inventory WHERE save_id = ? AND owner_code = ? AND law_id = ?',
        [saveId, ownerCode, lawId],
      );
    } else {
      await db.execute(
        'UPDATE law_inventory SET count = count - 1 WHERE save_id = ? AND owner_code = ? AND law_id = ?',
        [saveId, ownerCode, lawId],
      );
    }
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

/**
 * Compra e abre um **pacote premium** (`PREMIUM_PACK_COST` de cultura): sorteia
 * uma carta que a facção **ainda não tem** — nunca repete. Devolve a carta.
 */
export async function openPremiumPack(
  saveId: number,
  ownerCode: string,
): Promise<LawId> {
  const db = await getDb();
  const rows = await db.select<{ culture: number }[]>(
    'SELECT culture FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  if (!rows[0]) throw new Error('Facção não encontrada.');
  if (rows[0].culture < PREMIUM_PACK_COST) {
    throw new Error(
      `Cultura insuficiente — o pacote premium custa ${PREMIUM_PACK_COST}.`,
    );
  }

  const owned = await db.select<{ law_id: string }[]>(
    'SELECT law_id FROM law_inventory WHERE save_id = ? AND owner_code = ? AND count > 0',
    [saveId, ownerCode],
  );
  const ownedSet = new Set(owned.map((r) => r.law_id));
  const pool = LAW_LIST.filter((c) => !ownedSet.has(c.id));
  if (pool.length === 0) {
    throw new Error('Você já possui todas as leis do catálogo.');
  }
  const lawId = pool[Math.floor(Math.random() * pool.length)].id;

  await db.execute('BEGIN');
  try {
    await db.execute(
      'UPDATE factions SET culture = culture - ? WHERE save_id = ? AND code = ?',
      [PREMIUM_PACK_COST, saveId, ownerCode],
    );
    await addToInventory(db, saveId, ownerCode, lawId);
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
  return lawId;
}
