import { z } from 'zod'

const AiDialSettingSchema = z.enum([
  'off',
  'understand',
  'fill_gaps',
  'improvise',
  'invent',
])

const AiDialSchema = z.object({
  settings: z.array(AiDialSettingSchema),
  default: AiDialSettingSchema,
  locked: z.array(AiDialSettingSchema),
})

const ValidationConditionSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
})

const StepSchema = z.object({
  text: z.string(),
  conditions: z.array(ValidationConditionSchema).default([]),
})

export const AdventureLevelDataSchema = z.object({
  startWorld: z.string(),
  view: z.enum(['play', 'build']),
  panels: z.array(z.enum(['understood', 'world'])).default([]),
  revealPanels: z.enum(['always', 'on_select']).default('always'),
  steps: z.array(StepSchema).default([]),
  build: z.union([
    z.null(),
    z.object({
      blocks: z.array(z.string()).optional(),
    }),
  ]).default(null),
  interpreter: z.boolean().default(false),
  aiDial: AiDialSchema.optional(),
})

const ValidationSchema = z.object({
  key: z.string(),
  conditions: z.array(ValidationConditionSchema).default([]),
  message: z.string(),
  next: z.boolean(),
  callout: z.string().optional(),
})

export const AdventureLevelPropertiesSchema = z.object({
  id: z.number(),
  name: z.string(),
  appName: z.literal('adventure'),
  type: z.string(),
  displayName: z.string(),
  longInstructions: z.string().optional(),
  teacherMarkdown: z.string().optional(),
  projectTemplateLevelName: z.string().optional(),
  freePlay: z.boolean().default(false),
  validations: z.array(ValidationSchema).default([]),
  levelData: AdventureLevelDataSchema,
})

export function parseLevelProperties(raw) {
  const result = AdventureLevelPropertiesSchema.safeParse(raw)
  if (result.success) return result.data

  const details = result.error.issues.map(issue => {
    const path = issue.path.length ? issue.path.join('.') : 'level properties'
    return `${path}: ${issue.message}`
  }).join('; ')
  throw new Error(`Invalid Adventure level properties: ${details}`)
}
