import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Country } from './country.entity';
import { Region } from './region.entity';
import { BattleSide, BattleStatus } from './enums';
import { BattleHit } from './battle-hit.entity';

@Entity('battles')
export class Battle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Country, { eager: true })
  attackerCountry: Country;

  /** Dono atual da regiao disputada (null = territorio neutro). */
  @ManyToOne(() => Country, { eager: true, nullable: true })
  defenderCountry: Country | null;

  /** Regiao em disputa. O vencedor atacante toma o seu controle. */
  @ManyToOne(() => Region, { eager: true, nullable: true })
  region: Region | null;

  /**
   * Penalidade de projecao de poder do atacante (0..1): quanto mais longe a
   * regiao alvo estiver da fronteira do pais, menor o dano dos seus golpes.
   */
  @Column({ type: 'double', default: 0 })
  attackerFrontPenalty: number;

  /** True se a regiao trocou de dono ao encerrar a batalha. */
  @Column({ default: false })
  regionCaptured: boolean;

  @Column({ type: 'int', default: 0 })
  attackerDamage: number;

  @Column({ type: 'int', default: 0 })
  defenderDamage: number;

  @Column({ type: 'varchar', default: BattleStatus.OPEN })
  status: BattleStatus;

  @Column({ type: 'varchar', nullable: true })
  winnerSide: BattleSide | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @OneToMany(() => BattleHit, (h) => h.battle)
  hits: BattleHit[];
}
