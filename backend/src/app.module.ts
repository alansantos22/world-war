import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CountryModule } from './country/country.module';
import { CitizenModule } from './citizen/citizen.module';
import { BattleModule } from './battle/battle.module';
import { MarketModule } from './market/market.module';
import { RegionModule } from './region/region.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: parseInt(config.get('DB_PORT', '3306'), 10),
        username: config.get('DB_USER', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_NAME', 'world_war'),
        autoLoadEntities: true,
        synchronize: true, // MVP: cria/atualiza tabelas automaticamente
      }),
    }),
    AuthModule,
    CountryModule,
    CitizenModule,
    BattleModule,
    MarketModule,
    RegionModule,
  ],
})
export class AppModule {}
