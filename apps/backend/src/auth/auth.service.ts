import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Citizen } from '../entities/citizen.entity';
import { Country } from '../entities/country.entity';
import { LoginDto, RegisterDto } from './auth.dto';
import { GameConfig } from '../config/game.config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Citizen) private citizens: Repository<Citizen>,
    @InjectRepository(Country) private countries: Repository<Country>,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const emailTaken = await this.users.findOne({
      where: { email: dto.email },
    });
    if (emailTaken) throw new BadRequestException('E-mail ja cadastrado');

    const nameTaken = await this.citizens.findOne({
      where: { name: dto.citizenName },
    });
    if (nameTaken)
      throw new BadRequestException('Nome de cidadao ja existe');

    const country = await this.countries.findOne({
      where: { id: dto.countryId },
    });
    if (!country) throw new BadRequestException('Pais invalido');

    const user = this.users.create({
      email: dto.email,
      password: await bcrypt.hash(dto.password, 10),
    });
    await this.users.save(user);

    const citizen = this.citizens.create({
      name: dto.citizenName,
      country,
      user,
      strength: GameConfig.STARTING_STRENGTH,
      energy: GameConfig.MAX_ENERGY,
      maxEnergy: GameConfig.MAX_ENERGY,
      energyUpdatedAt: new Date(),
      money: GameConfig.STARTING_MONEY,
      gold: GameConfig.STARTING_GOLD,
    });
    await this.citizens.save(citizen);

    return this.sign(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.password)))
      throw new UnauthorizedException('Credenciais invalidas');
    return this.sign(user);
  }

  private sign(user: User) {
    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  }
}
