// A WebLLM-backed Interpreter: a small language model running in the browser on
// WebGPU, consulted only for lines the parser could not use.
//
// It never decides truth. It sees the same small snapshot the parser does
// (buildContext), its output is constrained by a grammar built from that snapshot
// (actionSchema) so it cannot name anything out of sight, the answer is checked
// again by validateResolution, and the engine still has the last word.

import { CreateWebWorkerMLCEngine, hasModelInCache } from '@mlc-ai/web-llm'
import { actionSchema } from '../engine/interpreter.js'
import { supportsF16 } from './models.js'
import { DEFAULT_PROMPT, EXPLAINS, PROMPTS } from './prompts.js'

export { MODELS, webgpuProblem } from './models.js'

/** The exact WebLLM build to use on this machine for one of MODELS. */
export async function buildFor(model) {
  return `${model.id}-${(await supportsF16()) ? 'q4f16_1' : 'q4f32_1'}-MLC`
}

export const isCached = buildId => hasModelInCache(buildId).catch(() => false)

export class WebLLMInterpreter {
  constructor(model, buildId, prompt = model.prompt ?? DEFAULT_PROMPT) {
    this.model = model
    this.buildId = buildId
    this.prompt = prompt
    this.name = `webllm · ${model.label} · prompt ${prompt}`
    this.engine = null
    this.worker = null
  }

  /** Download (or read from cache) and compile the model. onProgress gets {progress, text}. */
  async load(onProgress) {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    this.engine = await CreateWebWorkerMLCEngine(this.worker, this.buildId, {
      initProgressCallback: report => onProgress?.(report),
    })
  }

  async unload() {
    await this.engine?.unload().catch(() => {})
    this.worker?.terminate()
    this.engine = null
  }

  async interpret(utterance, context, transcript) {
    if (!this.engine) return { kind: 'unavailable', detail: 'the model is not loaded' }
    const schema = actionSchema(context, { explain: EXPLAINS.has(this.prompt) })
    const messages = PROMPTS[this.prompt](utterance, context, transcript)
    const reply = await this.engine.chat.completions.create({
      messages,
      temperature: 0,
      max_tokens: 128,
      response_format: { type: 'json_object', schema: JSON.stringify(schema) },
    })
    const raw = reply.choices[0]?.message?.content ?? ''
    const meta = {
      model: this.buildId,
      raw,
      promptVersion: this.prompt,
      prompt: messages.at(-1).content,
      messages,
      tokens: reply.usage && { prompt: reply.usage.prompt_tokens, completion: reply.usage.completion_tokens },
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { kind: 'clarify', question: "I didn't catch that. Could you say it another way?", meta }
    }
    // The paraphrase is for the model's benefit and the panel's, never the engine's.
    if ('means' in parsed) {
      meta.means = parsed.means
      delete parsed.means
    }
    if (parsed.type === 'clarify') {
      return { kind: 'clarify', question: parsed.question || 'What do you want to do?', meta }
    }
    return { kind: 'action', action: parsed, rephrased: meta.means ?? null, meta }
  }
}
