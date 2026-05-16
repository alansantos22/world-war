/**
 * Gera (ou regera) o mapa-mundi do servidor: apaga as regioes existentes,
 * cria novas regioes para cada pais e posiciona os recursos aleatoriamente.
 *
 * Use este comando ao iniciar um "novo servidor".
 *
 * Uso: npm run generate:map
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { User } from './entities/user.entity';
import { Citizen } from './entities/citizen.entity';
import { Country } from './entities/country.entity';
import { Company } from './entities/company.entity';
import { Inventory } from './entities/inventory.entity';
import { Battle } from './entities/battle.entity';
import { BattleHit } from './entities/battle-hit.entity';
import { MarketOffer } from './entities/market-offer.entity';
import { Region } from './entities/region.entity';
import { generateMap, summarize } from './map/map-generator';
import { resourceInfo } from './config/resources';
import { ResourceType } from './entities/enums';

function loadEnv() {
  const file = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  loadEnv();

  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'world_war',
    entities: [
      User, Citizen, Country, Company,
      Inventory, Battle, BattleHit, MarketOffer, Region,
    ],
    synchronize: true,
  });
  await ds.initialize();

  const countryRepo = ds.getRepository(Country);
  const regionRepo = ds.getRepository(Region);

  const countries = await countryRepo.find();
  if (countries.length === 0) {
    console.error('Nenhum pais encontrado. Rode "npm run seed" primeiro.');
    await ds.destroy();
    process.exit(1);
  }

  // Apaga o mapa atual.
  await regionRepo.clear();

  // Gera o novo mapa.
  const world = generateMap(countries.map((c) => c.code));
  const byCode = (code: string) => countries.find((c) => c.code === code);
  const regions = world.regions.map((g) =>
    regionRepo.create({
      name: g.name,
      continent: g.continent,
      resource: g.resource,
      cells: g.cells,
      ownerCountry: g.ownerCode ? byCode(g.ownerCode) : null,
      isCapital: g.isCapital,
    }),
  );
  await regionRepo.save(regions);

  // Relatorio.
  const owned = world.regions.filter((r) => r.ownerCode).length;
  console.log(
    `\nMapa gerado: ${regions.length} regioes (grade ${world.cols}x${world.rows}).`,
  );
  console.log(`Territorios: ${owned} controlados, ${regions.length - owned} neutros.\n`);
  const counts = summarize(world.regions);
  console.log('Distribuicao de recursos:');
  Object.entries(counts)
    .sort((a, b) => a[1] - b[1])
    .forEach(([res, n]) => {
      const info = resourceInfo(res as ResourceType);
      console.log(`  ${info.label.padEnd(18)} ${String(n).padStart(3)} regioes  [${info.tier}]`);
    });

  await ds.destroy();
  console.log('\nNovo mapa pronto!');
}

main().catch((err) => {
  console.error('Falha ao gerar o mapa:', err);
  process.exit(1);
});
