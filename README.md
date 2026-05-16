# World War

Monorepo com **dois jogos** que compartilham mapa e arte:

- **Jogo online** (`apps/backend` + `apps/frontend`) — MMO de guerra geopolítica
  no estilo **e-sim / eRepublik**. Você cria um cidadão, escolhe um país,
  trabalha, treina, compra armas e luta em batalhas entre nações.
- **Jogo desktop** (`apps/desktop`) — versão **offline, contra IA**, com pegada
  de **grande estratégia** (estilo Europa Universalis / Civilization): você
  comanda uma nação inteira. App nativo via **Tauri**, save em **SQLite** local.
  As mecânicas ainda serão desenvolvidas — por ora é só o esqueleto.

O texto abaixo descreve o **jogo online** (o MVP atual).

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
- **Batalhas e conquista** — pelo mapa você declara guerra a uma região
  (neutra ou inimiga); cada golpe causa dano com base na força, no nível e na
  arma usada (custa 10 de energia). Ao **encerrar** a batalha, se o atacante
  vencer, **o país toma o controle da região**. Capitais não são conquistáveis.
- **Projeção de poder** — atacar uma região colada na sua fronteira não tem
  penalidade; quanto mais longe (atravessando oceano/continente), maior o
  *debuff* de dano do atacante (−5% por célula de distância, até −75%) — no
  estilo de supply/distância de HoI4 e Europa Universalis.
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
world-war/                npm workspaces (monorepo)
├── package.json          raiz: workspaces + scripts dev:*
└── apps/
    ├── backend/    API NestJS do jogo online (porta 3009)
    │   └── src/
    │       ├── entities/   modelos do banco (TypeORM)
    │       ├── auth/        registro, login e JWT
    │       ├── citizen/     cidadão, trabalho, treino, inventário
    │       ├── battle/      batalhas e golpes
    │       ├── market/      mercado e ofertas
    │       ├── country/     listagem de países
    │       ├── config/      balanceamento do jogo (game.config.ts)
    │       └── seed.ts      cria o banco e os dados iniciais
    ├── frontend/   SPA Vue 3 do jogo online (porta 5173)
    │   └── src/
    │       ├── views/       telas (login, painel, batalha, mercado...)
    │       ├── stores/      Pinia (auth e cidadão)
    │       ├── router/      rotas e proteção de autenticação
    │       └── api/         cliente axios
    └── desktop/    jogo desktop de grande estratégia (Tauri + Vue + SQLite)
        ├── src/         frontend Vue (db.ts = conexão SQLite)
        └── src-tauri/   shell nativo em Rust (Tauri v2)
```

## Pré-requisitos

- Node.js 18+ (testado com 20)
- MySQL 8+ rodando localmente

## Como executar

### 1. Configurar o banco de dados

Edite `apps/backend/.env` (já criado a partir de `.env.example`) com as
credenciais do seu MySQL:

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
cd apps/backend
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
cd apps/frontend
npm install
npm run dev       # app em http://localhost:5173
```

O Vite faz proxy de `/api` para `http://localhost:3009`, então basta abrir
`http://localhost:5173` no navegador.

## Jogo desktop (grande estratégia, offline)

O jogo desktop fica em `apps/desktop` — um app **Tauri v2 + Vue 3** com save em
**SQLite** local. Por enquanto é só o esqueleto; as mecânicas de nação (economia,
diplomacia, tecnologia, IA) ainda serão desenvolvidas.

**Pré-requisito:** a toolchain do **Rust** instalada
(<https://www.rust-lang.org/tools/install>) e os
[pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) para o seu SO.

```bash
cd apps/desktop
npm install
npm run tauri:dev    # abre o app desktop em modo de desenvolvimento
npm run tauri:build  # gera o executável/instalador
```

A conexão com o banco fica em [`apps/desktop/src/db.ts`](apps/desktop/src/db.ts);
o arquivo `world-war.db` é criado no diretório de dados do app.

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
   cd apps/frontend
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
| GET    | `/api/battles/preview/:regionId` | prévia de ataque (distância/penalidade) |
| POST   | `/api/battles`           | declara guerra a uma região        |
| POST   | `/api/battles/:id/hit`   | desfere um golpe                   |
| POST   | `/api/battles/:id/finish`| encerra a batalha (vencedor conquista a região) |
| GET    | `/api/map`               | mapa: regiões agrupadas por país   |
| GET    | `/api/resources`         | catálogo de recursos especiais     |
| GET    | `/api/resources/scarcity`| escassez (regiões por recurso)     |
| GET    | `/api/market`            | lista ofertas do mercado           |
| POST   | `/api/market/buy`        | compra itens                       |
| POST   | `/api/inventory/eat`     | come comida (recupera energia)     |

Rotas protegidas exigem o cabeçalho `Authorization: Bearer <token>`.

## Balanceamento

Ajuste os valores do jogo em [`apps/backend/src/config/game.config.ts`](apps/backend/src/config/game.config.ts)
— custos de energia, salários, ganho de força, fórmula de XP por nível, etc.

## Observações

- Projeto é um **MVP jogável**; não cobre todo o e-sim (política, eleições,
  unidades militares, jornais, sistema monetário completo).
- `synchronize: true` é prático para desenvolvimento, mas em produção use
  *migrations* do TypeORM.
