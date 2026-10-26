// Registers the World Builder's blocks with Blockly and keeps the dropdowns that
// name rooms, things, characters and doors in step with the workspace.

import * as Blockly from 'blockly/core'
import * as En from 'blockly/msg/en'
import { FieldMultilineInput } from '@blockly/field-multilineinput'
import { BLOCKS } from './schema.js'
import { slugify } from './convert.js'

Blockly.setLocale(En)

// --- long text, wrapped and folded -------------------------------------------------

// Descriptions and dialogue are paragraphs, but the plugin's field only breaks at
// line breaks the author typed, so a paragraph showed as one truncated line. This
// field word-wraps for display (the stored text is untouched), and at rest folds
// long text to two lines with the second fading out, so a stack of blocks keeps
// its shape as text is written. Clicking it opens the whole paragraph to edit.
const WRAP_AT = 46          // characters per displayed line
const FOLDED_LINES = 2      // at rest
const EDITING_LINES = 30    // while editing: enough for any paragraph
const FADE_ID = 'adventure-lab-text-fade'

function wrapText(text, width = WRAP_AT) {
  const lines = []
  for (const paragraph of String(text).split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line)
        line = ''
      }
      // A word longer than the line is broken rather than allowed to run on.
      let rest = line ? `${line} ${word}` : word
      while (rest.length > width) {
        lines.push(rest.slice(0, width))
        rest = rest.slice(width)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

/** The fade the folded second line is painted with, defined once per page. */
function ensureFade(svg) {
  if (!svg || document.getElementById(FADE_ID)) return
  const ns = 'http://www.w3.org/2000/svg'
  let defs = svg.querySelector('defs')
  if (!defs) defs = svg.insertBefore(document.createElementNS(ns, 'defs'), svg.firstChild)
  const gradient = document.createElementNS(ns, 'linearGradient')
  gradient.id = FADE_ID
  for (const [offset, opacity] of [['0', 1], ['0.35', 1], ['1', 0.05]]) {
    const stop = document.createElementNS(ns, 'stop')
    stop.setAttribute('offset', offset)
    stop.setAttribute('stop-color', '#000')
    stop.setAttribute('stop-opacity', String(opacity))
    gradient.appendChild(stop)
  }
  defs.appendChild(gradient)
}

class WrappedTextField extends FieldMultilineInput {
  getDisplayText_() {
    const text = this.getText()
    this.folded_ = false
    if (!text) return Blockly.Field.NBSP
    const all = wrapText(text)
    const keep = this.isBeingEdited_ ? EDITING_LINES : FOLDED_LINES
    this.folded_ = all.length > keep
    const shown = all.slice(0, keep)
      .map(line => line.replace(/\s/g, Blockly.Field.NBSP) || Blockly.Field.NBSP)
      .join('\n')
    return this.getSourceBlock()?.RTL ? `${shown}\u200F` : shown
  }

  render_() {
    super.render_()
    if (!this.folded_ || !this.textGroup) return
    ensureFade(this.textGroup.ownerSVGElement)
    // Inline style, so it wins over Blockly's own text colour rule.
    this.textGroup.lastElementChild.style.fill = `url(#${FADE_ID})`
  }

  // Unfold when editing starts, and fold again when it ends: both redraw the
  // field, and a redraw while editing resizes the editor to the whole text.
  showEditor_(...args) {
    super.showEditor_(...args)
    this.forceRerender()
  }

  onFinishEditing_(...args) {
    super.onFinishEditing_?.(...args)
    this.forceRerender()
  }

  widgetCreate_() {
    const editor = super.widgetCreate_()
    editor.style.whiteSpace = 'pre-wrap'
    editor.style.overflowWrap = 'break-word'
    editor.style.overflowY = 'auto'
    return editor
  }
}
Blockly.fieldRegistry.register('field_multilinetext', WrappedTextField)

// --- what can be referred to --------------------------------------------------------

// kind -> [{ id, name }], rebuilt from the workspace on every change. Dropdowns read
// it when they open, so a room renamed on the left reads correctly on the right.
const registry = { room: [], door: [], item: [], npc: [] }

const PLACES = [['carried by the player', 'inventory'], ['hidden (not in the world yet)', 'hidden']]

function optionsFor(kind, none) {
  const list = kind === 'entity' ? [...registry.item, ...registry.npc, ...registry.door]
    : kind === 'place' ? registry.room
      : registry[kind]
  const options = list.filter(e => e.id).map(e => [e.name || e.id, e.id])
  if (kind === 'place') options.push(...PLACES)
  if (none) options.unshift([none, ''])
  if (!options.length) options.push([`(add a ${kind} first)`, ''])
  return options
}

function fillRegistry(entries) {
  for (const kind of Object.keys(registry)) registry[kind] = []
  for (const { type, id, name } of entries) {
    if (type in registry) registry[type].push({ id, name })
  }
}

/** Fill the registry from a workspace state before loading it: a dropdown only
 *  accepts a value it can list, so every saved reference must be listable the
 *  moment its block is created. */
export function primeRegistry(state) {
  fillRegistry((state.blocks?.blocks ?? []).map(b => ({ type: b.type, id: b.data, name: b.fields?.NAME ?? '' })))
}

// --- block definitions --------------------------------------------------------------

function expandField(arg) {
  switch (arg.type) {
    case 'field_ref':
      return { type: 'field_dropdown', name: arg.name, options: () => optionsFor(arg.kind, arg.none) }
    case 'field_flag':
      return { type: 'field_variable', name: arg.name, variable: 'flag', variableTypes: ['Flag'], defaultType: 'Flag' }
    case 'field_counter':
      return { type: 'field_variable', name: arg.name, variable: 'count', variableTypes: ['Counter'], defaultType: 'Counter' }
    default:
      return arg
  }
}

Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(def => {
  const out = { ...def }
  for (const key of Object.keys(def)) {
    if (key.startsWith('args')) out[key] = def[key].map(expandField)
  }
  return out
}))

// Blocks that define something the world refers to by id.
const DEFINES = new Set(['room', 'door', 'item', 'npc', 'use_rule', 'trigger_rule'])

// --- the workspace ------------------------------------------------------------------

/** Wire a workspace up: buttons, hidden ids for new blocks, and the registry. */
export function attachWorkspace(workspace) {
  workspace.registerButtonCallback('createFlag', () =>
    Blockly.Variables.createVariableButtonHandler(workspace, null, 'Flag'))
  workspace.registerButtonCallback('createCounter', () =>
    Blockly.Variables.createVariableButtonHandler(workspace, null, 'Counter'))

  workspace.addChangeListener(event => {
    if (event.isUiEvent) return
    // Blockly delivers events from a queue that a throwing listener jams for good,
    // so a bug here must never escape: log it and let the next change try again.
    try {
      ensureIds(workspace)
      fillRegistry(workspace.getTopBlocks(false).map(b => ({ type: b.type, id: b.data, name: b.getFieldValue('NAME') })))
      // Only a rename changes what a dropdown elsewhere should read.
      if (event.type === Blockly.Events.BLOCK_CHANGE && event.name === 'NAME') refreshDropdowns(workspace)
    } catch (err) {
      console.error('World Builder:', err)
    }
  })
}

/** Every block that defines something gets an id of its own, made from its name —
 *  new blocks, pasted copies (whose copied id is already taken), and loaded ones. */
function ensureIds(workspace) {
  const taken = new Set()
  for (const block of workspace.getTopBlocks(false)) {
    if (!DEFINES.has(block.type)) continue
    if (block.data && !taken.has(block.data)) { taken.add(block.data); continue }
    const stem = slugify(block.getFieldValue('NAME') ?? block.type.replace('_rule', ''))
    let id = stem
    for (let n = 2; taken.has(id); n++) id = `${stem}_${n}`
    block.data = id
    taken.add(id)
  }
}

/** Redraw reference dropdowns whose label is stale after a rename. Blockly keeps the
 *  chosen option's label until the menu is next opened, so set it directly. */
function refreshDropdowns(workspace) {
  for (const block of workspace.getAllBlocks(false)) {
    for (const input of block.inputList) {
      for (const field of input.fieldRow) {
        if (!(field instanceof Blockly.FieldDropdown) || !field.isOptionListDynamic()) continue
        const options = field.getOptions(false)
        const selected = options.find(o => o[1] === field.getValue())
        if (selected && selected !== field.selectedOption) {
          field.selectedOption = selected
          field.forceRerender()
        }
      }
    }
  }
}

// Columns by kind: the story and its rooms, doors and things, characters, rules.
const COLUMNS = [['world', 'room'], ['door', 'item'], ['npc'], ['use_rule', 'trigger_rule']]

/** Lay out a freshly loaded world in tidy columns, using the blocks' real sizes. */
export function arrange(workspace) {
  const gap = 48
  let x = 24
  for (const types of COLUMNS) {
    let y = 24
    let widest = 0
    for (const block of workspace.getTopBlocks(false)) {
      if (!types.includes(block.type)) continue
      const { height, width } = block.getHeightWidth()
      block.moveTo(new Blockly.utils.Coordinate(x, y))
      y += height + gap
      widest = Math.max(widest, width)
    }
    if (widest) x += widest + gap * 2
  }
  // Start where a reader starts: the top-left, with the Story block in view. The
  // scroll area is padded around the content, so scroll to the content itself.
  const metrics = workspace.getMetricsManager()
  const content = metrics.getContentMetrics()
  const scroll = metrics.getScrollMetrics()
  workspace.scrollbar?.set(content.left - scroll.left - 16, content.top - scroll.top - 16)
}

/** Put the loader's complaint on the blocks it names, and clear the rest. */
export function markProblems(workspace, message) {
  const named = new Set([...String(message ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]))
  const marked = []
  for (const block of workspace.getAllBlocks(false)) {
    const hit = message && block.data && named.has(block.data)
    block.setWarningText(hit ? message : null)
    if (hit) marked.push(block.id)
  }
  return marked
}

export { Blockly }
