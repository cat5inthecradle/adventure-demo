<script setup>
// Chooses the interpreter. Off by default: a model is a large download, so it is
// only fetched when someone picks one here. Cached models load without fetching.
import { markRaw, onMounted, reactive } from 'vue'
import { MODELS, webgpuProblem } from '../llm/models.js'

// The WebLLM runtime is a large module; fetch it only once WebGPU is confirmed.
const llm = () => import('../llm/webllm.js')

const props = defineProps({ game: { type: Object, required: true } })

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
  props.game.state.interpreter = null
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
  props.game.state.interpreter = markRaw(interpreter)
}
</script>

<template>
  <div class="picker">
    <label>
      Interpreter
      <select
        v-model="ui.choice" :disabled="ui.status === 'unsupported'"
        @focus="checkCache" @pointerdown="checkCache" @change="choose"
      >
        <option value="off">off — parser only</option>
        <option v-for="m in MODELS" :key="m.id" :value="m.id">
          {{ m.label }} · {{ ui.cached[m.id] ? 'downloaded' : m.size }} · {{ m.note }}
        </option>
      </select>
    </label>
    <span v-if="ui.status === 'loading'" class="status" :title="ui.text">
      <span class="bar"><span :style="{ width: `${Math.round(ui.progress * 100)}%` }"></span></span>
      {{ Math.round(ui.progress * 100) }}%
    </span>
    <span v-else-if="ui.status === 'ready'" class="status ok">ready</span>
    <span v-else-if="ui.status === 'error'" class="status bad" :title="ui.text">failed to load</span>
    <span v-else-if="ui.status === 'unsupported'" class="status bad" :title="ui.problem">no WebGPU</span>
  </div>
</template>

<style scoped>
.picker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
label { display: flex; align-items: center; gap: 6px; }
select {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 2px 4px;
  max-width: 300px;
}
.status { font-family: var(--mono); display: flex; align-items: center; gap: 6px; }
.status.ok { color: var(--good); }
.status.bad { color: var(--bad); cursor: help; }
.bar { width: 90px; height: 6px; border-radius: 3px; background: var(--chip); border: 1px solid var(--line); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
</style>
