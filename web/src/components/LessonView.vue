<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
const panelsRevealed = ref(false)
const visiblePanels = computed(() =>
  properties.value.levelData.revealPanels === 'always' || panelsRevealed.value
    ? panels.value
    : []
)
const canBuild = computed(() => properties.value.levelData.build !== null)
const toolbox = computed(() =>
  filterToolbox(properties.value.levelData.build?.blocks)
)
const tab = ref(properties.value.levelData.view)
const modePulse = ref(false)
const modeAnimationKey = ref(0)
const nudgeTurnId = ref(null)
const latestTurnId = computed(() => {
  revision.value
  return game.value.state.turns.at(-1)?.id ?? null
})
let modePulseTimer = null
let modePulseVersion = 0
let nudgeTimer = null

watch(() => {
  revision.value
  return game.value.state.interpreter
}, interpreter => props.controller.setInterpreter(interpreter))

async function pulseMode() {
  const version = ++modePulseVersion
  modePulse.value = false
  await nextTick()
  if (version !== modePulseVersion) return
  modeAnimationKey.value++
  modePulse.value = true
  clearTimeout(modePulseTimer)
  modePulseTimer = setTimeout(() => { modePulse.value = false }, 1050)
}

function changeTab(nextTab) {
  tab.value = nextTab
  pulseMode()
}

function clearNudge() {
  clearTimeout(nudgeTimer)
  nudgeTimer = null
  nudgeTurnId.value = null
}

function panelsAreWaiting() {
  return properties.value.levelData.revealPanels === 'on_select' &&
    !panelsRevealed.value && panels.value.length > 0
}

function scheduleNudge() {
  clearNudge()
  const turnId = latestTurnId.value
  if (!turnId || !panelsAreWaiting()) return
  nudgeTimer = setTimeout(() => {
    if (panelsAreWaiting() && latestTurnId.value === turnId) {
      nudgeTurnId.value = turnId
    }
  }, 4000)
}

function noteTyping() {
  scheduleNudge()
}

watch(() => level.value.levelId, () => {
  panelsRevealed.value = false
  clearNudge()
  changeTab(properties.value.levelData.view)
}, { immediate: true })

watch(latestTurnId, scheduleNudge)

async function submit(line) {
  await game.value.submit(line)
  terminal.value?.focus()
}

function select(turnId) {
  panelsRevealed.value = true
  clearNudge()
  game.value.select(turnId)
  props.controller.recordUiEvent('viewed_understood_panel')
}

function restart() {
  clearNudge()
  game.value.restart()
  terminal.value?.focus()
}

onBeforeUnmount(() => {
  unsubscribe()
  clearTimeout(modePulseTimer)
  clearNudge()
})
</script>

<template>
  <main v-if="phone" class="lesson-phone panel">
    <h2>This lesson needs a bigger screen</h2>
    <p>Open Adventure Lab on a Chromebook, tablet or laptop to play and build.</p>
  </main>
  <main v-else class="lesson">
    <InstructionsPanel :controller="controller" :revision="revision" />
    <section class="work" :class="{ 'mode-pulse': modePulse }">
      <header class="lesson-header">
        <div class="lesson-toolbar">
          <div class="lesson-tabs" aria-label="Lesson mode">
            <button type="button" :aria-pressed="tab === 'play'" @click="changeTab('play')">▶ Play</button>
            <button v-if="canBuild" type="button" :aria-pressed="tab === 'build'" @click="changeTab('build')">▦ Build</button>
          </div>
          <span class="spacer"></span>
          <InterpreterPicker v-show="properties.levelData.interpreter" :game="game" />
        </div>
        <p :key="modeAnimationKey" class="mode-banner">
          <template v-if="tab === 'play'">Play mode: try your world by typing commands.</template>
          <template v-else>Build mode: change your world with blocks, then press ▶ Play with my changes.</template>
        </p>
      </header>

      <div v-show="tab === 'play'" class="play-stage" :class="`panels-${visiblePanels.length}`">
        <div class="terminal-frame">
          <TerminalPane
            ref="terminal"
            :log="game.state.log"
            :selected-turn-id="selectedTurn?.id ?? null"
            :nudge-turn-id="nudgeTurnId"
            :busy="game.state.busy"
            @input="noteTyping"
            @submit="submit"
            @select="select"
            @skip="game.skip"
            @restart="restart"
          />
        </div>
        <aside v-if="visiblePanels.length" class="side-panels">
          <ParserPanel v-if="visiblePanels.includes('understood')" :turn="selectedTurn" />
          <WorldPanel
            v-if="visiblePanels.includes('world')"
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
          @play="changeTab('play')"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.lesson { flex: 1; min-height: 0; display: flex; gap: 14px; }
.work { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.lesson-header { display: grid; gap: 6px; }
.lesson-toolbar { display: flex; align-items: center; min-height: 38px; }
.lesson-tabs { display: inline-flex; padding: 3px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--chip); }
.lesson-tabs button { min-width: 100px; border: 0; border-radius: 7px; padding: 7px 18px; background: transparent; color: var(--muted); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.lesson-tabs button[aria-pressed='true'] { background: var(--accent); color: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
.lesson-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mode-banner { margin: 0; padding: 7px 10px; border-radius: 7px; background: var(--accent-soft); color: var(--fg-soft); font-size: 12.5px; font-weight: 600; }
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
@keyframes work-highlight { 0% { box-shadow: 0 0 0 3px var(--accent); } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes banner-enter { from { opacity: 0.35; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
.work.mode-pulse { animation: work-highlight 1s ease-out; }
.work.mode-pulse .mode-banner { animation: banner-enter 350ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .work.mode-pulse, .work.mode-pulse .mode-banner { animation: none; }
}
</style>
