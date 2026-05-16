import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RegionService } from './region.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class RegionController {
  constructor(private region: RegionService) {}

  /** Mapa-mundi: regioes agrupadas por pais. */
  @Get('map')
  map() {
    return this.region.map();
  }

  /** Catalogo de recursos especiais. */
  @Get('resources')
  resources() {
    return this.region.catalog();
  }

  /** Resumo de escassez de cada recurso. */
  @Get('resources/scarcity')
  scarcity() {
    return this.region.scarcity();
  }

  @Get('regions/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.region.detail(id);
  }
}
