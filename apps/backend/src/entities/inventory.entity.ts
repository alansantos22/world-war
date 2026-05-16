import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Citizen } from './citizen.entity';
import { ItemType } from './enums';

@Entity('inventory')
@Unique(['citizen', 'itemType', 'quality'])
export class Inventory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Citizen, { onDelete: 'CASCADE' })
  citizen: Citizen;

  @Column({ type: 'varchar' })
  itemType: ItemType;

  @Column({ type: 'int' })
  quality: number;

  @Column({ type: 'int', default: 0 })
  amount: number;
}
