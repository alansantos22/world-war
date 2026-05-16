import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { BattleService } from './battle.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user.decorator';
import { BattleSide } from '../entities/enums';

class CreateBattleDto {
  /** Regiao alvo da ofensiva. O pais do jogador e o atacante. */
  @IsInt()
  regionId: number;

  @IsOptional()
  @IsString()
  name?: string;
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

  /** Previa de ataque: distancia e penalidade para o pais do jogador. */
  @Get('preview/:regionId')
  preview(
    @UserId() userId: number,
    @Param('regionId', ParseIntPipe) regionId: number,
  ) {
    return this.battle.attackPreview(userId, regionId);
  }

  @Post()
  create(@UserId() userId: number, @Body() dto: CreateBattleDto) {
    return this.battle.create(userId, dto.regionId, dto.name);
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
