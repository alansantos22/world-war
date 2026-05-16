<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./db";

/**
 * Tela de diagnóstico (smoke test). Confirma que o bridge JS<->Rust e o
 * SQLite local funcionam. Será substituída pelas telas do jogo depois.
 */

const rustOk = ref<boolean | null>(null);
const rustMsg = ref("");

const sqlOk = ref<boolean | null>(null);
const sqlMsg = ref("");

async function testRust() {
  rustOk.value = null;
  rustMsg.value = "testando...";
  try {
    rustMsg.value = await invoke<string>("greet", { name: "World War" });
    rustOk.value = true;
  } catch (e) {
    rustMsg.value = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
    rustOk.value = false;
  }
}

async function testSqlite() {
  sqlOk.value = null;
  sqlMsg.value = "testando...";
  try {
    const db = await getDb();
    await db.execute(
      "CREATE TABLE IF NOT EXISTS smoke_test (id INTEGER PRIMARY KEY AUTOINCREMENT, msg TEXT, at TEXT)",
    );
    await db.execute("INSERT INTO smoke_test (msg, at) VALUES (?, ?)", [
      "ola sqlite",
      new Date().toISOString(),
    ]);
    const rows = await db.select<{ id: number; msg: string; at: string }[]>(
      "SELECT id, msg, at FROM smoke_test ORDER BY id DESC LIMIT 5",
    );
    sqlMsg.value =
      `OK — ${rows.length} linha(s) no banco:\n` +
      rows.map((r) => `  #${r.id}  ${r.msg}  @ ${r.at}`).join("\n");
    sqlOk.value = true;
  } catch (e) {
    sqlMsg.value = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
    sqlOk.value = false;
  }
}
</script>

<template>
  <main class="container">
    <h1>World War — Diagnóstico</h1>
    <p class="subtitle">
      Esqueleto do jogo desktop. Use os testes abaixo para confirmar que a base
      funciona; depois isto vira a tela inicial do jogo.
    </p>

    <section class="card">
      <h2>1. Bridge JS ↔ Rust</h2>
      <button @click="testRust">Testar Rust (greet)</button>
      <pre
        v-if="rustMsg"
        class="result"
        :class="{ ok: rustOk === true, err: rustOk === false }"
        >{{ rustMsg }}</pre
      >
    </section>

    <section class="card">
      <h2>2. Banco SQLite local</h2>
      <button @click="testSqlite">Testar SQLite</button>
      <pre
        v-if="sqlMsg"
        class="result"
        :class="{ ok: sqlOk === true, err: sqlOk === false }"
        >{{ sqlMsg }}</pre
      >
      <p class="hint">
        Cada clique insere uma linha — rode de novo e o contador sobe, provando
        que o arquivo <code>world-war.db</code> persiste entre execuções.
      </p>
    </section>
  </main>
</template>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 15px;
  color: #e8e8e8;
  background-color: #1c1f26;
}

body {
  margin: 0;
}

.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

h1 {
  margin: 0 0 0.25rem;
}

.subtitle {
  color: #9aa0ac;
  margin-top: 0;
}

.card {
  background: #262a33;
  border: 1px solid #353a45;
  border-radius: 10px;
  padding: 1.25rem;
  margin-top: 1.25rem;
}

.card h2 {
  margin-top: 0;
  font-size: 1.05rem;
}

button {
  border: 1px solid #396cd8;
  background: #396cd8;
  color: #fff;
  border-radius: 8px;
  padding: 0.55em 1.2em;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: #2f5bc0;
}

.result {
  white-space: pre-wrap;
  word-break: break-word;
  background: #15171d;
  border-radius: 8px;
  padding: 0.75rem;
  margin-top: 0.9rem;
  font-size: 0.85rem;
  border-left: 3px solid #6b7280;
}

.result.ok {
  border-left-color: #3fb950;
}

.result.err {
  border-left-color: #f85149;
  color: #ffb4ae;
}

.hint {
  color: #9aa0ac;
  font-size: 0.82rem;
  margin-bottom: 0;
}

code {
  background: #15171d;
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
</style>
