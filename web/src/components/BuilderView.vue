<script setup>
// The World Builder: a Blockly workspace that is the world, checked as you go,
// and played either live (your game carries on) or from the start. A student
// keeps several worlds, by name, in the browser (builder/library.js).
import { markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import wayfarer from '../../../worlds/wayfarer.json'
import { Blockly, arrange, attachWorkspace, markProblems, primeRegistry } from '../builder/blocks.js'
import { TOOLBOX } from '../builder/schema.js'
import { BLANK_WORLD as BLANK, slugify, stateToWorld, worldToState } from '../builder/convert.js'
import { loadWorld } from '../engine/loader.js'
import * as Library from '../builder/library.js'

const props = defineProps({
  game: { type: Object, required: true },
  active: Boolean,
  toolbox: { type: Object, default: () => TOOLBOX },
  libraryKey: { type: String, default: Library.LIBRARY_KEY },
})
const emit = defineEmits(['play'])

const host = ref(null)
const fileInput = ref(null)
const ui = reactive({
  world: null,          // the built world, when it loads
  problem: null,        // the loader's complaint, when it doesn't
  problemBlocks: [],
  changed: false,       // differs from what the game is playing
  confirming: null,     // 'delete' while asking
  message: '',
  name: '',             // the Story block's title, as typed
  hasStory: false,
  worlds: [],           // [{ id, name }], most recently changed first
  currentId: null,
})

let workspace = null
let timer = null
let library = null

// The world in the form the blocks produce it, so a world the game is playing
// compares equal to the same world rebuilt from blocks.
const canonical = raw => JSON.stringify(stateToWorld(worldToState(raw)))

/** Show a workspace state. A world just converted from a file gets laid out;
 *  the student's own saved arrangement is kept as they left it. */
function load(state, { tidy = true } = {}) {
  primeRegistry(state)
  workspace.clear()
  Blockly.serialization.workspaces.load(state, workspace)
  if (tidy) arrange(workspace)
  check()
}

/** Rebuild the world from the blocks, validate it, and save it to the library. */
function check() {
  clearTimeout(timer)
  const state = Blockly.serialization.workspaces.save(workspace)
  Library.update(library, library.current, state)
  Library.saveLibrary(library, undefined, props.libraryKey)
  refreshList()
  const story = state.blocks?.blocks?.find(b => b.type === 'world')
  ui.hasStory = !!story
  ui.name = story?.fields?.TITLE ?? ''
  let built = null
  try {
    built = stateToWorld(state)
    loadWorld(built)
    ui.world = markRaw(built)     // plain data: the game clones it, and proxies can't be cloned
    ui.problem = null
  } catch (err) {
    ui.world = null
    ui.problem = err.message
  }
  ui.problemBlocks = markProblems(workspace, ui.problem)
  ui.changed = !built || JSON.stringify(built) !== canonical(props.game.definition.value)
}

const schedule = () => { clearTimeout(timer); timer = setTimeout(check, 350) }

function refreshList() {
  ui.worlds = Library.list(library).map(({ id, name }) => ({ id, name }))
  ui.currentId = library.current
}

// --- the library ---------------------------------------------------------------------

/** Renaming a world is retitling its Story block, so the name is the same everywhere. */
function setName(value) {
  workspace.getTopBlocks(false).find(b => b.type === 'world')?.setFieldValue(value, 'TITLE')
}

function open(id) {
  ui.confirming = null
  if (id === library.current || !library.worlds[id]) return
  check()                                   // save the world being left
  library.current = id
  load(library.worlds[id].state, { tidy: false })
}

/** Add a world to the library and switch to it. Converted worlds carry no
 *  positions, so they are laid out; a duplicate keeps its arrangement. */
function addWorld(state, { tidy, message }) {
  ui.confirming = null
  if (library.current) check()
  library.current = Library.add(library, state)
  load(state, { tidy })
  ui.message = message
}

function newBlank() {
  const name = Library.freshTitle(library, 'My adventure')
  addWorld(Library.retitled(worldToState(BLANK), name), {
    tidy: true, message: `Started “${name}”: one room and the story block. Add rooms, things and rules from the left.`,
  })
}

function copyWayfarer() {
  const name = Library.freshTitle(library, 'My Wayfarer')
  addWorld(Library.retitled(worldToState(wayfarer), name), {
    tidy: true, message: `“${name}” is your own copy of the Wayfarer. Change anything, then play it.`,
  })
}

function duplicate() {
  const state = Blockly.serialization.workspaces.save(workspace)
  const name = Library.freshTitle(library, `${Library.titleOf(state)} copy`)
  addWorld(Library.retitled(state, name), { tidy: false, message: `Made a copy called “${name}”.` })
}

function deleteCurrent() {
  if (ui.confirming !== 'delete') {
    ui.confirming = 'delete'
    return
  }
  ui.confirming = null
  const gone = library.worlds[library.current]?.name
  clearTimeout(timer)
  Library.remove(library, library.current)
  Library.saveLibrary(library, undefined, props.libraryKey)
  if (library.current) load(library.worlds[library.current].state, { tidy: false })
  else newBlank()
  ui.message = `Deleted “${gone}”.`
}

function showProblem() {
  const id = ui.problemBlocks[0]
  if (!id) return
  workspace.getBlockById(id)?.select()
  workspace.centerOnBlock(id)
}

async function play(restart) {
  if (!ui.world) return
  await props.game.applyWorld(ui.world, { restart })
  ui.changed = false
  emit('play')
}

function download() {
  const world = ui.world ?? stateToWorld(Blockly.serialization.workspaces.save(workspace))
  const blob = new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${slugify(world.title || 'my_world')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function openFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const state = worldToState(JSON.parse(await file.text()))
    const name = Library.freshTitle(library, Library.titleOf(state))
    addWorld(Library.retitled(state, name), { tidy: true, message: `Opened ${file.name} as “${name}”.` })
  } catch (err) {
    ui.message = `Couldn’t open ${file.name}: ${err.message}`
  }
}

onMounted(() => {
  workspace = Blockly.inject(host.value, {
    toolbox: props.toolbox,
    renderer: 'zelos',
    // Blockly's sprites and sounds, served from this app (public/blockly-media,
    // copied from the blockly package) rather than static.blockly.com: a student's
    // browser should not be calling a third-party server.
    media: `${import.meta.env.BASE_URL}blockly-media/`,
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: 0.6, maxScale: 1.4, minScale: 0.25 },
    move: { scrollbars: true, drag: true, wheel: false },
    grid: { spacing: 32, length: 2, colour: '#d9d6ee', snap: false },
  })
  attachWorkspace(workspace)
  workspace.addChangeListener(event => { if (!event.isUiEvent) schedule() })

  library = Library.loadLibrary(undefined, props.libraryKey)
  const current = library.worlds[library.current]
  if (current) {
    load(current.state, { tidy: false })
  } else {
    // First visit: the world being played becomes the first world in the library.
    const state = worldToState(props.game.definition.value)
    library.current = Library.add(library, state)
    load(state, { tidy: true })
  }
})

watch(() => props.active, async active => {
  if (!active || !workspace) return
  await nextTick()
  Blockly.svgResize(workspace)
})

watch(() => props.toolbox, toolbox => {
  workspace?.updateToolbox(toolbox)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  workspace?.dispose()
})
</script>

<template>
  <section class="builder">
    <div ref="host" class="workspace" aria-label="World building blocks"></div>
    <aside class="panel side">
      <header class="panel-head"><h2>Build your world</h2></header>

      <div class="group identity">
        <label class="field-label" for="world-name">World name</label>
        <input
          id="world-name" class="name" :value="ui.name" :disabled="!ui.hasStory"
          :placeholder="ui.hasStory ? 'Name your world' : 'Add a Story block to name your world'"
          @input="setName($event.target.value)"
        >
        <label class="field-label" for="my-worlds">My worlds</label>
        <select id="my-worlds" :value="ui.currentId" @change="open($event.target.value)">
          <option v-for="w in ui.worlds" :key="w.id" :value="w.id">{{ w.name }}</option>
        </select>
        <div class="row">
          <button type="button" @click="newBlank">New</button>
          <button type="button" @click="duplicate">Duplicate</button>
          <button type="button" :class="{ danger: ui.confirming === 'delete' }" @click="deleteCurrent">
            {{ ui.confirming === 'delete' ? 'Delete it?' : 'Delete' }}
          </button>
        </div>
      </div>

      <div class="status" :class="ui.problem ? 'bad' : 'good'" role="status">
        <template v-if="ui.problem">
          <strong>Not playable yet</strong>
          <p>{{ ui.problem }}</p>
          <button v-if="ui.problemBlocks.length" type="button" class="link" @click="showProblem">Show me the block</button>
        </template>
        <template v-else>
          <strong>Ready to play</strong>
          <p v-if="!ui.changed">The game is playing exactly these blocks.</p>
          <p v-else-if="game.definition.value.title === ui.name">You have changes the game hasn’t seen yet.</p>
          <p v-else>The game is playing “{{ game.definition.value.title }}”, not this world.</p>
        </template>
      </div>

      <div class="actions">
        <button type="button" class="primary" :disabled="!ui.world" @click="play(false)">▶ Play with my changes</button>
        <p class="hint">Your game carries on where you are. New text and rules apply at once; things you already did stay done.</p>
        <button type="button" :disabled="!ui.world" @click="play(true)">↺ Play from the start</button>
      </div>

      <div class="group">
        <h3>Add a world</h3>
        <div class="row">
          <button type="button" @click="copyWayfarer">A copy of the Wayfarer</button>
          <button type="button" @click="fileInput.click()">Open a file…</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="openFile">
        </div>
        <h3>This world</h3>
        <div class="row">
          <button type="button" @click="download">Download as a file</button>
        </div>
        <p v-if="ui.message" class="hint" role="status">{{ ui.message }}</p>
      </div>

      <div class="group tips">
        <h3>How it works</h3>
        <ul>
          <li><b>Rooms</b> connect through <b>exits</b>. Exits go one way: add one back.</li>
          <li><b>Things</b> and <b>characters</b> start somewhere you choose.</li>
          <li><b>Rules</b> make things happen: “when the player uses the key on the door…”</li>
          <li><b>Flags</b> are true/false switches your rules set and check.</li>
          <li>Open the <b>Play</b> tab’s step-by-step view to see how your words are understood.</li>
        </ul>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.builder { flex: 1; display: flex; gap: 14px; min-width: 0; }
.workspace {
  flex: 1;
  min-width: 0;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.side { width: 340px; flex: none; overflow-y: auto; gap: 14px; }
.status { border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.status p { margin: 4px 0 0; overflow-wrap: anywhere; }
.status.good { background: var(--good-soft); }
.status.good strong { color: var(--good); }
.status.bad { background: var(--bad-soft); }
.status.bad strong { color: var(--bad); }
.actions { display: flex; flex-direction: column; gap: 6px; }
button {
  font: inherit;
  font-size: 13px;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  text-align: center;
}
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
button.link { background: none; border: 0; padding: 4px 0 0; color: var(--bad); text-decoration: underline; }
.hint { font-size: 12px; color: var(--muted); margin: 0; }
.identity { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.identity input, .identity select {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 7px 10px;
}
.identity input.name { font-size: 16px; font-weight: 600; }
.identity input:disabled { opacity: 0.6; }
button.danger { background: var(--bad); border-color: var(--bad); color: #fff; }
.group h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 6px 0 6px; }
.row { display: flex; gap: 6px; }
.row button { flex: 1; }
.tips ul { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--fg-soft); }
.tips li { margin-bottom: 4px; }
</style>
