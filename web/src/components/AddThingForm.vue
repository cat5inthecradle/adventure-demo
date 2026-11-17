<script setup>
// Add one thing to the starting room with three fields, then keep editing it.
// The game in progress carries on, so the student can try it straight away.
import { computed, reactive, watch } from 'vue'
import { studentThing, withThing } from '../lesson/addThing.js'

const props = defineProps({
  game: { type: Object, required: true },
  starter: { type: Object, required: true },
  suggestedName: { type: String, default: '' },
})
const emit = defineEmits(['applied'])

const form = reactive({ name: '', description: '', aliases: '', portable: true, error: '', status: '', busy: false })

const existing = computed(() => studentThing(props.game.definition.value, props.starter))
const roomName = computed(() => {
  const definition = props.game.definition.value
  return definition.rooms?.[definition.player_location]?.name ?? 'first room'
})

watch(existing, thing => {
  form.name = thing?.name ?? props.suggestedName
  form.description = thing?.description ?? ''
  form.aliases = (thing?.aliases ?? []).join(', ')
  form.portable = thing?.portable ?? true
}, { immediate: true })

async function save() {
  form.error = ''
  form.status = ''
  const adding = !existing.value
  form.busy = true
  try {
    const { world } = withThing(props.game.definition.value, {
      id: existing.value?.id ?? null,
      name: form.name,
      description: form.description,
      aliases: form.aliases,
      portable: form.portable,
    })
    await props.game.applyWorld(world)
    form.status = adding
      ? 'Added. Now examine it in the game.'
      : 'Saved. Try it in the game.'
    emit('applied')
  } catch (err) {
    form.error = err.message
  } finally {
    form.busy = false
  }
}
</script>

<template>
  <form class="panel add-thing" aria-labelledby="add-thing-title" @submit.prevent="save">
    <h3 id="add-thing-title">{{ existing ? 'Your thing' : 'Add a thing' }}</h3>
    <p class="where">It goes in the {{ roomName }}.</p>
    <label class="field">
      Name
      <input v-model="form.name" type="text" maxlength="40" autocomplete="off" required>
    </label>
    <label class="field">
      When a player examines it, say
      <textarea v-model="form.description" rows="3" maxlength="300" required></textarea>
    </label>
    <label class="field">
      Also called
      <input
        v-model="form.aliases"
        type="text"
        maxlength="120"
        autocomplete="off"
        placeholder="other names, with commas between"
      >
    </label>
    <label class="check">
      <input v-model="form.portable" type="checkbox">
      Players can pick it up
    </label>
    <p class="limits">Your description is only words. It cannot open a door or make something happen; that takes a rule.</p>
    <button type="submit" class="chunky" :disabled="form.busy">{{ existing ? 'Save changes' : 'Add it to the world' }}</button>
    <p v-if="form.error" class="error" role="alert">{{ form.error }}</p>
    <p v-else-if="form.status" class="status" role="status">{{ form.status }}</p>
  </form>
</template>

<style scoped>
.add-thing { padding: 12px; overflow-y: auto; }
h3 { margin: 0 0 2px; font-size: 14px; }
.where { margin: 0 0 4px; color: var(--muted); font-size: 12px; }
.check { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; color: var(--fg); }
.limits { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
.field { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.field input, .field textarea {
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
  resize: vertical;
}
.field input:focus-visible, .field textarea:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button { margin-top: 10px; padding: 7px 12px; background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 700; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.error, .status { margin: 8px 0 0; padding: 8px; border-radius: 7px; font-size: 12px; line-height: 1.4; }
.error { background: var(--warn-soft); }
.status { background: var(--good-soft); color: var(--good); font-weight: 600; }
</style>
