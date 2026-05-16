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
**ataca** territórios e esquadrões inimigos e **toma** territórios neutros. A
IA, os eventos e a diplomacia ainda serão implementados.

---

## 2. O mapa

### Grade

O mundo é uma grade fixa de **50 × 24 células** (`GRID` em
[`src/game/map-generator.ts`](src/game/map-generator.ts)). O desenho dos 6
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
nome próprio e um recurso. São ~400 províncias no total.

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
- **Comuns:** Madeira, Ferro, Bauxita, Cobre, Terras Agrícolas.

Os recursos raros são posicionados com *farthest-point sampling* (cada raro é
colocado o mais longe possível dos raros já posicionados), garantindo que
ninguém monopolize um recurso num canto do mapa. Quantidades proporcionais ao
total de províncias — Nióbio é o mais escasso (~3%).

O **ícone do recurso** aparece sobre a província **apenas no modo Recursos**
— aí todas as províncias mostram o seu ícone. No modo **Político** o mapa
fica limpo, sem ícones de recurso (nem dos raros).

> **Planejado:** efeito dos recursos na economia/produção de cada nação.

### Produção do território

Além do recurso, **cada província produz cinco valores por turno**
(definidos em [`src/game/economy.ts`](src/game/economy.ts), sorteados na
geração do mapa):

| Valor               | Descrição                                              |
|---------------------|--------------------------------------------------------|
| Manpower / turno    | Quanto manpower (população mobilizável) a província gera. |
| Recurso local       | Quanto do recurso da província é produzido.            |
| Produção            | Produção industrial estilo *Civilization* (futuras tropas/construções). |
| Pesquisa / turno    | Pontos de pesquisa gerados pela província.             |
| Cultura / turno     | Cultura gerada pela província.                         |

As **capitais produzem o dobro** de cada valor. Os números são sorteados a
cada "Novo mapa" e ficam visíveis no painel da província. A produção do
**recurso local** ainda recebe um **bônus de clima** (ver seção 10).

A cada turno (ver seção 9), o **manpower**, a **pesquisa** e a **cultura**
produzidos são somados aos valores da facção dona. "Recurso local" e
"produção industrial" ainda **não são acumulados** — ficam reservados para
mecânicas futuras
(efeito dos recursos, construção de tropas/edifícios).

---

## 3. As nações (facções)

São **13 nações**, definidas em [`src/game/nations.ts`](src/game/nations.ts).
Cada uma começa controlando **1 província — a sua capital** (marcada com ★).
Todo o resto do mundo começa **neutro**.

| Nação                          | País real                    | Direcionamento        |
|--------------------------------|-------------------------------|-----------------------|
| Império do Brasil              | Brasil                        | Império               |
| União das Repúblicas Unidas    | América do Norte              | Repúblicas            |
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
(`STARTING_FACTION`): 1.000 de dinheiro, 100 de influência, 10.000 de
manpower, 0 de pesquisa e 0 de cultura. Os valores da facção do jogador ficam
visíveis na **barra superior** da HUD (ver seção 8).

A cada turno a facção recebe a produção das suas províncias (ver seção 9):
**manpower**, **pesquisa** e **cultura** crescem. Dinheiro e influência ainda
**não têm fonte de produção** — ficam parados até definirmos de onde vêm.

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
| `kind`       | TEXT    | Tipo da tropa.                                  |
| `prod_cost`  | INTEGER | Produção necessária para concluir a tropa.      |
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

Criar um novo jogo gera o mapa, grava as províncias e cria as facções daquela
partida; carregar uma partida lê províncias e facções do seu `save_id`. "Novo
mapa" apaga e regenera só o mapa da partida atual (as facções são mantidas).
Bancos de versões antigas (sem `save_id`) são migrados para uma partida
"Partida recuperada"; saves anteriores à tabela `factions` ou às colunas de
produção recebem os valores iniciais ao serem carregados.

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
  **Direcionamentos** (🎖️) e **Exército** (🪖), que abrem os seus painéis, e
  **Novo mapa** (↻), **Salvar jogo** (💾), **Menu** (⏏) e **Tela cheia** (⛶).
  O texto de cada ação aparece como dica ao passar o mouse.
- **Painel da província** — aparece ao **clicar numa província**; mostra dono,
  direcionamento, recurso, **clima** (zona, hemisfério, estação, avisos de
  zona sísmica/vulcão) e a **produção por turno** (manpower, recurso local,
  produção, pesquisa e cultura). Fecha no `✕` ou ao clicar no oceano.
- **Painel lateral** (direita) — aberto pelos botões **Nações** (ranking de
  territórios) ou **Direcionamentos** (os 4 blocos políticos). Só um painel
  fica aberto por vez; o botão acende quando ativo.
- **Painel da cidade** (direita) — aberto pelo botão **Ver cidade** do painel
  da província; mostra a cidade em abas (estilo *Civilization*) — hoje a aba
  **Inventário** (ver seção 11).
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

Cada facção recebe a produção das suas províncias somada aos seus valores:

- **Manpower** += soma do manpower produzido pelas suas províncias.
- **Pesquisa** += soma da pesquisa produzida pelas suas províncias.
- **Cultura** += soma da cultura produzida pelas suas províncias.

As **capitais já produzem o dobro** (regra da geração do mapa — seção 2),
então esse bônus entra naturalmente na soma.

Cada facção também **paga a manutenção** do seu exército em **dinheiro** (ver
seção 11): 25 por esquadrão + 10 por tropa, e ainda as tropas do inventário —
mas tudo que está **num tile da própria facção custa metade**. O dinheiro
nunca fica negativo: se o caixa não cobre a manutenção, ele só chega a 0.

A **fila de recrutamento** de cada cidade avança: a **produção** da província
é gasta na primeira tropa da fila e, quando concluída, a tropa entra no
**inventário da cidade** (ver seção 11).

Por fim, cada esquadrão parado em **território da própria facção** recupera
**5 de vida** (comandante e cada tropa), e **todos os esquadrões recuperam os
seus 2 ataques** do turno (ver seção 11).

A **influência** ainda **não muda** por turno e o **dinheiro** ainda não tem
uma fonte de *produção* (só a despesa da manutenção). Definir de onde vêm é um
passo futuro.

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

**Montar um esquadrão** — ao clicar numa **província sua**, o painel do
território traz o botão **Montar esquadrão**. Custa **500 de dinheiro** e
**1.000 de manpower** (o comandante). O esquadrão **fica pronto só no turno
seguinte** ("Em preparação" até lá).

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

> *Provisório:* hoje a metade vale para **qualquer tile da facção**, porque o
> jogo ainda não distingue **cidade** de território. Quando existir o sistema
> de **cidades** (cidade + zona ao redor, estilo *Civilization*), o desconto
> passará a valer só nas cidades.

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

As tropas nascem pelo **recrutamento**. No painel de uma **cidade sua**, o
botão **Recrutamento** substitui as informações do território pelo painel de
recrutamento (com um botão **‹** para voltar). Hoje só há **infantaria**:

| Tropa      | Força | Vida | Dinheiro | Manpower | Produção | Manutenção |
|------------|-------|------|----------|----------|----------|------------|
| Infantaria | +10   | 50   | 200      | 250      | 50       | 10 / turno |

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
direita, com abas no topo (estilo *Civilization*). Hoje existe a aba
**Inventário**: mostra os **recursos** da cidade (zerados — o estoque chega com
o sistema de produção) e as **tropas** guardadas.

Cada tropa do inventário tem um botão **Add ao esquadrão** e uma **caixa de
seleção** para mover várias de uma vez. Ao enviar tropas a um esquadrão:

- com **1 esquadrão** estacionado na cidade, elas vão direto para ele;
- com **vários**, abre o diálogo **Qual esquadrão?**;
- sem **nenhum**, a ação fica desabilitada.

O esquadrão de destino precisa ter espaço (limite de tropas pelas estrelas).

> **Planejado:** as tropas do inventário também **defenderão a cidade** quando
> ela for atacada (hoje o inventário é só armazenamento — quem defende um tile
> são os esquadrões estacionados nele); outras tropas além da infantaria; e a
> **construção e produção** da cidade no painel **Ver cidade** (estilo
> *Civilization*).

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

## 12. Estrutura do código

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
    ├── economy.ts        valores da facção e produção do território
    ├── climate.ts        zonas de clima, hemisférios e estações
    ├── turns.ts          calendário dos turnos (data a partir do turno)
    ├── alignments.ts     os 4 direcionamentos políticos
    ├── nations.ts        as 13 nações
    ├── squads.ts         esquadrões, tropas, recrutamento e inventário
    ├── battle.ts         resolução de combate (dano, debuffs de ambiente)
    ├── map-generator.ts  geração procedural do mapa
    ├── world.ts          esquema SQLite, persistência e avanço de turno
    └── saves.ts          gestão das partidas salvas
```

---

## 13. Roteiro (próximos passos)

1. ~~**Escolher nação** — na tela "Novo jogo", o jogador pica a facção.~~
   **Implementado** (seção 5): escolher uma nação fixa ou criar a sua.
2. ~~**Turnos** — botão "Próximo turno" que avança o tempo.~~
   **Implementado** (seção 9): turnos semanais a partir de 01/01/1980.
3. **Economia** — *parcial*: a cada turno as facções já recebem **manpower**,
   **pesquisa** e **cultura** das suas províncias (seção 9). Falta dar uma
   fonte de produção ao **dinheiro** e à **influência**, e usar "recurso local"
   e "produção industrial" (efeito dos recursos, construção de tropas/edifícios).
4. **Eventos** — terremotos, erupções e eventos sazonais sobre o mapa de clima
   e placas tectônicas (seção 10), com **buffs e debuffs**.
5. ~~**Esquadrões e batalha**~~ **Implementado** (seção 11): montar, mover e
   dissolver esquadrões, **recrutar tropas**, **atacar** territórios e
   esquadrões e **tomar** territórios neutros (ocupar ou devastar).
6. **Construções** — edifícios nos tiles, com bônus de defesa e buffs/debuffs
   que entram na conta da batalha (seção 11).
7. **Conquista e defesa entre facções** — tomar territórios de outras nações;
   o contra-ataque do defensor; e a **defesa das cidades** — hoje as tropas no
   **inventário** ainda *não* defendem o tile (só os esquadrões estacionados),
   e isso vai mudar (ver seção 11).
8. **IA** — as nações controladas pela máquina jogam sozinhas a cada turno;
   só então uma cidade do jogador chega a ser atacada.
9. **Diplomacia e alianças** — mecânica de direcionamento político (seção 4);
   destrava mover-se por território de outras facções e o combate entre
   esquadrões (hoje só se batalha contra territórios neutros).
