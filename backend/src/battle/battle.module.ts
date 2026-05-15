import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BattleService } from './battle.service';
import { BattleController } from './battle.controller';
import { Battle } from '../entities/battle.entity';
import { BattleHit } from '../entities/battle-hit.entity';
import { Country } from '../entities/country.entity';
import { Inventory } from '../entities/inventory.entity';
import { CitizenModule } from '../citizen/citizen.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Battle, BattleHit, Country, Inventory]),
    CitizenModule,
  ],
  controllers: [BattleController],
  providers: [BattleService],
})
export class BattleModule {}
