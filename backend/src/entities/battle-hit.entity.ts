import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Battle } from './battle.entity';
import { Citizen } from './citizen.entity';
import { BattleSide } from './enums';

@Entity('battle_hits')
export class BattleHit {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Battle, { onDelete: 'CASCADE' })
  battle: Battle;

  @ManyToOne(() => Citizen, { eager: true })
  citizen: Citizen;

  @Column({ type: 'varchar' })
  side: BattleSide;

  @Column({ type: 'int' })
  damage: number;

  @Column({ default: false })
  weaponUsed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
