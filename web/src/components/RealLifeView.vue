<script setup>
// The lesson's closing step: the same dial, set for apps outside the game.
// Each scenario spells out what every setting would mean there; the student
// picks one and says why. The controller keeps the answers.
import { computed } from 'vue'
import { DIAL, DIAL_ORDER } from '../lesson/dial.js'

const props = defineProps({
  controller: { type: Object, required: true },
  config: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})

const NAMES = Object.fromEntries(DIAL_ORDER.map(key => [key, DIAL[key].short]))
const ORDER = DIAL_ORDER

const answers = computed(() => {
  props.revision
  return props.controller.realLife
})
const gameDial = computed(() => {
  props.revision
  return props.controller.dialSaved ? NAMES[props.controller.dialSaved.setting] : null
})
const scenarios = computed(() => props.config.scenarios.map(scenario => ({
  ...scenario,
  settings: ORDER.filter(key => Object.hasOwn(scenario.options, key)),
})))
const remaining = computed(() =>
  (props.revision, scenarios.value.filter(scenario => !props.controller.realLifeAnswered(scenario.id)).length)
)
</script>

<template>
  <div class="real-life">
    <p v-if="gameDial" class="yours">In your game, you set the dial to <strong>{{ gameDial }}</strong>.</p>
    <p class="reflection-help">What may AI do here? What happens if it is wrong? A short reason is enough. Different choices are worth discussing.</p>
    <div class="cards">
      <fieldset v-for="scenario in scenarios" :key="scenario.id" class="panel card">
        <legend>{{ scenario.title }}</legend>
        <p class="blurb">{{ scenario.blurb }}</p>
        <label
          v-for="key in scenario.settings"
          :key="key"
          class="option"
          :class="{ chosen: answers[scenario.id]?.setting === key }"
        >
          <input
            type="radio"
            :name="`real-life-${scenario.id}`"
            :value="key"
            :checked="answers[scenario.id]?.setting === key"
            @change="controller.setRealLife(scenario.id, { setting: key })"
          >
          <span><strong>{{ NAMES[key] }}.</strong> {{ scenario.options[key] }}</span>
        </label>
        <p v-if="answers[scenario.id]?.setting" class="chosen-capability">
          <strong>Your choice allows:</strong> {{ scenario.options[answers[scenario.id].setting] }}
        </p>
        <label class="field">
          Why does that capability fit?
          <input
            type="text"
            maxlength="200"
            autocomplete="off"
            :value="answers[scenario.id]?.reason ?? ''"
            placeholder="I would allow… because… If wrong…"
            @input="controller.setRealLife(scenario.id, { reason: $event.target.value })"
          >
        </label>
      </fieldset>
    </div>
    <p class="count" role="status">
      {{ remaining ? `${remaining} still need${remaining === 1 ? 's' : ''} a setting and a reason.` : 'All three are set.' }}
    </p>
  </div>
</template>

<style scoped>
.real-life { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 0 6px 6px 0; }
.reflection-help { margin: 0; font-size: 13px; line-height: 1.5; }
.chosen-capability { font-size: 13px; line-height: 1.5; background: var(--chip); padding: 8px; }
.yours { margin: 0; padding: 8px 10px; border: 2px solid var(--edge); border-radius: 6px; background: var(--accent-soft); color: var(--fg-soft); font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: start; }
.card { margin: 0; padding: 12px; min-width: 0; }
legend { float: left; width: 100%; padding: 0; margin: 0 0 2px; font-size: 19px; font-weight: 700; }
.blurb { clear: both; margin: 0 0 8px; color: var(--muted); font-size: 13px; line-height: 1.4; }
.option { display: flex; align-items: flex-start; gap: 7px; padding: 6px; border: 2px solid transparent; border-radius: 6px; font-size: 13px; line-height: 1.4; cursor: pointer; }
.option input { margin-top: 3px; }
.option.chosen { border-color: var(--edge); background: var(--hi); color: var(--on-hi); }
.option:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.field { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.field input {
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
.field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.count { margin: 0; color: var(--muted); font-size: 12.5px; }
</style>
