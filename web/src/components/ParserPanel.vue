<script setup>
// The pipeline, drawn: what the player typed → tokens → typo fixes → verb →
// noun resolution → (interpreter) → Action → engine events → world changes → prose.
import { computed } from 'vue'
import { describeAction } from '../engine/actions.js'
import { isParseError } from '../engine/parser.js'

const props = defineProps({ turn: { type: Object, default: null } })

const stages = computed(() => {
  const turn = props.turn
  if (!turn) return []
  const trace = turn.parseTrace
  const find = stage => trace.filter(s => s.stage === stage)
  const out = []

  const norm = find('normalize')[0]
  out.push({ key: 'tokens', title: 'Tokenize', hint: 'Lowercase, strip punctuation, split on spaces.', tokens: norm.tokens })

  const typos = find('typos')[0]
  if (typos) {
    out.push({
      key: 'typos', title: 'Fix typos',
      hint: `Unknown words are nudged toward the ${typos.vocabularySize} words this room knows — only when exactly one is close.`,
      fixes: typos.fixes,
    })
  }

  const verb = find('verb')[0]
  if (verb) {
    out.push({
      key: 'verb', title: 'Match verb',
      hint: verb.phrase ? 'The longest known verb phrase at the start wins.' : 'No known verb phrase starts this sentence.',
      verb,
    })
  }

  for (const s of trace) {
    if (s.stage === 'fillers') out.push({ key: 'fillers' + out.length, title: 'Drop filler words', hint: 'Words like “the” and “at” carry no meaning for the game.', fillers: s })
    if (s.stage === 'split') out.push({ key: 'split' + out.length, title: 'Split on preposition', hint: s.note ?? 'Instrument first, then what it is used on.', split: s })
    if (s.stage === 'resolve') out.push({ key: 'resolve' + out.length, title: `Resolve “${s.phrase}”`, hint: 'Match the words against everything you can see or carry.', resolve: s })
    if (s.stage === 'route') out.push({ key: 'route' + out.length, title: 'Plan a route', hint: 'Only through rooms you have walked. One step at a time.', route: s })
    if (s.stage === 'note') out.push({ key: 'note' + out.length, title: 'Rule applied', hint: s.text })
  }

  const parsed = find('result')[0]?.result
  out.push({
    key: 'parsed', title: 'Parser result',
    status: isParseError(parsed) ? 'fail' : 'ok',
    parsed,
  })

  out.push({ key: 'interp', title: 'Interpreter', interp: turn.interpreter })

  if (turn.action) {
    out.push({ key: 'action', title: 'Action', hint: 'The only thing the engine ever receives.', action: turn.action })
    out.push({ key: 'events', title: 'Engine events', hint: 'Structured facts. The engine decides; nothing else does.', events: turn.events })
    out.push({ key: 'changes', title: 'World changes', hint: 'Every value this turn changed in the world state.', changes: turn.changes })
  }
  return out
})

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

    <ol v-else class="pipeline">
      <li v-for="s in stages" :key="s.key" class="stage" :class="[s.key.replace(/\d+$/, ''), s.status]">
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

        <div v-if="s.key === 'parsed'">
          <code v-if="s.status === 'ok'" class="result ok">{{ describeAction(s.parsed) }}</code>
          <code v-else class="result fail">ParseError: {{ errorLabel(s.parsed) }}</code>
        </div>

        <div v-if="s.key === 'interp'" class="interp">
          <template v-if="!s.interp">
            <span class="muted">Not needed — the parser understood.</span>
          </template>
          <template v-else-if="s.interp.status === 'skipped'">
            <span class="slot">No interpreter connected.</span>
            <span class="muted small">This is where a language model would try to understand what the parser could not.</span>
          </template>
          <template v-else>
            <div><strong>{{ s.interp.name }}</strong> → {{ s.interp.status }} <span class="muted">({{ s.interp.ms }} ms)</span></div>
            <code v-if="s.interp.answer" class="small block">{{ JSON.stringify(s.interp.answer.action ?? s.interp.answer) }}</code>
          </template>
        </div>

        <code v-if="s.action" class="block">{{ JSON.stringify(s.action) }}</code>

        <ul v-if="s.events" class="events">
          <li v-for="(e, i) in s.events" :key="i" :class="{ bad: e.type === 'action_failed', good: e.type === 'game_ended' }">
            <span class="etype">{{ e.type }}</span>
            <span v-if="e.reason" class="muted"> · {{ e.reason }}</span>
            <span v-if="e.interaction" class="muted"> · rule {{ e.interaction }}</span>
          </li>
        </ul>

        <ul v-if="s.changes" class="changes">
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
.stage.interp::before { border-style: dashed; border-color: var(--muted); }
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
.events, .changes { list-style: none; margin: 0; padding: 0; font-size: 12.5px; }
.events li, .changes li { padding: 1px 0; }
.etype { font-family: var(--mono); }
.events .bad .etype { color: var(--bad); }
.events .good .etype { color: var(--good); font-weight: 600; }
.changes code { font-family: var(--mono); font-size: 12px; }
.from { color: var(--bad); font-family: var(--mono); font-size: 12px; }
.to { color: var(--good); font-family: var(--mono); font-size: 12px; }
.quote { color: var(--muted); font-family: var(--mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { color: var(--muted); padding: 8px 4px; }
</style>
