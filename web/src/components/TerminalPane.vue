<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  log: { type: Array, required: true },
  selectedTurnId: { type: Number, default: null },
  busy: Boolean,
})
const emit = defineEmits(['submit', 'select', 'skip', 'restart'])

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

function scrollToEnd() {
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
}

watch(() => props.log.length, async () => {
  await nextTick()
  scrollToEnd()
})

defineExpose({ focus: () => field.value?.focus(), scrollToEnd })
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
        <button
          v-else-if="entry.kind === 'restart'"
          type="button"
          class="line play-again"
          @click="emit('restart')"
        >▶ {{ entry.text }}</button>
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
        enterkeyhint="send"
        aria-label="Command"
        @keydown.up.prevent="recall(-1)"
        @keydown.down.prevent="recall(1)"
        @keydown.esc.prevent="emit('skip')"
      />
      <button v-if="busy" type="button" class="working" aria-live="polite" @click="emit('skip')">
        processing… <span class="keys"><kbd>Esc</kbd> to skip</span><span class="touch">tap to skip</span>
      </button>
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
.echo { color: var(--crt-dim); margin-bottom: 0.3em; }
button.play-again {
  font: inherit;
  color: var(--crt-bg);
  background: var(--crt-bright);
  border: 0;
  border-radius: 4px;
  padding: 0.2em 0.9em;
  cursor: pointer;
  text-shadow: none;
}
button.play-again:hover { background: var(--crt-fg); }
button.play-again:focus-visible { outline: 2px solid var(--crt-bright); outline-offset: 3px; }
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
.working {
  font: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--crt-dim);
  font-size: 0.85em;
  white-space: nowrap;
  animation: blink 1.2s steps(2, start) infinite;
}
.working kbd {
  font: inherit;
  border: 1px solid var(--crt-dim);
  border-radius: 3px;
  padding: 0 0.3em;
}
@keyframes blink { to { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .working { animation: none; } }
.prompt input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--crt-bright);
  font: inherit;
  caret-color: var(--crt-bright);
  text-shadow: 0 0 6px var(--crt-glow);
  outline: none;
}
.touch { display: none; }
/* Touch screens have no Esc key, so the hint says to tap instead. */
@media (hover: none) {
  .keys { display: none; }
  .touch { display: inline; }
  .working { padding: 0.5em 0; }
}
@media (max-width: 700px), (max-height: 500px) {
  .terminal { font-size: 15px; border-radius: 10px; }
  .screen { padding: 0.9em 0.9em 0.3em; }
  .prompt { padding: 0.5em 0.9em 0.7em; }
  /* Under 16px, phones zoom the page in when the field is tapped. */
  .prompt input { font-size: 16px; min-height: 32px; }
}
</style>
