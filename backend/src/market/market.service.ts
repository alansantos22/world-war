import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketOffer } from '../entities/market-offer.entity';
import { Inventory } from '../entities/inventory.entity';
import { ItemType } from '../entities/enums';
import { CitizenService } from '../citizen/citizen.service';

@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(MarketOffer) private offers: Repository<MarketOffer>,
    @InjectRepository(Inventory) private inventory: Repository<Inventory>,
    private citizenService: CitizenService,
  ) {}

  async list() {
    const offers = await this.offers.find({
      order: { itemType: 'ASC', quality: 'DESC', pricePerUnit: 'ASC' },
    });
    return offers
      .filter((o) => o.stateShop || o.amount > 0)
      .map((o) => ({
        id: o.id,
        itemType: o.itemType,
        quality: o.quality,
        amount: o.stateShop ? null : o.amount,
        pricePerUnit: Math.round(o.pricePerUnit * 100) / 100,
        seller: o.stateShop ? 'Loja do Estado' : o.seller?.name ?? '???',
        stateShop: o.stateShop,
      }));
  }

  /** Compra unidades de uma oferta do mercado. */
  async buy(userId: number, offerId: number, amount: number) {
    if (amount < 1) throw new BadRequestException('Quantidade invalida');

    const offer = await this.offers.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Oferta nao encontrada');
    if (!offer.stateShop && offer.amount < amount)
      throw new BadRequestException('Quantidade indisponivel na oferta');

    const buyer = await this.citizenService.requireCitizen(userId);
    if (offer.seller && offer.seller.id === buyer.id)
      throw new BadRequestException('Voce nao pode comprar a sua propria oferta');

    const cost = amount * offer.pricePerUnit;
    if (buyer.money < cost)
      throw new BadRequestException('Dinheiro insuficiente');

    buyer.money -= cost;
    await this.citizenService.saveCitizen(buyer);

    if (!offer.stateShop) {
      offer.amount -= amount;
      if (offer.seller) {
        offer.seller.money += cost;
        await this.citizenService.saveCitizen(offer.seller);
      }
      if (offer.amount <= 0) await this.offers.remove(offer);
      else await this.offers.save(offer);
    }

    await this.citizenService.addItem(
      buyer,
      offer.itemType,
      offer.quality,
      amount,
    );

    return {
      message: `Voce comprou ${amount}x ${offer.itemType} Q${offer.quality}`,
      cost: Math.round(cost * 100) / 100,
      citizen: this.citizenService.toDto(buyer),
    };
  }

  /** Cria uma oferta de venda a partir do inventario do cidadao. */
  async sell(
    userId: number,
    itemType: ItemType,
    quality: number,
    amount: number,
    pricePerUnit: number,
  ) {
    if (amount < 1 || pricePerUnit <= 0)
      throw new BadRequestException('Quantidade ou preco invalido');

    const seller = await this.citizenService.requireCitizen(userId);
    const row = await this.inventory.findOne({
      where: { citizen: { id: seller.id }, itemType, quality },
    });
    if (!row || row.amount < amount)
      throw new BadRequestException('Voce nao possui esses itens');

    row.amount -= amount;
    await this.inventory.save(row);

    const offer = this.offers.create({
      seller,
      itemType,
      quality,
      amount,
      pricePerUnit,
      stateShop: false,
    });
    await this.offers.save(offer);

    return {
      message: `Oferta criada: ${amount}x ${itemType} Q${quality}`,
      offerId: offer.id,
    };
  }
}
