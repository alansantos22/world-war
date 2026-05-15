import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Country } from './country.entity';
import { CompanyType } from './enums';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: CompanyType;

  @Column({ type: 'int', default: 1 })
  quality: number;

  @ManyToOne(() => Country, { eager: true })
  country: Country;
}
