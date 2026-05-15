import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, Min } from 'class-validator';
import { MarketService } from './market.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user.decorator';
import { ItemType } from '../entities/enums';

class BuyDto {
  @IsInt()
  offerId: number;

  @IsInt()
  @Min(1)
  amount: number;
}

class SellDto {
  @IsEnum(ItemType)
  itemType: ItemType;

  @IsInt()
  @Min(1)
  quality: number;

  @IsInt()
  @Min(1)
  amount: number;

  @IsNumber()
  @Min(0.01)
  pricePerUnit: number;
}

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private market: MarketService) {}

  @Get()
  list() {
    return this.market.list();
  }

  @Post('buy')
  buy(@UserId() userId: number, @Body() dto: BuyDto) {
    return this.market.buy(userId, dto.offerId, dto.amount);
  }

  @Post('sell')
  sell(@UserId() userId: number, @Body() dto: SellDto) {
    return this.market.sell(
      userId,
      dto.itemType,
      dto.quality,
      dto.amount,
      dto.pricePerUnit,
    );
  }
}
