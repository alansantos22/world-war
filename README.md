# World War

Clone (MVP jogável) de um jogo de estratégia de guerra geopolítica no estilo
**e-sim / eRepublik**. Você cria um cidadão, escolhe um país, trabalha para
ganhar dinheiro, treina para ficar mais forte, compra armas no mercado e luta
em batalhas entre nações.

## Stack

| Camada    | Tecnologia                                |
|-----------|-------------------------------------------|
| Backend   | NestJS + TypeScript + TypeORM             |
| Banco     | MySQL                                     |
| Frontend  | Vue 3 + Vite + Pinia + Vue Router         |
| Auth      | JWT (Bearer token)                        |

## Mecânicas do MVP

- **Cidadão** — força, nível, XP, energia, dinheiro e ouro.
- **Energia** — regenera +1 por minuto; comer comida recupera energia.
- **Trabalho** — emprega-se numa empresa e trabalha (custa 10 de energia,
  rende dinheiro, XP e produtos).
- **Treino** — custa 10 de energia, aumenta a força (+0,5).
- **Batalhas** — guerras entre dois países; cada golpe causa dano com base na
  força, no nível e na arma usada (custa 10 de energia).
- **Mercado** — compre/venda comida e armas; loja do estado com estoque
  ilimitado e ofertas de outros jogadores.
- **Ranking** — os 50 cidadãos mais fortes do mundo.
- **Mapa-múndi vetorial procedural** — mapa do mundo desenhado em SVG (grade
  50×24, 6 continentes) e **gerado a cada novo servidor**. Os continentes são
  subdivididos em ~65 regiões clicáveis; cada região recebe **1 recurso
  especial** posicionado aleatoriamente e pode ser controlada por um país ou
  ficar **neutra**. A tela tem duas visões (estilo e-sim): **Político** (cor
  por país dono) e **Recursos** (cor por recurso). As quantidades de recursos
  raros são controladas para garantir escassez (Nióbio extremamente raro — 1
  região no mundo; depois Urânio, Prata, Ouro, Petróleo). Regenere o mapa com
  `npm run generate:map`.

## Estrutura

```
world-war/
├── backend/    API NestJS (porta 3009)
│   └── src/
│       ├── entities/   modelos do banco (TypeORM)
│       ├── auth/        registro, login e JWT
│       ├── citizen/     cidadão, trabalho, treino, inventário
│       ├── battle/      batalhas e golpes
│       ├── market/      mercado e ofertas
│       ├── country/     listagem de países
│       ├── config/      balanceamento do jogo (game.config.ts)
│       └── seed.ts      cria o banco e os dados iniciais
└── frontend/   SPA Vue 3 (porta 5173)
    └── src/
        ├── views/       telas (login, painel, batalha, mercado...)
        ├── stores/      Pinia (auth e cidadão)
        ├── router/      rotas e proteção de autenticação
        └── api/         cliente axios
```

## Pré-requisitos

- Node.js 18+ (testado com 20)
- MySQL 8+ rodando localmente

## Como executar

### 1. Configurar o banco de dados

Edite `backend/.env` (já criado a partir de `.env.example`) com as credenciais
do seu MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=SUA_SENHA_AQUI
DB_NAME=world_war
JWT_SECRET=troque_este_segredo
PORT=3009
```

### 2. Backend

```bash
cd backend
npm install
npm run seed      # cria o banco "world_war", as tabelas e os dados iniciais
npm run start:dev # API em http://localhost:3009/api
```

> O `npm run seed` cria o banco automaticamente (`CREATE DATABASE IF NOT
> EXISTS`), insere 8 países, 6 empresas, 1 batalha em andamento, a loja do
> estado e **gera o mapa-múndi** (regiões + recursos aleatórios). As tabelas
> também são criadas/atualizadas automaticamente pelo TypeORM
> (`synchronize: true`) ao iniciar a API.
>
> Para **regerar apenas o mapa** (novo servidor), rode `npm run generate:map` —
> ele apaga as regiões atuais e gera um mapa novo com recursos reposicionados.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev       # app em http://localhost:5173
```

O Vite faz proxy de `/api` para `http://localhost:3009`, então basta abrir
`http://localhost:5173` no navegador.

## Como jogar

1. Acesse `http://localhost:5173`, vá em **Criar cidadão**, escolha um país.
2. No menu **Trabalho**, pegue um emprego e clique em *Trabalhar*.
3. Em **Treino**, treine para aumentar a força.
4. No **Mercado**, compre comida (recupera energia) e armas.
5. Em **Batalhas**, entre numa guerra e golpeie pelo seu lado.
6. Confira sua posição em **Ranking**.

## Instalar como app (PWA)

O frontend é um **PWA**: pode ser instalado como aplicativo no celular ou no
desktop, abrindo em tela cheia (sem a barra do navegador).

1. Faça o build de produção e sirva-o:
   ```bash
   cd frontend
   npm run build
   npm run preview
   ```
2. Abra o endereço no Chrome/Edge (desktop) ou no navegador do celular.
3. Use **Instalar app** (ícone na barra de endereço) ou, no celular,
   **Adicionar à tela inicial**.

> O service worker (`public/sw.js`) só é registrado no build de produção, para
> não interferir no hot-reload do `npm run dev`. As chamadas de `/api` sempre
> vão para a rede — o jogo é online.

Para um app de loja (Play Store / App Store), a SPA pode ser empacotada com
[Capacitor](https://capacitorjs.com/), reaproveitando o mesmo `dist/`.

A interface é **responsiva** — funciona em telas de celular, tablet e desktop
(menu em "hambúrguer" no mobile, tabelas com rolagem horizontal).

## Endpoints principais da API

| Método | Rota                     | Descrição                          |
|--------|--------------------------|------------------------------------|
| POST   | `/api/auth/register`     | cria usuário + cidadão             |
| POST   | `/api/auth/login`        | autentica e retorna o token JWT    |
| GET    | `/api/countries`         | lista os países                   |
| GET    | `/api/citizen/me`        | dados do cidadão logado            |
| GET    | `/api/citizen/rankings`  | ranking de força                   |
| POST   | `/api/work`              | trabalha                           |
| POST   | `/api/train`             | treina                             |
| GET    | `/api/companies`         | lista empresas                     |
| POST   | `/api/companies/:id/job` | consegue um emprego                |
| GET    | `/api/battles`           | lista batalhas                     |
| POST   | `/api/battles/:id/hit`   | desfere um golpe                   |
| GET    | `/api/map`               | mapa: regiões agrupadas por país   |
| GET    | `/api/resources`         | catálogo de recursos especiais     |
| GET    | `/api/resources/scarcity`| escassez (regiões por recurso)     |
| GET    | `/api/market`            | lista ofertas do mercado           |
| POST   | `/api/market/buy`        | compra itens                       |
| POST   | `/api/inventory/eat`     | come comida (recupera energia)     |

Rotas protegidas exigem o cabeçalho `Authorization: Bearer <token>`.

## Balanceamento

Ajuste os valores do jogo em [`backend/src/config/game.config.ts`](backend/src/config/game.config.ts)
— custos de energia, salários, ganho de força, fórmula de XP por nível, etc.

## Observações

- Projeto é um **MVP jogável**; não cobre todo o e-sim (política, eleições,
  unidades militares, jornais, sistema monetário completo).
- `synchronize: true` é prático para desenvolvimento, mas em produção use
  *migrations* do TypeORM.
