<script setup>
import { computed, ref } from 'vue'

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

// Switching worlds starts this level's game over, so ask once a game is under way.
const asking = ref(null)
function choose(key) {
  if (key === selected.value) return
  const underWay = (props.controller.game?.world.value.turn_count ?? 0) > 0
  if (underWay && asking.value !== key) {
    asking.value = key
    return
  }
  asking.value = null
  props.controller.setWorld(key)
}
const askingLabel = computed(() => choices.find(choice => choice.key === asking.value)?.label)
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
        @click="choose(choice.key)"
      >
        <strong>{{ choice.label }}</strong>
        <span>{{ choice.blurb }}</span>
      </button>
    </div>
    <p v-if="asking" class="ask" role="alert">
      Switch to {{ askingLabel }}? Your game here starts over. Each world keeps its own thing from “Make it real”.
      <button type="button" class="confirm" @click="choose(asking)">Switch</button>
      <button type="button" class="confirm" @click="asking = null">Stay</button>
    </p>
    <p v-else>You can come back to this level to switch worlds.</p>
  </section>
</template>

<style scoped>
.picker { margin: 12px 0 14px; border-top: 1px solid var(--line); padding-top: 12px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.choices { display: grid; gap: 8px; padding-right: 3px; }
button { display: grid; gap: 2px; width: 100%; border: 2px solid var(--edge); border-radius: 6px; padding: 7px 9px; background: var(--panel); color: var(--fg); font: inherit; text-align: left; cursor: pointer; box-shadow: var(--shadow-small); }
button[aria-pressed='true'] { background: var(--hi); color: var(--on-hi); }
button[aria-pressed='true'] span { color: var(--on-hi); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
strong { font-family: var(--display); font-size: 15px; }
span { color: var(--fg-soft); font-size: 11.5px; line-height: 1.35; }
p { margin: 7px 0 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
p.ask { padding: 8px; border: 2px solid var(--edge); border-radius: 6px; background: var(--warn-soft); color: var(--fg); font-size: 12px; }
button.confirm { display: inline-block; width: auto; margin: 6px 6px 0 0; padding: 3px 10px; box-shadow: none; font-size: 12px; font-weight: 700; }
</style>
