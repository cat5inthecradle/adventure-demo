<script setup>
import { ref } from 'vue'
import guide from '../../../docs/HOUR_OF_AI_TEACHER_GUIDE.md?raw'
import { renderMarkdown } from '../lesson/markdown.js'
const dialog = ref(null)
const html = renderMarkdown(guide)
</script>
<template>
  <button type="button" class="guide-button" @click="dialog.showModal()">Open the 60-minute teacher guide</button>
  <dialog ref="dialog" aria-label="Adventure Lab teacher guide">
    <header><button type="button" autofocus @click="dialog.close()">Close teacher guide</button></header>
    <div class="guide-content" v-html="html"></div>
  </dialog>
</template>
<style scoped>
button { font: inherit; padding: 8px; color: var(--fg); background: var(--panel); border: 1px solid var(--line-strong); border-radius: 5px; cursor: pointer; }
.guide-button { margin-top: 10px; }
dialog { width: min(760px, 92vw); max-height: 85vh; overflow-y: auto; color: var(--fg); background: var(--panel); border: 2px solid var(--edge); border-radius: 8px; padding: 20px; }
dialog::backdrop { background: rgb(0 0 0 / .5); }
header { position: sticky; top: -20px; background: var(--panel); padding: 8px 0; text-align: right; }
.guide-content { line-height: 1.6; font-size: 14px; }
.guide-content :deep(h1) { font-size: 25px; }
.guide-content :deep(h2) { font-size: 19px; margin-top: 22px; }
.guide-content :deep(li) { margin-bottom: 8px; }
</style>
