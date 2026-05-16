import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { MarketOffer } from '../entities/market-offer.entity';
import { Inventory } from '../entities/inventory.entity';
import { CitizenModule } from '../citizen/citizen.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketOffer, Inventory]),
    CitizenModule,
  ],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
