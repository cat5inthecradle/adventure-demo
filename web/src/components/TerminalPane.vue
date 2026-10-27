<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const CHARACTERS_PER_MS = 1.2

const props = defineProps({
  log: { type: Array, required: true },
  selectedTurnId: { type: Number, default: null },
  nudgeTurnId: { type: Number, default: null },
  busy: Boolean,
})
const emit = defineEmits(['submit', 'select', 'skip', 'restart'])

const input = ref('')
const field = ref(null)
const scroller = ref(null)
const history = []
const shownText = reactive(new Map())
let historyIndex = 0
let mounted = false
let reducedMotion = false
let motionQuery = null
let observedLog = props.log
let knownIds = new Set(props.log.map(entry => entry.id))
let typingQueue = []
let activeTyping = null
let animationFrame = null
let resetPending = false
let fastForwardUntilIdle = false

for (const entry of props.log) shownText.set(entry.id, entry.text)

function send() {
  finishTyping()
  fastForwardUntilIdle = props.busy
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

function displayedText(entry) {
  return shownText.get(entry.id) ?? entry.text
}

function stopAnimation() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
  activeTyping = null
  typingQueue = []
}

function showLogImmediately() {
  stopAnimation()
  shownText.clear()
  for (const entry of props.log) shownText.set(entry.id, entry.text)
  knownIds = new Set(props.log.map(entry => entry.id))
  observedLog = props.log
  nextTick(scrollToEnd)
}

function finishTyping() {
  stopAnimation()
  for (const entry of props.log) shownText.set(entry.id, entry.text)
  nextTick(scrollToEnd)
}

function typeFrame(timestamp) {
  if (!activeTyping) return
  if (activeTyping.lastTimestamp === null) activeTyping.lastTimestamp = timestamp
  const elapsed = timestamp - activeTyping.lastTimestamp
  activeTyping.lastTimestamp = timestamp
  activeTyping.characters += elapsed * CHARACTERS_PER_MS

  const count = Math.min(activeTyping.text.length, Math.floor(activeTyping.characters))
  shownText.set(activeTyping.id, activeTyping.text.slice(0, count))
  nextTick(scrollToEnd)

  if (count >= activeTyping.text.length) {
    activeTyping = null
    animationFrame = null
    startTyping()
    return
  }
  animationFrame = requestAnimationFrame(typeFrame)
}

function startTyping() {
  if (activeTyping || reducedMotion || fastForwardUntilIdle) return
  const nextId = typingQueue.shift()
  if (nextId === undefined) return
  const entry = props.log.find(item => item.id === nextId)
  if (!entry) {
    startTyping()
    return
  }
  activeTyping = {
    id: entry.id,
    text: entry.text,
    characters: 0,
    lastTimestamp: null,
  }
  animationFrame = requestAnimationFrame(typeFrame)
}

function skip() {
  finishTyping()
  fastForwardUntilIdle = props.busy
  emit('skip')
}

function setReducedMotion(event) {
  reducedMotion = event.matches
  if (reducedMotion) finishTyping()
}

watch(() => props.log.map(entry => [entry.id, entry.kind, entry.text]), () => {
  if (!mounted) return

  const entries = props.log
  const nextIds = new Set(entries.map(entry => entry.id))
  const replaced = props.log !== observedLog
  const allEntriesReplaced = knownIds.size > 0
    && entries.length > 0
    && !entries.some(entry => knownIds.has(entry.id))

  if (replaced || resetPending || allEntriesReplaced) {
    resetPending = false
    showLogImmediately()
    return
  }

  if (entries.length === 0 && knownIds.size > 0) {
    resetPending = true
    showLogImmediately()
    return
  }

  for (const id of shownText.keys()) {
    if (!nextIds.has(id)) shownText.delete(id)
  }

  for (const entry of entries) {
    if (knownIds.has(entry.id)) continue
    if (entry.kind === 'input' || reducedMotion || fastForwardUntilIdle) {
      shownText.set(entry.id, entry.text)
    } else {
      shownText.set(entry.id, '')
      typingQueue.push(entry.id)
    }
  }

  knownIds = nextIds
  observedLog = props.log
  startTyping()
  nextTick(scrollToEnd)
})

watch(() => props.busy, busy => {
  if (!busy) nextTick(() => { fastForwardUntilIdle = false })
  nextTick(scrollToEnd)
})

onMounted(() => {
  mounted = true
  showLogImmediately()
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionQuery.matches
  motionQuery.addEventListener('change', setReducedMotion)
})

onBeforeUnmount(() => {
  stopAnimation()
  motionQuery?.removeEventListener('change', setReducedMotion)
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
          :class="{
            selected: entry.turnId === selectedTurnId,
            nudge: entry.turnId === nudgeTurnId,
          }"
          :title="'Inspect how this was understood'"
          @click="emit('select', entry.turnId)"
        >{{ entry.text }}</button>
        <button
          v-else-if="entry.kind === 'restart'"
          type="button"
          class="line play-again"
          @click="emit('restart')"
        >
          <span aria-hidden="true">▶ {{ displayedText(entry) }}</span>
          <span class="visually-hidden">{{ entry.text }}</span>
        </button>
        <p v-else class="line" :class="entry.kind">
          <template v-if="entry.kind === 'input'">{{ entry.text }}</template>
          <template v-else>
            <span aria-hidden="true">{{ displayedText(entry) }}</span>
            <span class="visually-hidden">{{ entry.text }}</span>
          </template>
        </p>
      </template>
      <button v-if="busy" type="button" class="line pending" @click="skip">
        <span>processing…</span><span class="pending-cursor" aria-hidden="true">▌</span>
        <span class="pending-hint keys"><kbd>Esc</kbd> to skip</span>
        <span class="pending-hint touch">tap to skip</span>
      </button>
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
        @keydown.esc.prevent="skip"
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
button.clickable.nudge {
  animation: nudge 1.2s ease-in-out infinite;
}
.pending {
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--crt-fg);
  font: inherit;
  text-align: left;
  text-shadow: inherit;
  cursor: pointer;
}
.pending-cursor {
  color: var(--crt-bright);
  animation: blink 1.2s steps(2, start) infinite;
}
.pending-hint {
  margin-left: 0.8em;
  color: var(--crt-dim);
  font-size: 0.85em;
}
.pending kbd {
  font: inherit;
  border: 1px solid var(--crt-dim);
  border-radius: 3px;
  padding: 0 0.3em;
}
.pending:focus-visible { outline: 2px solid var(--crt-bright); outline-offset: 3px; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.prompt {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.6em 1.4em 1em;
  border-top: 1px solid var(--crt-edge);
}
.prompt-mark { color: var(--crt-bright); }
@keyframes blink { to { opacity: 0.45; } }
@keyframes nudge {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--crt-dim), 0 0 2px transparent; }
  50% { box-shadow: inset 0 0 0 1px var(--crt-bright), 0 0 10px var(--crt-glow); }
}
@media (prefers-reduced-motion: reduce) {
  .pending-cursor { animation: none; }
  button.clickable.nudge {
    animation: none;
    box-shadow: inset 0 0 0 1px var(--crt-bright), 0 0 6px var(--crt-glow);
  }
}
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
  .pending { padding: 0.5em 0; }
}
@media (max-width: 700px), (max-height: 500px) {
  .terminal { font-size: 15px; border-radius: 10px; }
  .screen { padding: 0.9em 0.9em 0.3em; }
  .prompt { padding: 0.5em 0.9em 0.7em; }
  /* Under 16px, phones zoom the page in when the field is tapped. */
  .prompt input { font-size: 16px; min-height: 32px; }
}
</style>
