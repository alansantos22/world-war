import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from '../entities/region.entity';
import { RESOURCES, resourceInfo } from '../config/resources';
import { ResourceType } from '../entities/enums';
import { GRID, CONTINENT_NAMES } from '../map/map-generator';

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region) private regions: Repository<Region>,
  ) {}

  /** Catalogo de recursos com raridade, cor e efeito. */
  catalog() {
    return Object.values(RESOURCES).sort(
      (a, b) => b.rarityRank - a.rarityRank,
    );
  }

  /** Mapa-mundi completo: grade, regioes e controle territorial. */
  async map() {
    const regions = await this.regions.find({ order: { id: 'ASC' } });

    // Resumo de controle territorial por pais.
    const owners: Record<number, any> = {};
    let neutralCount = 0;
    for (const r of regions) {
      if (r.ownerCountry) {
        const id = r.ownerCountry.id;
        if (!owners[id]) {
          owners[id] = {
            id,
            name: r.ownerCountry.name,
            code: r.ownerCountry.code,
            color: r.ownerCountry.color,
            regionCount: 0,
          };
        }
        owners[id].regionCount++;
      } else {
        neutralCount++;
      }
    }

    return {
      grid: { cols: GRID.cols, rows: GRID.rows },
      regions: regions.map((r) => this.toDto(r)),
      countries: Object.values(owners).sort(
        (a: any, b: any) => b.regionCount - a.regionCount,
      ),
      neutralCount,
      totalRegions: regions.length,
    };
  }

  async detail(id: number) {
    const region = await this.regions.findOne({ where: { id } });
    if (!region) throw new NotFoundException('Regiao nao encontrada');
    return this.toDto(region);
  }

  /** Resumo de escassez: quantas regioes possuem cada recurso. */
  async scarcity() {
    const regions = await this.regions.find();
    const counts: Record<string, number> = {};
    for (const r of regions) {
      counts[r.resource] = (counts[r.resource] || 0) + 1;
    }
    return Object.values(RESOURCES)
      .map((info) => ({
        resource: info.key,
        label: info.label,
        tier: info.tier,
        icon: info.icon,
        color: info.color,
        regionCount: counts[info.key] || 0,
      }))
      .sort((a, b) => a.regionCount - b.regionCount);
  }

  private toDto(r: Region) {
    const info = resourceInfo(r.resource as ResourceType);
    return {
      id: r.id,
      name: r.name,
      continent: r.continent,
      continentName: CONTINENT_NAMES[r.continent] || r.continent,
      cells: r.cells,
      isCapital: r.isCapital,
      resource: info,
      owner: r.ownerCountry
        ? {
            id: r.ownerCountry.id,
            name: r.ownerCountry.name,
            code: r.ownerCountry.code,
            color: r.ownerCountry.color,
          }
        : null,
    };
  }
}
