<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { lessonHint } from '../lesson/hints.js'
const props = defineProps({ controller: Object, revision: Number })
const depth = ref(0)
const hintText = ref(null)
async function more() {
  depth.value++
  await nextTick()
  if (depth.value === 3 || !hint.value.command) hintText.value?.focus()
}
const hint = computed(() => { props.revision; return lessonHint(props.controller) })
watch(() => hint.value.key, () => { depth.value = 0 })
</script>

<template>
  <section class="lesson-hint" aria-label="Lesson help">
    <button type="button" :aria-expanded="depth > 0" @click="depth = depth ? 0 : 1">{{ depth ? 'Hide hint' : 'Need a hint?' }}</button>
    <div v-if="depth" ref="hintText" tabindex="-1" role="status">
      <p>{{ hint.goal }}</p>
      <p v-if="depth >= 2">{{ hint.clue }}</p>
      <p v-if="depth >= 3 && hint.command">Type <code>{{ hint.command }}</code>.</p>
    </div>
    <button v-if="depth === 1 || (depth === 2 && hint.command)" type="button" @click="more">{{ depth === 1 ? 'Give me a clue' : 'Show the next command' }}</button>
  </section>
</template>

<style scoped>
.lesson-hint { margin: 0 0 12px; padding: 9px; background: var(--accent-soft); border-radius: 6px; font-size: 13px; line-height: 1.5; }
button { font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line-strong); padding: 5px 8px; border-radius: 4px; cursor: pointer; }
p { margin: 8px 0; } code { font-family: var(--mono); }
</style>
