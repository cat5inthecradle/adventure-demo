<script setup>
// One chat prompt, laid out to be read: the system message, any worked-example
// turns as a compact table, and the final message that carries the live scene.
import { computed } from 'vue'

const props = defineProps({ messages: { type: Array, required: true } })

const system = computed(() => props.messages.find(m => m.role === 'system'))
const final = computed(() => props.messages.at(-1))
// Everything between the system message and the final one comes in user/assistant pairs.
const demos = computed(() => {
  const middle = props.messages.slice(system.value ? 1 : 0, -1)
  const pairs = []
  for (let i = 0; i + 1 < middle.length; i += 2) {
    const said = middle[i].content.match(/Player says: "(.*)"/)?.[1] ?? middle[i].content
    const preamble = middle[i].content.split('Player says:')[0].trim()
    pairs.push({ said, answer: middle[i + 1].content, preamble })
  }
  return pairs
})
const demoScene = computed(() => demos.value.find(d => d.preamble)?.preamble ?? '')
const chars = computed(() => props.messages.reduce((n, m) => n + m.content.length, 0))
</script>

<template>
  <div class="prompt">
    <p class="muted small">
      {{ messages.length }} messages · {{ chars.toLocaleString() }} characters (≈ {{ Math.round(chars / 4).toLocaleString() }} tokens)
    </p>

    <div v-if="system" class="msg">
      <div class="role">system</div>
      <pre>{{ system.content }}</pre>
    </div>

    <div v-if="demos.length" class="msg">
      <div class="role">worked examples · {{ demos.length }} user / assistant turns</div>
      <pre v-if="demoScene" class="scene">{{ demoScene }}</pre>
      <table>
        <tr v-for="(d, i) in demos" :key="i">
          <td class="said">“{{ d.said }}”</td>
          <td><code>{{ d.answer }}</code></td>
        </tr>
      </table>
    </div>

    <div class="msg final">
      <div class="role">{{ final.role }} · the live scene</div>
      <pre>{{ final.content }}</pre>
    </div>
  </div>
</template>

<style scoped>
.prompt { display: flex; flex-direction: column; gap: 8px; }
.msg { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px 8px; background: var(--panel); }
.msg.final { border-color: var(--accent); }
.role { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
pre { font-family: var(--mono); font-size: 12px; white-space: pre-wrap; margin: 0; }
pre.scene { background: var(--chip); padding: 6px 8px; border-radius: 6px; margin-bottom: 6px; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
td { padding: 2px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
td.said { white-space: nowrap; color: var(--fg-soft); }
code { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
.small { font-size: 11.5px; margin: 0; }
</style>
