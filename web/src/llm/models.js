// The models offered in the picker. Kept apart from webllm.js so listing them
// does not pull the WebLLM runtime into the page before anyone asks for it.

// Small enough for a school Chromebook. Each has an f16 build (smaller, needs the
// GPU's shader-f16 feature) and an f32 build that works everywhere WebGPU does.
//
// `prompt` is the prompt version that scored best for that model on the
// benchmark (Benchmark view; scores in README.md). It differs by model: Llama
// does worse when asked to paraphrase first, the Qwen models much better.
export const MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B', size: '~1 GB', note: '36% · fastest', prompt: 'v3' },
  { id: 'Llama-3.2-1B-Instruct', label: 'Llama 3.2 1B', size: '~1 GB', note: '51%', prompt: 'v1' },
  { id: 'Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', size: '~1.7 GB', note: '80% · recommended', prompt: 'v3' },
]

/** Why WebGPU cannot run here, or null when it can. */
export async function webgpuProblem() {
  if (!('gpu' in navigator)) return 'This browser has no WebGPU (try a recent Chrome or Edge).'
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter ? null : 'WebGPU is present but no GPU adapter is available.'
  } catch (err) {
    return `WebGPU failed to start: ${err.message}`
  }
}

export async function supportsF16() {
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return !!adapter?.features.has('shader-f16')
  } catch {
    return false
  }
}
