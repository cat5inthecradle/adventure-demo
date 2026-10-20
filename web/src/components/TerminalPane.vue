<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  log: { type: Array, required: true },
  selectedTurnId: { type: Number, default: null },
  busy: Boolean,
})
const emit = defineEmits(['submit', 'select'])

const input = ref('')
const field = ref(null)
const scroller = ref(null)
const history = []
let historyIndex = 0

function send() {
  const line = input.value
  if (line.trim()) history.push(line)
  historyIndex = history.length
  input.value = ''
  emit('submit', line)
}

function recall(step) {
  if (!history.length) return
  historyIndex = Math.max(0, Math.min(history.length, historyIndex + step))
  input.value = history[historyIndex] ?? ''
}

watch(() => props.log.length, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
})

defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <section class="terminal" aria-label="Game terminal" @click.self="field?.focus()">
    <div ref="scroller" class="screen" role="log" aria-live="polite" @click.self="field?.focus()">
      <template v-for="entry in log" :key="entry.id">
        <button
          v-if="entry.kind === 'input' && entry.turnId"
          type="button"
          class="line input clickable"
          :class="{ selected: entry.turnId === selectedTurnId }"
          :title="'Inspect how this was understood'"
          @click="emit('select', entry.turnId)"
        >{{ entry.text }}</button>
        <p v-else class="line" :class="entry.kind">{{ entry.text }}</p>
      </template>
    </div>
    <form class="prompt" @submit.prevent="send">
      <label for="command" class="prompt-mark">&gt;</label>
      <input
        id="command"
        ref="field"
        v-model="input"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="Command"
        @keydown.up.prevent="recall(-1)"
        @keydown.down.prevent="recall(1)"
      />
    </form>
  </section>
</template>

<style scoped>
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--crt-bg);
  border: 1px solid var(--crt-edge);
  border-radius: 14px;
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.6), 0 0 0 4px var(--bezel);
  color: var(--crt-fg);
  font-family: var(--mono);
  font-size: clamp(13px, 1.45vh, 17px);
  line-height: 1.5;
  overflow: hidden;
  position: relative;
}
.terminal::after {
  /* scanlines */
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0, 0, 0, 0.18) 2px 3px);
  border-radius: inherit;
}
.screen {
  flex: 1;
  overflow-y: auto;
  padding: 1.2em 1.4em 0.4em;
  text-shadow: 0 0 6px var(--crt-glow);
}
.line {
  margin: 0 0 0.9em;
  white-space: pre-wrap;
  display: block;
}
.title {
  color: var(--crt-bright);
  font-size: 1.4em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.input {
  color: var(--crt-bright);
  margin-bottom: 0.3em;
}
.system { color: var(--crt-dim); }
button.clickable {
  font: inherit;
  text-shadow: inherit;
  background: none;
  border: 0;
  padding: 0 0.3em;
  margin-left: -0.3em;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}
button.clickable:hover { background: rgba(255, 255, 255, 0.06); }
button.clickable.selected { background: var(--crt-select); }
button.clickable:focus-visible { outline: 2px solid var(--crt-bright); }
.prompt {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.6em 1.4em 1em;
  border-top: 1px solid var(--crt-edge);
}
.prompt-mark { color: var(--crt-bright); }
.prompt input {
  flex: 1;
  background: transparent;
  border: 0;
  color: var(--crt-bright);
  font: inherit;
  caret-color: var(--crt-bright);
  text-shadow: 0 0 6px var(--crt-glow);
  outline: none;
}
</style>
