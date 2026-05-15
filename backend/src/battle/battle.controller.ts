import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { BattleService } from './battle.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user.decorator';
import { BattleSide } from '../entities/enums';

class CreateBattleDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsInt()
  attackerCountryId: number;

  @IsInt()
  defenderCountryId: number;
}

class HitDto {
  @IsEnum(BattleSide)
  side: BattleSide;

  @IsOptional()
  @IsBoolean()
  useWeapon?: boolean;
}

@Controller('battles')
@UseGuards(JwtAuthGuard)
export class BattleController {
  constructor(private battle: BattleService) {}

  @Get()
  list() {
    return this.battle.list();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.battle.detail(id);
  }

  @Post()
  create(@Body() dto: CreateBattleDto) {
    return this.battle.create(
      dto.name,
      dto.attackerCountryId,
      dto.defenderCountryId,
    );
  }

  @Post(':id/hit')
  hit(
    @UserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HitDto,
  ) {
    return this.battle.hit(userId, id, dto.side, !!dto.useWeapon);
  }

  @Post(':id/finish')
  finish(@Param('id', ParseIntPipe) id: number) {
    return this.battle.finish(id);
  }
}
