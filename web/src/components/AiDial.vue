<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  controller: { type: Object, required: true },
  dial: { type: Object, required: true },
})

const labels = {
  off: 'Off — commands only',
  understand: 'Understand — the AI turns your words into commands',
  fill_gaps: "Fill gaps — the AI writes when you didn't",
  improvise: 'Improvise characters — the AI talks beyond your lines',
  invent: 'Invent events — the AI decides what happens',
}

const setting = ref(props.dial.default)
const tone = ref('cozy')
const theme = ref('')
const reason = ref('')
const saved = ref(false)

watch(() => props.dial, dial => {
  setting.value = dial.default
  saved.value = false
})

function save() {
  props.controller.recordUiEvent('ai_dial_set', setting.value)
  saved.value = true
}
</script>

<template>
  <section class="dial" aria-labelledby="ai-dial-title">
    <h3 id="ai-dial-title">AI dial</h3>
    <label v-for="option in dial.settings" :key="option" class="setting" :class="{ locked: dial.locked.includes(option) }">
      <input v-model="setting" type="radio" :value="option" :disabled="dial.locked.includes(option)">
      <span>{{ labels[option] }}</span>
    </label>
    <p v-if="dial.locked.length" class="locked-note">
      <strong>Why is this locked?</strong> Inventing events can change the story without the player or author choosing.
    </p>
    <p class="prototype-note">Fill gaps and Improvise are not built yet. In this prototype, they behave like Understand.</p>
    <label class="field">
      Tone
      <select v-model="tone">
        <option value="cozy">Cozy</option>
        <option value="eerie">Eerie</option>
        <option value="funny">Funny</option>
        <option value="tense">Tense</option>
        <option value="hopeful">Hopeful</option>
      </select>
    </label>
    <label class="field">
      Theme
      <input v-model="theme" type="text" maxlength="80" placeholder="What is the story about?">
    </label>
    <label class="field">
      Reason
      <input v-model="reason" type="text" maxlength="120" placeholder="Why does this setting fit?">
    </label>
    <button type="button" @click="save">Save my setting</button>
    <span v-if="saved" class="saved" role="status">Saved.</span>
  </section>
</template>

<style scoped>
.dial { border-top: 1px solid var(--line); padding-top: 12px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.setting { display: flex; align-items: flex-start; gap: 7px; margin: 7px 0; font-size: 12.5px; line-height: 1.35; }
.setting input { margin-top: 2px; }
.setting.locked { color: var(--muted); }
.locked-note, .prototype-note { margin: 8px 0; padding: 8px; border-radius: 7px; font-size: 11.5px; line-height: 1.4; }
.locked-note { background: var(--warn-soft); }
.prototype-note { background: var(--chip); color: var(--fg-soft); }
.field { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.field select, .field input {
  min-width: 0;
  font: inherit;
  font-size: 13px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  padding: 6px 8px;
  text-transform: none;
  letter-spacing: normal;
}
button { margin-top: 10px; border: 0; border-radius: 7px; padding: 7px 10px; background: var(--accent); color: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.saved { margin-left: 8px; color: var(--good); font-size: 12px; }
</style>
