<script setup>
// "My AI rules": one printable page of what the student decided and made in
// the lesson. It only draws what LessonController.card() returns. Nothing is
// sent anywhere; the name line is left blank to fill in by hand.
import { computed } from 'vue'

const props = defineProps({
  controller: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})
defineEmits(['back'])

const card = computed(() => {
  props.revision
  return props.controller.card()
})

const print = () => window.print()
</script>

<template>
  <div class="card-stage">
    <div class="actions no-print">
      <button type="button" class="primary" @click="print">Print my card</button>
      <button type="button" @click="$emit('back')">Back to my answers</button>
    </div>

    <article class="rules-card" aria-labelledby="rules-card-title">
      <header>
        <h2 id="rules-card-title">My AI rules</h2>
        <p class="by">Name <span class="blank"></span></p>
      </header>

      <section>
        <h3>In my game, {{ card.title }}</h3>
        <template v-if="card.dial">
          <p class="choice">
            I set the AI dial to <strong>{{ card.dial.name }}</strong>: {{ card.dial.meaning }}.
          </p>
          <p class="because">
            Why:
            <span v-if="card.dial.reason">{{ card.dial.reason }}</span>
            <span v-else class="blank wide"></span>
          </p>
        </template>
        <p v-else class="missing">I have not saved a dial setting for my game yet.</p>
      </section>

      <section>
        <h3>What I made real</h3>
        <template v-if="card.thing">
          <p class="choice"><strong>{{ card.thing.name }}</strong></p>
          <blockquote>{{ card.thing.description }}</blockquote>
          <p v-if="card.thing.aliases.length" class="also">Also called: {{ card.thing.aliases.join(', ') }}</p>
          <p class="note">The AI could only write words about it. I put it in the rules.</p>
        </template>
        <p v-else class="missing">I have not added anything to the world yet.</p>
      </section>

      <section>
        <h3>In real life</h3>
        <ul class="apps">
          <li v-for="app in card.realLife" :key="app.id">
            <p class="choice">
              {{ app.title }}:
              <strong v-if="app.name">{{ app.name }}</strong>
              <span v-else class="missing">not set yet</span>
            </p>
            <p v-if="app.means" class="means">{{ app.means }}</p>
            <p class="because">
              Why:
              <span v-if="app.reason">{{ app.reason }}</span>
              <span v-else class="blank wide"></span>
            </p>
          </li>
        </ul>
      </section>

      <footer>The AI can write words. People decide what is true.</footer>
    </article>
  </div>
</template>

<style scoped>
.card-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.actions { display: flex; gap: 8px; align-self: stretch; }
.actions button { border: 1px solid var(--line-strong); border-radius: 8px; padding: 8px 14px; background: var(--panel); color: var(--fg); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.actions button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
.actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.rules-card { width: 100%; max-width: 680px; padding: 28px 32px; border: 1px solid #c9ced3; border-radius: 12px; background: #fff; color: #1d2329; line-height: 1.45; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1d2329; padding-bottom: 8px; }
h2 { margin: 0; font-size: 26px; }
.by { margin: 0; font-size: 14px; white-space: nowrap; }
section { padding: 14px 0; border-bottom: 1px solid #c9ced3; }
h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #4b5560; }
p { margin: 0 0 4px; font-size: 15px; }
blockquote { margin: 4px 0; padding: 6px 12px; border-left: 3px solid #1d2329; font-size: 15px; font-style: italic; }
.also, .note, .means { font-size: 13.5px; color: #4b5560; }
.because { font-size: 14px; }
.missing { color: #4b5560; font-style: italic; font-weight: 400; }
.blank { display: inline-block; width: 180px; border-bottom: 1px solid #1d2329; }
.blank.wide { width: 70%; }
.apps { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
footer { padding-top: 12px; font-size: 14px; font-weight: 700; text-align: center; }
</style>

<style>
/* Printing shows the card alone, on white, at the top of the page. */
@media print {
  body * { visibility: hidden !important; }
  .rules-card, .rules-card * { visibility: visible !important; }
  .rules-card { position: absolute; left: 0; top: 0; max-width: none; border: 0; padding: 0; }
  .no-print { display: none !important; }
}
</style>
