import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Country } from './country.entity';
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

  @ManyToOne(() => Country, { eager: true })
  defenderCountry: Country;

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
