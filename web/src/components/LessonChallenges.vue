<script setup>
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { CHALLENGES } from '../lesson/challenges.js'
import { EXPERIMENTS } from '../lesson/experiments.js'
import AddThingForm from './AddThingForm.vue'
import TerminalPane from './TerminalPane.vue'
import ParserPanel from './ParserPanel.vue'

const props = defineProps({ controller: Object, revision: Number })
defineEmits(['back'])
const active = ref(null)
const session = shallowRef(null)
const note = ref('')
const reviewed = ref(false)
const saveStatus = ref('')
const terminal = ref(null)
const inspector = ref(null)
const title = ref(null)
const menuTitle = ref(null)
onMounted(() => menuTitle.value?.focus())
const game = computed(() => session.value?.game)
const starter = computed(() => props.controller.starters[props.controller.world])
const readyModel = computed(() => { props.revision; return props.controller.interpreter })
const records = [...EXPERIMENTS[9006], EXPERIMENTS[9007][0]]
const suggested = computed(() => props.controller.worlds.worlds[props.controller.world].terms.detail)

async function open(challenge) {
  const template = Object.values(props.controller.levelProperties).find(p => p.levelData?.addThing)?.projectTemplateLevelName
  const source = challenge.id === 'object' ? props.controller.loadProject(template) ?? starter.value : starter.value
  active.value = challenge
  session.value = props.controller.challenges.open(challenge.id, props.controller.world, source)
  // Reusing a model is an explicit choice each time a practice session opens.
  game.value.setAi({ interpreter: null, aiMode: 'understand' })
  note.value = session.value.note
  reviewed.value = session.value.reviewed
  saveStatus.value = ''
  await nextTick()
  title.value?.focus()
}
function persist() {
  session.value.note = note.value
  session.value.reviewed = reviewed.value
  const saved = props.controller.challenges.persist(session.value)
  saveStatus.value = saved ? 'Practice position and notes saved in this browser.' : 'Kept for this visit. Browser storage is unavailable; a reload may lose this practice work.'
}
async function submit(line) {
  // A model unloaded in the lesson must not be used through an old reference.
  if (game.value.state.interpreter !== readyModel.value) game.value.setAi({ interpreter: null })
  await game.value.submit(line)
  persist()
}
async function inspect(id = game.value.state.turns.at(-1)?.id) {
  if (!id) return
  game.value.select(id)
  await nextTick()
  inspector.value?.focus()
}
function restart() { game.value.restart(); persist(); terminal.value?.focus() }
function editNote() { reviewed.value = false; persist() }
</script>

<template>
  <section class="challenges panel" aria-labelledby="challenges-title">
    <header>
      <h2 ref="menuTitle" tabindex="-1" id="challenges-title">Optional challenges</h2>
      <button type="button" class="chunky" :disabled="game?.state.busy" @click="$emit('back')">Back to my lesson</button>
    </header>
    <p>Have more time? Choose one challenge or combine them. You can leave at any time; these do not unlock or block lesson progress.</p>
    <div class="challenge-menu">
      <button v-for="challenge in CHALLENGES" :key="challenge.id" type="button" :disabled="game?.state.busy" :aria-pressed="active?.id === challenge.id" @click="open(challenge)">
        <strong>{{ challenge.title }}</strong><span>{{ challenge.duration }} · optional</span><span>{{ challenge.goal }}</span>
      </button>
    </div>
    <template v-if="active">
      <h3 ref="title" tabindex="-1">{{ active.title }}</h3>
      <ol><li v-for="step in active.steps" :key="step">{{ step }}</li></ol>
      <p class="scope">This is a separate practice copy. Your core lesson answers and object are preserved. Your practice position, edits, and notes are saved when you play or apply an edit; command history lasts for this visit.</p>
      <div class="practice-tools">
        <span>Practice AI: {{ game.state.interpreter && game.state.interpreter === readyModel ? 'using the lesson’s loaded model' : 'off' }}.</span>
        <button v-if="readyModel" type="button" :disabled="game.state.busy" @click="game.setAi({ interpreter: readyModel })">Use loaded lesson model</button>
        <span v-else>To try live AI, return to the lesson and choose a model there. The recorded route needs no model.</span>
        <button v-if="game.state.interpreter" type="button" :disabled="game.state.busy" @click="game.setAi({ interpreter: null })">Turn practice AI off</button>
        <button type="button" @click="terminal?.focus()">Command entry</button>
        <button type="button" :disabled="game.state.busy" @click="restart">Restart practice game</button>
        <button type="button" :disabled="!game.state.turns.length" @click="inspect()">Inspect latest command</button>
      </div>
      <details v-if="active.id === 'interpreter'" class="recordings">
        <summary>Use recorded examples instead</summary>
        <p>Recorded in Drift with Qwen2.5 1.5B on November 17, 2026. These historical captures do not respond to your new requests or change your practice game.</p>
        <article v-for="record in records" :key="record.id"><h4>{{ record.title }}</h4><pre>{{ record.recorded }}</pre><p>{{ record.question }}</p></article>
      </details>
      <div class="practice">
        <div class="game"><TerminalPane :key="session.key" ref="terminal" :log="game.state.log" :selected-turn-id="game.selectedTurn.value?.id" :busy="game.state.busy" @submit="submit" @select="inspect" @skip="game.skip" @restart="restart" :show-download="false" /></div>
        <AddThingForm v-if="active.id === 'object'" :key="session.key" :game="game" :starter="starter" :suggested-name="suggested" @applied="persist" />
        <ParserPanel :key="`inspector-${session.key}`" ref="inspector" :turn="game.selectedTurn.value" />
      </div>
      <label class="reflection">{{ active.reflection }}<textarea v-model="note" rows="3" maxlength="600" @input="editNote" placeholder="I predicted… I tried… I noticed…" /></label>
      <label class="self-check"><input v-model="reviewed" type="checkbox" @change="persist">I tried the challenge and can explain my evidence (self-check).</label>
      <p v-if="saveStatus" role="status">{{ saveStatus }}</p>
    </template>
  </section>
</template>

<style scoped>
.challenges { flex: 1; min-height: 0; overflow-y: auto; padding: 18px; line-height: 1.5; }
header { position: sticky; top: -18px; z-index: 2; background: var(--panel); padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 12px; } h2 { margin: 0; }
button, textarea { color: var(--fg); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 5px; padding: 8px; font: inherit; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
.challenge-menu { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.challenge-menu button { text-align: left; display: grid; gap: 6px; }
.challenge-menu button[aria-pressed=true] { border: 2px solid var(--accent); }
.challenge-menu span { font-size: 13px; }
.practice-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; margin: 12px 0; }
.scope { color: var(--fg-soft); font-size: 13px; }
.practice { display: grid; grid-template-columns: minmax(300px, 2fr) minmax(260px, 1fr); gap: 16px; }
.game { min-width: 0; height: 430px; } .game :deep(.terminal) { height: 100%; }
.practice :deep(.parser), .practice :deep(.add-thing) { max-height: 430px; overflow-y: auto; }
.reflection { display: grid; gap: 8px; margin: 18px 0 12px; } textarea { resize: vertical; }
.self-check { display: flex; gap: 8px; align-items: baseline; }
.recordings { margin: 12px 0; padding: 12px; background: var(--chip); } summary { cursor: pointer; }
pre { white-space: pre-wrap; font: inherit; }
@media (max-width: 900px) { .challenge-menu, .practice { grid-template-columns: 1fr; } }
</style>
