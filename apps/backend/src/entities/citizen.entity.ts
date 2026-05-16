import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Country } from './country.entity';
import { User } from './user.entity';
import { Company } from './company.entity';
import { Inventory } from './inventory.entity';
import { GameConfig } from '../config/game.config';

@Entity('citizens')
export class Citizen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'double', default: GameConfig.STARTING_STRENGTH })
  strength: number;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 0 })
  xp: number;

  @Column({ type: 'int', default: GameConfig.MAX_ENERGY })
  energy: number;

  @Column({ type: 'int', default: GameConfig.MAX_ENERGY })
  maxEnergy: number;

  @Column({ type: 'datetime' })
  energyUpdatedAt: Date;

  @Column({ type: 'double', default: GameConfig.STARTING_MONEY })
  money: number;

  @Column({ type: 'double', default: GameConfig.STARTING_GOLD })
  gold: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Country, { eager: true })
  country: Country;

  @ManyToOne(() => Company, { eager: true, nullable: true })
  employer: Company | null;

  @OneToOne(() => User, (u) => u.citizen, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @OneToMany(() => Inventory, (i) => i.citizen)
  inventory: Inventory[];
}
