import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { CitizenService } from './citizen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user.decorator';

class EatDto {
  @IsInt()
  @Min(1)
  quality: number;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class CitizenController {
  constructor(private citizen: CitizenService) {}

  @Get('citizen/me')
  async me(@UserId() userId: number) {
    const c = await this.citizen.requireCitizen(userId);
    return this.citizen.toDto(c);
  }

  @Get('citizen/rankings')
  rankings() {
    return this.citizen.rankings();
  }

  @Get('inventory')
  async inventory(@UserId() userId: number) {
    const c = await this.citizen.requireCitizen(userId);
    return this.citizen.getInventory(c);
  }

  @Post('inventory/eat')
  eat(@UserId() userId: number, @Body() dto: EatDto) {
    return this.citizen.eat(userId, dto.quality);
  }

  @Get('companies')
  companies() {
    return this.citizen.listCompanies();
  }

  @Post('companies/:id/job')
  getJob(
    @UserId() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.citizen.getJob(userId, id);
  }

  @Post('work')
  work(@UserId() userId: number) {
    return this.citizen.work(userId);
  }

  @Post('train')
  train(@UserId() userId: number) {
    return this.citizen.train(userId);
  }
}
