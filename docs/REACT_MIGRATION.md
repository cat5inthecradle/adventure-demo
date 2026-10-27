# Moving Adventure Lab to React and into the main repo

Adventure Lab is a prototype of a Code.org lab. The plan is to rewrite its views
in React and then move it into `code-dot-org`, where it becomes a lab package that
Studio loads like Music Lab or Dance Party. This file is the plan for getting
there with as little rewriting as possible.

The rule that makes it cheap: **only views are framework code.** Everything else
is plain JavaScript with no Vue import, so it moves as it is.

## What moves as it is, and what changes

| Here | In the main repo | Work |
|---|---|---|
| `web/src/engine/` | The lab's engine, unchanged | Convert to TypeScript, or keep as JS behind type declarations |
| `web/src/lab2/` | `apps/src/lab2/progress/` (`ProgressManager`, `ConditionsChecker`) and Studio's `resolveCourseLevel` | Delete ours and import theirs. Same names, same semantics |
| `web/src/adventure/conditions.js`, `AdventureValidator.js` | The lab's `progress/` folder, like `music/progress/MusicConditions.ts` and `MusicValidator.ts` | Rename to `.ts` |
| `web/src/adventure/levelKind.js` | The lab's `schema.ts`, registered with `registerLevelKindSchema('adventure', …)` | Same zod schema |
| `curriculum/hour-of-ai/unit.json` | A unit in levelbuilder (`dashboard/config/scripts_json/`) | Already in script-structure shape |
| `curriculum/hour-of-ai/level_properties.json` | One `.level` file per level (`dashboard/config/levels/custom/adventure/`) | Same fields: `long_instructions`, `validations`, `level_data`, `project_template_level_name`, `teacher_markdown` |
| `worlds/starters/*.json` | Each level's `startSources`, or assets the lab loads | The world format is unchanged |
| `web/src/lesson/LessonController.js` | Studio's routing and Lab2's project handling | Mostly deleted: the host does this job there |
| `web/src/game.js` | The lab's session store | Must stop importing Vue first (phase 1) |
| `web/src/components/*.vue` | React components | The real rewrite (phase 2) |
| Browser storage for worlds | The project system (channels and sources) | `projectTemplateLevelName` starts doing real work |
| The interpreter (`engine/interpreter.js`) | Unchanged, plus an AI Gateway adapter next to the in-browser one | Same `interpret()` contract |

## Phases

Each phase leaves the app working and the tests green.

### Phase 1: no Vue outside the views (in this repo)

- `game.js` uses Vue's `reactive` and `shallowRef`. Make it a plain store with
  `getState()` and `subscribe()`, in the same spirit as Oceans' `state.ts`.
  Vue reads it through a small composable. React will read it through
  `useSyncExternalStore`.
- `LessonController` is already framework-free. Keep it that way.
- Move every student-facing string into one locale module, because the main repo
  needs them translatable.

### Phase 2: React views (in this repo)

- Swap `@vitejs/plugin-vue` for `@vitejs/plugin-react` and rewrite the views one
  by one in TypeScript: terminal, parser panel, world panel, instructions, AI
  dial, World Builder, benchmark.
- Reuse what Lab2 already has instead of porting ours: its instructions panel
  (with validation feedback and Continue), its layout and its Blockly wrappers.
  Our `InstructionsPanel` and markdown renderer exist only to stand in for them.
- Use `@code-dot-org/component-library` for buttons, tabs and form controls so
  the look matches Studio.
- Tests: the engine, curriculum and acceptance suites don't change. Add React
  Testing Library tests for the views.

### Phase 3: shape it as a lab package (in this repo)

Match the scaffold in `frontend/packages/labs/` (see `docs/conventions/packages.md`
there, which their turbo generator follows):

- The default export is one React component taking `onContinue`. It reads the
  level through `useLevelProperties()` and never reads the URL.
- Vite library mode, a standalone dev server (`main.tsx` calling `initializeCore()`),
  and level-property fixtures checked against the schema.
- Runtime settings such as the AI Gateway URL come from `SiteConfig`, never from
  `import.meta.env`.

### Phase 4: move it

1. Generate the package with the main repo's generator and copy the source in.
2. Register it in Studio: `AVAILABLE_LABS` in `src/modules/labs/config/labs.ts`
   and the lazy import in `getLabEntrypoint.ts`.
3. Create the levels and the unit in levelbuilder from the JSON here.
4. Point validation at the shared progress system and delete `src/lab2/`.

## Open questions

- **Which host?** Music and Dance run on Lab2 in `apps/`, which has the progress
  system. The newer `frontend/packages/labs` shell has level properties and
  `onContinue` but, per its README, no progress system or project store yet.
  Building on Lab2 works today; building on `frontend/` is where new labs are
  heading. Decide with the platform team before phase 3.
- **Genre choice.** In the main repo a level's starting content is fixed by the
  level. Our students pick a genre in level 1 and keep it. Either level 1
  creates the project that later levels inherit, or the genre pick becomes a
  choice level (`BubbleChoice`) with one starter per genre.
- **The AI dial's later settings.** Fill gaps and improvise need a model that
  writes prose, which means the AI Gateway adapter. They should come through the
  same interpreter contract so the engine still decides what is true.
