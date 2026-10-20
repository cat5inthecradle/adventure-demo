// Runs the WebLLM engine off the main thread, so downloading and compiling a model
// never freezes the terminal.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.onmessage = message => handler.onmessage(message)
