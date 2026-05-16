# CLAUDE.md

Instruções para o Claude Code trabalhar neste repositório.

## Sobre o projeto

Monorepo (npm workspaces) com **dois jogos**:

- `apps/backend` + `apps/frontend` — jogo **online** MMO (estilo e-sim/eRepublik).
- `apps/desktop` — jogo **desktop** de grande estratégia, offline contra IA
  (Tauri v2 + Vue 3 + SQLite). É o foco do desenvolvimento atual.

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
