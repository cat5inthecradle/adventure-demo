<script setup>
import { computed, ref, watch } from 'vue'
import { renderMarkdown } from '../lesson/markdown.js'
import AiDial from './AiDial.vue'

const props = defineProps({
  controller: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})

const finished = ref(false)
const level = computed(() => {
  props.revision
  return props.controller.level
})
const properties = computed(() => {
  props.revision
  return props.controller.properties
})
const progress = computed(() => {
  props.revision
  return props.controller.state()
})
const currentIndex = computed(() => level.value.levels.findIndex(candidate =>
  candidate.position === level.value.position
))
const previous = computed(() => level.value.levels[currentIndex.value - 1] ?? null)
const following = computed(() => level.value.levels[currentIndex.value + 1] ?? null)
const instructions = computed(() => renderMarkdown(properties.value.longInstructions))
const steps = computed(() => {
  props.revision
  return props.controller.steps().map(step => ({
    ...step,
    html: renderMarkdown(step.text),
  }))
})
const teacherNotes = computed(() => renderMarkdown(properties.value.teacherMarkdown))

watch(() => level.value.levelId, () => { finished.value = false })

function continueLesson() {
  const destination = props.controller.next()
  if (following.value && destination.to) {
    window.location.hash = destination.to
  } else if (!following.value) {
    finished.value = true
  } else if (destination.href) {
    window.location.href = destination.href
  }
}
</script>

<template>
  <aside class="panel instructions">
    <nav class="level-nav" aria-label="Lesson levels">
      <a v-if="previous" :href="previous.path" aria-label="Previous level">← Previous</a>
      <span v-else></span>
      <span class="position" aria-live="polite">Level {{ level.position }} of {{ level.totalLevels }}</span>
      <a v-if="following" :href="following.path" aria-label="Next level">Next →</a>
      <span v-else></span>
    </nav>

    <div class="scroll">
      <p class="progression">{{ level.progression }}</p>
      <h2>{{ properties.displayName }}</h2>
      <div class="markdown" v-html="instructions"></div>

      <ol v-if="steps.length" class="steps" aria-label="Level steps">
        <li v-for="(step, index) in steps" :key="index" :class="{ done: step.done }">
          <span
            class="step-marker"
            :class="{ checkable: step.checkable }"
            :aria-label="step.checkable ? (step.done ? 'Done' : 'Not done') : null"
          >{{ step.checkable ? (step.done ? '✓' : '') : index + 1 }}</span>
          <div class="markdown step-text" v-html="step.html"></div>
        </li>
      </ol>

      <AiDial
        v-if="properties.levelData.aiDial"
        :controller="controller"
        :dial="properties.levelData.aiDial"
      />

      <div v-if="progress.message" class="feedback" :class="{ success: progress.satisfied }" role="status">
        {{ progress.message }}
      </div>

      <p v-if="finished" class="finished" role="status">You finished the lesson.</p>
      <button
        v-else
        type="button"
        class="continue"
        :disabled="!controller.canContinue()"
        @click="continueLesson"
      >Continue</button>

      <details v-if="properties.teacherMarkdown" class="teachers">
        <summary>For teachers</summary>
        <div class="markdown" v-html="teacherNotes"></div>
      </details>
    </div>
  </aside>
</template>

<style scoped>
.instructions { width: 320px; flex: none; padding: 0; }
.level-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 11px; }
.level-nav a { color: var(--accent); text-decoration: none; }
.level-nav a:last-child { text-align: right; }
.position { color: var(--muted); }
.scroll { padding: 12px; overflow-y: auto; }
.progression { margin: 0 0 4px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
h2 { margin: 0 0 12px; font-size: 20px; line-height: 1.2; }
.markdown { color: var(--fg-soft); font-size: 13px; line-height: 1.5; }
.markdown :deep(p) { margin: 0 0 10px; }
.markdown :deep(ul) { margin: 0 0 10px; padding-left: 18px; }
.markdown :deep(code) { font-family: var(--mono); background: var(--chip); padding: 1px 4px; border-radius: 4px; }
.markdown :deep(a) { color: var(--accent); }
.steps { margin: 14px 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.steps li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; }
.step-marker { width: 22px; height: 22px; display: grid; place-items: center; color: var(--muted); font-size: 12px; font-weight: 700; }
.step-marker.checkable { border: 2px solid var(--line-strong); border-radius: 50%; }
.steps li.done .step-marker { border-color: var(--good); background: var(--good); color: #fff; }
.step-text { padding-top: 1px; }
.step-text :deep(p) { margin: 0; }
.feedback { margin: 12px 0 8px; padding: 10px; border-radius: 8px; background: var(--warn-soft); font-size: 12.5px; line-height: 1.4; }
.feedback.success { background: var(--good-soft); color: var(--good); font-weight: 600; }
.continue { width: 100%; border: 0; border-radius: 8px; padding: 9px 12px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.continue:disabled { opacity: 0.45; cursor: default; }
.finished { padding: 10px; border-radius: 8px; background: var(--good-soft); color: var(--good); font-weight: 600; text-align: center; }
.teachers { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
.teachers summary { cursor: pointer; color: var(--muted); font-size: 12px; }
.teachers .markdown { margin-top: 8px; font-size: 12px; }
</style>
