<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { downloadLog } from '../sessionLog.js'
import AddThingForm from './AddThingForm.vue'
import AiExperiments from './AiExperiments.vue'
import AiDial from './AiDial.vue'
import AiRulesCard from './AiRulesCard.vue'
import LessonChallenges from './LessonChallenges.vue'
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
const inspector = ref(null)
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
const showChallenges = ref(false)
async function closeChallenges() {
  showChallenges.value = false
  await nextTick()
  focusLesson()
}
const experimentRoute = ref(null)
const hasExperiments = computed(() => { revision.value; return props.controller.experimentTasks().length > 0 })
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

watch(() => level.value.levelId, async () => {
  panelsRevealed.value = false
  showCard.value = false
  showChallenges.value = false
  experimentRoute.value = null
  clearNudge()
  await nextTick()
  focusLesson()
}, { immediate: true })

watch(latestTurnId, scheduleNudge)

async function submit(line) {
  await game.value.submit(line)
}

async function select(turnId) {
  panelsRevealed.value = true
  clearNudge()
  game.value.select(turnId)
  props.controller.recordUiEvent('viewed_understood_panel')
  await nextTick()
  inspector.value?.focus()
}

async function focusCommand() {
  if (showChallenges.value) return
  experimentRoute.value = null
  showCard.value = false
  await nextTick()
  terminal.value?.focus()
}
async function inspectLatest() {
  if (showChallenges.value) return
  if (!latestTurnId.value || !panels.value.includes('understood')) return
  experimentRoute.value = null
  await nextTick()
  await select(latestTurnId.value)
}
function focusLesson() {
  if (showChallenges.value) return
  document.getElementById('lesson-instructions')?.focus()
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
    <p>Open Adventure Lab on a Chromebook, tablet or laptop for the lesson.</p>
    <p><a href="#play">Play the full game on this screen instead →</a></p>
  </main>
  <main v-else class="lesson" @keydown.alt.c.prevent="focusCommand" @keydown.alt.i.prevent="inspectLatest" @keydown.alt.l.prevent="focusLesson">
    <InstructionsPanel v-show="!showChallenges" @challenges="showChallenges = true" :controller="controller" :revision="revision" :card-open="showCard" @finish="showCard = true" />
    <section class="work">
      <nav v-if="!showChallenges" class="quick-nav" aria-label="Move around the lesson">
        <button v-if="!realLife" type="button" @click="focusCommand" title="Alt+C">Command entry</button>
        <button v-if="panels.includes('understood')" type="button" :disabled="!latestTurnId" @click="inspectLatest" title="Alt+I">Inspect latest command</button>
        <button type="button" @click="focusLesson" title="Alt+L">Lesson instructions</button>
      </nav>
      <header v-show="!showChallenges && properties.levelData.interpreter" class="lesson-toolbar">
        <template v-if="hasExperiments">
          <button class="chunky experiment-button" @click="experimentRoute = 'live'">Review experiments</button>
          <button class="chunky experiment-button" @click="experimentRoute = 'recorded'">Use recorded examples</button>
        </template>
        <span class="spacer"></span>
        <InterpreterPicker :game="game" attention />
      </header>

      <LessonChallenges v-if="showChallenges" :controller="controller" :revision="revision" @back="closeChallenges" />
      <AiRulesCard v-else-if="showCard" @challenges="showChallenges = true" :controller="controller" :revision="revision" @back="showCard = false" />
      <AiExperiments v-else-if="experimentRoute && hasExperiments" :key="`${properties.id}-${experimentRoute}`" :controller="controller" :revision="revision" :initial-route="experimentRoute" @back="experimentRoute = null" />
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
          <ParserPanel ref="inspector" v-if="visiblePanels.includes('understood')" :turn="selectedTurn" />
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
.quick-nav { display: flex; gap: 8px; flex-wrap: wrap; }
.quick-nav button { font: inherit; font-size: 12px; background: var(--panel); color: var(--fg); border: 1px solid var(--line-strong); border-radius: 4px; padding: 5px 8px; cursor: pointer; }
.quick-nav button:disabled { opacity: .5; }
.lesson { flex: 1; min-height: 0; display: flex; gap: 18px; }
.work { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.lesson-toolbar { display: flex; align-items: center; min-height: 44px; padding: 0 8px 4px 0; }
.spacer { flex: 1; }
.experiment-button { padding: 7px; margin-right: 8px; background: var(--panel); color: var(--fg); cursor: pointer; }
.lesson-toolbar { flex-wrap: wrap; gap: 6px; }
.play-stage { flex: 1; min-height: 0; display: flex; gap: 18px; padding: 0 8px 8px 0; }
.terminal-frame { flex: 1; min-width: 0; height: 100%; }
.panels-0 .terminal-frame { max-width: min(100%, calc((100vh - 130px) * 4 / 3)); }
.side-panels { width: 320px; min-width: 260px; display: grid; grid-auto-rows: minmax(0, 1fr); gap: 16px; }
.side-panels.with-form { grid-template-rows: auto; }
.dial-panel { padding: 12px; overflow-y: auto; max-height: 62vh; }
.lesson-phone { margin: auto; max-width: 430px; padding: 18px; }
.lesson-phone h2 { margin: 0 0 8px; font-size: 18px; }
.lesson-phone p { margin: 0 0 8px; line-height: 1.5; }
.lesson-phone a { color: var(--accent); font-weight: 600; }
@media (max-width: 1100px) {
  .play-stage { flex-direction: column; overflow-y: auto; }
  .terminal-frame { flex: none; height: 400px; width: 100%; }
  .side-panels { flex: none; width: 100%; min-width: 0; grid-auto-rows: auto; }
  .side-panels :deep(.parser) { max-height: 420px; }
  .dial-panel { max-height: none; }
}
</style>
