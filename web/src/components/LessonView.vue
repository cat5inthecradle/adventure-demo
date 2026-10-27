<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { filterToolbox } from '../builder/schema.js'
import InstructionsPanel from './InstructionsPanel.vue'
import InterpreterPicker from './InterpreterPicker.vue'
import ParserPanel from './ParserPanel.vue'
import TerminalPane from './TerminalPane.vue'
import WorldPanel from './WorldPanel.vue'

const BuilderView = defineAsyncComponent(() => import('./BuilderView.vue'))

const props = defineProps({
  controller: { type: Object, required: true },
  phone: Boolean,
})

const revision = ref(0)
const terminal = ref(null)
const unsubscribe = props.controller.onChange(() => { revision.value++ })
const level = computed(() => {
  revision.value
  return props.controller.level
})
const properties = computed(() => {
  revision.value
  return props.controller.properties
})
const game = computed(() => {
  revision.value
  return props.controller.game
})
const selectedTurn = computed(() => game.value.selectedTurn.value)
const changedPaths = computed(() =>
  (selectedTurn.value?.changes ?? []).map(change => change.path)
)
const panels = computed(() => properties.value.levelData.panels)
const canBuild = computed(() => properties.value.levelData.build !== null)
const toolbox = computed(() =>
  filterToolbox(properties.value.levelData.build?.blocks)
)
const tab = ref(properties.value.levelData.view)

watch(() => level.value.levelId, () => {
  tab.value = properties.value.levelData.view
})
watch(() => {
  revision.value
  return game.value.state.interpreter
}, interpreter => props.controller.setInterpreter(interpreter))

async function submit(line) {
  await game.value.submit(line)
  terminal.value?.focus()
}

function select(turnId) {
  game.value.select(turnId)
  props.controller.recordUiEvent('viewed_understood_panel')
}

function restart() {
  game.value.restart()
  terminal.value?.focus()
}

onBeforeUnmount(unsubscribe)
</script>

<template>
  <main v-if="phone" class="lesson-phone panel">
    <h2>This lesson needs a bigger screen</h2>
    <p>Open Adventure Lab on a Chromebook, tablet or laptop to play and build.</p>
  </main>
  <main v-else class="lesson">
    <InstructionsPanel :controller="controller" :revision="revision" />
    <section class="work">
      <header class="lesson-tabs">
        <button type="button" :aria-current="tab === 'play' && 'page'" @click="tab = 'play'">Play</button>
        <button v-if="canBuild" type="button" :aria-current="tab === 'build' && 'page'" @click="tab = 'build'">Build</button>
        <span class="spacer"></span>
        <InterpreterPicker v-show="properties.levelData.interpreter" :game="game" />
      </header>

      <div v-show="tab === 'play'" class="play-stage" :class="`panels-${panels.length}`">
        <div class="terminal-frame">
          <TerminalPane
            ref="terminal"
            :log="game.state.log"
            :selected-turn-id="selectedTurn?.id ?? null"
            :busy="game.state.busy"
            @submit="submit"
            @select="select"
            @skip="game.skip"
            @restart="restart"
          />
        </div>
        <aside v-if="panels.length" class="side-panels">
          <ParserPanel v-if="panels.includes('understood')" :turn="selectedTurn" />
          <WorldPanel
            v-if="panels.includes('world')"
            :world="game.world.value"
            :changed-paths="changedPaths"
          />
        </aside>
      </div>

      <div v-if="canBuild" v-show="tab === 'build'" class="build-stage">
        <BuilderView
          :game="game"
          :active="tab === 'build'"
          :toolbox="toolbox"
          :library-key="controller.libraryKey"
          @play="tab = 'play'"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.lesson { flex: 1; min-height: 0; display: flex; gap: 14px; }
.work { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.lesson-tabs { display: flex; align-items: center; gap: 3px; min-height: 28px; }
.lesson-tabs button { font: inherit; font-size: 12px; padding: 4px 14px; border-radius: 7px; border: 1px solid transparent; background: none; color: var(--muted); cursor: pointer; }
.lesson-tabs button[aria-current='page'] { background: var(--chip); border-color: var(--line); color: var(--fg); }
.spacer { flex: 1; }
.play-stage, .build-stage { flex: 1; min-height: 0; }
.play-stage { display: flex; gap: 14px; }
.build-stage { display: flex; }
.terminal-frame { flex: 1; min-width: 0; height: 100%; }
.panels-0 .terminal-frame { max-width: min(100%, calc((100vh - 130px) * 4 / 3)); }
.side-panels { width: 320px; min-width: 260px; display: grid; grid-auto-rows: minmax(0, 1fr); gap: 12px; }
.lesson-phone { margin: auto; max-width: 430px; padding: 18px; }
.lesson-phone h2 { margin: 0 0 8px; font-size: 18px; }
.lesson-phone p { margin: 0; line-height: 1.5; }
</style>
