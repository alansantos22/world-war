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
políticos; cada facção tem os seus **quatro valores** e cada território a sua
**produção por turno** (ainda estáticos). Turnos, economia dinâmica, IA e
diplomacia ainda serão implementados.

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

O **ícone do recurso** aparece sobre a província no mapa: os recursos **raros
são sempre visíveis** (facilita achar petróleo, urânio, etc.); no modo
**Recursos**, todas as províncias mostram o ícone.

> **Planejado:** efeito dos recursos na economia/produção de cada nação.

### Produção do território

Além do recurso, **cada província produz quatro valores por turno**
(definidos em [`src/game/economy.ts`](src/game/economy.ts), sorteados na
geração do mapa):

| Valor               | Descrição                                              |
|---------------------|--------------------------------------------------------|
| Manpower / turno    | Quanto manpower (população mobilizável) a província gera. |
| Recurso local       | Quanto do recurso da província é produzido.            |
| Produção            | Produção industrial estilo *Civilization* (futuras tropas/construções). |
| Pesquisa / turno    | Pontos de pesquisa gerados pela província.             |

As **capitais produzem o dobro** de cada valor. Os números são sorteados a
cada "Novo mapa" e ficam visíveis no painel da província.

> **Planejado:** a cada turno, somar a produção das províncias de uma nação
> aos valores da facção (ver seção 3). Hoje a produção é apenas estática.

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

Toda facção (as 13 nações fixas **e** a nação personalizada) acumula **quatro
valores**, definidos em [`src/game/economy.ts`](src/game/economy.ts) e
persistidos na tabela `factions`:

| Valor               | Descrição                                          |
|---------------------|----------------------------------------------------|
| Dinheiro            | Tesouro nacional.                                  |
| Influência          | Influência política.                               |
| Manpower            | População mobilizável disponível.                  |
| Pontos de pesquisa  | Pontos de pesquisa acumulados.                     |

Toda facção começa a partida com os **mesmos valores iniciais**
(`STARTING_FACTION`): 1.000 de dinheiro, 100 de influência, 10.000 de
manpower e 0 de pesquisa. Os valores da facção do jogador ficam visíveis na
**barra da facção** da HUD (ver seção 8).

> **Planejado:** os valores evoluem a cada turno a partir da produção das
> províncias da nação (ver seção 2). Hoje são estoques estáticos.

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

A barra superior também tem o botão **Salvar jogo** (renomeia a partida e
confirma o estado atual como salvo) e o botão **Menu** (volta ao menu
inicial). A partida atual aparece marcada com 📌 na barra.

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
  nação do jogador seguidos dos seus **quatro valores** (dinheiro, influência,
  manpower e pesquisa — ver seção 3); depois a alternância de visão do mapa
  (Político / Recursos); à direita, a província sob o cursor e o nome da
  partida. Não traz o nome do jogo (já aparece no menu inicial).
- **Barra lateral** (canto superior esquerdo) — uma lista vertical de botões
  arredondados com as ações do jogo: **Nações** e **Direcionamentos** (abrem
  os painéis), **Novo mapa**, **Salvar jogo**, **Menu** e **Tela cheia**.
- **Painel da província** — aparece ao **clicar numa província**; mostra dono,
  direcionamento, recurso e a **produção por turno** (manpower, recurso local,
  produção e pesquisa). Fecha no `✕` ou ao clicar no oceano.
- **Painel lateral** (direita) — aberto pelos botões **Nações** (ranking de
  territórios) ou **Direcionamentos** (os 4 blocos políticos). Só um painel
  fica aberto por vez; o botão acende quando ativo.

- **Navegação do mapa** — a roda do mouse dá **zoom** (centrado no cursor) e
  **arrastar** move o mapa. Não há botões de zoom: a navegação é toda pelo
  mouse, deixando o rodapé livre.

Regra de ouro: nenhum painel fica na frente do mapa sem o jogador ter pedido.

## 9. Estrutura do código

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
    ├── resources.ts      catálogo de recursos
    ├── economy.ts        valores da facção e produção do território
    ├── alignments.ts     os 4 direcionamentos políticos
    ├── nations.ts        as 13 nações
    ├── map-generator.ts  geração procedural do mapa
    ├── world.ts          esquema SQLite e persistência de mapa e facções
    └── saves.ts          gestão das partidas salvas
```

---

## 10. Roteiro (próximos passos)

1. ~~**Escolher nação** — na tela "Novo jogo", o jogador pica a facção.~~
   **Implementado** (seção 5): escolher uma nação fixa ou criar a sua.
2. **Turnos** — botão "Próximo turno" que avança o tempo.
3. **Economia** — *parcial*: os valores da facção (dinheiro, influência,
   manpower, pesquisa) e a produção por turno de cada território já existem
   (seções 2 e 3), mas ainda são **estáticos**. Falta o turno somar a produção
   das províncias aos valores da facção.
4. **Expansão** — conquistar províncias neutras e vizinhas.
5. **IA** — as nações controladas pela máquina jogam sozinhas a cada turno.
6. **Diplomacia e alianças** — mecânica de direcionamento político (seção 4).
