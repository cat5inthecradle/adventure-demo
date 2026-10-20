<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { createGame } from './game.js'
import TerminalPane from './components/TerminalPane.vue'
import ParserPanel from './components/ParserPanel.vue'
import WorldPanel from './components/WorldPanel.vue'
import InterpreterPicker from './components/InterpreterPicker.vue'
// Loaded on first visit: players who never open it never download it.
const BenchView = defineAsyncComponent(() => import('./components/BenchView.vue'))

// Starts parser-only; InterpreterPicker swaps a WebLLM interpreter in on request.
// See src/engine/interpreter.js for the contract any interpreter follows.
const game = createGame({ interpreter: null })
const { world, state, selectedTurn } = game

const PACES = [[0, 'instant'], [250, '0.25 s / phase'], [500, '0.5 s / phase'], [1000, '1 s / phase'], [2000, '2 s / phase']]

const terminal = ref(null)
const changedPaths = computed(() => (selectedTurn.value?.changes ?? []).map(c => c.path))

async function submit(line) {
  await game.submit(line)
  terminal.value?.focus()
}

// Two views over one app: playing the game, and benchmarking its interpreter.
// The hash keeps the view across reloads (#bench), and the game stays mounted
// underneath so switching back loses nothing.
const viewFromHash = () => (location.hash.startsWith('#bench') ? 'bench' : 'play')
const view = ref(viewFromHash())
const onHash = () => { view.value = viewFromHash() }
function show(next) {
  location.hash = next === 'bench' ? '#bench' : ''
  view.value = next
}

onMounted(() => {
  window.addEventListener('hashchange', onHash)
  terminal.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>Adventure Lab</h1>
      <span class="subtitle">{{ world.title }}</span>
      <nav class="views" aria-label="Views">
        <button type="button" :aria-current="view === 'play' && 'page'" @click="show('play')">Play</button>
        <button type="button" :aria-current="view === 'bench' && 'page'" @click="show('bench')">Benchmark</button>
      </nav>
      <span class="spacer"></span>
      <label class="pace">
        Pace
        <select v-model.number="state.pace" aria-label="Pause between phases">
          <option v-for="[ms, label] in PACES" :key="ms" :value="ms">{{ label }}</option>
        </select>
      </label>
      <InterpreterPicker :game="game" />
    </header>
    <main v-show="view === 'play'" class="stage">
      <div class="terminal-frame">
        <TerminalPane
          ref="terminal"
          :log="state.log"
          :selected-turn-id="selectedTurn?.id ?? null"
          :busy="state.busy"
          @submit="submit"
          @select="game.select"
          @skip="game.skip"
        />
      </div>
      <aside class="side">
        <ParserPanel :turn="selectedTurn" />
        <WorldPanel :world="world" :changed-paths="changedPaths" />
      </aside>
    </main>
    <main v-if="view === 'bench'" class="stage">
      <BenchView />
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
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  padding-top: 12px;
}
h1 { font-size: 17px; margin: 0; letter-spacing: 0.02em; }
.subtitle { color: var(--muted); font-size: 13px; }
.spacer { flex: 1; }
.views { display: flex; gap: 2px; margin-left: 8px; }
.views button {
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.views button[aria-current='page'] { background: var(--chip); border-color: var(--line); color: var(--fg); }
.pace {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pace select {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 2px 4px;
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
  /* Never squeeze the side panels below their minimum. */
  max-width: calc(100% - 340px);
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
