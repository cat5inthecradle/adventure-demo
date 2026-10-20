<script setup>
// The pipeline, drawn: what the player typed → tokens → typo fixes → verb →
// noun resolution → (interpreter) → Action → engine events → world changes → prose.
import { computed, nextTick, ref, watch } from 'vue'
import { describeAction } from '../engine/actions.js'
import { buildStages } from '../stages.js'

const props = defineProps({ turn: { type: Object, default: null } })

const stages = computed(() => {
  const all = buildStages(props.turn)
  const shown = props.turn?.revealed ?? all.length
  return all.slice(0, shown)
})

// Keep the newest stage in view while a turn is being revealed.
const list = ref(null)
watch(() => props.turn?.revealed, async () => {
  await nextTick()
  list.value?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

const INTERP_STATUS = {
  action: 'understood',
  clarify: 'asked a question',
  rejected: 'answer rejected',
  unavailable: 'unavailable',
}

const show = v => (v === undefined ? '—' : JSON.stringify(v))
const errorLabel = e => ({
  empty: 'nothing typed', unknown_verb: `unknown verb “${e.verb}”`, unknown_noun: `nothing called “${e.noun}” here`,
  ambiguous: `“${e.noun}” is ambiguous`, missing_noun: `“${e.verb}” needs a noun`, no_route: 'no known route',
  elsewhere: `${e.noun} is in the ${e.place}`,
}[e.kind] ?? e.kind)

</script>

<template>
  <section class="panel parser" aria-labelledby="parser-title">
    <header class="panel-head">
      <h2 id="parser-title">How it was understood</h2>
      <span v-if="turn" class="quote">“{{ turn.line }}”</span>
    </header>

    <p v-if="!turn" class="empty">Type a command. Each step the game takes to understand it will appear here.</p>

    <ol v-else ref="list" class="pipeline">
      <li v-for="s in stages" :key="s.key" class="stage" :class="['stage-' + s.kind, s.status]">
        <div class="stage-title">{{ s.title }}</div>
        <div v-if="s.hint" class="hint">{{ s.hint }}</div>

        <div v-if="s.tokens" class="chips">
          <span v-for="(t, i) in s.tokens" :key="i" class="chip">{{ t }}</span>
          <span v-if="!s.tokens.length" class="muted">(empty)</span>
        </div>

        <div v-if="s.fixes" class="chips">
          <template v-for="f in s.fixes" :key="f.from">
            <span v-if="f.to" class="chip fix"><s>{{ f.from }}</s> → {{ f.to }}</span>
            <span v-else class="chip warn">{{ f.from }}: too close to {{ f.rejected.join(' / ') }} to guess</span>
          </template>
          <span v-if="!s.fixes.length" class="muted">no corrections needed</span>
        </div>

        <div v-if="s.verb" class="chips">
          <template v-if="s.verb.phrase">
            <span class="chip verb">{{ s.verb.phrase.join(' ') }}</span>
            <span class="arrow">⇒</span>
            <span class="chip kind">{{ s.verb.kind }}</span>
            <span v-if="s.verb.shortcut" class="muted">(a bare direction)</span>
            <span v-for="(t, i) in s.verb.rest" :key="i" class="chip dim">{{ t }}</span>
          </template>
          <span v-else class="chip bad">{{ s.verb.tried.join(' ') }}</span>
        </div>

        <div v-if="s.fillers" class="chips">
          <span v-for="(t, i) in s.fillers.before" :key="i" class="chip" :class="{ struck: !s.fillers.after.includes(t) }">{{ t }}</span>
        </div>

        <div v-if="s.split" class="chips">
          <span v-for="(t, i) in s.split.left" :key="'l' + i" class="chip">{{ t }}</span>
          <span class="chip prep">{{ s.split.preposition }}</span>
          <span v-for="(t, i) in s.split.right" :key="'r' + i" class="chip">{{ t }}</span>
        </div>

        <div v-if="s.resolve" class="scope">
          <span
            v-for="e in s.resolve.scope" :key="e.id"
            class="entity" :class="[e.kind, { hit: s.resolve.matches.includes(e.id) }]"
            :title="e.id"
          >{{ e.name }}</span>
          <span v-if="!s.resolve.scope.length" class="muted">nothing in view</span>
          <div class="muted small">
            <template v-if="s.resolve.generic">“{{ s.resolve.phrase }}” is too generic to identify anything.</template>
            <template v-else-if="s.resolve.method === 'exact'">Exact name or alias match.</template>
            <template v-else-if="s.resolve.method === 'words'">Matched because every word appears in its name or aliases.</template>
            <template v-else-if="s.resolve.elsewhere">Not here — but seen in the {{ s.resolve.elsewhere.room }}.</template>
            <template v-else>No match.</template>
          </div>
        </div>

        <div v-if="s.route" class="chips">
          <span class="chip">{{ s.route.destination }}</span>
          <span class="arrow">⇒</span>
          <span class="chip kind">{{ s.route.direction ?? 'no route known' }}</span>
        </div>

        <div v-if="s.kind === 'prose'" class="prose">{{ s.text }}</div>

        <div v-if="s.kind === 'parsed'">
          <code v-if="s.status === 'ok'" class="result ok">{{ describeAction(s.parsed) }}</code>
          <code v-else class="result fail">ParseError: {{ errorLabel(s.parsed) }}</code>
        </div>

        <div v-if="s.kind === 'interp'" class="interp">
          <template v-if="!s.interp">
            <span class="muted">Not needed — the parser understood.</span>
          </template>
          <template v-else-if="s.interp.status === 'skipped'">
            <span class="slot">No interpreter connected.</span>
            <span class="muted small">This is where a language model would try to understand what the parser could not.</span>
          </template>
          <template v-else>
            <div class="interp-head">
              <strong>{{ s.interp.name }}</strong>
              <span class="verdict" :class="s.interp.status">{{ INTERP_STATUS[s.interp.status] ?? s.interp.status }}</span>
              <span class="muted small">
                {{ s.interp.ms }} ms<template v-if="s.interp.answer?.meta?.tokens">
                  · {{ s.interp.answer.meta.tokens.prompt }} in / {{ s.interp.answer.meta.tokens.completion }} out tokens</template>
              </span>
            </div>
            <div class="muted small">The parser gave up, so the line went to the model, with only what you can see:</div>
            <div class="scope">
              <span v-for="e in [...s.interp.context.visible, ...s.interp.context.inventory]" :key="e.id" class="entity hit" :class="e.kind" :title="e.id">{{ e.name }}</span>
            </div>
            <div class="muted small">It replied:</div>
            <code class="small block">{{ s.interp.answer?.meta?.raw ?? JSON.stringify(s.interp.answer) }}</code>
            <template v-if="s.interp.reread">
              <div class="muted small">The parser re-read its paraphrase, “{{ s.interp.reread.text }}”:</div>
              <code v-if="!s.interp.reread.result.parseError" class="result ok">{{ describeAction(s.interp.reread.result) }}</code>
              <code v-else class="result fail">{{ errorLabel(s.interp.reread.result) }}</code>
              <div class="muted small">
                <template v-if="s.interp.via === 'reread' && !s.interp.reread.result.parseError">Its own reading wins over the model’s choice of command.</template>
                <template v-else-if="s.interp.via === 'reread'">So the player is told, instead of the model guessing.</template>
                <template v-else>Words the parser doesn’t know, so the model’s own command is used.</template>
              </div>
            </template>
            <div v-if="s.interp.status === 'rejected'" class="small bad-text">
              That names something out of sight or isn’t a legal command, so the game threw it away.
            </div>
            <details v-if="s.interp.answer?.meta?.prompt" class="small">
              <summary>Full prompt</summary>
              <pre>{{ s.interp.answer.meta.prompt }}</pre>
            </details>
          </template>
        </div>

        <code v-if="s.action" class="block">{{ JSON.stringify(s.action) }}</code>

        <ul v-if="s.events" class="event-list">
          <li v-for="(e, i) in s.events" :key="i" :class="{ bad: e.type === 'action_failed', good: e.type === 'game_ended' }">
            <span class="etype">{{ e.type }}</span>
            <span v-if="e.reason" class="muted"> · {{ e.reason }}</span>
            <span v-if="e.interaction" class="muted"> · rule {{ e.interaction }}</span>
          </li>
        </ul>

        <ul v-if="s.changes" class="change-list">
          <li v-for="c in s.changes" :key="c.path">
            <code>{{ c.path }}</code>: <span class="from">{{ show(c.from) }}</span> → <span class="to">{{ show(c.to) }}</span>
          </li>
          <li v-if="!s.changes.length" class="muted">nothing changed</li>
        </ul>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.pipeline {
  list-style: none;
  margin: 0;
  padding: 0 0 4px;
  overflow-y: auto;
  flex: 1;
}
.stage {
  position: relative;
  animation: arrive 0.35s ease-out;
  padding: 8px 10px 9px 22px;
  margin-left: 6px;
  border-left: 2px solid var(--line);
}
.stage::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--panel);
  border: 2px solid var(--accent);
}
.stage.fail::before { border-color: var(--bad); }
.stage-interp::before { border-style: dashed; border-color: var(--muted); }
@keyframes arrive {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .stage { animation: none; }
}
.stage-prose::before { border-color: var(--good); background: var(--good); }
.prose {
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  max-height: 7.5em;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 70%, transparent);
  color: var(--fg-soft);
}
.stage-title { font-weight: 600; font-size: 13px; }
.hint { color: var(--muted); font-size: 12px; margin: 1px 0 5px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.chip {
  font-family: var(--mono);
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--chip);
  border: 1px solid var(--line);
}
.chip.verb, .chip.kind { background: var(--accent-soft); border-color: var(--accent); }
.chip.dim { opacity: 0.6; }
.chip.prep { background: var(--warn-soft); border-color: var(--warn); }
.chip.fix { background: var(--good-soft); border-color: var(--good); }
.chip.warn, .chip.bad { background: var(--bad-soft); border-color: var(--bad); }
.chip.struck { text-decoration: line-through; opacity: 0.45; }
.arrow { color: var(--muted); }
.scope { display: flex; flex-wrap: wrap; gap: 4px; }
.entity {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  opacity: 0.55;
}
.entity.hit { opacity: 1; background: var(--accent-soft); border-color: var(--accent); font-weight: 600; }
.entity.npc { border-style: dashed; }
.entity.door { border-radius: 4px; }
.scope .small { flex-basis: 100%; }
.result { font-family: var(--mono); font-size: 12.5px; padding: 2px 8px; border-radius: 5px; }
.result.ok { background: var(--good-soft); }
.result.fail { background: var(--bad-soft); }
code.block {
  display: block;
  font-family: var(--mono);
  font-size: 12px;
  background: var(--chip);
  padding: 4px 8px;
  border-radius: 5px;
  word-break: break-all;
}
.slot {
  display: inline-block;
  border: 1px dashed var(--muted);
  border-radius: 5px;
  padding: 1px 8px;
  font-size: 12px;
  margin-bottom: 3px;
}
.interp .small { display: block; }
.interp-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.interp-head .small { display: inline; }
.interp .scope { margin: 3px 0 4px; }
.verdict { font-size: 11.5px; padding: 0 6px; border-radius: 4px; background: var(--chip); }
.verdict.action { background: var(--good-soft); color: var(--good); }
.verdict.rejected, .verdict.unavailable { background: var(--bad-soft); color: var(--bad); }
.verdict.clarify { background: var(--warn-soft); color: var(--warn); }
.bad-text { color: var(--bad); }
.interp pre { font-family: var(--mono); font-size: 11px; white-space: pre-wrap; background: var(--chip); padding: 6px; border-radius: 5px; }
.event-list, .change-list { list-style: none; margin: 0; padding: 0; font-size: 12.5px; }
.event-list li, .change-list li { padding: 1px 0; }
.etype { font-family: var(--mono); }
.event-list .bad .etype { color: var(--bad); }
.event-list .good .etype { color: var(--good); font-weight: 600; }
.change-list code { font-family: var(--mono); font-size: 12px; }
.from { color: var(--bad); font-family: var(--mono); font-size: 12px; }
.to { color: var(--good); font-family: var(--mono); font-size: 12px; }
.quote { color: var(--muted); font-family: var(--mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: var(--muted); padding: 8px 4px; }
</style>
