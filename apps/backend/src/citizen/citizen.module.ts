import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CitizenService } from './citizen.service';
import { CitizenController } from './citizen.controller';
import { Citizen } from '../entities/citizen.entity';
import { Company } from '../entities/company.entity';
import { Inventory } from '../entities/inventory.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Citizen, Company, Inventory])],
  controllers: [CitizenController],
  providers: [CitizenService],
  exports: [CitizenService],
})
export class CitizenModule {}
