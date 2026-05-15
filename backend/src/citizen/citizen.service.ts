import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Citizen } from '../entities/citizen.entity';
import { Company } from '../entities/company.entity';
import { Inventory } from '../entities/inventory.entity';
import { ItemType } from '../entities/enums';
import { GameConfig, xpForLevel } from '../config/game.config';

@Injectable()
export class CitizenService {
  constructor(
    @InjectRepository(Citizen) private citizens: Repository<Citizen>,
    @InjectRepository(Company) private companies: Repository<Company>,
    @InjectRepository(Inventory) private inventory: Repository<Inventory>,
  ) {}

  /** Carrega o cidadao do usuario, aplicando a regeneracao de energia. */
  async requireCitizen(userId: number): Promise<Citizen> {
    const citizen = await this.citizens.findOne({
      where: { user: { id: userId } },
    });
    if (!citizen) throw new NotFoundException('Cidadao nao encontrado');
    this.applyEnergyRegen(citizen);
    await this.citizens.save(citizen);
    return citizen;
  }

  /** Regenera energia com base no tempo decorrido desde a ultima atualizacao. */
  applyEnergyRegen(citizen: Citizen) {
    const now = Date.now();
    const last = new Date(citizen.energyUpdatedAt).getTime();
    if (citizen.energy >= citizen.maxEnergy) {
      citizen.energy = citizen.maxEnergy;
      citizen.energyUpdatedAt = new Date(now);
      return;
    }
    const minutes = Math.floor((now - last) / 60000);
    if (minutes <= 0) return;
    citizen.energy = Math.min(
      citizen.maxEnergy,
      citizen.energy + minutes * GameConfig.ENERGY_REGEN_PER_MIN,
    );
    citizen.energyUpdatedAt = new Date(last + minutes * 60000);
  }

  /** Adiciona XP e processa subida(s) de nivel. */
  applyXp(citizen: Citizen, amount: number) {
    citizen.xp += amount;
    while (citizen.xp >= xpForLevel(citizen.level + 1)) {
      citizen.level += 1;
      citizen.gold += GameConfig.GOLD_PER_LEVEL;
    }
  }

  /** Soma itens ao inventario do cidadao. */
  async addItem(
    citizen: Citizen,
    itemType: ItemType,
    quality: number,
    amount: number,
  ) {
    let row = await this.inventory.findOne({
      where: { citizen: { id: citizen.id }, itemType, quality },
    });
    if (!row) {
      row = this.inventory.create({ citizen, itemType, quality, amount: 0 });
    }
    row.amount += amount;
    await this.inventory.save(row);
    return row;
  }

  /** Persiste o cidadao (usado por outros modulos, ex.: batalha). */
  saveCitizen(citizen: Citizen) {
    return this.citizens.save(citizen);
  }

  async getInventory(citizen: Citizen) {
    return this.inventory.find({
      where: { citizen: { id: citizen.id } },
      order: { itemType: 'ASC', quality: 'DESC' },
    });
  }

  async listCompanies() {
    return this.companies.find({ order: { type: 'ASC', quality: 'DESC' } });
  }

  /** Define o empregador do cidadao. */
  async getJob(userId: number, companyId: number) {
    const citizen = await this.requireCitizen(userId);
    const company = await this.companies.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada');
    citizen.employer = company;
    await this.citizens.save(citizen);
    return this.toDto(citizen);
  }

  /** Trabalha: gasta energia, recebe salario, produto e XP. */
  async work(userId: number) {
    const citizen = await this.requireCitizen(userId);
    if (!citizen.employer)
      throw new BadRequestException('Consiga um emprego antes de trabalhar');
    if (citizen.energy < GameConfig.WORK_ENERGY_COST)
      throw new BadRequestException('Energia insuficiente para trabalhar');

    const company = citizen.employer;
    citizen.energy -= GameConfig.WORK_ENERGY_COST;
    const pay = GameConfig.WORK_BASE_PAY * company.quality;
    citizen.money += pay;
    this.applyXp(citizen, GameConfig.WORK_XP);
    await this.citizens.save(citizen);

    // O trabalhador leva uma parte da producao para casa.
    const itemType =
      company.type === 'FOOD' ? ItemType.FOOD : ItemType.WEAPON;
    const producedAmount = company.quality;
    await this.addItem(citizen, itemType, company.quality, producedAmount);

    return {
      message: `Voce trabalhou na ${company.name}`,
      pay,
      xp: GameConfig.WORK_XP,
      produced: { itemType, quality: company.quality, amount: producedAmount },
      citizen: this.toDto(citizen),
    };
  }

  /** Treina: gasta energia, ganha forca e XP. */
  async train(userId: number) {
    const citizen = await this.requireCitizen(userId);
    if (citizen.energy < GameConfig.TRAIN_ENERGY_COST)
      throw new BadRequestException('Energia insuficiente para treinar');

    citizen.energy -= GameConfig.TRAIN_ENERGY_COST;
    citizen.strength += GameConfig.TRAIN_STRENGTH_GAIN;
    this.applyXp(citizen, GameConfig.TRAIN_XP);
    await this.citizens.save(citizen);

    return {
      message: 'Treino concluido',
      strengthGain: GameConfig.TRAIN_STRENGTH_GAIN,
      xp: GameConfig.TRAIN_XP,
      citizen: this.toDto(citizen),
    };
  }

  /** Come uma unidade de comida para recuperar energia. */
  async eat(userId: number, quality: number) {
    const citizen = await this.requireCitizen(userId);
    const row = await this.inventory.findOne({
      where: {
        citizen: { id: citizen.id },
        itemType: ItemType.FOOD,
        quality,
      },
    });
    if (!row || row.amount < 1)
      throw new BadRequestException('Voce nao possui essa comida');
    if (citizen.energy >= citizen.maxEnergy)
      throw new BadRequestException('Sua energia ja esta cheia');

    const restored = Math.min(
      quality * GameConfig.FOOD_ENERGY_PER_QUALITY,
      citizen.maxEnergy - citizen.energy,
    );
    citizen.energy += restored;
    row.amount -= 1;
    await this.inventory.save(row);
    await this.citizens.save(citizen);

    return {
      message: `Voce comeu e recuperou ${restored} de energia`,
      restored,
      citizen: this.toDto(citizen),
    };
  }

  async rankings() {
    const list = await this.citizens.find({
      order: { strength: 'DESC' },
      take: 50,
    });
    return list.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      country: c.country && {
        name: c.country.name,
        code: c.country.code,
        color: c.country.color,
      },
      level: c.level,
      strength: Math.round(c.strength * 10) / 10,
    }));
  }

  /** Serializa o cidadao para o cliente. */
  toDto(citizen: Citizen) {
    return {
      id: citizen.id,
      name: citizen.name,
      country: citizen.country && {
        id: citizen.country.id,
        name: citizen.country.name,
        code: citizen.country.code,
        color: citizen.country.color,
      },
      strength: Math.round(citizen.strength * 10) / 10,
      level: citizen.level,
      xp: citizen.xp,
      xpCurrentLevel: xpForLevel(citizen.level),
      xpNextLevel: xpForLevel(citizen.level + 1),
      energy: citizen.energy,
      maxEnergy: citizen.maxEnergy,
      money: Math.round(citizen.money * 100) / 100,
      gold: Math.round(citizen.gold * 100) / 100,
      employer: citizen.employer && {
        id: citizen.employer.id,
        name: citizen.employer.name,
        type: citizen.employer.type,
        quality: citizen.employer.quality,
      },
    };
  }
}
