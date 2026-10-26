<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { createGame } from './game.js'
import TerminalPane from './components/TerminalPane.vue'
import ParserPanel from './components/ParserPanel.vue'
import WorldPanel from './components/WorldPanel.vue'
import InterpreterPicker from './components/InterpreterPicker.vue'
// Loaded on first visit: players who never open it never download it.
const BenchView = defineAsyncComponent(() => import('./components/BenchView.vue'))
// Blockly is large; it loads the first time someone opens Build.
const BuilderView = defineAsyncComponent(() => import('./components/BuilderView.vue'))

// Starts parser-only; InterpreterPicker swaps a WebLLM interpreter in on request.
// See src/engine/interpreter.js for the contract any interpreter follows.
const game = createGame({ interpreter: null })
const { world, state, selectedTurn } = game

const PACES = [[0, 'instant'], [250, '0.25 s / phase'], [500, '0.5 s / phase'], [1000, '1 s / phase'], [2000, '2 s / phase']]

const terminal = ref(null)
const changedPaths = computed(() => (selectedTurn.value?.changes ?? []).map(c => c.path))

// Phones get one thing at a time: the game, how a command was understood, or the
// world. A phone on its side counts too — it is far too short for side panels.
const narrow = window.matchMedia('(max-width: 700px), (max-height: 500px)')
const phone = ref(narrow.matches)
const onNarrow = () => { phone.value = narrow.matches }
const PANES = [['game', 'Game'], ['parser', 'Understood'], ['world', 'World']]
const pane = ref('game')

// Tapping a command on a phone opens how it was understood.
function select(turnId) {
  game.select(turnId)
  if (phone.value) pane.value = 'parser'
}

function showPane(next) {
  pane.value = next
  if (next === 'game') setTimeout(() => terminal.value?.scrollToEnd())
}

// A phone's keyboard covers the bottom of the page without shrinking it, so size
// the app to what is actually visible and keep the latest lines in view.
function fitViewport() {
  const visible = window.visualViewport
  if (!visible) return
  document.documentElement.style.setProperty('--app-height', `${visible.height}px`)
  window.scrollTo(0, 0)
  terminal.value?.scrollToEnd()
}

async function submit(line) {
  await game.submit(line)
  terminal.value?.focus()
}

// Three views over one app: playing the game, building a world, and benchmarking
// the interpreter. The hash keeps the view across reloads (#build, #bench). The
// game and the builder stay mounted once opened, so switching back loses nothing.
const viewFromHash = () => (location.hash.startsWith('#bench') ? 'bench'
  : location.hash.startsWith('#build') ? 'build' : 'play')
const view = ref(viewFromHash())
const builderOpened = ref(view.value === 'build' && !phone.value)
const onHash = () => { view.value = viewFromHash() }
function show(next) {
  location.hash = next === 'play' ? '' : `#${next}`
  view.value = next
  if (next === 'build' && !phone.value) builderOpened.value = true
  if (next === 'play') setTimeout(() => terminal.value?.focus())
}

// Restart asks once before throwing a game away; a finished game doesn't ask.
const confirmingRestart = ref(false)
function restart() {
  if (!world.value.outcome && world.value.turn_count > 0 && !confirmingRestart.value) {
    confirmingRestart.value = true
    return
  }
  confirmingRestart.value = false
  game.restart()
  terminal.value?.focus()
}

onMounted(() => {
  window.addEventListener('hashchange', onHash)
  narrow.addEventListener('change', onNarrow)
  window.visualViewport?.addEventListener('resize', fitViewport)
  fitViewport()
  // On a phone, focusing pops the keyboard up over the opening text.
  if (!phone.value) terminal.value?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHash)
  narrow.removeEventListener('change', onNarrow)
  window.visualViewport?.removeEventListener('resize', fitViewport)
})
</script>

<template>
  <div class="app" :class="{ phone }">
    <header class="topbar">
      <h1>Adventure Lab</h1>
      <span class="subtitle">{{ world.title }}</span>
      <nav class="views" aria-label="Views">
        <button type="button" :aria-current="view === 'play' && 'page'" @click="show('play')">Play</button>
        <button type="button" :aria-current="view === 'build' && 'page'" @click="show('build')">Build</button>
        <button v-if="!phone" type="button" :aria-current="view === 'bench' && 'page'" @click="show('bench')">Benchmark</button>
      </nav>
      <span class="spacer"></span>
      <span v-if="view === 'play'" class="restart">
        <template v-if="confirmingRestart">
          <span class="ask">{{ phone ? 'Lose your progress?' : 'Restart the story? Your progress will be lost.' }}</span>
          <button type="button" class="danger" @click="restart">Restart</button>
          <button type="button" @click="confirmingRestart = false">Keep playing</button>
        </template>
        <button v-else type="button" title="Start this story over from the beginning" @click="restart">↺ Restart</button>
      </span>
      <label class="pace">
        Pace
        <select v-model.number="state.pace" aria-label="Pause between phases">
          <option v-for="[ms, label] in PACES" :key="ms" :value="ms">{{ label }}</option>
        </select>
      </label>
      <!-- Phones play with the parser alone: the models are 1–2 GB downloads that
           most phones cannot run. -->
      <InterpreterPicker v-show="!phone" :game="game" />
    </header>
    <nav v-if="phone && view === 'play'" class="panes" aria-label="Show">
      <button
        v-for="[key, label] in PANES" :key="key" type="button"
        :aria-current="pane === key && 'page'" @click="showPane(key)"
      >{{ label }}</button>
    </nav>
    <main v-show="view === 'play'" class="stage" :data-pane="phone ? pane : null">
      <div class="terminal-frame">
        <TerminalPane
          ref="terminal"
          :log="state.log"
          :selected-turn-id="selectedTurn?.id ?? null"
          :busy="state.busy"
          @submit="submit"
          @select="select"
          @skip="game.skip"
          @restart="restart"
        />
      </div>
      <aside class="side">
        <ParserPanel :turn="selectedTurn" />
        <WorldPanel :world="world" :changed-paths="changedPaths" />
      </aside>
    </main>
    <main v-if="phone && view === 'build'" class="stage">
      <div class="panel phone-note">
        <h2>Building needs a bigger screen</h2>
        <p>The World Builder is made of blocks you drag around, which doesn’t fit on a phone.
          Open Adventure Lab on a tablet, Chromebook or laptop to build a world.</p>
        <p class="muted">Worlds you’ve built are saved in each browser, so they won’t show up here.</p>
        <button type="button" @click="show('play')">▶ Back to the game</button>
      </div>
    </main>
    <main v-if="builderOpened" v-show="view === 'build' && !phone" class="stage">
      <BuilderView :game="game" :active="view === 'build' && !phone" @play="show('play')" />
    </main>
    <main v-if="view === 'bench'" class="stage">
      <BenchView />
    </main>
  </div>
</template>

<style scoped>
.app {
  height: var(--app-height, 100dvh);
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
.restart { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.restart .ask { color: var(--muted); }
.restart button {
  font: inherit;
  font-size: 12px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
}
.restart button.danger { background: var(--bad); border-color: var(--bad); color: #fff; }
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

/* --- phones ----------------------------------------------------------------- */
.phone { padding: 0 10px 10px; gap: 8px; }
.phone .topbar { gap: 6px 10px; padding-top: 8px; align-items: center; }
/* The terminal opens with the world's title; the top bar has no room for it. */
.phone .subtitle { display: none; }
.phone .views { flex: 1; justify-content: flex-end; }
.phone .views { margin-left: 0; }
/* Fingers need bigger targets than a pointer. */
.phone .views button,
.phone .restart button,
.phone .pace select,
.panes button { min-height: 40px; font-size: 14px; padding: 0 14px; }
.panes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--chip);
  border: 1px solid var(--line);
}
.panes button {
  flex: 1;
  font: inherit;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.panes button[aria-current='page'] { background: var(--panel); color: var(--fg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
.phone .terminal-frame { width: 100%; height: 100%; aspect-ratio: auto; max-width: none; flex: 1; }
.phone .side { min-width: 0; grid-template-rows: minmax(0, 1fr); }
.phone .stage:not([data-pane='game']) .terminal-frame,
.phone .stage[data-pane='game'] .side,
.phone .stage[data-pane='parser'] .side > :not(.parser),
.phone .stage[data-pane='world'] .side > :not(.world) { display: none; }
.phone-note { margin: auto; max-width: 420px; padding: 18px; gap: 4px; }
.phone-note h2 { font-size: 17px; margin: 0 0 6px; }
.phone-note p { margin: 0 0 10px; font-size: 15px; line-height: 1.45; }
.phone-note button {
  font: inherit;
  min-height: 44px;
  border-radius: 8px;
  border: 0;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
</style>
