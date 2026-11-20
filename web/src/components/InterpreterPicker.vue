<script setup>
// Chooses the interpreter. Off by default: a model is a large download, so it is
// only fetched when someone picks one here. Cached models load without fetching.
import { onMounted, reactive } from 'vue'
import { MODELS, webgpuProblem } from '../llm/models.js'

// The WebLLM runtime is a large module; fetch it only once WebGPU is confirmed.
const llm = () => import('../llm/webllm.js')

const props = defineProps({
  game: { type: Object, required: true },
  // In the lesson the menu has to be found by a student who has never seen it,
  // so it calls for attention until a model is chosen.
  attention: Boolean,
})

const ui = reactive({
  choice: 'off',
  status: 'off',        // off | loading | ready | error | unsupported
  progress: 0,
  text: '',
  cached: {},           // model id -> true when already downloaded
  problem: null,
})

onMounted(async () => {
  ui.problem = await webgpuProblem()
  if (ui.problem) ui.status = 'unsupported'
})

// Which models are already downloaded is only worth asking once someone opens
// the menu — asking needs the WebLLM runtime.
let checkedCache = false
async function checkCache() {
  if (checkedCache || ui.problem) return
  checkedCache = true
  const { buildFor, isCached } = await llm()
  for (const model of MODELS) ui.cached[model.id] = await isCached(await buildFor(model))
}

let current = null

async function choose() {
  const model = MODELS.find(m => m.id === ui.choice)
  props.game.setAi({ interpreter: null })
  const previous = current
  current = null
  await previous?.unload()
  if (!model) {
    ui.status = 'off'
    return
  }

  ui.status = 'loading'
  ui.progress = 0
  ui.text = ui.cached[model.id] ? 'Loading from this browser’s cache…' : `Downloading ${model.size}…`
  const { WebLLMInterpreter, buildFor } = await llm()
  const interpreter = new WebLLMInterpreter(model, await buildFor(model))
  current = interpreter
  try {
    await interpreter.load(report => {
      if (current !== interpreter) return
      ui.progress = report.progress
      ui.text = report.text
    })
  } catch (err) {
    if (current !== interpreter) return
    ui.status = 'error'
    ui.text = String(err?.message ?? err)
    ui.choice = 'off'
    current = null
    return
  }
  if (current !== interpreter) return interpreter.unload()
  ui.cached[model.id] = true
  ui.status = 'ready'
  props.game.setAi({ interpreter })
}
</script>

<template>
  <div class="picker" :class="[ui.status, { attention: attention && ui.status === 'off' }]">
    <label>
      <svg class="robot" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" shape-rendering="crispEdges">
        <rect x="7" y="0" width="2" height="3" />
        <rect x="2" y="3" width="12" height="10" />
        <rect class="face" x="4" y="5" width="3" height="3" />
        <rect class="face" x="9" y="5" width="3" height="3" />
        <rect class="face" x="5" y="10" width="6" height="1" />
        <rect x="0" y="6" width="2" height="4" />
        <rect x="14" y="6" width="2" height="4" />
        <rect x="4" y="13" width="3" height="3" />
        <rect x="9" y="13" width="3" height="3" />
      </svg>
      <span class="name">AI Interpreter</span>
      <select
        v-model="ui.choice" :disabled="ui.status === 'unsupported'"
        @focus="checkCache" @pointerdown="checkCache" @change="choose"
      >
        <option value="off">Off: no AI</option>
        <option v-for="m in MODELS" :key="m.id" :value="m.id">
          {{ m.label }} · {{ ui.cached[m.id] ? 'downloaded' : m.size }} · {{ m.note }}
        </option>
      </select>
    </label>
    <span v-if="ui.status === 'loading'" class="status" :title="ui.text">
      <span class="bar"><span :style="{ width: `${Math.round(ui.progress * 100)}%` }"></span></span>
      {{ Math.round(ui.progress * 100) }}%
    </span>
    <span v-else-if="ui.status === 'ready'" class="status ok">✓ ready</span>
    <span v-else-if="attention && ui.status === 'off'" class="status nudge">← pick a model</span>
    <span v-else-if="ui.status === 'error'" class="status bad" :title="ui.text">failed to load</span>
    <span v-else-if="ui.status === 'unsupported'" class="status bad" :title="ui.problem">no WebGPU</span>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 4px 8px;
  border: 2px solid var(--edge);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow-small);
  font-size: 13px;
  color: var(--fg);
}
label { display: flex; align-items: center; gap: 8px; }
.name { font-family: var(--display); font-size: 15px; font-weight: 700; white-space: nowrap; }
.robot { flex: none; fill: var(--muted); }
.robot .face { fill: var(--panel); }
.picker.ready .robot { fill: var(--accent); }
.picker.loading .robot { fill: var(--warn); }
select {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 2px solid var(--line-strong);
  border-radius: 6px;
  padding: 3px 6px;
  max-width: 300px;
}
select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* Until a model is chosen in the lesson, the menu is the thing to find. */
.picker.attention { background: var(--hi); color: var(--on-hi); animation: call 1.6s ease-in-out infinite; }
.picker.attention .robot { fill: var(--on-hi); }
.picker.attention .robot .face { fill: var(--hi); }
.status.nudge { font-family: var(--display); font-weight: 700; color: var(--on-hi); white-space: nowrap; }
@keyframes call {
  0%, 100% { box-shadow: var(--shadow-small); transform: none; }
  50% { box-shadow: 4px 4px 0 var(--ink); transform: translate(-2px, -2px); }
}
@media (prefers-reduced-motion: reduce) {
  .picker.attention { animation: none; }
}
.status { font-family: var(--mono); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.status.ok { color: var(--good); }
.status.bad { color: var(--bad); cursor: help; }
.bar { width: 90px; height: 6px; border-radius: 3px; background: var(--chip); border: 1px solid var(--line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
</style>
