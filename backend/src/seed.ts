/**
 * Script de seed: cria o banco de dados, as tabelas e os dados iniciais
 * (paises, empresas, uma batalha em andamento e a loja do estado).
 *
 * Uso: npm run seed
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
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
import { CompanyType, ItemType, BattleStatus } from './entities/enums';
import { generateMap } from './map/map-generator';

// Carrega variaveis do arquivo .env (se existir).
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
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'world_war',
  };

  // 1. Cria o banco de dados se ainda nao existir.
  const admin = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4`,
  );
  await admin.end();
  console.log(`Banco "${cfg.database}" pronto.`);

  // 2. Conecta com o TypeORM e cria as tabelas.
  const ds = new DataSource({
    type: 'mysql',
    host: cfg.host,
    port: cfg.port,
    username: cfg.user,
    password: cfg.password,
    database: cfg.database,
    entities: [
      User,
      Citizen,
      Country,
      Company,
      Inventory,
      Battle,
      BattleHit,
      MarketOffer,
      Region,
    ],
    synchronize: true,
  });
  await ds.initialize();
  console.log('Tabelas sincronizadas.');

  const countryRepo = ds.getRepository(Country);
  const companyRepo = ds.getRepository(Company);
  const battleRepo = ds.getRepository(Battle);
  const offerRepo = ds.getRepository(MarketOffer);
  const regionRepo = ds.getRepository(Region);

  // 3. Paises.
  if ((await countryRepo.count()) === 0) {
    const countries = [
      { name: 'Brasil', code: 'BRA', color: '#2e9e3f' },
      { name: 'Estados Unidos', code: 'USA', color: '#3b5cc4' },
      { name: 'Russia', code: 'RUS', color: '#c0392b' },
      { name: 'China', code: 'CHN', color: '#e8b923' },
      { name: 'Alemanha', code: 'GER', color: '#34495e' },
      { name: 'Franca', code: 'FRA', color: '#5b8def' },
      { name: 'Japao', code: 'JPN', color: '#e36a8a' },
      { name: 'Argentina', code: 'ARG', color: '#5dbfd6' },
    ];
    await countryRepo.save(countries.map((c) => countryRepo.create(c)));
    console.log(`${countries.length} paises criados.`);
  }

  const allCountries = await countryRepo.find();
  const byCode = (code: string) =>
    allCountries.find((c) => c.code === code);

  // 4. Empresas.
  if ((await companyRepo.count()) === 0) {
    const companies = [
      { name: 'Fazenda Sol Nascente', type: CompanyType.FOOD, quality: 1, country: byCode('BRA') },
      { name: 'Padaria Central', type: CompanyType.FOOD, quality: 3, country: byCode('BRA') },
      { name: 'AgroMax Foods', type: CompanyType.FOOD, quality: 5, country: byCode('USA') },
      { name: 'Forja de Ferro', type: CompanyType.WEAPON, quality: 2, country: byCode('RUS') },
      { name: 'Industrias Belicas Aurora', type: CompanyType.WEAPON, quality: 4, country: byCode('GER') },
      { name: 'Arsenal Imperial', type: CompanyType.WEAPON, quality: 5, country: byCode('CHN') },
    ];
    await companyRepo.save(companies.map((c) => companyRepo.create(c)));
    console.log(`${companies.length} empresas criadas.`);
  }

  // 5. Mapa-mundi: gerado proceduralmente. Continentes subdivididos em
  // regioes, recursos posicionados aleatoriamente e territorios iniciais
  // distribuidos entre os paises.
  if ((await regionRepo.count()) === 0) {
    const world = generateMap(allCountries.map((c) => c.code));
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
    console.log(
      `Mapa gerado: ${regions.length} regioes (grade ${world.cols}x${world.rows}).`,
    );
  }

  // 6. Batalha em andamento: o Brasil ataca uma regiao neutra vizinha.
  if ((await battleRepo.count()) === 0) {
    const bra = byCode('BRA');
    const braRegions = await regionRepo.find();
    const braCells = braRegions
      .filter((r) => r.ownerCountry?.id === bra?.id)
      .flatMap((r) => r.cells);
    // Regiao neutra mais proxima da fronteira do Brasil.
    const cheby = (a: any, b: any) =>
      Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const target = braRegions
      .filter((r) => !r.ownerCountry && !r.isCapital)
      .map((r) => ({
        r,
        d: Math.min(
          ...braCells.flatMap((c) => r.cells.map((rc) => cheby(c, rc))),
        ),
      }))
      .sort((a, b) => a.d - b.d)[0];
    if (bra && target) {
      const gap = Math.max(0, target.d - 1);
      await battleRepo.save(
        battleRepo.create({
          name: `Ofensiva em ${target.r.name}`,
          attackerCountry: bra,
          defenderCountry: null,
          region: target.r,
          attackerFrontPenalty: Math.min(0.75, gap * 0.05),
          status: BattleStatus.OPEN,
          attackerDamage: 0,
          defenderDamage: 0,
        }),
      );
      console.log('Batalha inicial criada.');
    }
  }

  // 7. Loja do estado: comida e armas de todas as qualidades.
  if ((await offerRepo.count()) === 0) {
    const offers: Partial<MarketOffer>[] = [];
    for (let q = 1; q <= 5; q++) {
      offers.push({
        itemType: ItemType.FOOD,
        quality: q,
        amount: 0,
        stateShop: true,
        pricePerUnit: q * 1.5,
        seller: null,
      });
      offers.push({
        itemType: ItemType.WEAPON,
        quality: q,
        amount: 0,
        stateShop: true,
        pricePerUnit: q * 6,
        seller: null,
      });
    }
    await offerRepo.save(offers.map((o) => offerRepo.create(o)));
    console.log(`${offers.length} ofertas da loja do estado criadas.`);
  }

  // 8. Contas de teste (admin e jogador). Credenciais em CREDENTIALS.md.
  const userRepo = ds.getRepository(User);
  const citizenRepo = ds.getRepository(Citizen);

  async function ensureAccount(
    email: string,
    password: string,
    citizenName: string,
    isAdmin: boolean,
    countryCode: string,
  ) {
    if (await userRepo.findOne({ where: { email } })) return;
    const user = userRepo.create({
      email,
      password: await bcrypt.hash(password, 10),
      isAdmin,
    });
    await userRepo.save(user);
    await citizenRepo.save(
      citizenRepo.create({
        name: citizenName,
        country: byCode(countryCode),
        user,
        energyUpdatedAt: new Date(),
      }),
    );
    console.log(`Conta criada: ${email}${isAdmin ? ' (admin)' : ''}`);
  }

  await ensureAccount(
    'admin@worldwar.local',
    'WorldWarAdmin123',
    'Comandante Supremo',
    true,
    'BRA',
  );
  await ensureAccount(
    'player@worldwar.local',
    'WorldWarPlayer123',
    'Recruta Novato',
    false,
    'USA',
  );

  await ds.destroy();
  console.log('\nSeed concluido com sucesso!');
}

main().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
