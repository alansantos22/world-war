# CLAUDE.md

Instruções para o Claude Code trabalhar neste repositório.

## Sobre o projeto

Monorepo (npm workspaces) com **dois jogos**:

- `apps/backend` + `apps/frontend` — jogo **online** MMO (estilo e-sim/eRepublik).
- `apps/desktop` — jogo **desktop** de grande estratégia, offline contra IA
  (Tauri v2 + Vue 3 + SQLite).

O **único foco** do desenvolvimento é o jogo **desktop**. O jogo online e
qualquer preocupação que envolva servidor/rede estão **fora de escopo** — não
gastar esforço com isso.

## Regras do projeto

### 1. Documentação do design do jogo

**Toda nova regra ou mecânica do jogo desktop deve ser registrada em
[`apps/desktop/GAME_DESIGN.md`](apps/desktop/GAME_DESIGN.md).**

Sempre que implementar, alterar ou combinar uma regra de jogo (mapa, nações,
recursos, economia, turnos, combate, diplomacia, IA, alinhamentos, etc.),
atualize o `GAME_DESIGN.md` **na mesma tarefa**, antes de considerar o
trabalho concluído. O documento deve sempre:

- refletir o **estado atual** do jogo;
- separar claramente o que **já está implementado** do que é **planejado**.

### 2. Validação contra trapaça

As funções da lógica do jogo (`apps/desktop/src/game/*`) devem **validar com
cuidado** e **recalcular os valores autoritativos** elas mesmas — nunca confiar
em caminho, custo, quantidade ou alvo vindos da interface. O jogador não pode
conseguir "cheatear".

Uma função que enfileira ou aplica uma ação deve carregar o estado do banco e
derivar custo/efeito a partir dele, em vez de receber esses valores prontos da
UI. Exemplo: `queueRoad` em `src/game/roads.ts` recalcula o traçado e o preço
da estrada via `planRoad` (não recebe `path` nem custo); a UI usa a mesma
`planRoad` só para exibir.
