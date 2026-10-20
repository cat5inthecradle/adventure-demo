<script setup>
import { computed, onMounted, ref } from 'vue'
import { createGame } from './game.js'
import TerminalPane from './components/TerminalPane.vue'
import ParserPanel from './components/ParserPanel.vue'
import WorldPanel from './components/WorldPanel.vue'

// An interpreter (e.g. a WebLLM-backed one) is passed here when it exists.
// See src/engine/interpreter.js for the contract.
const game = createGame({ interpreter: null })
const { world, state, selectedTurn } = game

const terminal = ref(null)
const changedPaths = computed(() => (selectedTurn.value?.changes ?? []).map(c => c.path))

async function submit(line) {
  await game.submit(line)
  terminal.value?.focus()
}

onMounted(() => terminal.value?.focus())
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>Adventure Lab</h1>
      <span class="subtitle">{{ world.title }}</span>
      <span class="spacer"></span>
      <span class="mode" :title="state.interpreter ? 'Natural language goes to ' + state.interpreter.name : 'Only the built-in parser is running'">
        interpreter: {{ state.interpreter ? state.interpreter.name : 'off' }}
      </span>
    </header>
    <main class="stage">
      <div class="terminal-frame">
        <TerminalPane
          ref="terminal"
          :log="state.log"
          :selected-turn-id="selectedTurn?.id ?? null"
          :busy="state.busy"
          @submit="submit"
          @select="game.select"
        />
      </div>
      <aside class="side">
        <ParserPanel :turn="selectedTurn" />
        <WorldPanel :world="world" :changed-paths="changedPaths" />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0 18px 18px;
  gap: 12px;
}
.topbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-top: 12px;
}
h1 { font-size: 17px; margin: 0; letter-spacing: 0.02em; }
.subtitle { color: var(--muted); font-size: 13px; }
.spacer { flex: 1; }
.mode {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
  padding: 2px 8px;
}
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 18px;
}
/* The terminal is a fixed 4:3 screen sized by the available height; the side
   panels take whatever width is left. */
.terminal-frame {
  height: 100%;
  aspect-ratio: 4 / 3;
  max-width: 68%;
  flex: none;
}
.side {
  flex: 1;
  min-width: 320px;
  display: grid;
  grid-template-rows: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 14px;
}
</style>
