<script setup>
import { computed, ref, watch } from 'vue'
import { DIAL } from '../lesson/dial.js'

const props = defineProps({
  controller: { type: Object, required: true },
  dial: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})

const labels = Object.fromEntries(Object.entries(DIAL)
  .map(([key, { name, meaning }]) => [key, `${name} — ${meaning}`]))

const reason = ref(props.controller.dialSaved?.reason ?? '')
const problem = ref('')
const saved = ref(false)

const setting = computed({
  get() {
    props.revision
    return props.controller.dial.setting
  },
  set(value) {
    props.controller.setDial({ setting: value })
    saved.value = false
  },
})
const tone = computed({
  get() {
    props.revision
    return props.controller.dial.tone ?? ''
  },
  set(value) {
    props.controller.setDial({ setting: setting.value, tone: value || null })
    saved.value = false
  },
})
const theme = computed({
  get() {
    props.revision
    return props.controller.dial.theme ?? ''
  },
  set(value) {
    props.controller.setDial({ setting: setting.value, theme: value || null })
    saved.value = false
  },
})
const needsModel = computed(() => {
  props.revision
  return setting.value !== 'off' && props.controller.interpreter == null
})

watch(() => props.dial, () => {
  saved.value = false
})

function save() {
  problem.value = ''
  try {
    props.controller.saveDialChoice(reason.value)
    saved.value = true
  } catch (err) {
    problem.value = err.message
  }
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
    <p v-if="needsModel" class="model-note">AI can't do anything until you choose a model in the menu at the top right.</p>
    <label class="field">
      Tone
      <select v-model="tone">
        <option value="">Any</option>
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
      <input v-model="reason" type="text" maxlength="120" placeholder="Why does this setting fit?" @input="saved = false">
    </label>
    <button type="button" class="chunky" @click="save">Save my setting</button>
    <span v-if="saved" class="saved" role="status">Saved.</span>
    <p v-else-if="problem" class="model-note" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped>
.dial { min-height: 0; }
h3 { margin: 0 0 8px; font-size: 16px; }
.setting { display: flex; align-items: flex-start; gap: 7px; margin: 7px 0; font-size: 12.5px; line-height: 1.35; }
.setting input { margin-top: 2px; }
.setting.locked { color: var(--muted); }
.locked-note, .prototype-note, .model-note { margin: 8px 0; padding: 8px; border-radius: 7px; font-size: 11.5px; line-height: 1.4; }
.locked-note { background: var(--warn-soft); }
.prototype-note { background: var(--chip); color: var(--fg-soft); }
.model-note { background: var(--accent-soft); color: var(--fg-soft); }
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
button { margin-top: 10px; padding: 7px 12px; background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 700; cursor: pointer; }
.saved { margin-left: 8px; color: var(--good); font-size: 12px; }
</style>
