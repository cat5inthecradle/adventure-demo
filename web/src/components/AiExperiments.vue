<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ controller: Object, revision: Number, initialRoute: String })
defineEmits(['back'])
const route = ref(props.initialRoute ?? 'live')
const index = ref(0)
const observation = ref('')
const problem = ref('')
const drafts = {}
const tasks = computed(() => { props.revision; return props.controller.experimentTasks() })
const task = computed(() => tasks.value[index.value])
const saved = computed(() => { props.revision; return props.controller.experiments[props.controller.properties.id] ?? {} })
const evidence = computed(() => {
  props.revision
  return route.value === 'recorded' ? task.value.recorded : props.controller.liveEvidence(task.value.id)
})
function select(i) {
  if (task.value) drafts[task.value.id] = observation.value
  index.value = i
  observation.value = drafts[task.value.id] ?? saved.value[task.value.id]?.observation ?? ''
  problem.value = ''
}
function save() {
  try {
    props.controller.saveExperiment(task.value.id, route.value, observation.value)
    problem.value = ''
  } catch (err) { problem.value = err.message }
}
observation.value = saved.value[task.value.id]?.observation ?? ''
</script>

<template>
  <section class="experiments panel" aria-labelledby="experiments-title">
    <header><h2 id="experiments-title">Review experiments</h2><button class="chunky" @click="$emit('back')">Back to game and dial</button></header>
    <p>Predict what should happen, inspect the evidence, then explain what you noticed. You can mix live and recorded work.</p>
    <nav aria-label="Experiments">
      <button v-for="(item, i) in tasks" :key="item.id" :aria-current="index === i ? 'step' : undefined" @click="select(i)">
        {{ i + 1 }}. {{ item.title }}{{ saved[item.id] ? ' — saved' : '' }}
      </button>
    </nav>
    <h3>{{ task.title }}</h3>
    <label>Evidence to inspect
      <select v-model="route">
        <option value="live">My live attempts</option>
        <option value="recorded">Recorded example — no download</option>
      </select>
    </label>
    <p v-if="route === 'recorded'" class="source">Recorded in Drift with Qwen2.5 1.5B on November 17, 2026. This is a historical capture, not a live reply. It does not change your game. Your results may differ.</p>
    <pre v-if="evidence">{{ evidence }}</pre>
    <p v-else class="source">No matching live evidence yet. Try the commands in the instructions, then return here. If replies are unhelpful or the model is still loading, choose the recorded example above.</p>
    <p>{{ route === 'live' && ['interpret', 'boundary'].includes(task.id) ? 'What did your request produce? Inspect the reply and world changes. If it failed, explain what you could try next.' : task.question }}</p>
    <label>Your observation
      <textarea v-model="observation" maxlength="400" rows="3" placeholder="I noticed… The evidence is…" />
    </label>
    <button class="chunky" :disabled="!evidence" @click="save">Save observation</button>
    <p v-if="problem" role="alert">{{ problem }}</p>
    <p v-else-if="saved[task.id]" role="status">Saved from {{ saved[task.id].route === 'live' ? 'a live attempt' : 'a recorded example' }}: {{ saved[task.id].observation }}</p>
    <p v-if="controller.experimentsComplete()">All observations saved. {{ controller.properties.id === 9007 ? 'Your dial preference and reason are saved separately in the game view.' : 'You can continue to the next level.' }}</p>
  </section>
</template>

<style scoped>
.experiments { overflow-y: auto; padding: 20px; flex: 1; min-height: 0; line-height: 1.5; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { margin: 0; } h3 { margin-bottom: 10px; }
nav { display: flex; flex-wrap: wrap; gap: 8px; }
button, select, textarea { font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px; }
button { cursor: pointer; } button[aria-current] { border: 2px solid var(--accent); } button:disabled { opacity: .5; cursor: default; }
label { display: grid; gap: 5px; margin: 12px 0; max-width: 700px; }
pre { white-space: pre-wrap; font: inherit; background: var(--chip); padding: 14px; border-left: 3px solid var(--accent); }
.source { color: var(--fg-soft); font-size: 13px; }
textarea { resize: vertical; }
</style>
