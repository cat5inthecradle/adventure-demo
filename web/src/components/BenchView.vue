<script setup>
// Runs every natural-language case through a real in-browser model and scores it.
// Needs WebGPU, which is why this is a page and not a unit test.
//
// #bench?model=Qwen2.5-1.5B-Instruct&prompt=v3&run=1 starts on its own, and the
// finished report is also left on window.__bench for scripted runs.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MODELS, webgpuProblem } from '../llm/models.js'
import { DEFAULT_PROMPT, PROMPT_LABELS, PROMPTS } from '../llm/prompts.js'
import { CASES, contextFor, runCase } from '../bench/cases.js'
import PromptMessages from './PromptMessages.vue'

const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
const ui = reactive({
  model: params.get('model') ?? MODELS.at(-1).id,
  prompt: params.get('prompt') ?? 'best',     // 'best' = the model's own default
  status: 'idle',         // idle | loading | running | done | error
  progress: 0,
  message: '',
  results: [],
  buildId: null,
  used: null,             // the prompt version actually run
})

// --- prompt inspector ------------------------------------------------------------
// Builds the exact messages a model would be sent for any case, with no model
// loaded — the prompt is a pure function of the scene and the player's words.
const promptVersion = computed(() => (ui.prompt === 'best'
  ? MODELS.find(m => m.id === ui.model)?.prompt ?? DEFAULT_PROMPT
  : ui.prompt))
const inspectCase = ref(CASES[0].id)
const inspected = ref(null)
watch([promptVersion, inspectCase], async () => {
  const testCase = CASES.find(c => c.id === inspectCase.value)
  const { context, transcript } = await contextFor(testCase)
  inspected.value = PROMPTS[promptVersion.value](testCase.say, context, transcript)
}, { immediate: true })

const open = reactive({})   // result id -> expanded

const passed = computed(() => ui.results.filter(r => r.pass).length)
const score = computed(() => (ui.results.length ? Math.round((100 * passed.value) / ui.results.length) : 0))
const medianMs = computed(() => {
  const ms = ui.results.map(r => r.ms).sort((a, b) => a - b)
  return ms.length ? ms[Math.floor(ms.length / 2)] : 0
})

function report() {
  return {
    model: ui.buildId,
    prompt: ui.used,
    cases: ui.results.length,
    passed: passed.value,
    score: score.value,
    medianMs: medianMs.value,
    failures: ui.results.filter(r => !r.pass),
    results: ui.results,
  }
}

async function run() {
  const problem = await webgpuProblem()
  if (problem) {
    ui.status = 'error'
    ui.message = problem
    return
  }
  ui.results = []
  ui.status = 'loading'
  const { WebLLMInterpreter, buildFor } = await import('../llm/webllm.js')
  const model = MODELS.find(m => m.id === ui.model)
  ui.buildId = await buildFor(model)
  const interpreter = new WebLLMInterpreter(model, ui.buildId, ui.prompt === 'best' ? undefined : ui.prompt)
  ui.used = interpreter.prompt
  try {
    await interpreter.load(r => { ui.progress = r.progress; ui.message = r.text })
    ui.status = 'running'
    for (const [n, testCase] of CASES.entries()) {
      ui.message = `${n + 1} / ${CASES.length}: ${testCase.say}`
      ui.results.push(await runCase(testCase, interpreter))
    }
    ui.status = 'done'
    ui.message = ''
    window.__bench = report()
  } catch (err) {
    ui.status = 'error'
    ui.message = String(err?.message ?? err)
  } finally {
    await interpreter.unload()
  }
}

async function copy() {
  await navigator.clipboard.writeText(JSON.stringify(report(), null, 2))
  ui.message = 'Copied.'
}

onMounted(() => { if (params.get('run')) run() })
</script>

<template>
  <section class="bench panel">
    <header>
      <h2>Interpreter benchmark</h2>
      <p class="muted">
        {{ CASES.length }} sentences the parser cannot understand, each played from a real game state
        and scored against the answers that count as right. Cases live in
        <code>tests/fixtures/nl_cases.json</code>.
      </p>
      <div class="controls">
        <select v-model="ui.model" :disabled="ui.status === 'loading' || ui.status === 'running'">
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }} · {{ m.size }}</option>
        </select>
        <select v-model="ui.prompt" :disabled="ui.status === 'loading' || ui.status === 'running'">
          <option value="best">prompt: this model's best ({{ MODELS.find(m => m.id === ui.model)?.prompt }})</option>
          <option v-for="(label, v) in PROMPT_LABELS" :key="v" :value="v">prompt {{ label }}</option>
        </select>
        <button type="button" :disabled="ui.status === 'loading' || ui.status === 'running'" @click="run">Run</button>
        <button type="button" :disabled="!ui.results.length" @click="copy">Copy results as JSON</button>
        <span v-if="ui.status === 'loading'" class="muted">loading {{ Math.round(ui.progress * 100) }}%</span>
        <span class="muted">{{ ui.message }}</span>
      </div>
      <p v-if="ui.results.length" class="score" :data-status="ui.status">
        <strong>{{ passed }} / {{ ui.results.length }}</strong> ({{ score }}%) · median {{ medianMs }} ms · {{ ui.buildId }} · prompt {{ ui.used }}
      </p>
    </header>

    <details class="inspector">
      <summary>Inspect prompt {{ PROMPT_LABELS[promptVersion] }}</summary>
      <div class="inspector-body">
        <label class="muted small">
          Built for case
          <select v-model="inspectCase">
            <option v-for="c in CASES" :key="c.id" :value="c.id">{{ c.id }} — “{{ c.say }}”</option>
          </select>
        </label>
        <PromptMessages v-if="inspected" :messages="inspected" />
      </div>
    </details>

    <table v-if="ui.results.length">
      <thead>
        <tr><th></th><th>case</th><th>player says</th><th>expected</th><th>got</th><th>ms</th></tr>
      </thead>
      <tbody>
        <template v-for="r in ui.results" :key="r.id">
          <tr
            :class="[r.pass ? 'pass' : 'fail', 'row']" tabindex="0" :aria-expanded="!!open[r.id]"
            title="Show what the model was sent and what it said"
            @click="open[r.id] = !open[r.id]" @keydown.enter="open[r.id] = !open[r.id]"
          >
            <td>{{ r.pass ? '✓' : '✗' }}</td>
            <td><code>{{ r.id }}</code></td>
            <td>{{ r.say }}</td>
            <td><code>{{ r.expected }}</code></td>
            <td><code>{{ r.got }}</code></td>
            <td class="num">{{ r.ms }}</td>
          </tr>
          <tr v-if="open[r.id]" class="detail">
            <td colspan="6">
              <div class="reply">
                <div><span class="muted small">model replied</span> <code>{{ r.raw ?? '—' }}</code></div>
                <div v-if="r.reread">
                  <span class="muted small">parser re-read “{{ r.reread.text }}”</span>
                  <span class="small">{{ r.reread.used ? '— and its reading was used' : '— words it did not know, so the model’s command stood' }}</span>
                </div>
              </div>
              <PromptMessages v-if="r.messages" :messages="r.messages" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.bench { flex: 1; height: 100%; overflow-y: auto; padding: 12px 16px; }
h2 { font-size: 16px; margin: 0 0 4px; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
select, button {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 4px 10px;
}
button { cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.score { font-size: 15px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
code { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
tr.pass td:first-child { color: var(--good); }
tr.fail td:first-child { color: var(--bad); font-weight: 700; }
tr.fail { background: var(--bad-soft); }
.num { text-align: right; font-family: var(--mono); }
tr.row { cursor: pointer; }
tr.row:hover td { background: var(--chip); }
tr.detail td { background: var(--bg); padding: 10px 12px 14px; }
.reply { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.small { font-size: 11.5px; }
.inspector { margin: 4px 0 14px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
.inspector summary { cursor: pointer; font-weight: 600; font-size: 13px; }
.inspector-body { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.inspector-body select { max-width: 100%; font-size: 12px; }
</style>
