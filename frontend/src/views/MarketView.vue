<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, apiError } from '../api/client';
import { useCitizenStore } from '../stores/citizen';

const citizen = useCitizenStore();
const offers = ref<any[]>([]);
const inventory = ref<any[]>([]);
const msg = ref('');
const err = ref('');

const sellForm = ref({
  itemType: 'FOOD',
  quality: 1,
  amount: 1,
  pricePerUnit: 1,
});

async function load() {
  const [o, inv] = await Promise.all([
    api.get('/market'),
    api.get('/inventory'),
  ]);
  offers.value = o.data;
  inventory.value = inv.data;
}
onMounted(load);

async function buy(offer: any) {
  err.value = msg.value = '';
  try {
    const { data } = await api.post('/market/buy', {
      offerId: offer.id,
      amount: 1,
    });
    citizen.apply(data.citizen);
    msg.value = `${data.message} (-$${data.cost})`;
    await load();
  } catch (e) {
    err.value = apiError(e);
  }
}

async function eat(quality: number) {
  err.value = msg.value = '';
  try {
    const { data } = await api.post('/inventory/eat', { quality });
    citizen.apply(data.citizen);
    msg.value = data.message;
    await load();
  } catch (e) {
    err.value = apiError(e);
  }
}

async function sell() {
  err.value = msg.value = '';
  try {
    const { data } = await api.post('/market/sell', {
      itemType: sellForm.value.itemType,
      quality: Number(sellForm.value.quality),
      amount: Number(sellForm.value.amount),
      pricePerUnit: Number(sellForm.value.pricePerUnit),
    });
    msg.value = data.message;
    await load();
  } catch (e) {
    err.value = apiError(e);
  }
}
</script>

<template>
  <div class="container">
    <h1>Mercado Global</h1>
    <p class="muted" style="margin-bottom:16px">
      Compre comida para recuperar energia e armas para lutar.
    </p>

    <div v-if="msg" class="toast ok">{{ msg }}</div>
    <div v-if="err" class="toast err">{{ err }}</div>

    <div class="panel">
      <h2>Ofertas a venda</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Qualidade</th><th>Preco/un.</th><th>Estoque</th><th>Vendedor</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in offers" :key="o.id">
            <td>{{ o.itemType === 'FOOD' ? 'Comida' : 'Arma' }}</td>
            <td>Q{{ o.quality }}</td>
            <td>${{ o.pricePerUnit }}</td>
            <td>{{ o.amount === null ? 'Ilimitado' : o.amount }}</td>
            <td class="muted">{{ o.seller }}</td>
            <td><button class="btn-ghost" @click="buy(o)">Comprar 1</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Seu inventario</h2>
      <table v-if="inventory.length">
        <thead>
          <tr><th>Item</th><th>Qualidade</th><th>Quantidade</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="i in inventory" :key="i.id">
            <td>{{ i.itemType === 'FOOD' ? 'Comida' : 'Arma' }}</td>
            <td>Q{{ i.quality }}</td>
            <td>{{ i.amount }}</td>
            <td>
              <button v-if="i.itemType === 'FOOD' && i.amount > 0"
                      class="btn-green" @click="eat(i.quality)">
                Comer (+{{ i.quality * 10 }} energia)
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Inventario vazio. Trabalhe ou compre itens.</p>
    </div>

    <div class="panel">
      <h2>Vender item</h2>
      <div class="row">
        <div>
          <label>Tipo</label>
          <select v-model="sellForm.itemType">
            <option value="FOOD">Comida</option>
            <option value="WEAPON">Arma</option>
          </select>
        </div>
        <div>
          <label>Qualidade</label>
          <input type="number" v-model="sellForm.quality" min="1" max="5" />
        </div>
        <div>
          <label>Quantidade</label>
          <input type="number" v-model="sellForm.amount" min="1" />
        </div>
        <div>
          <label>Preco por unidade</label>
          <input type="number" v-model="sellForm.pricePerUnit" min="0.01" step="0.5" />
        </div>
      </div>
      <button style="margin-top:14px" @click="sell">Criar oferta</button>
    </div>
  </div>
</template>
