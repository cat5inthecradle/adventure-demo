<script setup>
import { computed } from 'vue'

const props = defineProps({
  controller: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})

const { worlds } = props.controller
const choices = worlds.order
  .filter(key => props.controller.isSelectableWorld(key))
  .map(key => ({ key, ...worlds.worlds[key] }))
const selected = computed(() => {
  props.revision
  return props.controller.world
})
</script>

<template>
  <section class="picker" aria-labelledby="world-picker-title">
    <h3 id="world-picker-title">Choose your world</h3>
    <div class="choices">
      <button
        v-for="choice in choices"
        :key="choice.key"
        type="button"
        :aria-pressed="selected === choice.key"
        @click="controller.setWorld(choice.key)"
      >
        <strong>{{ choice.label }}</strong>
        <span>{{ choice.blurb }}</span>
      </button>
    </div>
    <p>You can come back to this level to switch worlds.</p>
  </section>
</template>

<style scoped>
.picker { margin: 12px 0 14px; border-top: 1px solid var(--line); padding-top: 12px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.choices { display: grid; gap: 6px; }
button { display: grid; gap: 2px; width: 100%; border: 1px solid var(--line-strong); border-radius: 8px; padding: 7px 9px; background: var(--panel); color: var(--fg); font: inherit; text-align: left; cursor: pointer; }
button[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
strong { font-size: 12.5px; }
span { color: var(--fg-soft); font-size: 11.5px; line-height: 1.35; }
p { margin: 7px 0 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
</style>
