<script setup>
import { ref } from 'vue'

const props = defineProps({ controller: { type: Object, required: true } })
const dialog = ref(null)
const error = ref('')

function open() {
  error.value = ''
  dialog.value.showModal()
}

function reset() {
  try {
    const firstLevel = props.controller.clearSavedLesson()
    // replaceState avoids a hashchange saving old progress before the reload.
    window.history.replaceState(null, '', firstLevel)
    window.location.reload()
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <button type="button" class="reset-lesson" @click="open">Reset lesson</button>
  <dialog ref="dialog" aria-labelledby="reset-lesson-title" aria-describedby="reset-lesson-description">
    <h2 id="reset-lesson-title">Start a fresh lesson?</h2>
    <p id="reset-lesson-description">
      This clears your lesson answers, progress, AI settings, authored objects, and optional challenge work in every world,
      then reloads at Level 1. This cannot be undone.
    </p>
    <p>Current game sessions restart too. Downloaded models and named saved games are kept. Choose a model again when you need it.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button type="button" autofocus @click="dialog.close()">Cancel</button>
      <button type="button" class="danger" @click="reset">Clear lesson and restart</button>
    </div>
  </dialog>
</template>

<style scoped>
button { font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.reset-lesson { font-size: 12px; }
dialog { color: var(--fg); background: var(--panel); border: 2px solid var(--edge); border-radius: 10px; max-width: min(460px, calc(100vw - 32px)); padding: 20px; }
dialog::backdrop { background: rgb(0 0 0 / 55%); }
h2 { margin: 0 0 12px; font-size: 22px; }
p { line-height: 1.5; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.danger { background: var(--bad); border-color: var(--bad); color: white; }
.error { color: var(--bad); }
</style>
