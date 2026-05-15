import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Country } from './country.entity';
import { ResourceType } from './enums';

export interface Cell {
  x: number;
  y: number;
}

@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** Continente (codigo: N, S, E, A, I, O). */
  @Column()
  continent: string;

  /** Recurso especial da regiao (exatamente 1 por regiao). */
  @Column({ type: 'varchar' })
  resource: ResourceType;

  /** Celulas da grade que compoem o desenho da regiao no mapa. */
  @Column({ type: 'json' })
  cells: Cell[];

  /** Pais que controla a regiao (null = território neutro). */
  @ManyToOne(() => Country, { eager: true, nullable: true })
  ownerCountry: Country | null;

  /** Indica se a regiao e a capital do pais que a controla. */
  @Column({ default: false })
  isCapital: boolean;
}
