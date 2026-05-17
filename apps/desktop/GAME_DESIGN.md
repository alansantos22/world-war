# World War — Jogo Desktop (Documento de Design)

Versão offline de grande estratégia (estilo Europa Universalis / Civilization),
jogada contra IA. App nativo em **Tauri v2 + Vue 3**, com estado salvo em
**SQLite** local.

> Este documento descreve o que **já está implementado** e marca claramente o
> que ainda é **planejado**. Mantenha-o atualizado a cada nova mecânica.

---

## 1. Visão geral

O jogador comanda **uma nação** num mapa-múndi. O objetivo de longo prazo é
expandir território, gerir economia, fazer diplomacia e vencer as outras
nações — todas controladas por IA.

Estado atual: o **mapa-múndi** com províncias, nações e direcionamentos
políticos; cada facção tem os seus **valores**, cada território a sua
**produção por turno**, os seus **defensores** e os seus dados de
**clima e geografia** (hemisfério, zona de clima, zonas sísmicas, vulcões);
o jogo já avança por **turnos** (1 semana cada), em que as facções recebem a
produção das suas províncias e pagam a manutenção dos seus exércitos; o
jogador monta, move e dissolve **esquadrões** militares, **recruta tropas**,
**ataca** territórios e esquadrões inimigos e **toma** territórios neutros;
cada nação tem **cidades** — começando pela capital — com população, comida e
zona de influência, e pode **fundar novas cidades** com colonos. A IA, os
eventos e a diplomacia ainda serão implementados.

---

## 2. O mapa

### Grade

O mundo é uma grade fixa de **100 × 48 células** (`GRID` em
[`src/game/map-generator.ts`](src/game/map-generator.ts)) — o desenho-base
(`BASE_LAND`, 50 × 24) ampliado por `MAP_SCALE` (2×). O desenho dos 6
continentes é fixo:

| Código | Continente        |
|--------|-------------------|
| N      | América do Norte  |
| S      | América do Sul    |
| E      | Europa            |
| A      | África            |
| I      | Ásia              |
| O      | Oceania           |

### Província = célula

**Cada célula de terra é uma província individual** — a unidade básica do
jogo. Uma província pode ser possuída por uma nação (ou ficar neutra), tem um
nome próprio e um recurso. São ~1.600 províncias no total. As Américas do Norte
e do Sul são ligadas por um istmo — a **América Central**.

A cada "Novo mapa" o desenho dos continentes é o mesmo, mas os **nomes**, os
**recursos** e as **capitais** são sorteados de novo.

### Mar profundo × mar raso

As células de oceano têm dois tipos, só para fins visuais:

- **Mar raso** — célula de oceano encostada (8 vizinhos) em alguma terra.
  Cor mais clara.
- **Mar profundo** — todo o resto do oceano. Cor mais escura (desenhado como
  fundo do mapa).

A classificação é calculada na renderização ([`src/App.vue`](src/App.vue)),
não é persistida.

### Recursos

Cada província tem **1 recurso** (catálogo em
[`src/game/resources.ts`](src/game/resources.ts)):

- **Raros:** Nióbio, Urânio, Prata, Ouro, Petróleo.
- **Comuns:** Madeira, Ferro, Carvão, Bauxita, Cobre, Terras Agrícolas.

Os recursos raros são posicionados com *farthest-point sampling* (cada raro é
colocado o mais longe possível dos raros já posicionados), garantindo que
ninguém monopolize um recurso num canto do mapa. Quantidades proporcionais ao
total de províncias — Nióbio é o mais escasso (~3%).

O **ícone do recurso** aparece sobre a província **apenas no modo Recursos**
— aí todas as províncias mostram o seu ícone. No modo **Político** o mapa
fica limpo, sem ícones de recurso (nem dos raros).

> **Planejado:** efeito dos recursos na economia/produção de cada nação.

### Produção: tudo vem das cidades

Uma província **sem cidade** é só território — **não produz nada**. Toda a
produção (industrial, comida, cultura, pesquisa, manpower, recursos, dinheiro)
vem das **cidades** e das suas **construções** (ver seções 12 e 13). Cada
cidade tem valores-base e cresce com a população:

| Valor          | Capital | Cidade | Cresce com |
|----------------|---------|--------|------------|
| Produção       | 20      | 10     | +1 a cada 25 mil de população; zonas de fábrica |
| Cultura/turno  | 5       | 2      | museu, teatro, rádio, TV |
| Recurso local  | 2 (1 raro) | 1 (0 raro) | — extrai o recurso do próprio tile |

`Manpower` (1% da população) e `pesquisa` também vêm das cidades. As colunas
de produção sorteadas das províncias ficam como **dado legado**, sem uso.

---

## 3. As nações (facções)

São **13 nações**, definidas em [`src/game/nations.ts`](src/game/nations.ts).
Cada uma começa controlando **1 província — a sua capital** (marcada com ★).
Todo o resto do mundo começa **neutro**.

| Nação                          | País real                    | Direcionamento        |
|--------------------------------|-------------------------------|-----------------------|
| Império do Brasil              | Brasil                        | Império               |
| União das Repúblicas Americanas    | América do Norte              | Repúblicas            |
| Império Britânico              | Reino Unido                   | Império               |
| Império da China               | China                         | Império               |
| Império do Japão               | Japão                         | Império               |
| URSS                           | União Soviética               | Comunistas            |
| União das Repúblicas Francesas | França                        | Repúblicas            |
| Reino da Ibéria                | Portugal e Espanha            | Império               |
| Império Germânico              | Alemanha                      | Império               |
| União dos Estados Libertos     | África do Sul                 | Estados independentes |
| Sultanato Mameluco             | Egito                         | Império               |
| Pérsia                         | Irã                           | Império               |
| Macedônia                      | Grécia e Macedônia do Norte   | Repúblicas            |

> O direcionamento de cada nação acima é uma **proposta inicial** — é só um
> campo em `nations.ts` e fácil de ajustar.

### Valores da facção

Toda facção (as 13 nações fixas **e** a nação personalizada) acumula **cinco
valores**, definidos em [`src/game/economy.ts`](src/game/economy.ts) e
persistidos na tabela `factions`:

| Valor               | Descrição                                          |
|---------------------|----------------------------------------------------|
| Dinheiro            | Tesouro nacional.                                  |
| Influência          | Influência política.                               |
| Manpower            | População mobilizável disponível.                  |
| Pontos de pesquisa  | Pontos de pesquisa acumulados.                     |
| Cultura             | Cultura acumulada.                                 |

Toda facção começa a partida com os **mesmos valores iniciais**
(`STARTING_FACTION`): 1.000 de dinheiro, 100 de influência, 0 de manpower, 0 de
pesquisa e 0 de cultura. O **manpower inicial** não é fixo: vem da **capital**,
que nasce como cidade com 1.000.000 de habitantes ⇒ 1% = 10.000 de manpower
(ver seção 12). Os valores da facção do jogador ficam visíveis na **barra
superior** da HUD (ver seção 8).

A cada turno a facção recebe a produção das suas províncias (ver seção 9):
**pesquisa** e **cultura** crescem. O **manpower** cresce quando as **cidades**
ganham população (seção 12). Dinheiro e influência ainda **não têm fonte de
produção** — só a despesa de manutenção do exército toca o dinheiro.

### Bandeiras

Cada facção tem uma **bandeira** própria, gerada no estilo *identicon* do
GitHub ([`src/game/flags.ts`](src/game/flags.ts) +
[`src/components/Flag.vue`](src/components/Flag.vue)): um padrão 5×5 simétrico
derivado de uma semente, desenhado na cor da nação. As nações fixas usam o
código como semente; a nação personalizada usa o nome. A bandeira aparece na
seleção de nação, no painel da província, no ranking e na barra superior.

### Nação personalizada (jogador)

Além das 13 nações fixas, o jogador pode **criar a sua própria nação** ao
iniciar um novo jogo (ver seção 5). Ela entra como uma 14ª facção, com código
reservado `PLR`, e começa também com 1 província-capital — sorteada num ponto
aleatório do continente que o jogador escolher.

---

## 4. Direcionamentos políticos

Há **4 direcionamentos** (definidos em
[`src/game/alignments.ts`](src/game/alignments.ts)):

| Direcionamento         | Descrição                                            |
|------------------------|------------------------------------------------------|
| Repúblicas             | Nações governadas por repúblicas e uniões.           |
| Império                | Monarquias, impérios, reinos e sultanatos.           |
| Comunistas             | Estados socialistas/comunistas.                      |
| Estados independentes  | Estados livres e não alinhados.                      |

### Mecânica de alianças (planejada)

O direcionamento que o **jogador** seguir vai influenciar as **chances de
aliança** com outras facções: é mais fácil se aliar a facções do mesmo
direcionamento. Os detalhes (como o jogador escolhe/muda de direcionamento,
fórmulas de afinidade, efeitos diplomáticos) serão definidos depois.

---

## 5. Menu inicial e partidas salvas

O app abre no **menu inicial** ([`src/components/MainMenu.vue`](src/components/MainMenu.vue)),
não direto no mapa. [`src/App.vue`](src/App.vue) é a **casca**: alterna entre o
menu e a tela de jogo ([`src/components/GameView.vue`](src/components/GameView.vue)).

O menu tem três opções:

- **Iniciar novo jogo** — pede um nome para a partida e como o jogador vai
  comandar (ver abaixo); então gera um mundo novo e entra no jogo.
- **Carregar jogo salvo** — lista as partidas salvas (bandeira e nome da
  nação do jogador, nº de províncias, data da última modificação); permite
  carregar ou apagar cada uma.
- **Configurações** — ver seção 6.

### Escolha da nação do jogador

Ao iniciar um novo jogo, o jogador escolhe entre dois modos:

- **Escolher uma nação** — pega uma das 13 nações fixas (com bandeira, nome e
  direcionamento à mostra).
- **Criar minha nação** — define **nome**, **direcionamento**, **cor** e
  **continente inicial**. A cor sai de uma paleta que já exclui as 13 cores
  usadas pelas nações fixas, então nunca se repete. A capital é sorteada numa
  província aleatória do continente escolhido.

Dentro do jogo, a nação do jogador aparece na barra superior (bandeira +
nome), tem a sua capital destacada no mapa com um anel branco e é marcada com
a etiqueta **VOCÊ** no ranking e no painel da província.

A barra lateral tem o botão **Salvar jogo** (renomeia a partida e confirma o
estado atual como salvo) e o botão **Menu** (volta ao menu inicial). A
partida atual aparece marcada com 📌 na barra superior.

---

## 6. Configurações

Opções do **aplicativo** (valem para qualquer partida), guardadas no
`localStorage` do computador — [`src/settings.ts`](src/settings.ts):

| Configuração                          | Padrão | Efeito                                        |
|---------------------------------------|--------|-----------------------------------------------|
| Iniciar o jogo em tela cheia          | não    | Abre o app já em tela cheia.                  |
| Confirmar antes de voltar ao menu     | sim    | Pede confirmação ao sair do jogo para o menu. |

---

## 7. Persistência (SQLite)

O estado fica num banco SQLite local (`world-war.db`, no diretório de dados do
app). Conexão em [`src/db.ts`](src/db.ts); esquema e leitura/escrita do mapa em
[`src/game/world.ts`](src/game/world.ts); gestão das partidas em
[`src/game/saves.ts`](src/game/saves.ts).

### Tabela `saves`

Uma linha por **partida salva**, incluindo a nação do jogador.

| Coluna             | Tipo    | Descrição                                            |
|--------------------|---------|------------------------------------------------------|
| `id`               | INTEGER | Chave primária.                                      |
| `name`             | TEXT    | Nome da partida.                                     |
| `created_at`       | TEXT    | Data/hora de criação (ISO).                          |
| `updated_at`       | TEXT    | Data/hora da última gravação (ISO).                  |
| `turn`             | INTEGER | Turno atual da partida (começa em 1).                |
| `player_code`      | TEXT    | Código da nação do jogador (`PLR` se personalizada). |
| `custom_name`      | TEXT    | Nome da nação personalizada (`NULL` se nação fixa).  |
| `custom_color`     | TEXT    | Cor da nação personalizada.                          |
| `custom_alignment` | TEXT    | Direcionamento da nação personalizada.               |
| `custom_continent` | TEXT    | Continente inicial da nação personalizada.           |

### Tabela `provinces`

Cada província pertence a uma partida (`save_id`).

| Coluna       | Tipo    | Descrição                                  |
|--------------|---------|--------------------------------------------|
| `id`         | INTEGER | Chave primária.                            |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.       |
| `x`, `y`     | INTEGER | Coordenada da célula na grade.             |
| `continent`  | TEXT    | Código do continente (N/S/E/A/I/O).        |
| `name`       | TEXT    | Nome da província.                         |
| `resource`   | TEXT    | Recurso (`ResourceType`).                  |
| `owner_code` | TEXT    | Código da nação dona, ou `NULL` se neutra. |
| `is_capital` | INTEGER | 1 se é a capital de uma nação.             |
| `manpower_prod` | INTEGER | Manpower produzido por turno.           |
| `resource_prod` | INTEGER | Recurso local produzido por turno.      |
| `production`    | INTEGER | Produção industrial por turno.          |
| `research_prod` | INTEGER | Pontos de pesquisa produzidos por turno.|
| `culture_prod`  | INTEGER | Cultura produzida por turno.            |
| `climate`       | TEXT    | Zona de clima (`ClimateZone`).          |
| `seismic`       | INTEGER | 1 se a província fica numa zona sísmica.|
| `volcano`       | INTEGER | 1 se há um vulcão na província.         |
| `defender_hp`   | INTEGER | Vida somada das tropas que defendem o território neutro. |
| `conquered`     | INTEGER | 1 se o território foi tomado de outra facção. |
| `sector`        | TEXT    | Setor em que o tile foi especializado, ou nulo (seção 13). |
| `road`          | TEXT    | Via no tile: `ROAD`, `RAIL` ou nulo (seção 14). |

### Tabela `factions`

Uma linha por **facção em cada partida** (as 13 nações fixas e, se houver, a
personalizada).

| Coluna            | Tipo    | Descrição                              |
|-------------------|---------|----------------------------------------|
| `id`              | INTEGER | Chave primária.                        |
| `save_id`         | INTEGER | Partida (`saves.id`) a que pertence.   |
| `code`            | TEXT    | Código da nação (`PLR` se personalizada). |
| `money`           | INTEGER | Dinheiro.                              |
| `influence`       | INTEGER | Influência.                            |
| `manpower`        | INTEGER | Manpower.                              |
| `research_points` | INTEGER | Pontos de pesquisa.                    |
| `culture`         | INTEGER | Cultura.                               |
| `tax_level`       | TEXT    | Nível de imposto cobrado (seção 13).   |

### Tabela `squads`

Uma linha por **esquadrão** no mapa de uma partida (ver seção 11).

| Coluna             | Tipo    | Descrição                                       |
|--------------------|---------|-------------------------------------------------|
| `id`               | INTEGER | Chave primária.                                 |
| `save_id`          | INTEGER | Partida (`saves.id`) a que pertence.            |
| `owner_code`       | TEXT    | Código da facção dona.                          |
| `x`, `y`           | INTEGER | Posição (célula) do esquadrão no mapa.          |
| `created_turn`     | INTEGER | Turno em que foi montado (pronto no seguinte).  |
| `last_moved_turn`  | INTEGER | Último turno em que se moveu.                   |
| `name`             | TEXT    | Nome dado pelo jogador (`NULL` = "Esquadrão #id"). |
| `cmd_stars`        | INTEGER | Estrelas do comandante — o talento inato (1–5). |
| `cmd_force`        | INTEGER | Força contribuída pelo comandante.              |
| `cmd_hp`           | INTEGER | Pontos de vida atuais do comandante.            |
| `cmd_max_hp`       | INTEGER | Pontos de vida máximos do comandante.           |
| `cmd_defense`      | INTEGER | Defesa do comandante.                           |
| `cmd_xp`           | INTEGER | Experiência de batalha do comandante (define o level). |
| `cmd_tradition`    | INTEGER | Tradição militar do comandante.                 |
| `attacks_used`     | INTEGER | Ataques já gastos no turno atual (zera a cada turno). |
| `moral`            | INTEGER | Moral do esquadrão (0–100).                     |
| `moves_used`       | INTEGER | Movimentos já gastos no turno (zera a cada turno). |
| `move_allowance`   | INTEGER | Movimentos do turno — sobe ao andar por via (seção 14). |

### Tabela `squad_troops`

Uma linha por **tropa** dentro de um esquadrão (ver seção 11).

| Coluna     | Tipo    | Descrição                                       |
|------------|---------|-------------------------------------------------|
| `id`       | INTEGER | Chave primária.                                 |
| `squad_id` | INTEGER | Esquadrão (`squads.id`) a que pertence.         |
| `kind`     | TEXT    | Tipo da tropa (`INFANTARIA`).                   |
| `force`    | INTEGER | Força que a tropa soma ao esquadrão.            |
| `hp`       | INTEGER | Pontos de vida atuais.                          |
| `max_hp`   | INTEGER | Pontos de vida máximos.                         |
| `xp`       | INTEGER | Experiência de batalha da tropa (define o level). |

### Tabela `recruit_orders`

Uma linha por **tropa na fila de produção** de uma cidade (ver seção 11).

| Coluna       | Tipo    | Descrição                                       |
|--------------|---------|-------------------------------------------------|
| `id`         | INTEGER | Chave primária (também a ordem na fila).        |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.            |
| `x`, `y`     | INTEGER | Tile da cidade que produz a tropa.              |
| `owner_code` | TEXT    | Facção dona.                                    |
| `squad_id`   | INTEGER | Coluna legada (a tropa pronta vai para o inventário da cidade). |
| `kind`       | TEXT    | O que está sendo produzido (`INFANTARIA` ou `COLONO`). |
| `prod_cost`  | INTEGER | Produção necessária para concluir o item.       |
| `prod_done`  | INTEGER | Produção já acumulada.                          |

### Tabela `battle_logs`

Uma linha por **batalha** travada na partida — guarda só as **200 mais
recentes** (ver seção 11).

| Coluna    | Tipo    | Descrição                                          |
|-----------|---------|----------------------------------------------------|
| `id`      | INTEGER | Chave primária.                                    |
| `save_id` | INTEGER | Partida (`saves.id`) a que pertence.               |
| `turn`    | INTEGER | Turno em que a batalha ocorreu.                    |
| `data`    | TEXT    | Relatório completo da batalha, em JSON.            |

### Tabela `city_troops`

Uma linha por **tropa no inventário de uma cidade** — recrutada, mas ainda
fora de um esquadrão (ver seção 11).

| Coluna       | Tipo    | Descrição                                       |
|--------------|---------|-------------------------------------------------|
| `id`         | INTEGER | Chave primária.                                 |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.            |
| `x`, `y`     | INTEGER | Tile da cidade onde a tropa está guardada.      |
| `owner_code` | TEXT    | Facção dona.                                    |
| `kind`       | TEXT    | Tipo da tropa.                                  |
| `hp`         | INTEGER | Pontos de vida atuais.                          |
| `max_hp`     | INTEGER | Pontos de vida máximos.                         |
| `xp`         | INTEGER | Experiência de batalha da tropa.                |

### Tabela `cities`

Uma linha por **cidade** de uma partida (ver seção 12).

| Coluna         | Tipo    | Descrição                                     |
|----------------|---------|-----------------------------------------------|
| `id`           | INTEGER | Chave primária.                               |
| `save_id`      | INTEGER | Partida (`saves.id`) a que pertence.          |
| `x`, `y`       | INTEGER | Tile da cidade.                               |
| `owner_code`   | TEXT    | Facção dona.                                  |
| `is_capital`   | INTEGER | 1 se a cidade é a capital de uma nação.       |
| `population`   | INTEGER | População atual da cidade.                    |
| `food`         | INTEGER | Estoque de comida da cidade.                  |
| `manpower_cap` | INTEGER | Manpower que a cidade já concedeu (catraca).  |
| `founded_turn` | INTEGER | Turno em que a cidade foi fundada (1 = capital). |

### Tabela `settler_squads`

Uma linha por **esquadrão de colonos** no mapa (ver seção 12).

| Coluna            | Tipo    | Descrição                                  |
|-------------------|---------|--------------------------------------------|
| `id`              | INTEGER | Chave primária.                            |
| `save_id`         | INTEGER | Partida (`saves.id`) a que pertence.       |
| `owner_code`      | TEXT    | Facção dona.                               |
| `x`, `y`          | INTEGER | Posição (célula) do esquadrão no mapa.     |
| `count`           | INTEGER | Quantidade de colonos no esquadrão.        |
| `created_turn`    | INTEGER | Turno em que foi criado (pronto no seguinte). |
| `last_moved_turn` | INTEGER | Último turno em que se moveu.              |

### Tabela `constructions`

Uma linha por **construção erguida** num tile (ver seção 13).

| Coluna       | Tipo    | Descrição                                       |
|--------------|---------|-------------------------------------------------|
| `id`         | INTEGER | Chave primária.                                 |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.            |
| `x`, `y`     | INTEGER | Tile onde a construção foi erguida.             |
| `city_x`, `city_y` | INTEGER | Cidade que recebe a produção da construção. |
| `owner_code` | TEXT    | Facção dona.                                    |
| `kind`       | TEXT    | Tipo (`FAZENDA`, `CELEIRO`, `PASTO`, `MINA`, `FABRICA`). |
| `variant`    | TEXT    | Rebanho do pasto (`GADO`/`OVELHA`/`PORCO`), ou nulo. |

### Tabela `construction_orders`

Uma linha por **construção na fila** de uma cidade (ver seção 13).

| Coluna              | Tipo    | Descrição                                  |
|---------------------|---------|--------------------------------------------|
| `id`                | INTEGER | Chave primária (também a ordem na fila).   |
| `save_id`           | INTEGER | Partida (`saves.id`) a que pertence.       |
| `city_x`, `city_y`  | INTEGER | Cidade dona da fila.                       |
| `target_x`, `target_y` | INTEGER | Tile onde a construção será erguida.    |
| `owner_code`        | TEXT    | Facção dona.                               |
| `kind`              | TEXT    | Tipo da construção.                        |
| `variant`           | TEXT    | Rebanho do pasto, ou nulo.                 |
| `prod_cost`         | INTEGER | Produção necessária para concluir.         |
| `prod_done`         | INTEGER | Produção já acumulada.                     |
| `money_cost`        | INTEGER | Dinheiro pago (devolvido se cancelada).    |

### Tabela `city_resources`

Uma linha por **recurso no inventário de uma cidade** (ver seção 13).

| Coluna     | Tipo    | Descrição                                         |
|------------|---------|---------------------------------------------------|
| `id`       | INTEGER | Chave primária.                                   |
| `save_id`  | INTEGER | Partida (`saves.id`) a que pertence.              |
| `x`, `y`   | INTEGER | Tile da cidade dona do inventário.                |
| `resource` | TEXT    | Recurso (`ResourceType`) ou produto (`COURO`/`LA`). |
| `amount`   | INTEGER | Quantidade acumulada.                             |

### Tabela `road_orders`

Uma linha por **estrada/ferrovia na fila** de uma cidade (ver seção 14).

| Coluna       | Tipo    | Descrição                                       |
|--------------|---------|-------------------------------------------------|
| `id`         | INTEGER | Chave primária.                                 |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.            |
| `city_x`, `city_y` | INTEGER | Tile da cidade que enfileirou a via.      |
| `owner_code` | TEXT    | Código da facção dona.                          |
| `kind`       | TEXT    | `ROAD` ou `RAIL`.                               |
| `target_x`, `target_y` | INTEGER | Tile da cidade de destino da ligação. |
| `path`       | TEXT    | JSON dos tiles que receberão a via.             |
| `prod_cost`  | INTEGER | Produção total necessária.                      |
| `prod_done`  | INTEGER | Produção já investida.                          |
| `money_cost` | INTEGER | Dinheiro cobrado ao enfileirar (devolvido se cancelar). |

Criar um novo jogo gera o mapa, grava as províncias, cria as facções e semeia
uma **cidade em cada capital**; carregar uma partida lê tudo do seu `save_id`.
"Novo mapa" apaga e regenera só o mapa da partida atual (as facções são
mantidas). Bancos de versões antigas (sem `save_id`) são migrados para uma
partida "Partida recuperada"; saves anteriores à tabela `factions` ou às
colunas de produção recebem os valores iniciais ao serem carregados. Saves
anteriores ao sistema de cidades ganham cidades nas suas capitais ao serem
carregados (sem o bônus de manpower — essas facções já o têm).

---

## 8. Interface (HUD)

A interface segue o estilo dos jogos de grande estratégia (Europa Universalis,
Hearts of Iron): o **mapa ocupa a tela inteira** como fundo e a HUD são
**painéis sobrepostos** que **abrem por botão** — por padrão ficam fechados,
deixando o mapa livre.

- **Janela** — abre **maximizada**; o botão **Tela cheia** da barra lateral
  alterna a **tela cheia** de verdade.
- **Barra superior** (sempre visível) — à esquerda, a **bandeira e o nome** da
  nação do jogador seguidos dos seus **valores** (dinheiro, influência,
  manpower, pesquisa e cultura — ver seção 3); depois a alternância de visão do
  mapa (**Político** / **Recursos** / **Clima**); à direita, a província sob o
  cursor e o nome da partida. Não traz o nome do jogo (já aparece no menu
  inicial).
- **Barra lateral** (canto superior esquerdo) — uma lista vertical de botões
  arredondados, **só com ícones**, para as ações do jogo: **Nações** (🏴),
  **Direcionamentos** (🎖️), **Economia** (💰) e **Exército** (🪖), que abrem os
  seus painéis, e **Novo mapa** (↻), **Salvar jogo** (💾), **Menu** (⏏) e
  **Tela cheia** (⛶). O texto de cada ação aparece como dica ao passar o mouse.
- **Painel da província** — aparece ao **clicar numa província**; mostra dono,
  direcionamento, recurso, **clima** (zona, hemisfério, estação, avisos de
  zona sísmica/vulcão) e a **produção por turno**. Lista os **esquadrões** e os
  **esquadrões de colonos** do tile; se o tile for uma **cidade** sua, traz as
  ações da cidade (Montar esquadrão, Ver cidade); e, se for um tile da zona de
  influência de uma cidade, traz a escolha de **setor** e as **construções**
  (seção 13). Fecha no `✕` ou ao clicar no oceano.
- **Painel lateral** (direita) — aberto pelos botões **Nações** (ranking de
  territórios), **Direcionamentos** (os 4 blocos políticos) ou **Economia**
  (imposto, felicidade e renda por turno). Só um painel fica aberto por vez; o
  botão acende quando ativo.
- **Painel da cidade** (direita) — aberto pelo botão **Ver cidade** do painel
  da província; só abre em **tiles de cidade**. O nome no topo é **editável**
  (renomeia a cidade). Tem três abas (estilo *Civilization*): **Cidade**
  (população, comida, manpower, influência, produção, cultura, pesquisa,
  felicidade, o **Armazém da cidade** — estoque de recursos — e os **Recursos
  da cidade** — o que ela coleta por turno), **Produção** (filas de
  tropas/colonos e de construção) e **Inventário** (tropas guardadas) — ver
  seção 12.
- **Caixa de turno** (canto inferior direito, sempre visível) — mostra o
  **turno atual**, a **data** e a **estação** de cada hemisfério (ver seção
  10), e traz o botão grande **Próximo turno** que avança o tempo (ver seção
  9).

- **Navegação do mapa** — a roda do mouse dá **zoom** (centrado no cursor) e
  **arrastar** move o mapa. Não há botões de zoom: a navegação é toda pelo
  mouse, deixando o rodapé livre.
- **Borda de oceano** — o mundo é renderizado com uma **margem de água** em
  volta dos continentes (`MAP_PAD` em [`GameView.vue`](src/components/GameView.vue)).
  Essa folga empurra a terra para longe dos cantos da tela — então a barra
  superior e a barra lateral ficam **sobre o mar** — e dá espaço para arrastar
  o mapa e tirar qualquer província de trás de um painel.

Regra de ouro: nenhum painel fica na frente do mapa sem o jogador ter pedido.

## 9. Turnos

O jogo avança por **turnos**, geridos em
[`src/game/turns.ts`](src/game/turns.ts) (calendário) e
[`src/game/world.ts`](src/game/world.ts) (`advanceTurn`).

- A partida começa no **turno 1**, em **01 de Janeiro de 1980**.
- Cada turno equivale a **1 semana** — a data avança 7 dias por turno.
- O botão grande **Próximo turno** (caixa de turno, canto inferior direito)
  avança um turno.

### O que acontece a cada turno

Cada **cidade** processa o seu **ciclo de turno** — comida, crescimento da
população, manpower, e rende **cultura**, **pesquisa**, **dinheiro** e
**recursos** à facção (ver seções 12 e 13). Províncias sem cidade não rendem
nada. O **manpower** vem do crescimento (1% da população nova).

Cada facção também **paga a manutenção** do seu exército em **dinheiro** (ver
seção 11): 25 por esquadrão + 10 por tropa, e ainda as tropas do inventário —
mas tudo que está **num tile da própria facção custa metade**. O dinheiro
nunca fica negativo: se o caixa não cobre a manutenção, ele só chega a 0.

Cada cidade tem **duas filas** que avançam em paralelo, cada uma pela
**produção efetiva** da cidade (produção da província + zonas de fábrica):

- a **fila de produção** — tropas e colonos (seções 11 e 12);
- a **fila de construção** — as construções da seção 13.

Cada facção também recebe **dinheiro** das suas cidades: o imposto da
população e as zonas de fábrica (ver seção 13). A renda é somada ao caixa, e
em seguida a manutenção é descontada.

Por fim, cada esquadrão parado em **território da própria facção** recupera
**5 de vida** (comandante e cada tropa), e **todos os esquadrões recuperam os
seus 2 ataques** do turno (ver seção 11).

A **influência** ainda **não muda** por turno.

O turno fica gravado na coluna `turn` da tabela `saves` e os valores das
facções na tabela `factions`; avançar o turno também marca a partida como
modificada (`updated_at`).

---

## 10. Clima e geografia

Cada província carrega dados de **clima e geografia**, definidos em
[`src/game/climate.ts`](src/game/climate.ts) e sorteados na geração do mapa.
Por enquanto é só o **mapa de dados** — os eventos e os buffs/debuffs que vão
usá-lo ainda serão implementados.

### Hemisférios e estações

A linha do **equador** divide o mundo: províncias acima dela ficam no
**hemisfério Norte**, abaixo no **hemisfério Sul** (`EQUATOR_ROW` em
[`map-generator.ts`](src/game/map-generator.ts)).

As **estações do ano** seguem o calendário dos turnos (seção 9) e são
**opostas entre os hemisférios** — quando é verão no Norte, é inverno no Sul.
As quatro estações (Primavera, Verão, Outono, Inverno) aparecem na caixa de
turno para os dois hemisférios.

### Zonas de clima

Cada província tem uma das **4 zonas de clima**, definida pela latitude (do
equador rumo aos polos):

| Zona       | Onde aparece                                  |
|------------|-----------------------------------------------|
| Tropical   | Perto do equador.                             |
| Desértico  | Faixas subtropicais.                          |
| Ameno      | Latitudes médias (clima temperado).           |
| Gelado     | Regiões polares.                              |

Uma leve variação aleatória evita faixas perfeitamente retas. O modo de visão
**Clima** pinta o mapa por zona.

### Bônus de clima nos recursos

O clima multiplica a **produção do recurso local** de uma província
(`resourceBoost` em [`src/game/resources.ts`](src/game/resources.ts)):

| Recurso          | Tropical | Ameno | Desértico | Gelado |
|------------------|----------|-------|-----------|--------|
| Terras Agrícolas | 1,5×     | 2×    | 0,5×      | 0,75×  |
| Madeira          | 2×       | 1×    | 0,5×      | 0,75×  |
| Petróleo         | 1×       | 1×    | 1,75×     | 1,5×   |

O **Nióbio** é um caso à parte: rende **2×** quando está na **América do Sul**
(continente `S`), independentemente do clima.

Recursos/combinações sem entrada usam **1×** (sem bônus nem penalidade). O
multiplicador já entra na produção sorteada na geração do mapa e aparece como
uma etiqueta no painel da província.

### Placas tectônicas

- **Zonas sísmicas** — formam um "anel de fogo" em volta do Pacífico: a costa
  oeste das Américas, a costa leste da Ásia e toda a Oceania.
- **Vulcões** — espalhados por algumas das províncias sísmicas (~12%).

No modo **Clima**, as zonas sísmicas aparecem com um contorno laranja e os
vulcões com o ícone 🌋; o painel da província mostra os dois como avisos.

> **Planejado:** usar esse mapa de placas e clima como base para um sistema de
> **eventos** (terremotos, erupções, secas, ondas de frio) e de **buffs e
> debuffs** sazonais.

---

## 11. Esquadrões, recrutamento e batalha

O sistema militar do jogo: os esquadrões e o recrutamento estão em
[`src/game/squads.ts`](src/game/squads.ts), a resolução de combate em
[`src/game/battle.ts`](src/game/battle.ts) e os defensores dos territórios são
sorteados em [`src/game/map-generator.ts`](src/game/map-generator.ts).

> **Planejado:** bônus de defesa do tile e buffs/debuffs de **construções**
> (todos os tiles poderão ter construções no futuro); tomar territórios de
> **outras facções** (hoje só territórios neutros são tomados); contra-ataque
> do defensor; e a progressão de **XP → estrelas** do comandante.

### Defensores do território

Todo **território neutro** é defendido por **tropas de infantaria** — de 2 a
12, sorteadas na geração do mapa. Para não materializar centenas de tropas, a
defesa de um território é um **único número**: a sua **vida somada**
(`defenderHp`), com cada tropa valendo 50 de vida — `defenderHp / 50`
(arredondado para cima) é o número de tropas vivas. Territórios já possuídos
(as capitais iniciais) não têm defensores.

Para tomar um território é preciso atacá-lo até derrubar essa vida a **0**
(ver *Batalha*). Com os defensores eliminados, o jogador escolhe:

- **Ocupar** — o território passa a ser seu, com a produção intacta.
- **Devastar** — o território é seu, mas toda a sua **produção por turno**
  (manpower, recurso, produção, pesquisa e cultura) é **zerada**.

Um **território neutro** tomado torna-se seu. Tomar territórios de **outras
facções** funciona de forma diferente e ainda não está implementado — a flag
`conquered` está reservada para marcá-los.

### Esquadrões

O exército é organizado em **esquadrões** (estilo *Rome: Total War*). Um
esquadrão fica posicionado num tile do mapa, com um **ícone próprio** (⚔️ na
cor da nação dona — vários esquadrões no mesmo tile mostram um contador).

**Montar um esquadrão** — ao clicar numa **cidade sua**, o painel do território
traz o botão **Montar esquadrão**. Custa **500 de dinheiro** e **1.000 de
manpower** (o comandante). O esquadrão **fica pronto só no turno seguinte**
("Em preparação" até lá).

**O comandante** — todo esquadrão nasce com um comandante:

| Atributo  | Inicial | Observação                                              |
|-----------|---------|---------------------------------------------------------|
| Estrelas  | 1       | O **talento** inato (1–5): +5% de força por estrela e o limite de tropas. Não muda com a experiência. |
| Level     | 0       | A **experiência** de batalha (0–5) — ver *Experiência e level*. |
| Tradição  | 0       | **Tradição militar** — somada à soma dos dados na batalha. *Como subir: planejado.* |
| Força     | 30      | Contribui para a força do esquadrão (cada tropa soma ~⅓ disso). |
| Vida      | 100     | Pontos de vida.                                         |
| Defesa    | 1       | Defesa do comandante.                                   |

O comandante é o **último a morrer** do esquadrão — só morre quando nenhuma
outra tropa tiver vida. Se o **comandante morre, o esquadrão inteiro morre**.

**Talento × experiência** — as **estrelas** são o talento com que o comandante
nasce (um general pode lutar dezenas de batalhas e ainda assim não ser
Alexandre, o Grande); o **level** é a experiência ganha lutando. São coisas
separadas.

**Tropas e limite** — além do comandante, o esquadrão tem **tropas** (ver
*Recrutamento*), que somam força e têm vida e level próprios. Um comandante de
**1★ comporta 20 tropas** e **cada estrela a mais soma +2** (5★ = 28); o
comandante não conta nesse limite.

A **força do esquadrão** é a soma da força do comandante com a das suas tropas,
multiplicada pelo bônus de **talento** (estrelas) e pelo de **experiência**
(level médio — ver *Experiência e level*).

**Nome** — o jogador pode **renomear** cada esquadrão no painel do exército;
sem nome, ele aparece como "Esquadrão #id".

**Mover** — o painel do tile lista os esquadrões; em cada esquadrão seu há o
botão **Mover**. Ao clicar nele, os tiles vizinhos válidos ficam destacados e
o próximo clique leva o esquadrão para lá. Um esquadrão **move-se 1 tile por
turno** — mas **sair de um tile gelado leva 2 turnos**. Cada movimento custa
**2% de moral**. Não se pode **entrar em território de outra facção** nem em
tiles ocupados por **esquadrões de outras facções** — só território seu ou
neutro (até existir um sistema de diplomacia).

**Moral** — todo esquadrão tem uma **moral** (0–100%, começa em 100%). Ela
afeta a força em batalha: 50% é neutro, e a cada 10% acima/abaixo de 50% são
±3% de força. A moral muda assim:

- **−5%** a cada batalha; **−15%** a mais se o esquadrão perder uma tropa;
  **+15%** se destruir todo o exército inimigo;
- **−2%** a cada movimento;
- **+5%** por turno parado (sem lutar nem mover) — o **dobro** num tile da
  própria facção.

**Dissolver** — o mesmo painel traz o botão **Excluir** para dissolver um
esquadrão seu. **Não há reembolso**: esquadrão perdido — dissolvido ou
destruído em batalha — é perdido de vez, como na vida real.

**Manutenção** — descontada de cada facção no avanço de turno (seção 9):
**25 de dinheiro** por esquadrão (o comandante) **+ 10 por tropa**. Quem está
**num tile da própria facção custa metade** — tropas em repouso saem mais
barato que tropas em campanha. As tropas guardadas no **inventário** de uma
cidade também pagam manutenção, e sempre pela metade (**5** cada).

> *Provisório:* hoje a metade ainda vale para **qualquer tile da facção** —
> quando o sistema de cidades amadurecer, o desconto tende a valer só nas
> cidades e na sua zona de influência (ver seção 12).

**Lista no tile** — o painel da província **sempre mostra a lista de
esquadrões** daquele tile. Cada linha traz a força, as tropas, a vida e a
defesa, a moral, os ataques restantes e o estado (Pronto / Em preparação).

**Painel do exército** — o botão 🪖 da barra lateral abre um modal com **todos
os esquadrões** da facção e as suas tropas. Ali dá para **excluir** uma tropa e
**transferir tropas** entre esquadrões que estejam no **mesmo tile**. O modal
ainda tem a aba **Batalhas**, com o histórico de combates (ver *Batalha*).

**Atacar** — cada esquadrão tem **2 ataques por turno** (recuperados no avanço
de turno). Quando um esquadrão entra num tile que **não é da sua facção**, o
painel do território abre o **Combate** — atacar a **região** (defensores de um
tile neutro) ou um **esquadrão inimigo** do mesmo tile. Ver *Batalha*.

### Recrutamento de tropas

As tropas nascem pelo **recrutamento**. A aba **Produção** do painel da cidade
(ver seção 12) lista o que a cidade pode construir — hoje **infantaria** e
**colonos**. Sobre a infantaria:

| Tropa      | Força | Vida | Dinheiro | Manpower | Produção | Manutenção |
|------------|-------|------|----------|----------|----------|------------|
| Infantaria | +10   | 50   | 200      | 500      | 50       | 10 / turno |

A **vida** de uma tropa é **50% da vida do comandante** (comandante = 100 →
infantaria = 50).

O **dinheiro** e o **manpower** são cobrados **na hora** de enfileirar. A
**produção** é o tempo de construção: a cada turno a cidade gasta a sua
**produção por turno** (seção 2) na **primeira** tropa da sua **fila** — quando
a produção acumulada alcança o custo, a tropa fica pronta e entra no
**inventário da cidade**. Ex.: uma cidade que produz 38/turno leva
`ceil(50 / 38) = 2` turnos.

**Fila de produção** — dá para **enfileirar** várias tropas (basta ter
dinheiro e manpower); a cada turno só a **primeira** da fila avança. Uma ordem
pode ser **cancelada** (devolve o dinheiro e o manpower).

### Inventário da cidade

A tropa pronta **não** vai direto para um esquadrão — fica guardada no
**inventário da cidade**. Assim dá para **treinar tropas em várias cidades** e
só depois juntá-las a um esquadrão.

O botão **Ver cidade** (no painel da província) abre um **painel da cidade** à
direita, com abas no topo (estilo *Civilization*) — **Cidade**, **Produção** e
**Inventário** (ver seção 12). A aba **Inventário** mostra as **tropas**
guardadas na cidade.

Cada tropa do inventário tem um botão **Add ao esquadrão** e uma **caixa de
seleção** para mover várias de uma vez. Ao enviar tropas a um esquadrão:

- com **1 esquadrão** estacionado na cidade, elas vão direto para ele;
- com **vários**, abre o diálogo **Qual esquadrão?**;
- sem **nenhum**, a ação fica desabilitada.

O esquadrão de destino precisa ter espaço (limite de tropas pelas estrelas).

> **Planejado:** as tropas do inventário também **defenderão a cidade** quando
> ela for atacada (hoje o inventário é só armazenamento — quem defende um tile
> são os esquadrões estacionados nele); outras tropas além da infantaria; e as
> **construções** nos tiles da zona de influência da cidade (ver seção 12).

### Batalha

Quando um esquadrão entra num tile que **não é da sua facção**, o painel abre o
**Combate**: escolhe-se o **esquadrão atacante** e o alvo — a **região** (os
defensores de um tile neutro) ou um **esquadrão inimigo** do mesmo tile. Cada
ataque gasta 1 dos 2 ataques do esquadrão e resolve **uma batalha**.

> Hoje, na prática, só há batalha contra **territórios neutros**: a regra de
> movimento impede entrar em tiles de outras facções ou ocupados por
> esquadrões delas, então o combate **esquadrão × esquadrão** só será
> alcançável com o sistema de diplomacia/guerra. O código já o resolve.

A batalha é **bidirecional**: atacante e defensor trocam dano de uma só vez —
quem ataca também é ferido.

**Força efetiva** — a força-base de cada lado (comandante + tropas, já com os
bônus de **talento** e **experiência**; para um território neutro, nº de tropas
× 10) é ajustada por fatores que se **somam**:

- **Ambiente** — vale para os **dois lados**, cada um com a sua capital: +5%
  perto da própria capital; terreno gelado −20%, desértico/tropical −10%;
  inverno em terreno gelado −30%; verão em terreno desértico −20%.
- **Dados** — 2 dados por lado (estilo EU4). A **tradição militar** do
  comandante é somada à soma dos seus dados. Compara-se a soma: quem somar mais
  leva **+10% por ponto de diferença**; no **empate**, o defensor leva +10% de
  vantagem.
- **Moral** — 50% é neutro; ±3% de força a cada 10% de moral. (Os defensores de
  um território neutro não têm moral.)

```
força efetiva = força-base × (1 + ambiente + dados + moral)
```

**Dano** — cada lado tira vida do outro:

```
dano = força efetiva do atacante − defesa do alvo   (e vice-versa)
```

A defesa é a do comandante (1) — territórios neutros têm defesa 0. O dano cai
primeiro nas **tropas** (que somem quando a vida chega a 0) e por último no
**comandante**; se ele morre, o esquadrão é destruído. Num território, o dano
baixa a vida dos defensores — zerá-la o libera para ser tomado.

**Os dados** são lançados na hora: o modal de batalha mostra os 2 dados de cada
lado girando e revela o resultado — força base e efetiva, todos os
modificadores, o **dano dado e sofrido** pelos dois lados, a vida antes/depois
e as tropas perdidas.

**Histórico** — toda batalha é registrada e pode ser revista na aba
**Batalhas** do painel do exército, com os dados, os modificadores, o dano e as
baixas de cada lado — para ajudar o jogador a estudar o campo de batalha. O
histórico guarda as **200 batalhas mais recentes**.

**Recuperação de vida** — um esquadrão parado num **território da própria
facção** recupera **5 de vida** por turno (comandante e tropas, até o máximo).
Fora do seu território, não há recuperação.

### Experiência e level

O **comandante** e **cada tropa** acumulam **experiência (XP)** própria e
sobem de **level** (0 a 5) — XP e level são separados entre comandante e
tropas, de modo que uma tropa recém-recrutada começa do zero mesmo num
esquadrão veterano.

**XP por batalha** — o comandante e as tropas sobreviventes ganham:

```
xp = 5 + dificuldade + bônus de território
dificuldade  = (dano dado − dano sofrido) / 100, arredondado p/ baixo, de 0 a 4
bônus        = +10 se a batalha derrotou todos os defensores do território
```

Numa batalha **esquadrão × esquadrão**, **os dois lados** ganham XP (cada um
com a sua dificuldade). Numa batalha **esquadrão × território neutro**, só o
esquadrão atacante ganha — e o bônus de território só vale para ele.

O ganho ainda passa por um **multiplicador de XP** (hoje 1) — o gancho para
futuras **pesquisas** que turbinem o ganho de experiência.

**Curva de level** — uma progressão geométrica de XP por level:

| Level | XP para o próximo |
|-------|-------------------|
| 0 → 1 | 20                |
| 1 → 2 | 45                |
| 2 → 3 | 100               |
| 3 → 4 | 224               |
| 4 → 5 | 500               |

**Efeito do level** — cada level médio do esquadrão adiciona **+10% de força**.
O level médio é a média dos levels de todos, mas o **comandante pesa como 3
tropas**: um comandante experiente puxa tropas fracas para cima, e um
inexperiente arrasta tropas fortes para baixo — como na vida real, em que bons
generais salvam tropas fracas e maus generais desperdiçam tropas veteranas. Um
esquadrão todo no level 5 é uma força de elite.

---

## 12. Cidades e colonos

O sistema de cidades (estilo *Civilization*) está em
[`src/game/cities.ts`](src/game/cities.ts). Uma **cidade** é um **tile
especial**: cada nação começa com uma — a sua **capital** —, e novas cidades
são **fundadas** por **colonos**.

> **Implementado:** fundar cidades, população, comida, zona de influência e o
> ciclo de turno (comida, crescimento, manpower). **Planejado:** as
> **construções** (fazendas e outros edifícios nos tiles de influência).

### A cidade

Cada cidade tem **população** e um estoque de **comida**:

- **Capitais** nascem com **1.000.000** de habitantes e **10** de comida, e
  **produzem 10 de comida por turno** (mínimo).
- **Cidades fundadas** nascem com **100 mil** de habitantes e **10** de comida
  por colono do esquadrão; só produzem comida com **fazendas e pastos**
  (seção 13).
- **Estoque de comida** — limite-base de **200** numa capital, **100** numa
  cidade; cada **celeiro** soma +20% (seção 13).
- **Teto de população** — **2.500.000** numa cidade, **5.000.000** numa
  capital; conjuntos habitacionais e áreas urbanas o aumentam (seção 13). A
  população não cresce além do teto.

### Comida e população (por turno)

- **Consumo:** 1 de comida por turno a cada **100 mil** de habitantes (1 milhão
  ⇒ 10 de comida).
- A comida produzida (base da capital + fazendas + pastos) entra no estoque; o
  consumo é pago do estoque.
- **Crescimento:** se a produção supera o consumo, a população cresce **1% por
  ponto de comida em excedente** (produz 15, consome 10 ⇒ +5%/turno), até o
  teto de população. A **felicidade** da cidade amplia ou reduz esse
  crescimento (ver seção 13).
- **Fome:** se o estoque acaba e a comida não cobre o consumo, a cidade perde
  **3% da população por turno** até a produção bastar — a **felicidade** alta
  freia essa perda, a baixa a acelera (seção 13).
- **Penalidade de conexão:** uma cidade comum **sem caminho de tiles possuídos**
  até outra cidade da facção paga **+30%** de comida no consumo. As capitais
  nunca pagam essa penalidade.

### Manpower (modelo Hearts of Iron)

O manpower da facção vem **só das cidades**: cada cidade fornece **1% da sua
população**. É uma **catraca** — quando a população cresce, o 1% novo é somado
ao manpower da facção; quando a população encolhe, o manpower já concedido
**não é perdido**, mas também **não volta a crescer** até a população
ultrapassar o pico anterior. Gastar manpower (recrutar tropas/esquadrões) não
o devolve: para repor, a população precisa **crescer**.

### Zona de influência

Toda cidade tem uma **zona de influência** ao seu redor: raio de **1 tile**
para uma cidade comum e **2 tiles** para uma capital. É a área onde a facção
poderá erguer **construções** que alimentam a cidade (planejado, estilo
*Civilization*). Há uma **distância mínima de 2 tiles** entre cidades.

### Colonos e esquadrão de colonos

Para fundar uma cidade a facção precisa de um **colono**:

- O colono é construído na **fila de produção** de uma cidade (aba **Produção**
  do painel da cidade). Custa **100 mil de população + 10 de comida** daquela
  cidade (cobrados ao enfileirar) e **200 de produção** (construído ao longo de
  vários turnos). Cancelar a ordem devolve a população e a comida.
- A cidade precisa **manter um piso de população** depois de pagar o colono:
  **100 mil** numa cidade comum, **500 mil** numa capital — ou seja, é preciso
  ter ≥ 200 mil (capital ≥ 600 mil) para produzir um colono. (A fome ainda pode
  levar a população abaixo desse piso; ele só limita a criação de colonos.)
- A fila é **única por cidade** — produzir tropas adia o colono e vice-versa.
- Quando pronto, o colono vai para um **esquadrão de colonos** no tile da
  cidade. Vários colonos podem ficar **no mesmo esquadrão**.

O **esquadrão de colonos** é uma unidade própria — **sem comandante e sem
combate**. Move-se pelo mapa **1 tile por turno** (2 turnos para sair de tile
gelado), só por território seu ou neutro, e fica **pronto no turno seguinte**
ao da criação. Se um **esquadrão militar inimigo entra no seu tile**, o
esquadrão de colonos é **destruído** (civis não resistem a tropas — regra do
*Civilization V*).

### Fundar uma cidade

Com um esquadrão de colonos pronto num tile válido, o painel da província traz
o botão **🏛️ Fundar cidade**. O tile precisa estar a **pelo menos 2 tiles**
(distância de Chebyshev) de toda cidade existente. Ao fundar:

- o esquadrão de colonos é **consumido**;
- nasce uma cidade com **100 mil de população e 10 de comida por colono**;
- a cidade concede de imediato **1% da população** como manpower à facção;
- se o tile era neutro, ele é **tomado** pela facção.

> **Gaps futuros:** sistema de **revoltas** quando uma cidade não consegue
> comida; **custo de lealdade** das cidades distantes; sistema de **leis** para
> definir quanto da população pode virar manpower.

---

## 13. Setores, construções e economia

Os tiles da **zona de influência** de uma cidade podem ser **especializados**
e receber **construções**. Definido em
[`src/game/constructions.ts`](src/game/constructions.ts) e
[`src/game/economy.ts`](src/game/economy.ts).

> O catálogo já prevê o **sistema de pesquisa** futuro: cada construção tem o
> campo `requiresResearch` (hoje sempre nulo — tudo destravado).

### Setores e o tile da cidade

Os tiles **vizinhos** da zona de influência podem ser especializados num dos
**7 setores**: **agrícola**, **industrial**, **urbano**, **comercial**,
**religioso**, **militar** e **pesquisa**. O **tile da cidade** é diferente —
nele não se escolhe setor; ele hospeda direto as **construções da cidade**
(museu, teatro, escola, biblioteca, área urbana, conjunto habitacional, rádio,
TV, shopping, mercado local e templo), estilo *Civilization*.

Ao clicar num tile seu dentro da zona de influência, o botão **🏗️** abre o
painel de especialização à direita. Atribuir um setor é grátis; só dá para
trocar o setor de um tile **sem construções**. O setor **religioso** é
**proibido no comunismo**.

### Construções

As construções entram numa **fila de construção própria de cada cidade**,
paralela à fila de tropas/colonos — as duas avançam por turno pela produção
efetiva da cidade. O **dinheiro** é cobrado ao enfileirar; a **produção** é
gasta turno a turno. Cada construção tem um **limite por tile** (algumas, um
**limite por facção**); algumas são **proibidas** por direcionamento ou
**exigem** outra construção.

**Agrícola** — Fazenda (450/2.500, 1/tile, +5 de comida; ×3 e bônus de clima
em Terras Agrícolas); Celeiro (350/1.000, 2/tile, +20% na capacidade de
comida); Pasto (600/4.000, 1/tile, +5 de comida; gado→couro, ovelha→lã,
porco→+2 de comida).

**Industrial** — Mina (600/6.500 ou 2.000/15.000 para raros, 1/tile, extrai o
mineral do tile, 3 ou 1/turno); Zona de fábricas (700/5.000, +produtividade e
dinheiro por direcionamento); Armazém (500/3.500, 2/tile, +50% na capacidade
de minérios/madeira/petróleo); Madeireira (600/4.000, 1/tile, coleta 2
madeira/turno); Oleoduto (1.200/15.000, 1/tile, coleta 2 petróleo/turno);
Usinas de energia — a carvão (1.000/11.000, 2 carvão → 10 energia), nuclear
(4.000/45.000, 1 urânio → 45 energia) e de petróleo (1.500/24.000, 1 petróleo
→ 20 energia).

**Urbano** — Conjunto habitacional (900/12.000, 2/tile e 4 no comunismo,
+500 mil de teto de pop, +750 mil no comunismo); Área urbana (1.200/8.000,
+500 mil, +800 mil nos estados independentes — proibida no comunismo; nos
independentes custa 0 $ e 1.600 de produção); Museu (250/4.500, +2 cultura);
Teatro (230/3.000, +5 cultura); Centro policial (300/3.500) e Agência de
propaganda (400/6.000 — proibida nos independentes) — ordem e lealdade *(gap)*;
Emissora de rádio (400/2.500, +4 cultura, 1 energia) e de TV (500/4.500, +7
cultura, 1 energia).

**Comercial** — Mercado local (450/5.000, +500 $/turno); Shopping center
(600/9.500, +900 $/turno — proibido no comunismo); Zona comercial (600/16.000,
+1.250 $/turno, +1.700 nos independentes — proibida no comunismo; nos
independentes custa 0 $ e 1.200 de produção); Banco Nacional (650/30.000,
1/facção, proibido nos independentes — +30%/+20% nas zonas comerciais); Bolsa
de valores (500/50.000, 1/facção, proibida no comunismo — +15%/+30% nos ganhos
comerciais e industriais); Agência bancária (150/8.000, +10% nos ganhos
comerciais/industriais — exige o Banco Nacional); Mercado exterior
(300/6.000, 1/facção) e Mercado militar (200/4.000, 1/facção) — comércio entre
facções *(gap)*.

**Religioso** (proibido no comunismo) — Templo (200/2.500); Catedral
(600/12.000); Monumento (500/10.000). Aumentam felicidade, ordem e influência
religiosa *(efeitos como gap)*.

**Militar** — Quartel (550/6.500 — as tropas da cidade custam +10% de produção,
mas nascem com 5 de XP); Academia Militar (500/10.000 — comandantes da cidade
nascem com 2★, 10% de chance de 3★, 2% de 4★, e 15 de XP); Fábrica de armamento
(1.100/15.000, 2 energia) e Fábrica de armaduras (1.200/19.000, 2 energia) —
liberam armas/armaduras *(gap)*; Fortificação (2.500/28.000), Muralhas de
concreto (4.000/40.000) e Silo de mísseis (2.500/26.000) — defesa e mísseis no
cerco *(gap)*.

**Pesquisa** — Escola (150/1.500, +2 pesquisa) e Biblioteca (220/2.800, +3
pesquisa) — também construíveis no tile da cidade, **proibidas aos estados
independentes**; Observatório (380/5.500, +5); Universidade (650/9.500, +8);
Laboratório militar (950/14.000, +12); Centro de pesquisas (1.150/18.000, +15).
Só os **estados independentes** geram pesquisa **sem** setor — cada cidade sua
rende +5 de pesquisa por turno (em troca, não constroem Escola nem Biblioteca).

A mina só pode ser erguida em tiles de **mineral** (exclui Madeira e Terras
Agrícolas). Os minerais e produtos (couro, lã) vão para o **inventário de
recursos da cidade**.

### Energia e armazenamento

A **energia** não é estocada: por turno, as **usinas** que têm combustível no
inventário o consomem e geram pontos de energia; os edifícios que precisam de
energia (rádio, TV) são atendidos **por ordem de construção** — quem fica sem
energia não produz o seu efeito naquele turno.

Cada recurso tem um **limite de estoque** na cidade: minérios comuns **30**,
raros **10**, petróleo **15**, madeira **40**, manufaturados (couro/lã) **30**.
Cada **Armazém** soma +50% à capacidade de minérios, madeira e petróleo.
Recursos coletados acima do teto são perdidos.

### Economia e impostos

A facção cobra **impostos** da população: `1` de dinheiro a cada `250`
habitantes (100 mil ⇒ 400). O **nível de imposto** é definido no painel
**Economia** (💰), limitado pelo direcionamento:

| Nível    | Multiplicador | Felicidade | Direcionamentos que permitem |
|----------|---------------|------------|------------------------------|
| Mínimo   | ×0,5          | +30        | todos                        |
| Médio    | ×1,0          | +5         | repúblicas, império, comunistas |
| Alto     | ×1,3          | −15        | império, comunistas          |
| Extremamente alto | ×1,7 | −40        | comunistas                   |

Modificadores de economia por **direcionamento**:

- **Estados independentes** — +20% em zonas comerciais, +10% em industriais e
  +10% em agrícolas.
- **Comunistas** — empobrecimento: −60% nos impostos, −60% em zonas comerciais
  e −50% em zonas industriais.
- **Repúblicas** e **império** — sem buff/debuff (gap: **políticas e leis**
  exclusivas).

A **zona de fábricas** rende produtividade e dinheiro conforme o
direcionamento: comunistas +15 / 0 $, império +12 / 0 $, repúblicas +8 /
+500 $, estados independentes +5 / +1.400 $.

As construções financeiras dão **bônus de ganhos** à facção, somados por cima
dos modificadores de direcionamento: o **Banco Nacional** reforça as zonas
comerciais (+30% em império/república, +20% nos demais); a **Bolsa de valores**
reforça comércio e indústria (+15%, ou +30% nos estados independentes); cada
**Agência bancária** soma +10% a ambos.

### Felicidade

Cada **cidade** tem a sua felicidade (0–100, no máximo 100): `50` de base, mais
o modificador do **imposto** (ver `TAX_LEVELS`) — que vale para **todas** as
cidades —, mais os pontos das suas **construções** (efeito de **uma** cidade) —
Teatro +4, TV +5, Templo/Rádio +3, Museu +2. A felicidade da **facção** é a
**média** das felicidades das suas cidades, e define o **teto de prosperidade**.

A felicidade da cidade também **modula o crescimento da população**: 50 é
neutro; entre 51 e 100 dá um buff de +10% a +70% no crescimento; abaixo de 50
dá um debuff de −10% a −80%. No **decaimento** (fome) é o inverso — felicidade
alta freia a perda, felicidade baixa a acelera.

| Felicidade | Modificador de crescimento |
|------------|----------------------------|
| 100 | +70% |
| 86–99 | +36% a +50% |
| 71–85 | +21% a +35% |
| 51–70 | +10% a +20% |
| 50 | 0% |
| 30–49 | −10% a −20% |
| 15–29 | −35% a −55% |
| 0–14 | −56% a −80% |

### Prosperidade

A **prosperidade** (0–100) é um valor da facção que **multiplica a renda** de
impostos e de zonas comerciais. É exibida no painel **Economia**.

- **Teto** — depende do direcionamento (república 90, império 85, comunista 60,
  estados independentes 100) e da felicidade: `−5` se a felicidade < 100, `−20`
  se < 50.
- **Início** — cada nação começa com 40% do seu teto; estados independentes com
  70%, comunistas com 30%.
- **Crescimento** — `0,1` por turno, ajustado pelo imposto (mínimo ×1,2, médio
  ×1,0, alto ×0,75, extremamente alto ×0,40) e por construções (Banco +6%,
  Bolsa +7%, Zona comercial +5%, Shopping +4%, Teatro/Museu +3%,
  Universidade/Mercado local +2%; Conjunto habitacional −3%, Área urbana −2%).
  Se a prosperidade fica acima do teto (a felicidade caiu), ela **decai** 0,5
  por turno; o piso é 10.
- **Multiplicador de renda** — ≤10 ⇒ ×0,3; 10–25 ⇒ ×0,5; 25–40 ⇒ ×0,75;
  40–50 ⇒ ×0,9; 50–60 ⇒ ×1,0; 60–70 ⇒ ×1,1; 70–80 ⇒ ×1,2; 80–85 ⇒ ×1,35;
  85–90 ⇒ ×1,5; 90–99 ⇒ ×1,7; 100 ⇒ ×2,0.

> **Gaps futuros:** **árvore de pesquisa** — dividida em pesquisas
> **militares, civis, econômicas e industriais** (gastará o `researchPoints`);
> **compra de tiles** — cada tile tem um preço, estados independentes pagam
> **20% menos** e só conquistam comprando (não tomam à força); sistema de
> **cerco** (cidades com pontos de vida — 200 por 100 mil de habitantes —,
> pontos de defesa de fortificação/muralha que precisam cair antes da vida);
> **devastação entre facções** (roubo de 10% do investido, reparo por 35% em
> 3 turnos, tile devastado para de produzir); **fortalezas de tile**;
> **mísseis**; **armas e armaduras** equipáveis; **influência religiosa** e
> líder religioso; **ordem**, **lealdade**, **relíquias**;
> **comércio entre facções**; políticas e leis por direcionamento; efeito da
> felicidade no crescimento.

---

## 14. Estradas e ferrovias

Uma cidade pode ligar-se a **outras cidades da mesma facção** por **estradas**
e **ferrovias**. As vias aceleram o movimento das tropas e dão um pequeno
boost de prosperidade.

### Traçado (A\*)

O caminho entre duas cidades é o **mais curto** achado por **A\*** (8
direções, heurística de Chebyshev), passando **só por tiles possuídos pela
facção** — não há como construir via em tiles que não são seus. Se não houver
um caminho contínuo de tiles próprios, as cidades **não podem ser ligadas**
("sem conexão"). A via é assentada nos tiles **intermediários** (as duas
cidades das pontas não recebem via).

### Estrada × ferrovia

- A **estrada** liga duas cidades por tiles próprios.
- A **ferrovia** é um **upgrade da estrada**: só pode ser construída onde
  **já existe uma via** ligando as duas cidades — ela melhora o traçado
  existente.

### Custo

| Via      | Produção / tile | Dinheiro / tile |
|----------|-----------------|-----------------|
| Estrada  | 200             | 1.500           |
| Ferrovia | 600 (3×)        | 4.500 (3×)      |

O custo de uma ligação é `custo por tile × nº de tiles do caminho` (fora as
duas cidades). O jogador vê o custo **antes** de mandar construir. O
**dinheiro** é cobrado na hora; a **produção** é gasta turno a turno pela fila
da cidade (uma ordem por turno, como recrutamento e construção). Cancelar uma
ordem **devolve o dinheiro** pago.

O traçado e o custo são **recalculados ao enfileirar** a obra, a partir do
estado do jogo — a interface não envia caminho nem preço. Assim não há como
enfileirar uma via mais barata, num caminho que não é seu ou uma ferrovia sem
estrada.

### Movimento das tropas

Cada esquadrão tem `move_allowance` movimentos por turno (1 por padrão) e
`moves_used` para os já gastos — ambos zerados a cada turno. Ao **entrar**
num tile com via, o `move_allowance` sobe para `2` (estrada) ou `3`
(ferrovia), permitindo andar **2 tiles num turno por estrada** ou **3 por
ferrovia**. O 1º movimento do turno vale sempre. Sair de um **tile gelado**
continua levando 2 turnos (seção 10).

### Boost de prosperidade

Uma cidade ligada **por estrada** a outra cidade da facção soma **+0,5%** ao
crescimento de prosperidade; se a ligação for **por ferrovia**, **+1,5%**
(3×). O bônus é somado ao das construções (seção 13). Com 5 cidades ligadas:
+2,5% por estrada ou +7,5% por ferrovia — perceptível, mas longe de quebrar o
jogo (o crescimento-base é 0,1/turno).

### Interface

O painel da cidade tem a aba **Estradas**: lista as outras cidades da facção
com o **custo** de ligar por estrada (e, quando já há estrada, por ferrovia),
um botão **Construir** e a **fila de estradas** (com cancelar). No mapa, os
tiles de via desenham linhas ligando-se às vias e cidades vizinhas — marrom
para estrada, cinza-aço para ferrovia.

---

## 15. Estrutura do código

```
apps/desktop/src/
├── db.ts                 conexão SQLite
├── settings.ts           configurações do app (localStorage)
├── styles.css            estilos-base compartilhados
├── App.vue               casca: alterna menu × jogo
├── components/
│   ├── MainMenu.vue      menu inicial (novo jogo / carregar / configurações)
│   ├── GameView.vue      tela do mapa-múndi
│   └── Flag.vue          bandeira (identicon) de uma facção
└── game/
    ├── enums.ts          ResourceType
    ├── flags.ts          geração do padrão das bandeiras
    ├── resources.ts      catálogo de recursos e bônus de clima
    ├── economy.ts        valores da facção, impostos e economia
    ├── climate.ts        zonas de clima, hemisférios e estações
    ├── turns.ts          calendário dos turnos (data a partir do turno)
    ├── alignments.ts     os 4 direcionamentos políticos
    ├── nations.ts        as 13 nações
    ├── squads.ts         esquadrões, tropas, recrutamento e inventário
    ├── cities.ts         cidades, colonos e fundação de cidades
    ├── constructions.ts  setores, construções e fila de construção
    ├── roads.ts          estradas/ferrovias: A\*, custos e fila de estradas
    ├── battle.ts         resolução de combate (dano, debuffs de ambiente)
    ├── map-generator.ts  geração procedural do mapa
    ├── world.ts          esquema SQLite, persistência e avanço de turno
    └── saves.ts          gestão das partidas salvas
```

---

## 16. Roteiro (próximos passos)

1. ~~**Escolher nação** — na tela "Novo jogo", o jogador pica a facção.~~
   **Implementado** (seção 5): escolher uma nação fixa ou criar a sua.
2. ~~**Turnos** — botão "Próximo turno" que avança o tempo.~~
   **Implementado** (seção 9): turnos semanais a partir de 01/01/1980.
3. **Economia** — *parcial*: as facções recebem **pesquisa** e **cultura** das
   províncias, **manpower** das cidades e **dinheiro** de impostos e fábricas
   (seções 9, 12 e 13). Falta uma fonte para a **influência** e o **uso dos
   recursos** do inventário das cidades.
4. **Eventos** — terremotos, erupções e eventos sazonais sobre o mapa de clima
   e placas tectônicas (seção 10), com **buffs e debuffs**.
5. ~~**Esquadrões e batalha**~~ **Implementado** (seção 11): montar, mover e
   dissolver esquadrões, **recrutar tropas**, **atacar** territórios e
   esquadrões e **tomar** territórios neutros (ocupar ou devastar).
6. ~~**Cidades**~~ **Implementado** (seção 12): fundar cidades com colonos,
   população, comida, zona de influência e ciclo de turno.
7. ~~**Setores, construções e economia**~~ **Implementado** (seção 13): os 7
   setores (agrícola, industrial, urbano, comercial, religioso, militar,
   pesquisa) com suas construções; energia; impostos; produção pelas cidades.
8. **Árvore de pesquisa** — gastar os pontos de pesquisa em pesquisas
   militares, civis, econômicas e industriais que destravam construções e
   melhorias (o campo `requiresResearch` das construções é o gancho — seção 13).
9. **Conquista e defesa entre facções** — tomar territórios de outras nações;
   o contra-ataque do defensor; e a **defesa das cidades** — hoje as tropas no
   **inventário** ainda *não* defendem o tile (só os esquadrões estacionados),
   e isso vai mudar (ver seção 11).
10. **IA** — as nações controladas pela máquina jogam sozinhas a cada turno;
   só então uma cidade do jogador chega a ser atacada.
11. **Diplomacia e alianças** — mecânica de direcionamento político (seção 4);
   destrava mover-se por território de outras facções e o combate entre
   esquadrões (hoje só se batalha contra territórios neutros).
