import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Citizen } from './citizen.entity';

@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ length: 3 })
  code: string;

  @Column({ default: '#888888' })
  color: string;

  @OneToMany(() => Citizen, (c) => c.country)
  citizens: Citizen[];
}
