import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country } from '../entities/country.entity';
import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Controller('countries')
class CountryController {
  constructor(
    @InjectRepository(Country) private countries: Repository<Country>,
  ) {}

  @Get()
  list() {
    return this.countries.find({ order: { name: 'ASC' } });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountryController],
})
export class CountryModule {}
