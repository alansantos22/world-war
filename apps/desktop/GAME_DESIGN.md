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
**produção por turno**, a sua **força de batalha** e os seus dados de
**clima e geografia** (hemisfério, zona de clima, zonas sísmicas, vulcões);
o jogo já avança por **turnos** (1 semana cada), em que as facções recebem a
produção das suas províncias e pagam a manutenção dos seus exércitos; o
jogador já monta, move e dissolve **esquadrões** militares no mapa e **recruta
tropas** para eles. A **resolução de combate** (atacar territórios e
esquadrões), a IA, os eventos e a diplomacia ainda serão implementados.

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
| `battle_force`  | INTEGER | Força de batalha a derrubar para tomar o território. |
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
| `cmd_stars`        | INTEGER | Estrelas do comandante (1–5).                   |
| `cmd_force`        | INTEGER | Força contribuída pelo comandante.              |
| `cmd_hp`           | INTEGER | Pontos de vida atuais do comandante.            |
| `cmd_max_hp`       | INTEGER | Pontos de vida máximos do comandante.           |
| `cmd_defense`      | INTEGER | Defesa do comandante.                           |
| `cmd_xp`           | INTEGER | Experiência acumulada do comandante.            |

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

### Tabela `recruit_orders`

Uma linha por **tropa na fila de produção** de uma cidade (ver seção 11).

| Coluna       | Tipo    | Descrição                                       |
|--------------|---------|-------------------------------------------------|
| `id`         | INTEGER | Chave primária (também a ordem na fila).        |
| `save_id`    | INTEGER | Partida (`saves.id`) a que pertence.            |
| `x`, `y`     | INTEGER | Tile da cidade que produz a tropa.              |
| `owner_code` | TEXT    | Facção dona.                                    |
| `squad_id`   | INTEGER | Esquadrão que receberá a tropa pronta.          |
| `kind`       | TEXT    | Tipo da tropa.                                  |
| `prod_cost`  | INTEGER | Produção necessária para concluir a tropa.      |
| `prod_done`  | INTEGER | Produção já acumulada.                          |

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
  arredondados, **só com ícones**, para as ações do jogo: **Nações** (🏴) e
  **Direcionamentos** (🎖️), que abrem os painéis, e **Novo mapa** (↻),
  **Salvar jogo** (💾), **Menu** (⏏) e **Tela cheia** (⛶). O texto de cada
  ação aparece como dica ao passar o mouse.
- **Painel da província** — aparece ao **clicar numa província**; mostra dono,
  direcionamento, recurso, **clima** (zona, hemisfério, estação, avisos de
  zona sísmica/vulcão) e a **produção por turno** (manpower, recurso local,
  produção, pesquisa e cultura). Fecha no `✕` ou ao clicar no oceano.
- **Painel lateral** (direita) — aberto pelos botões **Nações** (ranking de
  territórios) ou **Direcionamentos** (os 4 blocos políticos). Só um painel
  fica aberto por vez; o botão acende quando ativo.
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

Cada facção também **paga a manutenção** dos seus esquadrões (ver seção 11):
**dinheiro** -= 25 por esquadrão **+ 10 por tropa**. O dinheiro nunca fica
negativo — se o caixa não cobre a manutenção, ele só chega a 0.

Por fim, a **fila de recrutamento** de cada cidade avança: a **produção** da
província é gasta na primeira tropa da fila e, quando concluída, a tropa entra
no esquadrão alvo (ver seção 11).

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

## 11. Esquadrões e força de batalha

O sistema militar do jogo. Definido em
[`src/game/squads.ts`](src/game/squads.ts), com a força de batalha dos
territórios em [`src/game/map-generator.ts`](src/game/map-generator.ts).

> A **resolução de combate** em si — atacar territórios e esquadrões, derrubar
> a força de batalha — ainda **não está implementada**; é o próximo passo. O
> que existe hoje é toda a **estrutura**: a força de batalha como dado, os
> esquadrões (montar, mover, dissolver, manutenção) e o **recrutamento de
> tropas**.

### Força de batalha do território

Toda província de terra tem uma **força de batalha** (`battleForce`), sorteada
na geração do mapa (20–80; as **capitais resistem o dobro**). Para tomar um
território de forma **hostil** é preciso derrubar essa força a **0**.

- Um **território neutro** tomado torna-se **seu**.
- Um território **tomado de outra facção** funciona de forma diferente — por
  enquanto só fica **marcado** com a flag `conquered`.
- Ao tomar um território o jogador decidirá entre **devastá-lo** (destruir
  tudo e matar todos que estão nele) ou apenas **ocupá-lo**.

A força de batalha aparece no painel da província. *A tomada em si e a escolha
de devastar dependem da resolução de combate — **planejado**.*

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
| Estrelas  | 1       | Buff de força (1★ = +0%, **+5% por estrela**, 5★ = +20%) e limite de tropas. |
| Força     | 30      | Contribui para a força do esquadrão (cada tropa soma ~⅓ disso). |
| Vida      | 100     | Pontos de vida.                                         |
| Defesa    | 1       | Defesa do comandante.                                   |
| XP        | 0       | O comandante acumula experiência. *Progressão de XP → estrelas: planejada.* |

O comandante é o **último a morrer** do esquadrão — só morre quando nenhuma
outra tropa tiver vida. Se o **comandante morre, o esquadrão inteiro morre**.

**Tropas e limite** — além do comandante, o esquadrão tem **tropas** (ver
*Recrutamento*), que somam força e têm pontos de vida próprios. Um comandante
de **1★ comporta 20 tropas** e **cada estrela a mais soma +2** (5★ = 28); o
comandante não conta nesse limite.

A **força do esquadrão** é a soma da força do comandante com a das suas tropas,
multiplicada pelo bônus de estrelas.

**Mover** — o painel do tile lista os esquadrões; em cada esquadrão seu há o
botão **Mover**. Ao clicar nele, os tiles vizinhos válidos ficam destacados e
o próximo clique leva o esquadrão para lá. Um esquadrão **move-se 1 tile por
turno** — mas **sair de um tile gelado leva 2 turnos**.

**Dissolver** — o mesmo painel traz o botão **Excluir** para dissolver um
esquadrão seu (o que estava na sua fila de recrutamento é reembolsado).

**Manutenção** — descontada de cada facção no avanço de turno (seção 9):
**25 de dinheiro** por esquadrão (o comandante) **+ 10 por tropa**.

**Lista no tile** — o painel da província **sempre mostra a lista de
esquadrões** daquele tile. Cada linha traz a força, o número de tropas, a vida
e a defesa do comandante, a manutenção e o estado (Pronto / Em preparação).

**Atacar** — esquadrões servem para tomar territórios de forma hostil e para
combater outros esquadrões no mesmo tile (botão **Atacar**). *A resolução
desses ataques é o* **sistema de batalha — planejado**; por isso os botões
**Atacar** e **Tomar território** aparecem **desativados** por enquanto.

### Recrutamento de tropas

As tropas entram no esquadrão pelo **recrutamento**. No painel de uma
**cidade sua** que tenha um **esquadrão seu** no tile, o botão **Recrutamento**
**substitui** as informações do território pelo painel de recrutamento (com um
botão **‹** para voltar).

Ali o jogador escolhe o **esquadrão alvo** (entre os seus naquele tile) e a
**tropa**. Hoje só há **infantaria**:

| Tropa      | Força | Vida | Dinheiro | Manpower | Produção | Manutenção |
|------------|-------|------|----------|----------|----------|------------|
| Infantaria | +10   | 50   | 200      | 250      | 50       | 10 / turno |

A **vida** de uma tropa é **50% da vida do comandante** (comandante = 100 →
infantaria = 50).

O **dinheiro** e o **manpower** são cobrados **na hora** de enfileirar. A
**produção** é o tempo de construção: a cada turno a cidade gasta a sua
**produção por turno** (seção 2) na **primeira** tropa da sua **fila** — quando
a produção acumulada alcança o custo, a tropa fica pronta e **entra no
esquadrão alvo**. Ex.: uma cidade que produz 38/turno leva
`ceil(50 / 38) = 2` turnos.

**Fila de produção** — dá para **enfileirar** várias tropas (desde que haja
dinheiro e manpower); a cada turno só a **primeira** da fila avança. Uma ordem
pode ser **cancelada** (devolve o dinheiro e o manpower). Não se pode
enfileirar além do limite de tropas do esquadrão (tropas já no esquadrão + as
da fila).

> **Planejado:** outras tropas além da infantaria e a progressão de XP do
> comandante.

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
    ├── squads.ts         esquadrões, tropas e fila de recrutamento
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
5. **Esquadrões** — *parcial*: já é possível **montar, mover e dissolver**
   esquadrões, **recrutar tropas** (infantaria) e cada território tem a sua
   **força de batalha** (seção 11).
6. **Sistema de batalha** — resolução de combate: atacar territórios (derrubar
   a força de batalha a 0) e esquadrões, dano às tropas e ao comandante,
   tomada do território e a escolha de **devastar ou ocupar**.
7. **IA** — as nações controladas pela máquina jogam sozinhas a cada turno.
8. **Diplomacia e alianças** — mecânica de direcionamento político (seção 4).
