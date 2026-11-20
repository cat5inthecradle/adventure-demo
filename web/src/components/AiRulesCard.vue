<script setup>
// "My AI rules": a printable record of what the student decided and made in
// the lesson. It only draws what LessonController.card() returns. Nothing is
// sent anywhere; the name line is left blank to fill in by hand.
import { computed } from 'vue'

const props = defineProps({
  controller: { type: Object, required: true },
  revision: { type: Number, default: 0 },
})
defineEmits(['back', 'challenges'])

const card = computed(() => {
  props.revision
  return props.controller.card()
})

const print = () => window.print()
</script>

<template>
  <div class="card-stage">
    <div class="actions no-print">
      <button type="button" class="primary chunky" @click="print">Print my card</button>
      <button type="button" class="chunky" @click="$emit('challenges')">Explore optional challenges</button>
      <button type="button" class="chunky" @click="$emit('back')">Back to my answers</button>
    </div>

    <article class="rules-card" aria-labelledby="rules-card-title">
      <header>
        <h2 id="rules-card-title">My AI rules</h2>
        <p class="by">Name <span class="blank"></span></p>
      </header>

      <section>
        <h3>My lesson work</h3>
        <ul class="activity-list"><li v-for="activity in card.activity" :key="activity.title">
          {{ activity.title }}: <strong>{{ activity.completed ? 'completed' : 'not completed' }}</strong><span v-if="activity.route"> · {{ activity.route }}</span>
        </li></ul>
        <p class="note">This records saved activities and observations. It is a starting point for discussion, not a grade.</p>
      </section>
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
        <h3>My AI investigations</h3>
        <ul>
          <li v-for="experiment in card.experiments" :key="experiment.title">
            <strong>{{ experiment.title }}</strong> — {{ experiment.route === 'live' ? 'live attempt' : experiment.route === 'recorded' ? 'recorded example' : 'not completed' }}
            <p v-if="experiment.observation">{{ experiment.observation }}</p>
          </li>
        </ul>
      </section>

      <section v-if="card.observedExample">
        <h3>One example I inspected</h3>
        <p><strong>{{ card.observedExample.title }}</strong> · {{ card.observedExample.route === 'recorded' ? 'recorded example' : 'live attempt' }}</p>
        <pre class="evidence">{{ card.observedExample.evidence }}</pre>
        <p class="because">I noticed: {{ card.observedExample.observation }}</p>
      </section>
      <section>
        <h3>What I made real</h3>
        <template v-if="card.thing">
          <p class="choice"><strong>{{ card.thing.name }}</strong></p>
          <blockquote>{{ card.thing.description }}</blockquote>
          <p v-if="card.thing.aliases.length" class="also">Also called: {{ card.thing.aliases.join(', ') }}</p>
          <p class="note">Players {{ card.thing.portable ? 'can' : 'cannot' }} pick it up.</p>
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
.card-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; align-items: center; padding: 0 8px 8px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-self: stretch; }
.actions button { padding: 8px 14px; background: var(--panel); color: var(--fg); font-size: 14px; font-weight: 700; cursor: pointer; }
.actions button.primary { background: var(--accent); color: var(--on-accent); }
.actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.rules-card { width: 100%; max-width: 680px; padding: 28px 32px; border: 2px solid #1f2440; border-top: 10px solid #e4572e; border-radius: 8px; box-shadow: 5px 5px 0 var(--ink); background: #fffdf7; color: #1f2440; line-height: 1.45; }
.evidence { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 12px; line-height: 1.45; background: #f1eee5; padding: 10px; }
.activity-list { font-size: 13px; padding-left: 18px; }
.rules-card { overflow-wrap: anywhere; }
header { flex-wrap: wrap; display: flex; align-items: baseline; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1d2329; padding-bottom: 8px; }
h2 { margin: 0; font-size: 32px; font-weight: 700; }
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
/* Remove scroll/flex constraints so long cards paginate without clipping. */
@media print {
  @page { margin: 14mm; }
  html, body, #app, .app, .lesson, .work, .card-stage {
    height: auto !important; max-height: none !important; min-height: 0 !important;
    overflow: visible !important; display: block !important;
    padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important;
    background: white !important;
  }
  .app > :not(.lesson), .lesson > :not(.work), .work > :not(.card-stage), .card-stage > :not(.rules-card), .no-print { display: none !important; }
  .rules-card { position: static !important; width: 100% !important; max-width: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; background: white !important; }
  .rules-card h2 { font-size: 24pt; }
  .rules-card section { padding: 8px 0; }
  .rules-card h3 { break-after: avoid; }
  .rules-card li, .rules-card blockquote, .rules-card .evidence { break-inside: avoid; }
  .rules-card p { orphans: 3; widows: 3; }
}
</style>
