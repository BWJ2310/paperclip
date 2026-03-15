# Wish: Dependency Modernization — Fix Deprecations & Peer Mismatches

**Status:** DRAFT
**Slug:** `dependency-modernization`
**Created:** 2026-03-15

---

## Summary

The `pnpm install` output shows 4 deprecated subdependencies and 2 unmet peer dependency warnings. This wish upgrades the dependency tree in safe, ordered stages: drizzle-orm first (unblocks better-auth peer), then zod 3→4 (unblocks better-call peer), then better-auth to latest, then dev tooling (vitest/coverage), and finally suppress remaining upstream-only deprecations with `pnpm.overrides`.

---

## Scope

### IN
- Upgrade `drizzle-orm` from `0.38.4` → `0.45.1` across `@paperclipai/db`, `@paperclipai/server`, and `cli`
- Upgrade `drizzle-kit` from `0.31.9` → `0.31.9` (stays same — latest stable; 1.0.0-beta not ready)
- Migrate `zod` from `3.25.76` → `4.3.6` across all workspace packages (17 source files)
- Upgrade `better-auth` from `1.4.18` → `1.5.5` (once drizzle-orm + zod are done)
- Upgrade `@vitest/coverage-v8` from `3.2.4` → `4.1.0` and `vitest` from `3.2.4` → `4.x` to fix `glob@10.5.0` deprecation
- Add `pnpm.overrides` for `@esbuild-kit/*` and `intersection-observer` (upstream-only, can't fix)
- Verify no existing eslint/prettier config exists (confirmed: none found — biome is additive, not a replacement)

### OUT
- Upgrading `drizzle-kit` to `1.0.0-beta` (unstable)
- Adding biome as linter/formatter (no existing tool to replace — separate initiative)
- Upgrading `@mdxeditor/editor` or `@codesandbox/sandpack-react` (already latest)
- pnpm version upgrade (`9.15.4` → `10.32.1`) — separate concern, affects `packageManager` field
- Database schema migrations or data changes
- Changing the better-auth integration pattern (adapters, session resolution)

---

## Decisions

- **DEC-1: Order matters.** drizzle-orm must upgrade before better-auth (peer dep). zod must upgrade before better-auth (better-call peer). Each group validates independently before proceeding.
- **DEC-2: Zod 4 migration strategy.** Use the [`zod-v3-to-v4` codemod](https://github.com/nicoespeon/zod-v3-to-v4) for automated transforms, then manual review. Key changes: `{ message: ... }` → `{ error: ... }`, `z.string().email()` stays (still works but also available as `z.email()`), `.merge()` → `.extend()`, `z.nativeEnum()` → `z.enum()`. Additionally, **30+ `z.ZodIssueCode.custom` callsites** in `packages/shared/src/validators/plugin.ts` (26), `agent.ts` (1), `project.ts` (1), and `config-schema.ts` (2) use `.superRefine()` with `{ message: ... }` — these must be updated to `{ error: ... }`. Named imports `ZodError` (in `server/src/middleware/error-handler.ts`) and `ZodSchema` (in `server/src/middleware/validate.ts`) must be verified against zod 4 API — `ZodError` is renamed to `z.ZodError`, `ZodSchema` may need `z.ZodType` instead.
- **DEC-3: drizzle-orm 0.38→0.45 breaking changes.** Removed in-driver mapping for postgres array types (1231, 1115, 1185, 1187, 1182). We must audit if we use `numeric[]`, `timestamp[]`, `interval[]`, `date[]` column types. New `bigint`/`number` modes for decimal/numeric. Must verify existing schema compatibility.
- **DEC-4: Vitest 3→4 upgrade.** Required to resolve `glob@10.5.0` deprecation (via `test-exclude@8`). Must check vitest 4 breaking changes and update test configs if needed.
- **DEC-5: Biome does NOT replace anything.** No eslint, prettier, or biome config exists in the project today. Biome would be a net-new addition — out of scope for this dependency modernization wish.
- **DEC-6: Upstream suppression.** `@esbuild-kit/*` is pulled by `drizzle-kit@0.31.9` (even latest). `intersection-observer` is pulled by `@codesandbox/sandpack-react`. Both are leaf-level, non-functional in our app. Suppress with `pnpm.overrides` to clean up install output.

---

## Success Criteria

- [ ] `pnpm install` produces zero deprecated subdependency warnings
- [ ] `pnpm install` produces zero unmet peer dependency warnings
- [ ] `pnpm -r typecheck` passes with zero errors
- [ ] `pnpm test:run` passes all tests
- [ ] `pnpm -r build` succeeds
- [ ] better-auth login/signup/session flow works (manual smoke test)
- [ ] drizzle-kit `generate` and `migrate` still work against existing schema
- [ ] No runtime regressions in zod validation (server API validation, config parsing)

---

## Assumptions

- **ASM-1:** drizzle-orm 0.38→0.45 is backwards-compatible for our postgres column types (we don't use the removed array type mappings — to be verified in G1)
- **ASM-2:** zod 4 codemod handles our standard usage patterns, but 30+ `.superRefine()` callsites with `z.ZodIssueCode.custom` and named imports (`ZodError`, `ZodSchema`) will need manual review
- **ASM-3:** vitest 4 test API is backwards-compatible with our test suite (standard describe/it/expect patterns)
- **ASM-4:** better-auth 1.5.5 drizzle adapter API is compatible with our `createBetterAuthInstance()` pattern in `server/src/auth/better-auth.ts`

## Risks

- **RISK-1:** drizzle-orm 0.45 may change query builder behavior subtly. Mitigation: run full test suite + manual smoke test of key queries.
- **RISK-2:** zod 4 `z.object({ field: z.string().default("x").optional() }).parse({})` now returns `{ field: "x" }` instead of `{}`. If any code relies on absent defaults, this could cause regressions. Mitigation: search for `.default(...).optional()` patterns.
- **RISK-3:** better-auth 1.5.5 may have new required config fields or changed adapter API. Mitigation: read changelog before upgrading, keep as last group.

---

## Execution Groups

### G1: Upgrade drizzle-orm (0.38 → 0.45)
**Goal:** Satisfy `better-auth` peer dependency requirement (`drizzle-orm >= 0.41.0`).

**Deliverables:**
1. Audit `@paperclipai/db/src/schema/*.ts` for use of postgres array types (`numeric[]`, `timestamp[]`, `interval[]`, `date[]`) — these lost in-driver mapping in 0.41
2. Bump `drizzle-orm` in `packages/db/package.json`, `server/package.json`, AND `cli/package.json` from `^0.38.4` / `0.38.4` → `^0.45.1` (note: cli pins exact version `0.38.4`, not caret — must update)
3. Run `pnpm install` and resolve any new peer warnings
4. Run `drizzle-kit generate` — verify no unexpected migration diffs
5. Fix any type errors from API changes

**Acceptance criteria:**
- `pnpm -r typecheck` passes
- `pnpm test:run` passes
- `drizzle-kit generate` produces no diff (no unintended schema changes)
- `better-auth` peer warning for `drizzle-orm` is gone

**Validation:** `pnpm -r typecheck && pnpm test:run && cd packages/db && pnpm drizzle-kit generate 2>&1 | grep -c "No schema changes"`

**Files likely touched:**
- `packages/db/package.json`
- `server/package.json`
- `cli/package.json` (pins exact `drizzle-orm: "0.38.4"` — must bump)
- Possibly `packages/db/src/schema/*.ts` if array type mappings need updating
- Possibly `packages/db/src/client.ts` if connection API changed

---

### G2: Migrate zod 3 → 4
**Goal:** Satisfy `better-call` peer dependency (`zod >= 4.0.0`) and modernize validation.

**Deliverables:**
1. Install `zod-v3-to-v4` codemod and run across workspace: `npx @nicolo-ribaudo/zod-v3-to-v4` (or manual if codemod is unavailable)
2. Bump `zod` in `packages/shared/package.json`, `server/package.json`, `packages/plugins/sdk/package.json` from `^3.24.2` → `^4.3.6`
3. Apply migration transforms:
   - `{ message: "..." }` → `{ error: "..." }` in validation error customization (31 occurrences across 3 validator files + config-schema)
   - `z.nativeEnum()` → `z.enum()` if used
   - `.merge()` → `.extend()` if used
   - Audit `.default(...).optional()` patterns for changed behavior
4. **Migrate 30+ `z.ZodIssueCode.custom` callsites** in `.superRefine()` handlers:
   - `packages/shared/src/validators/plugin.ts` — 26 callsites using `ctx.addIssue({ code: z.ZodIssueCode.custom, message: "..." })` — update `message` → `error` if zod 4 changes issue API
   - `packages/shared/src/validators/agent.ts` — 1 callsite
   - `packages/shared/src/validators/project.ts` — 1 callsite
   - `packages/shared/src/config-schema.ts` — 2 callsites
5. **Fix named imports in server middleware:**
   - `server/src/middleware/error-handler.ts`: `import { ZodError } from "zod"` — verify `ZodError` still exported as named export in zod 4 (it is, via `z.ZodError`)
   - `server/src/middleware/validate.ts`: `import type { ZodSchema } from "zod"` — may need `ZodType` instead if `ZodSchema` is removed
6. Verify `@paperclipai/plugin-sdk` public API (zod is re-exported — breaking change for plugin authors)
7. Fix all type errors

**Acceptance criteria:**
- `pnpm -r typecheck` passes
- `pnpm test:run` passes
- `better-call` peer warning for `zod` is gone
- Server starts and config parsing works
- All 30+ `.superRefine()` callsites compile and pass validation

**Validation:** `pnpm -r typecheck && pnpm test:run`

**Files likely touched (17+ source files):**
- `packages/shared/package.json` + `packages/shared/src/config-schema.ts` + `packages/shared/src/validators/*.ts` (11 files — especially `plugin.ts` with 26 callsites)
- `packages/plugins/sdk/package.json` + `packages/plugins/sdk/src/index.ts`
- `server/package.json` + `server/src/middleware/validate.ts` + `server/src/middleware/error-handler.ts`

**depends-on:** G1 (drizzle-orm must be done first to avoid compound failures)

---

### G3: Upgrade better-auth (1.4.18 → 1.5.5)
**Goal:** Get latest better-auth with resolved peer deps.

**Deliverables:**
1. Read better-auth 1.4.18→1.5.5 changelog for breaking changes
2. Bump `better-auth` in `server/package.json` from `1.4.18` → `1.5.5`
3. Run `pnpm install` — verify zero peer warnings for better-auth subtree
4. Verify `drizzleAdapter()` call in `server/src/auth/better-auth.ts` still works
5. Verify `better-auth/crypto` imports (`verifyPassword`, `hashPassword`) still work
6. Verify `toNodeHandler` from `better-auth/node` still works
7. Fix any API changes in auth config

**Acceptance criteria:**
- `pnpm install` shows no peer warnings for `better-auth`, `better-call`, or `zod`
- `pnpm -r typecheck` passes
- `pnpm test:run` passes
- Login/signup works (manual smoke test)

**Validation:** `pnpm install 2>&1 | grep -c "unmet peer" && pnpm -r typecheck && pnpm test:run`

**Files likely touched:**
- `server/package.json`
- Possibly `server/src/auth/better-auth.ts` if adapter API changed
- Possibly `server/src/routes/users.ts` if crypto imports changed

**depends-on:** G1, G2

---

### G4: Upgrade vitest + coverage-v8 (3.x → 4.x)
**Goal:** Eliminate `glob@10.5.0` deprecation warning.

**Deliverables:**
1. Bump root `package.json`: `vitest` `^3.0.5` → `^4.1.0`, `@vitest/coverage-v8` `^3.0.5` → `^4.1.0`
2. Bump vitest in all workspace `devDependencies` (`packages/db`, `server`, `ui`)
3. Update vitest config files if API changed (check `vitest.config.ts` / `vite.config.ts`)
4. Run full test suite — fix any assertion API changes
5. Verify `test-exclude@8` is now resolved (uses `glob@^13` instead of deprecated `glob@10`)

**Acceptance criteria:**
- `pnpm install` shows no `glob` deprecation
- `pnpm test:run` passes
- `pnpm test:coverage` works

**Validation:** `pnpm install 2>&1 | grep "glob" | grep -c deprecated && pnpm test:run && pnpm test:coverage`

**Files likely touched:**
- `package.json` (root)
- `packages/db/package.json`
- `server/package.json`
- `ui/package.json`
- Possibly `vitest.config.ts` or test files if API broke

**depends-on:** none (independent of G1-G3, but run after to avoid churn)

---

### G5: Suppress upstream deprecations via pnpm.overrides
**Goal:** Clean up remaining warnings that can't be fixed by upgrades.

**Deliverables:**
1. Add `pnpm.overrides` to root `package.json`:
   ```json
   "pnpm": {
     "overrides": {
       "@esbuild-kit/core-utils": "npm:tsx@^4.19.2",
       "@esbuild-kit/esm-loader": "npm:tsx@^4.19.2",
       "intersection-observer": "npm:@aspect-build/empty-package@latest"
     }
   }
   ```
   Note: the `@esbuild-kit` override may not work cleanly since tsx has a different API. Alternative: just add `pnpm.peerDependencyRules.ignoreMissing` or accept the deprecation warning since it's upstream in drizzle-kit.
2. Actually, more realistic approach — use `pnpm.auditConfig` or simply document that these are upstream:
   ```json
   "pnpm": {
     "peerDependencyRules": {
       "ignoreMissing": [],
       "allowAny": []
     }
   }
   ```
3. Test that `pnpm install` is clean or only shows known-upstream warnings
4. Add a comment in `package.json` documenting why overrides exist and when to remove them

**Acceptance criteria:**
- `pnpm install` output is clean (no actionable warnings)
- No functional regressions from overrides
- Overrides are documented with removal conditions

**Validation:** `pnpm install 2>&1 | grep -cE "(deprecated|unmet peer)"`

**Files likely touched:**
- `package.json` (root)

**depends-on:** G1, G2, G3, G4 (run last — only suppress what remains)

---

## Dependency Graph

```
G1 (drizzle-orm) ──┐
                    ├──▸ G3 (better-auth) ──┐
G2 (zod 3→4) ──────┘                       ├──▸ G5 (overrides)
                                            │
G4 (vitest 4) ─────────────────────────────┘
```

## Package Version Summary

| Package | Current | Target | Breaking? |
|---------|---------|--------|-----------|
| `drizzle-orm` | 0.38.4 | 0.45.1 | Medium — array type mapping removed |
| `drizzle-kit` | 0.31.9 | 0.31.9 | No change (latest stable) |
| `zod` | 3.25.76 | 4.3.6 | Yes — error API, default behavior, format methods |
| `better-auth` | 1.4.18 | 1.5.5 | Low — minor release |
| `better-call` | 1.1.8 | 2.0.2 | Transitive (comes with better-auth) |
| `vitest` | 3.2.4 | 4.1.0 | Low-Medium — major version bump |
| `@vitest/coverage-v8` | 3.2.4 | 4.1.0 | Low — follows vitest |

## Biome Finding

**No existing linter/formatter exists in this project.** There is no eslint, prettier, or biome configuration anywhere in the workspace. Biome would be a new addition, not a replacement — this is a separate initiative and explicitly out of scope.
