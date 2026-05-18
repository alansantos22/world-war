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
 * PRINCÍPIO DO CATÁLOGO: cada card é uma **lei/decreto** que um governo aprova
 * — nunca uma consequência ou um estado de coisas. O efeito é o que a lei
 * *causa*. São **90 leis** (30 boas, 30 neutras, 30 ruins); onze são "leis
 * engraçadas" inspiradas em leis reais, mas o texto de cada card é sempre
 * **deste mundo** — nada de referência histórica ao mundo real. Os efeitos
 * ainda são **descritivos** — o sistema numérico que os aplica na
 * economia/combate virá depois. Ver `GAME_DESIGN.md`.
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
 * o efeito virá com a integração das leis à economia/combate.
 */
export interface LawEffectLine {
  text: string;
  good: boolean;
}

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
  /** Efeitos da lei exibidos no card (buffs e debuffs). */
  effects: LawEffectLine[];
}

/**
 * Catálogo de leis. São 90 cards — 30 boas, 30 neutras e 30 ruins. Todo card é
 * uma lei/decreto que um governo aprova; o efeito é a consequência da lei.
 * Os efeitos são descritivos por enquanto.
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
    effects: [{ text: '+12% de renda de impostos', good: true }],
  },
  ZONA_LIVRE_COMERCIO: {
    id: 'ZONA_LIVRE_COMERCIO',
    name: 'Lei das Zonas de Livre Comércio',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🏷️',
    flavor:
      'Cria distritos onde mercadorias entram e saem sem tarifa nem inspeção; o capital estrangeiro acorre em massa.',
    effects: [{ text: '+30% de renda das zonas comerciais', good: true }],
  },
  SERVICO_MILITAR: {
    id: 'SERVICO_MILITAR',
    name: 'Serviço Militar Obrigatório',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎖️',
    flavor:
      'Torna o alistamento obrigatório; o exército nunca fica sem reservas para mobilizar.',
    effects: [{ text: '+20% de manpower gerado pelas cidades', good: true }],
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
      { text: '+30% de cultura por turno', good: true },
      { text: '+5 de felicidade', good: true },
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
    effects: [{ text: '+15% de renda das zonas de fábrica', good: true }],
  },
  OBRAS_PUBLICAS: {
    id: 'OBRAS_PUBLICAS',
    name: 'Plano Nacional de Obras Públicas',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🏗️',
    flavor:
      'Mobiliza o país num mutirão de estradas, portos e usinas erguidos a preço de Estado.',
    effects: [
      { text: '−25% no custo em dinheiro das construções', good: true },
    ],
  },
  REFORMA_EDUCACIONAL: {
    id: 'REFORMA_EDUCACIONAL',
    name: 'Reforma Educacional',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🎓',
    flavor:
      'Coloca escolas e universidades como prioridade nacional — uma geração inteira de cientistas.',
    effects: [{ text: '+30% de pesquisa por turno', good: true }],
  },
  SUBSIDIO_AGRICOLA: {
    id: 'SUBSIDIO_AGRICOLA',
    name: 'Lei de Subsídio Agrícola',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🌾',
    flavor:
      'O Estado garante preço mínimo e crédito ao campo; a colheita cresce e a fome recua.',
    effects: [{ text: '+18% de produção de comida', good: true }],
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
      { text: '+10% de renda das zonas comerciais', good: true },
      { text: '+6 de felicidade', good: true },
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
    effects: [{ text: '+15 de felicidade', good: true }],
  },
  CORPO_DIPLOMATICO: {
    id: 'CORPO_DIPLOMATICO',
    name: 'Lei do Corpo Diplomático',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📨',
    flavor:
      'Cria um quadro permanente de embaixadores que mantêm a voz da nação ativa em todas as cortes.',
    effects: [{ text: '+8 de influência por turno', good: true }],
  },
  MERCADO_INTERNO: {
    id: 'MERCADO_INTERNO',
    name: 'Lei de Estímulo ao Mercado Interno',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📊',
    flavor:
      'Protege e estimula o consumo doméstico; a economia ganha um chão firme para crescer.',
    effects: [
      { text: '+0,15 por turno no crescimento de prosperidade', good: true },
    ],
  },
  EFICIENCIA_ADMIN: {
    id: 'EFICIENCIA_ADMIN',
    name: 'Lei de Eficiência Administrativa',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📐',
    flavor:
      'Enxuga o funcionalismo e padroniza a gestão: manter os edifícios públicos custa muito menos.',
    effects: [{ text: '−20% de manutenção das construções', good: true }],
  },
  PADRONIZACAO_OBRAS: {
    id: 'PADRONIZACAO_OBRAS',
    name: 'Lei de Padronização das Obras',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🧱',
    flavor:
      'Plantas e materiais únicos para todo o território: cada obra avança com menos desperdício.',
    effects: [
      { text: '−15% no custo de produção das construções', good: true },
    ],
  },
  MOBILIZACAO_RAPIDA: {
    id: 'MOBILIZACAO_RAPIDA',
    name: 'Lei de Mobilização Rápida',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📯',
    flavor:
      'Cria centros de alistamento ágeis em cada cidade; equipar um recruta sai bem mais barato.',
    effects: [
      { text: '−20% no custo em dinheiro do recrutamento de tropas', good: true },
    ],
  },
  ORCAMENTO_DEFESA: {
    id: 'ORCAMENTO_DEFESA',
    name: 'Lei do Orçamento de Defesa Enxuto',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎗️',
    flavor:
      'Reorganiza o soldo e a logística do exército; manter as tropas pesa menos no tesouro.',
    effects: [{ text: '−20% de manutenção das tropas', good: true }],
  },
  MERITOCRACIA_MILITAR: {
    id: 'MERITOCRACIA_MILITAR',
    name: 'Lei da Meritocracia Militar',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🥇',
    flavor:
      'Promove oficiais por desempenho em campo; cada novo comandante já chega calejado.',
    effects: [
      { text: 'Comandantes nascem com +15 de experiência', good: true },
    ],
  },
  DOUTRINA_OFENSIVA: {
    id: 'DOUTRINA_OFENSIVA',
    name: 'Lei da Doutrina Ofensiva',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🗡️',
    flavor:
      'Treina o exército para o avanço e o assalto; as tropas golpeiam com fúria redobrada.',
    effects: [{ text: '+25% de força das tropas em ataques', good: true }],
  },
  PRIORIDADE_ESTRADAS: {
    id: 'PRIORIDADE_ESTRADAS',
    name: 'Lei de Prioridade Militar nas Estradas',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🛣️',
    flavor:
      'Reserva as estradas para o trânsito do exército; as colunas cruzam o país num passo.',
    effects: [
      { text: '+1 de movimento por turno para as tropas', good: true },
    ],
  },
  PROGRAMA_ENERGETICO: {
    id: 'PROGRAMA_ENERGETICO',
    name: 'Lei do Programa Energético Nacional',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🔌',
    flavor:
      'Investe pesado em geração e na rede elétrica; as usinas rendem como nunca.',
    effects: [{ text: '+25% de energia gerada pelas usinas', good: true }],
  },
  EXPANSAO_URBANA: {
    id: 'EXPANSAO_URBANA',
    name: 'Lei de Expansão Urbana',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🏙️',
    flavor:
      'Libera o zoneamento e ergue novos bairros; as cidades comportam muito mais gente.',
    effects: [{ text: '+15% no teto de população das cidades', good: true }],
  },
  INCENTIVO_NATALIDADE: {
    id: 'INCENTIVO_NATALIDADE',
    name: 'Lei de Incentivo à Natalidade',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '👶',
    flavor:
      'Concede auxílios e licenças generosas às famílias; os berçários não dão conta.',
    effects: [{ text: '+20% no crescimento populacional', good: true }],
  },
  EXPLORACAO_MINERAL: {
    id: 'EXPLORACAO_MINERAL',
    name: 'Lei de Exploração Mineral',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '⛏️',
    flavor:
      'Abre o subsolo à exploração intensiva; as minas entregam mais a cada turno.',
    effects: [{ text: '+20% na coleta de recursos das minas', good: true }],
  },
  ARMAZENS_PUBLICOS: {
    id: 'ARMAZENS_PUBLICOS',
    name: 'Lei dos Armazéns Públicos',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '📦',
    flavor:
      'Ergue silos e depósitos estatais em cada cidade; nada mais transborda e se perde.',
    effects: [
      { text: '+25% na capacidade de estoque das cidades', good: true },
    ],
  },
  VALORIZACAO_ARTES: {
    id: 'VALORIZACAO_ARTES',
    name: 'Lei de Valorização das Artes',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🎭',
    flavor:
      'Garante pensão e prestígio a artistas e mestres de ofício; a vida cultural floresce.',
    effects: [{ text: '+15% de cultura por turno', good: true }],
  },
  COMBATE_SONEGACAO: {
    id: 'COMBATE_SONEGACAO',
    name: 'Lei de Combate à Sonegação',
    quality: 'BOA',
    magnitude: 'ALTA',
    icon: '🧮',
    flavor:
      'Cria uma fiscalização implacável; quem devia ao Estado agora paga em dia.',
    effects: [{ text: '+25% de renda de impostos', good: true }],
  },
  CONCESSOES_PUBLICAS: {
    id: 'CONCESSOES_PUBLICAS',
    name: 'Lei de Concessões Públicas',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '💰',
    flavor:
      'Arrenda portos, estradas e terras da Coroa à iniciativa privada; o tesouro recebe um fluxo fixo.',
    effects: [{ text: '+1.200 de dinheiro por turno', good: true }],
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
      { text: '+25% de produção de comida', good: true },
      { text: '+4 de felicidade', good: true },
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
    effects: [{ text: '+12 de felicidade', good: true }],
  },
  ABRIGO_EM_CADA_LAR: {
    id: 'ABRIGO_EM_CADA_LAR',
    name: 'Lei do Abrigo em Cada Lar',
    quality: 'BOA',
    magnitude: 'NORMAL',
    icon: '🛖',
    flavor:
      'Nenhuma casa pode ser erguida sem um abrigo subterrâneo; a população dorme entrincheirada atrás das próprias paredes.',
    effects: [{ text: '+18% de força de defesa das cidades', good: true }],
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
      { text: '−50% de manutenção das tropas', good: true },
      { text: '−30% de força das tropas em ataques', good: false },
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
      { text: '+25% de produção das cidades', good: true },
      { text: '−15% de renda de impostos', good: false },
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
      { text: '+18% de renda das zonas comerciais', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+12% de pesquisa por turno', good: true },
      { text: '−8 de felicidade', good: false },
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
      { text: '+12 de felicidade', good: true },
      { text: '−25% de cultura por turno', good: false },
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
      { text: '+22% de renda das zonas de fábrica', good: true },
      { text: '−22% de renda das zonas comerciais', good: false },
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
      { text: '+25% de força de defesa das cidades', good: true },
      { text: '−15% de renda de impostos', good: false },
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
      { text: '+14 de felicidade', good: true },
      {
        text: '−200 de dinheiro por turno a cada 100 mil habitantes da nação',
        good: false,
      },
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
      { text: '+12% de produção das cidades', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+10% de produção das cidades', good: true },
      { text: '−15 de felicidade', good: false },
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
      { text: '+25% de produção das cidades', good: true },
      { text: '−12 de felicidade', good: false },
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
      { text: '+14 de felicidade', good: true },
      { text: '−15% de produção das cidades', good: false },
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
      { text: '+15% de renda de impostos', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+22% de renda das zonas comerciais', good: true },
      { text: '−15% de renda de impostos', good: false },
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
      { text: '+25% de produção das cidades', good: true },
      { text: '−20% de renda das zonas comerciais', good: false },
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
      { text: '+30% de manpower gerado pelas cidades', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+20% de pesquisa por turno', good: true },
      { text: '−15% de cultura por turno', good: false },
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
      { text: '−30% de manutenção das construções', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+1.500 de dinheiro por turno', good: true },
      { text: '−15% de produção das cidades', good: false },
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
      { text: '+40% na capacidade de estoque das cidades', good: true },
      { text: '−800 de dinheiro por turno', good: false },
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
      { text: '−30% no custo de colonos', good: true },
      { text: '−10% de renda de impostos', good: false },
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
      { text: '+20% de força de defesa das cidades', good: true },
      { text: '−15% de renda das zonas comerciais', good: false },
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
      { text: '+12 de felicidade', good: true },
      { text: '−15% de pesquisa por turno', good: false },
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
      { text: '+18% de pesquisa por turno', good: true },
      { text: '−8 de felicidade', good: false },
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
      { text: '+12 de felicidade', good: true },
      { text: '−18% de renda das zonas de fábrica', good: false },
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
      { text: '+25% de produção de comida', good: true },
      { text: '−10 de felicidade', good: false },
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
      { text: '+10 de felicidade', good: true },
      { text: '−15% de renda das zonas comerciais', good: false },
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
      { text: '+25% de cultura por turno', good: true },
      { text: '−1.000 de dinheiro por turno', good: false },
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
      { text: '+8 de felicidade', good: true },
      { text: '−10% de produção das cidades', good: false },
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
      { text: '+30% na coleta de recursos das minas', good: true },
      { text: '−15% de renda das zonas comerciais', good: false },
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
    effects: [{ text: '−13% de renda de impostos', good: false }],
  },
  ISOLAMENTO: {
    id: 'ISOLAMENTO',
    name: 'Decreto de Isolacionismo',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚧',
    flavor:
      'Decreta o fechamento do país ao comércio e à diplomacia estrangeira.',
    effects: [{ text: '−17% de renda das zonas comerciais', good: false }],
  },
  RACIONAMENTO_ENERGIA: {
    id: 'RACIONAMENTO_ENERGIA',
    name: 'Lei de Racionamento Energético',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '⚡',
    flavor:
      'O governo limita por decreto a geração das usinas; fábricas e cidades funcionam pela metade.',
    effects: [{ text: '−26% de energia gerada pelas usinas', good: false }],
  },
  CONFISCO_BENS: {
    id: 'CONFISCO_BENS',
    name: 'Lei de Confisco de Bens',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🚔',
    flavor:
      'Autoriza o Estado a tomar propriedades e poupanças dos cidadãos — a população reage com fúria.',
    effects: [{ text: '−22 de felicidade', good: false }],
  },
  LICENCIAMENTO: {
    id: 'LICENCIAMENTO',
    name: 'Lei do Licenciamento Obrigatório',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '📋',
    flavor:
      'Exige licença e vistoria para cada obra; cada carimbo abre espaço para mais uma propina.',
    effects: [
      { text: '+22% no custo em dinheiro das construções', good: false },
    ],
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
      { text: '−22% de renda de impostos', good: false },
      { text: '−17% de renda das zonas comerciais', good: false },
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
    effects: [{ text: '−19% de pesquisa por turno', good: false }],
  },
  INDICACAO_POLITICA: {
    id: 'INDICACAO_POLITICA',
    name: 'Lei de Indicação Política',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '👔',
    flavor:
      'Os postos de comando passam a ser indicação política, não mérito — generais despreparados.',
    effects: [
      { text: 'Comandantes nascem com −13 de experiência', good: false },
    ],
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
      { text: '−9% de renda das zonas comerciais', good: false },
      { text: '−5 de felicidade', good: false },
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
      { text: '−10% de renda de impostos', good: false },
      { text: '−9 de felicidade', good: false },
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
    effects: [{ text: '−16% de produção de comida', good: false }],
  },
  TABELAMENTO_PRECOS: {
    id: 'TABELAMENTO_PRECOS',
    name: 'Lei de Tabelamento de Preços',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🔖',
    flavor:
      'Congela à força o preço de tudo; os mercadores fecham as portas em vez de vender no prejuízo.',
    effects: [{ text: '−16% de renda das zonas comerciais', good: false }],
  },
  EXPROPRIACAO_FABRICAS: {
    id: 'EXPROPRIACAO_FABRICAS',
    name: 'Lei de Expropriação de Fábricas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🏚️',
    flavor:
      'Confisca as fábricas sem indenizar ninguém; abandonadas pelos donos, elas definham.',
    effects: [{ text: '−18% de renda das zonas de fábrica', good: false }],
  },
  IMPOSTO_EXTORSIVO: {
    id: 'IMPOSTO_EXTORSIVO',
    name: 'Lei do Imposto Extorsivo',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '💢',
    flavor:
      'Cria taxas sobre cada gesto da vida cotidiana; o povo se sente espremido até o último tostão.',
    effects: [{ text: '−12 de felicidade', good: false }],
  },
  PERSEGUICAO_POLITICA: {
    id: 'PERSEGUICAO_POLITICA',
    name: 'Lei de Perseguição Política',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '⛓️',
    flavor:
      'Manda prender quem ousa discordar do governo; o medo se espalha de porta em porta.',
    effects: [{ text: '−15 de felicidade', good: false }],
  },
  FECHAMENTO_ESCOLAS: {
    id: 'FECHAMENTO_ESCOLAS',
    name: 'Lei de Fechamento de Escolas',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚪',
    flavor:
      'Fecha escolas e laboratórios para "cortar gastos"; uma geração inteira fica sem instrução.',
    effects: [{ text: '−18% de pesquisa por turno', good: false }],
  },
  PROIBICAO_ARTES: {
    id: 'PROIBICAO_ARTES',
    name: 'Lei de Proibição das Artes',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🖼️',
    flavor:
      'Declara a arte um luxo subversivo e a bane das ruas; teatros e ateliês fecham as portas.',
    effects: [{ text: '−22% de cultura por turno', good: false }],
  },
  DESMONTE_INDUSTRIAL: {
    id: 'DESMONTE_INDUSTRIAL',
    name: 'Lei do Desmonte Industrial',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '⚙️',
    flavor:
      'Sucateia o parque industrial em nome de uma economia "mais simples"; as cidades produzem cada vez menos.',
    effects: [{ text: '−22% de produção das cidades', good: false }],
  },
  SUCATEAMENTO_MILITAR: {
    id: 'SUCATEAMENTO_MILITAR',
    name: 'Lei de Sucateamento Militar',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🗑️',
    flavor:
      'Vende armas e equipamentos para fazer caixa; as tropas vão à luta mal-armadas.',
    effects: [{ text: '−20% de força das tropas em ataques', good: false }],
  },
  CORTES_DEFESA: {
    id: 'CORTES_DEFESA',
    name: 'Lei de Cortes na Defesa',
    quality: 'RUIM',
    magnitude: 'ALTA',
    icon: '🪙',
    flavor:
      'Corta a verba das fortificações e guarnições; as cidades ficam vulneráveis a qualquer cerco.',
    effects: [{ text: '−20% de força de defesa das cidades', good: false }],
  },
  MORATORIA_DIVIDA: {
    id: 'MORATORIA_DIVIDA',
    name: 'Lei de Moratória da Dívida',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '💳',
    flavor:
      'O Estado dá calote nos próprios credores; o crédito seca e os mercados perdem a confiança.',
    effects: [{ text: '−16% de renda das zonas comerciais', good: false }],
  },
  ANISTIA_FISCAL: {
    id: 'ANISTIA_FISCAL',
    name: 'Lei de Anistia Fiscal aos Poderosos',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🤐',
    flavor:
      'Perdoa as dívidas dos mais poderosos; o tesouro abre mão de uma fortuna em tributos.',
    effects: [{ text: '−13% de renda de impostos', good: false }],
  },
  ISENCAO_SERVICO: {
    id: 'ISENCAO_SERVICO',
    name: 'Lei de Isenção do Serviço Militar',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🛌',
    flavor:
      'Permite que quase todos escapem do alistamento; o exército fica sem reservas para mobilizar.',
    effects: [
      { text: '−18% de manpower gerado pelas cidades', good: false },
    ],
  },
  INSPECOES_PERMANENTES: {
    id: 'INSPECOES_PERMANENTES',
    name: 'Lei de Inspeções Permanentes',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🔍',
    flavor:
      'Exige vistorias constantes e laudos infindáveis; manter cada edifício vira um sorvedouro de dinheiro.',
    effects: [{ text: '+18% de manutenção das construções', good: false }],
  },
  PEDAGIOS_INTERNOS: {
    id: 'PEDAGIOS_INTERNOS',
    name: 'Lei de Pedágios Internos',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚏',
    flavor:
      'Crava cabines de pedágio em cada estrada; até as colunas militares emperram nas filas.',
    effects: [
      { text: '−1 de movimento por turno para as tropas', good: false },
    ],
  },
  CONGELAMENTO_URBANO: {
    id: 'CONGELAMENTO_URBANO',
    name: 'Lei de Congelamento Urbano',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🧊',
    flavor:
      'Proíbe novas construções residenciais; as cidades sufocam, sem para onde crescer.',
    effects: [{ text: '−12% no teto de população das cidades', good: false }],
  },
  CONTROLE_NATALIDADE: {
    id: 'CONTROLE_NATALIDADE',
    name: 'Lei de Controle de Natalidade',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🚼',
    flavor:
      'Impõe limites rígidos ao número de filhos; os berços vão ficando vazios.',
    effects: [{ text: '−16% no crescimento populacional', good: false }],
  },
  RESTRICAO_MINERACAO: {
    id: 'RESTRICAO_MINERACAO',
    name: 'Lei de Restrição à Mineração',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '⛔',
    flavor:
      'Embarga a maior parte das jazidas por decreto; o subsolo rende cada vez menos.',
    effects: [{ text: '−18% na coleta de recursos das minas', good: false }],
  },
  ANIVERSARIO_OBRIGATORIO: {
    id: 'ANIVERSARIO_OBRIGATORIO',
    name: 'Lei do Aniversário Obrigatório',
    quality: 'RUIM',
    magnitude: 'NORMAL',
    icon: '🎂',
    flavor:
      'Esquecer o aniversário do cônjuge passa a ser crime; os cidadãos vivem aterrorizados diante do calendário.',
    effects: [{ text: '−12 de felicidade', good: false }],
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
      { text: '−10 de felicidade', good: false },
      { text: '−8% de produção das cidades', good: false },
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
 * Garante que uma facção tem as suas leis em ordem:
 *
 * 1. apaga cartas de catálogos antigos (ids que não existem mais);
 * 2. preenche **todo espaço de lei vazio** (até `slotTier`) com uma carta
 *    sorteada da qualidade certa — é o que semeia o conjunto inicial e o que
 *    conserta saves cujas cartas ficaram inválidas depois de mudanças no
 *    catálogo.
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

  // 2. Descobre quais espaços (qualidade × índice) ficaram vazios.
  const fac = await db.select<{ law_slot_tier: number }[]>(
    'SELECT law_slot_tier FROM factions WHERE save_id = ? AND code = ?',
    [saveId, ownerCode],
  );
  const slotTier = fac[0]?.law_slot_tier ?? MIN_SLOT_TIER;

  const existing = await db.select<{ quality: string; slot_index: number }[]>(
    'SELECT quality, slot_index FROM active_laws WHERE save_id = ? AND owner_code = ?',
    [saveId, ownerCode],
  );
  const filled = new Set(existing.map((r) => `${r.quality}:${r.slot_index}`));

  const missing: { quality: LawQuality; slotIndex: number }[] = [];
  for (const q of LAW_QUALITY_LIST) {
    for (let i = 0; i < slotTier; i++) {
      if (!filled.has(`${q.id}:${i}`)) {
        missing.push({ quality: q.id, slotIndex: i });
      }
    }
  }
  if (missing.length === 0) return;

  // 3. Preenche cada espaço vazio com uma carta sorteada.
  await db.execute('BEGIN');
  try {
    for (const m of missing) {
      const lawId = randomLawOfQuality(m.quality);
      await addToInventory(db, saveId, ownerCode, lawId);
      await db.execute(
        `INSERT INTO active_laws (save_id, owner_code, quality, slot_index, law_id)
         VALUES (?, ?, ?, ?, ?)`,
        [saveId, ownerCode, m.quality, m.slotIndex, lawId],
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
