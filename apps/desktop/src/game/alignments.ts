/**
 * Direcionamentos políticos do jogo.
 *
 * Cada nação tem um alinhamento. O alinhamento que o JOGADOR seguir vai
 * influenciar as chances de aliança com outras facções do mesmo
 * direcionamento — essa mecânica de diplomacia/alianças será implementada
 * mais adiante.
 */

export type AlignmentId =
  | 'REPUBLICA'
  | 'IMPERIO'
  | 'COMUNISTA'
  | 'INDEPENDENTE';

export interface Alignment {
  id: AlignmentId;
  label: string;
  color: string;
  description: string;
}

export const ALIGNMENTS: Record<AlignmentId, Alignment> = {
  REPUBLICA: {
    id: 'REPUBLICA',
    label: 'Repúblicas',
    color: '#3b82c4',
    description:
      'Nações governadas por repúblicas e uniões republicanas. Tendem a se aliar entre si contra impérios.',
  },
  IMPERIO: {
    id: 'IMPERIO',
    label: 'Império',
    color: '#b8862b',
    description:
      'Monarquias, impérios, reinos e sultanatos. O bloco mais numeroso e tradicional.',
  },
  COMUNISTA: {
    id: 'COMUNISTA',
    label: 'Comunistas',
    color: '#c0392b',
    description:
      'Estados socialistas/comunistas. Bloco ideológico isolado, mas coeso.',
  },
  INDEPENDENTE: {
    id: 'INDEPENDENTE',
    label: 'Estados independentes',
    color: '#2aa198',
    description:
      'Estados livres e não alinhados. Não pertencem a nenhum bloco — diplomacia caso a caso.',
  },
};

export const ALIGNMENT_LIST: Alignment[] = Object.values(ALIGNMENTS);
