<script setup>
import { computed, ref } from 'vue'
import * as q from '../engine/queries.js'
import { DIRECTION_ORDER } from '../engine/models.js'

const props = defineProps({
  world: { type: Object, required: true },
  changedPaths: { type: Array, default: () => [] },
})

const tab = ref('map')
const tabs = [['map', 'Map'], ['here', 'Here'], ['state', 'State']]

// --- map ---------------------------------------------------------------------
// Rooms are laid out on a grid by walking exits from the starting room. Up and
// down are drawn as diagonal offsets, which is how paper adventure maps did it.
const STEP = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], up: [1, -1], down: [-1, 1] }

const layout = computed(() => {
  const w = props.world
  const start = w.visited[0] ?? w.player_location
  const pos = { [start]: [0, 0] }
  const taken = new Set(['0,0'])
  const queue = [start]
  while (queue.length) {
    const id = queue.shift()
    const [x, y] = pos[id]
    for (const dir of DIRECTION_ORDER) {
      const exit = w.rooms[id].exits[dir]
      if (!exit || exit.to in pos) continue
      let [nx, ny] = [x + STEP[dir][0], y + STEP[dir][1]]
      while (taken.has(`${nx},${ny}`)) { nx += STEP[dir][0] || 1; ny += STEP[dir][1] }
      pos[exit.to] = [nx, ny]
      taken.add(`${nx},${ny}`)
      queue.push(exit.to)
    }
  }
  const xs = Object.values(pos).map(p => p[0])
  const ys = Object.values(pos).map(p => p[1])
  return { pos, minX: Math.min(...xs), minY: Math.min(...ys), cols: Math.max(...xs) - Math.min(...xs) + 1, rows: Math.max(...ys) - Math.min(...ys) + 1 }
})

const CELL = 120
const BOX = { w: 92, h: 40 }
const known = computed(() => q.visitedRooms(props.world))

// A room is drawn once it has been visited or is one exit away from a visited one.
const mapRooms = computed(() => {
  const w = props.world
  const { pos, minX, minY } = layout.value
  const shown = new Set(known.value)
  for (const id of known.value) for (const exit of Object.values(w.rooms[id].exits)) shown.add(exit.to)
  return [...shown].filter(id => id in pos).map(id => ({
    id,
    name: known.value.has(id) ? w.rooms[id].name : '?',
    x: (pos[id][0] - minX) * CELL + CELL / 2,
    y: (pos[id][1] - minY) * CELL + CELL / 2,
    here: id === w.player_location,
    visited: known.value.has(id),
    people: q.npcsInRoom(w, id).length,
  }))
})

const mapLinks = computed(() => {
  const w = props.world
  const byId = Object.fromEntries(mapRooms.value.map(r => [r.id, r]))
  const links = []
  const seen = new Set()
  for (const r of mapRooms.value) {
    if (!r.visited) continue
    for (const exit of Object.values(w.rooms[r.id].exits)) {
      const other = byId[exit.to]
      const key = [r.id, exit.to].sort().join('|')
      if (!other || seen.has(key)) continue
      seen.add(key)
      const door = exit.door_id ? w.doors[exit.door_id] : null
      links.push({ key, x1: r.x, y1: r.y, x2: other.x, y2: other.y, door: door && { open: door.open, locked: door.locked, name: door.name } })
    }
  }
  return links
})

const viewBox = computed(() => `0 0 ${layout.value.cols * CELL} ${layout.value.rows * CELL}`)

// --- here ----------------------------------------------------------------------
const here = computed(() => {
  const w = props.world
  const room = q.currentRoom(w)
  return {
    room,
    description: q.resolvedDescription(w, room),
    exits: DIRECTION_ORDER.filter(d => room.exits[d]).map(d => {
      const exit = room.exits[d]
      const door = exit.door_id ? w.doors[exit.door_id] : null
      return { dir: d, to: known.value.has(exit.to) ? w.rooms[exit.to].name : 'somewhere new', door }
    }),
    items: q.itemsInRoom(w, room.id),
    npcs: q.npcsInRoom(w, room.id),
    inventory: q.inventory(w),
  }
})

// --- state ---------------------------------------------------------------------
const changed = computed(() => new Set(props.changedPaths))
const isChanged = path => changed.value.has(path)
const flagEntries = computed(() => Object.entries(props.world.flags))
const counterEntries = computed(() => Object.entries(props.world.counters))
const raw = computed(() => JSON.stringify(props.world, null, 2))
</script>

<template>
  <section class="panel world" aria-labelledby="world-title">
    <header class="panel-head">
      <h2 id="world-title">World</h2>
      <div class="tabs" role="tablist">
        <button
          v-for="[id, label] in tabs" :key="id" type="button" role="tab"
          :aria-selected="tab === id" :class="{ active: tab === id }" @click="tab = id"
        >{{ label }}</button>
      </div>
      <span class="turns">turn {{ world.turn_count }}<template v-if="world.outcome"> · {{ world.outcome }}</template></span>
    </header>

    <div class="body">
      <div v-if="tab === 'map'" class="map">
        <svg :viewBox="viewBox" role="img" aria-label="Map of the rooms you know">
          <g v-for="l in mapLinks" :key="l.key">
            <line :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" class="link" />
            <rect
              v-if="l.door"
              :x="(l.x1 + l.x2) / 2 - 7" :y="(l.y1 + l.y2) / 2 - 7" width="14" height="14" rx="2"
              class="door" :class="{ open: l.door.open, locked: l.door.locked }"
            ><title>{{ l.door.name }} ({{ l.door.open ? 'open' : l.door.locked ? 'locked' : 'closed' }})</title></rect>
          </g>
          <g v-for="r in mapRooms" :key="r.id" :class="['room', { here: r.here, unknown: !r.visited }]">
            <rect :x="r.x - BOX.w / 2" :y="r.y - BOX.h / 2" :width="BOX.w" :height="BOX.h" rx="6" />
            <text :x="r.x" :y="r.y + 4" text-anchor="middle">{{ r.name }}</text>
            <circle v-if="r.people && r.visited" :cx="r.x + BOX.w / 2 - 6" :cy="r.y - BOX.h / 2 + 6" r="4" class="npc" />
          </g>
        </svg>
        <p class="legend">
          <span class="key here"></span> you are here
          <span class="key door"></span> closed door
          <span class="key door open"></span> open door
          <span class="key npc"></span> someone here
        </p>
      </div>

      <div v-else-if="tab === 'here'" class="here">
        <h3>{{ here.room.name }}</h3>
        <p class="desc">{{ here.description }}</p>
        <dl>
          <dt>Exits</dt>
          <dd>
            <div v-for="e in here.exits" :key="e.dir">
              <strong>{{ e.dir }}</strong> → {{ e.to }}
              <span v-if="e.door" class="muted">via {{ e.door.name }} ({{ e.door.open ? 'open' : e.door.locked ? 'locked' : 'closed' }})</span>
            </div>
          </dd>
          <dt>You see</dt>
          <dd>
            <span v-for="i in here.items" :key="i.id" class="pill" :title="i.id">{{ i.name }}<small v-if="!i.portable"> fixed</small></span>
            <span v-for="n in here.npcs" :key="n.id" class="pill npc" :title="n.id">{{ n.name }}</span>
            <span v-if="!here.items.length && !here.npcs.length" class="muted">nothing</span>
          </dd>
          <dt>Carrying</dt>
          <dd>
            <span v-for="i in here.inventory" :key="i.id" class="pill" :title="i.id">{{ i.name }}</span>
            <span v-if="!here.inventory.length" class="muted">nothing</span>
          </dd>
        </dl>
      </div>

      <div v-else class="state">
        <h3>Flags</h3>
        <ul class="kv">
          <li v-for="[k, v] in flagEntries" :key="k" :class="{ changed: isChanged(`flags.${k}`) }">
            <code>{{ k }}</code><span :class="v ? 'yes' : 'no'">{{ v }}</span>
          </li>
          <li v-if="!flagEntries.length" class="muted">none set yet</li>
        </ul>
        <template v-if="counterEntries.length">
          <h3>Counters</h3>
          <ul class="kv">
            <li v-for="[k, v] in counterEntries" :key="k" :class="{ changed: isChanged(`counters.${k}`) }">
              <code>{{ k }}</code><span>{{ v }}</span>
            </li>
          </ul>
        </template>
        <h3>Doors</h3>
        <ul class="kv">
          <li v-for="d in Object.values(world.doors)" :key="d.id" :class="{ changed: isChanged(`doors.${d.id}.open`) || isChanged(`doors.${d.id}.locked`) }">
            <code>{{ d.id }}</code><span>{{ d.open ? 'open' : 'closed' }}{{ d.locked ? ', locked' : '' }}</span>
          </li>
        </ul>
        <h3>Items</h3>
        <ul class="kv">
          <li v-for="i in Object.values(world.items)" :key="i.id" :class="{ changed: isChanged(`items.${i.id}.location`) }">
            <code>{{ i.id }}</code><span>{{ i.location }}</span>
          </li>
        </ul>
        <details>
          <summary>Raw world JSON</summary>
          <pre>{{ raw }}</pre>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tabs { display: flex; gap: 2px; margin-left: auto; }
.tabs button {
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.tabs button.active { background: var(--chip); border-color: var(--line); color: var(--fg); }
.turns { color: var(--muted); font-size: 12px; font-family: var(--mono); }
.body { flex: 1; overflow-y: auto; min-height: 0; }

.map { height: 100%; display: flex; flex-direction: column; }
.map svg { flex: 1; min-height: 0; width: 100%; }
.link { stroke: var(--line-strong); stroke-width: 2; }
.door { fill: var(--bad); stroke: var(--panel); stroke-width: 2; }
.door.open { fill: var(--good); }
.room rect { fill: var(--chip); stroke: var(--line-strong); stroke-width: 1.5; }
.room text { fill: var(--fg); font-size: 11px; font-family: var(--sans); }
.room.here rect { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.5; }
.room.here text { font-weight: 700; }
.room.unknown rect { fill: none; stroke-dasharray: 4 3; }
.room.unknown text { fill: var(--muted); }
.npc { fill: var(--warn); }
.legend { font-size: 11px; color: var(--muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0 0; }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 6px; }
.key.here { background: var(--accent-soft); border: 2px solid var(--accent); }
.key.door { background: var(--bad); }
.key.door.open { background: var(--good); }
.key.npc { background: var(--warn); border-radius: 50%; }

.here h3 { margin: 2px 0 4px; font-size: 15px; }
.desc { font-size: 13px; color: var(--fg-soft); margin: 0 0 8px; }
dl { margin: 0; font-size: 13px; }
dt { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-top: 8px; }
dd { margin: 3px 0 0; display: flex; flex-wrap: wrap; gap: 4px; flex-direction: column; }
dd:has(.pill) { flex-direction: row; }
.pill { font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--chip); border: 1px solid var(--line); }
.pill.npc { border-style: dashed; }
.pill small { color: var(--muted); }

.state h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 10px 0 4px; }
.state h3:first-child { margin-top: 2px; }
.kv { list-style: none; margin: 0; padding: 0; font-size: 12.5px; }
.kv li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 6px; border-radius: 4px; }
.kv li.changed { background: var(--warn-soft); }
.kv code { font-family: var(--mono); font-size: 12px; }
.yes { color: var(--good); font-family: var(--mono); }
.no { color: var(--bad); font-family: var(--mono); }
details { margin-top: 10px; font-size: 12px; }
pre { font-family: var(--mono); font-size: 11px; background: var(--chip); padding: 8px; border-radius: 6px; overflow-x: auto; max-height: 320px; }
</style>
