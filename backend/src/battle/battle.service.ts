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
import { Region } from '../entities/region.entity';
import { BattleSide, BattleStatus, ItemType } from '../entities/enums';
import { CitizenService } from '../citizen/citizen.service';
import { GameConfig } from '../config/game.config';

/** Resultado da analise de viabilidade de um ataque a uma regiao. */
interface AttackAssessment {
  region: Region;
  attacker: Country;
  /** Celulas de distancia entre a fronteira do pais e a regiao alvo (0 = colada). */
  gap: number;
  /** Penalidade de dano do atacante (0..1) decorrente da distancia. */
  penalty: number;
  /** Batalha aberta que ja disputa esta regiao, se houver. */
  existing: Battle | null;
  /** Motivo pelo qual o ataque NAO e possivel (null = pode atacar). */
  blocker: string | null;
}

@Injectable()
export class BattleService {
  constructor(
    @InjectRepository(Battle) private battles: Repository<Battle>,
    @InjectRepository(BattleHit) private hits: Repository<BattleHit>,
    @InjectRepository(Country) private countries: Repository<Country>,
    @InjectRepository(Inventory) private inventory: Repository<Inventory>,
    @InjectRepository(Region) private regions: Repository<Region>,
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

  /**
   * Previa de ataque a uma regiao: informa se o pais do jogador pode atacar
   * e qual seria a penalidade de distancia. Usado pelo mapa antes de declarar
   * guerra.
   */
  async attackPreview(userId: number, regionId: number) {
    const citizen = await this.citizenService.requireCitizen(userId);
    const a = await this.assess(citizen.country, regionId);
    return {
      regionId,
      regionName: a.region.name,
      attackerCountry: a.attacker && { name: a.attacker.name, color: a.attacker.color },
      defenderCountry: a.region.ownerCountry
        ? { name: a.region.ownerCountry.name, color: a.region.ownerCountry.color }
        : null,
      gap: a.gap,
      penalty: a.penalty,
      penaltyPercent: Math.round(a.penalty * 100),
      canAttack: a.blocker === null || a.existing !== null,
      blocker: a.blocker,
      existingBattleId: a.existing?.id ?? null,
    };
  }

  /** Declara guerra: o pais do jogador ataca uma regiao do mapa. */
  async create(userId: number, regionId: number, name?: string) {
    const citizen = await this.citizenService.requireCitizen(userId);
    const attacker = citizen.country;
    if (!attacker)
      throw new BadRequestException('Seu cidadao nao tem pais definido');

    const a = await this.assess(attacker, regionId);

    // Se ja existe uma ofensiva aberta nesta regiao, entra nela.
    if (a.existing) return this.summary(a.existing);
    if (a.blocker) throw new BadRequestException(a.blocker);

    const battle = this.battles.create({
      name: name?.trim() || `Ofensiva em ${a.region.name}`,
      attackerCountry: attacker,
      defenderCountry: a.region.ownerCountry,
      region: a.region,
      attackerFrontPenalty: a.penalty,
      regionCaptured: false,
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

    let damage = this.computeDamage(citizen.strength, citizen.level, weaponBonus);

    // Projecao de poder: o atacante perde dano ao bater longe da sua fronteira.
    // O defensor luta em casa, sem penalidade.
    if (side === BattleSide.ATTACKER && battle.attackerFrontPenalty > 0) {
      damage = Math.max(
        1,
        Math.round(damage * (1 - battle.attackerFrontPenalty)),
      );
    }

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

    // Conquista: se o atacante venceu, o pais toma o controle da regiao.
    if (battle.winnerSide === BattleSide.ATTACKER && battle.region) {
      const region = await this.regions.findOne({
        where: { id: battle.region.id },
      });
      if (region && !region.isCapital) {
        region.ownerCountry = battle.attackerCountry;
        await this.regions.save(region);
        battle.regionCaptured = true;
      }
    }
    await this.battles.save(battle);
    return this.summary(battle);
  }

  /**
   * Avalia se `attacker` pode atacar a regiao `regionId`: calcula a distancia
   * ate a fronteira do pais, a penalidade resultante e eventuais bloqueios.
   */
  private async assess(
    attacker: Country | null,
    regionId: number,
  ): Promise<AttackAssessment> {
    const region = await this.regions.findOne({ where: { id: regionId } });
    if (!region) throw new NotFoundException('Regiao nao encontrada');

    const all = await this.regions.find();
    const owned = attacker
      ? all.filter((r) => r.ownerCountry?.id === attacker.id)
      : [];

    const gap = this.frontGap(owned, region);
    const penalty = Math.min(
      GameConfig.WAR_MAX_FRONT_PENALTY,
      gap * GameConfig.WAR_FRONT_PENALTY_PER_CELL,
    );

    const existing = await this.battles.findOne({
      where: { region: { id: regionId }, status: BattleStatus.OPEN },
    });

    let blocker: string | null = null;
    if (!attacker) blocker = 'Seu cidadao nao tem pais definido';
    else if (region.isCapital)
      blocker = 'Capitais nao podem ser conquistadas';
    else if (region.ownerCountry?.id === attacker.id)
      blocker = 'Seu pais ja controla esta regiao';
    else if (owned.length === 0)
      blocker = 'Seu pais nao controla nenhum territorio para atacar a partir dele';

    return { region, attacker: attacker!, gap, penalty, existing, blocker };
  }

  /**
   * Menor distancia (em celulas) entre o territorio do pais e a regiao alvo.
   * 0 = a regiao faz fronteira (celulas coladas, inclusive na diagonal).
   */
  private frontGap(territory: Region[], target: Region): number {
    if (territory.length === 0) return GameConfig.WAR_MAX_FRONT_PENALTY * 100;
    let min = Infinity;
    for (const r of territory) {
      for (const a of r.cells) {
        for (const t of target.cells) {
          const d = Math.max(Math.abs(a.x - t.x), Math.abs(a.y - t.y));
          if (d < min) min = d;
        }
      }
    }
    return Math.max(0, min - 1);
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
      defenderCountry: b.defenderCountry
        ? {
            name: b.defenderCountry.name,
            code: b.defenderCountry.code,
            color: b.defenderCountry.color,
          }
        : null,
      region: b.region && {
        id: b.region.id,
        name: b.region.name,
        continent: b.region.continent,
      },
      attackerFrontPenalty: Number(b.attackerFrontPenalty),
      attackerPenaltyPercent: Math.round(Number(b.attackerFrontPenalty) * 100),
      regionCaptured: b.regionCaptured,
      attackerDamage: Number(b.attackerDamage),
      defenderDamage: Number(b.defenderDamage),
      status: b.status,
      winnerSide: b.winnerSide,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
    };
  }
}
