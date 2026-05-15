import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Battle } from '../entities/battle.entity';
import { BattleHit } from '../entities/battle-hit.entity';
import { Country } from '../entities/country.entity';
import { Inventory } from '../entities/inventory.entity';
import { BattleSide, BattleStatus, ItemType } from '../entities/enums';
import { CitizenService } from '../citizen/citizen.service';
import { GameConfig } from '../config/game.config';

@Injectable()
export class BattleService {
  constructor(
    @InjectRepository(Battle) private battles: Repository<Battle>,
    @InjectRepository(BattleHit) private hits: Repository<BattleHit>,
    @InjectRepository(Country) private countries: Repository<Country>,
    @InjectRepository(Inventory) private inventory: Repository<Inventory>,
    private citizenService: CitizenService,
  ) {}

  async list() {
    const battles = await this.battles.find({
      order: { status: 'ASC', createdAt: 'DESC' },
    });
    return battles.map((b) => this.summary(b));
  }

  async detail(id: number) {
    const battle = await this.battles.findOne({ where: { id } });
    if (!battle) throw new NotFoundException('Batalha nao encontrada');

    const hits = await this.hits.find({
      where: { battle: { id } },
      order: { createdAt: 'DESC' },
    });

    // Ranking de heroes por dano em cada lado.
    const board: Record<string, { name: string; side: string; damage: number }> =
      {};
    for (const h of hits) {
      const key = `${h.citizen?.id}-${h.side}`;
      if (!board[key])
        board[key] = {
          name: h.citizen?.name ?? '???',
          side: h.side,
          damage: 0,
        };
      board[key].damage += h.damage;
    }
    const heroes = Object.values(board).sort((a, b) => b.damage - a.damage);

    return {
      ...this.summary(battle),
      heroes,
      recentHits: hits.slice(0, 15).map((h) => ({
        citizen: h.citizen?.name,
        side: h.side,
        damage: h.damage,
        weaponUsed: h.weaponUsed,
        at: h.createdAt,
      })),
    };
  }

  async create(name: string, attackerId: number, defenderId: number) {
    if (attackerId === defenderId)
      throw new BadRequestException('Os paises devem ser diferentes');
    const attacker = await this.countries.findOne({
      where: { id: attackerId },
    });
    const defender = await this.countries.findOne({
      where: { id: defenderId },
    });
    if (!attacker || !defender)
      throw new BadRequestException('Pais invalido');

    const battle = this.battles.create({
      name,
      attackerCountry: attacker,
      defenderCountry: defender,
      attackerDamage: 0,
      defenderDamage: 0,
      status: BattleStatus.OPEN,
    });
    await this.battles.save(battle);
    return this.summary(battle);
  }

  /** Desfere um golpe na batalha por um dos lados. */
  async hit(userId: number, battleId: number, side: BattleSide, useWeapon: boolean) {
    const battle = await this.battles.findOne({ where: { id: battleId } });
    if (!battle) throw new NotFoundException('Batalha nao encontrada');
    if (battle.status !== BattleStatus.OPEN)
      throw new BadRequestException('Esta batalha ja foi encerrada');

    const citizen = await this.citizenService.requireCitizen(userId);
    if (citizen.energy < GameConfig.FIGHT_ENERGY_COST)
      throw new BadRequestException('Energia insuficiente para lutar');

    // Bonus de arma: consome a melhor arma do inventario.
    let weaponBonus = 0;
    let weaponUsed = false;
    if (useWeapon) {
      const weapon = await this.inventory.findOne({
        where: { citizen: { id: citizen.id }, itemType: ItemType.WEAPON },
        order: { quality: 'DESC' },
      });
      if (!weapon || weapon.amount < 1)
        throw new BadRequestException('Voce nao possui armas');
      weapon.amount -= 1;
      await this.inventory.save(weapon);
      weaponBonus = weapon.quality * GameConfig.WEAPON_BONUS_PER_QUALITY;
      weaponUsed = true;
    }

    const damage = this.computeDamage(citizen.strength, citizen.level, weaponBonus);

    citizen.energy -= GameConfig.FIGHT_ENERGY_COST;
    this.citizenService.applyXp(
      citizen,
      Math.max(1, Math.round(damage / GameConfig.FIGHT_XP_DIVISOR)),
    );
    await this.citizenService.saveCitizen(citizen);

    const hitRow = this.hits.create({
      battle,
      citizen,
      side,
      damage,
      weaponUsed,
    });
    await this.hits.save(hitRow);

    if (side === BattleSide.ATTACKER) battle.attackerDamage += damage;
    else battle.defenderDamage += damage;
    await this.battles.save(battle);

    return {
      message: `Voce causou ${damage} de dano`,
      damage,
      weaponUsed,
      battle: this.summary(battle),
      citizen: this.citizenService.toDto(citizen),
    };
  }

  async finish(id: number) {
    const battle = await this.battles.findOne({ where: { id } });
    if (!battle) throw new NotFoundException('Batalha nao encontrada');
    if (battle.status === BattleStatus.FINISHED)
      throw new BadRequestException('Batalha ja encerrada');

    battle.status = BattleStatus.FINISHED;
    battle.finishedAt = new Date();
    battle.winnerSide =
      battle.attackerDamage >= battle.defenderDamage
        ? BattleSide.ATTACKER
        : BattleSide.DEFENDER;
    await this.battles.save(battle);
    return this.summary(battle);
  }

  /** dano = forca * fator de nivel * fator de arma * variacao aleatoria */
  private computeDamage(strength: number, level: number, weaponBonus: number) {
    const base = strength * (1 + (level - 1) * 0.1);
    const random = 0.9 + Math.random() * 0.2;
    return Math.max(1, Math.round(base * (1 + weaponBonus) * random));
  }

  private summary(b: Battle) {
    return {
      id: b.id,
      name: b.name,
      attackerCountry: b.attackerCountry && {
        name: b.attackerCountry.name,
        code: b.attackerCountry.code,
        color: b.attackerCountry.color,
      },
      defenderCountry: b.defenderCountry && {
        name: b.defenderCountry.name,
        code: b.defenderCountry.code,
        color: b.defenderCountry.color,
      },
      attackerDamage: Number(b.attackerDamage),
      defenderDamage: Number(b.defenderDamage),
      status: b.status,
      winnerSide: b.winnerSide,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
    };
  }
}
