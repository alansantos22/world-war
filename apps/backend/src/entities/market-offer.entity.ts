import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Citizen } from './citizen.entity';
import { ItemType } from './enums';

@Entity('market_offers')
export class MarketOffer {
  @PrimaryGeneratedColumn()
  id: number;

  // null = oferta da loja do estado (estoque infinito)
  @ManyToOne(() => Citizen, { eager: true, nullable: true })
  seller: Citizen | null;

  @Column({ type: 'varchar' })
  itemType: ItemType;

  @Column({ type: 'int' })
  quality: number;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: false })
  stateShop: boolean;

  @Column({ type: 'double' })
  pricePerUnit: number;

  @CreateDateColumn()
  createdAt: Date;
}
