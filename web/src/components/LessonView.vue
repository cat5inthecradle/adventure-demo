<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { downloadLog } from '../sessionLog.js'
import AddThingForm from './AddThingForm.vue'
import AiDial from './AiDial.vue'
import AiRulesCard from './AiRulesCard.vue'
import InstructionsPanel from './InstructionsPanel.vue'
import InterpreterPicker from './InterpreterPicker.vue'
import ParserPanel from './ParserPanel.vue'
import RealLifeView from './RealLifeView.vue'
import TerminalPane from './TerminalPane.vue'
import WorldPanel from './WorldPanel.vue'

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
const showCard = ref(false)
const realLife = computed(() => properties.value.levelData.realLife ?? null)
const addThing = computed(() => properties.value.levelData.addThing ?? null)
const starter = computed(() => props.controller.starters[properties.value.levelData.startWorld])
const aiDial = computed(() => properties.value.levelData.aiDial ?? null)
const sideCount = computed(() => visiblePanels.value.length + (addThing.value ? 1 : 0) + (aiDial.value ? 1 : 0))
const nudgeTurnId = ref(null)
const latestTurnId = computed(() => {
  revision.value
  return game.value.state.turns.at(-1)?.id ?? null
})
let nudgeTimer = null

watch(() => {
  revision.value
  return game.value.state.interpreter
}, interpreter => props.controller.setInterpreter(interpreter))

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
  showCard.value = false
  clearNudge()
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
  clearNudge()
})
</script>

<template>
  <main v-if="phone" class="lesson-phone panel">
    <h2>This lesson needs a bigger screen</h2>
    <p>Open Adventure Lab on a Chromebook, tablet or laptop to play.</p>
  </main>
  <main v-else class="lesson">
    <InstructionsPanel :controller="controller" :revision="revision" :card-open="showCard" @finish="showCard = true" />
    <section class="work">
      <header v-show="properties.levelData.interpreter" class="lesson-toolbar">
        <span class="spacer"></span>
        <InterpreterPicker :game="game" />
      </header>

      <AiRulesCard v-if="showCard" :controller="controller" :revision="revision" @back="showCard = false" />
      <RealLifeView v-else-if="realLife" :controller="controller" :config="realLife" :revision="revision" />
      <div v-else class="play-stage" :class="`panels-${sideCount}`">
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
            @download-log="downloadLog(controller)"
          />
        </div>
        <aside v-if="sideCount" class="side-panels" :class="{ 'with-form': addThing || aiDial }">
          <div v-if="aiDial" class="panel dial-panel">
            <AiDial :controller="controller" :dial="aiDial" :revision="revision" />
          </div>
          <AddThingForm
            v-if="addThing"
            :game="game"
            :starter="starter"
            :suggested-name="addThing.name"
            @applied="terminal?.focus()"
          />
          <ParserPanel v-if="visiblePanels.includes('understood')" :turn="selectedTurn" />
          <WorldPanel
            v-if="visiblePanels.includes('world')"
            :world="game.world.value"
            :changed-paths="changedPaths"
          />
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.lesson { flex: 1; min-height: 0; display: flex; gap: 18px; }
.work { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.lesson-toolbar { display: flex; align-items: center; min-height: 38px; }
.spacer { flex: 1; }
.play-stage { flex: 1; min-height: 0; display: flex; gap: 18px; padding: 0 8px 8px 0; }
.terminal-frame { flex: 1; min-width: 0; height: 100%; }
.panels-0 .terminal-frame { max-width: min(100%, calc((100vh - 130px) * 4 / 3)); }
.side-panels { width: 320px; min-width: 260px; display: grid; grid-auto-rows: minmax(0, 1fr); gap: 16px; }
.side-panels.with-form { grid-template-rows: auto; }
.dial-panel { padding: 12px; overflow-y: auto; max-height: 62vh; }
.lesson-phone { margin: auto; max-width: 430px; padding: 18px; }
.lesson-phone h2 { margin: 0 0 8px; font-size: 18px; }
.lesson-phone p { margin: 0; line-height: 1.5; }
</style>
