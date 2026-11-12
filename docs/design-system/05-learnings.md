# 05 · Learnings

> The wrap-up the brief asked for: which clean-architecture principles this project applied, where they paid off, where they were too much for a one-person site, and what to do differently with several teams.
> Links point to one source per idea. Like the earlier documents, they were not fetched from this session, so treat them as pointers.

## 1. The principles we applied

| Principle | What it became here | Source |
| --- | --- | --- |
| The dependency rule: dependencies point inward, toward what changes least | Layers tokens → primitives → composites → patterns → app. Nothing in `design-system/` imports `@/`. | Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) |
| Information hiding: a module shows a small surface and hides the rest | The `@ds` barrel is the only way in. Deep imports are lint errors. | D. L. Parnas, [On the criteria to be used in decomposing systems into modules](https://dl.acm.org/doi/10.1145/361598.361623) |
| Ports and adapters: the core defines what it needs, the outside plugs in | The app's `FormField` became an adapter over the DS `FormField`: translation and browser validation stay in the app, and the DS takes strings. Links come in through `asChild`, text through props. | Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) |
| Indirection through names: depend on a role, not a value | The semantic token tier (`--color-action`, `--color-feedback-error`) over the raw palette (`--color-violet`). | DTCG's alias model, [designtokens.org](https://www.designtokens.org/) |
| Fitness functions: an architectural rule is a test, or it is a wish | `eslint-plugin-boundaries` in the editor, `dependency-cruiser` in CI, both proven by files that break each rule. | [Fitness function-driven development](https://www.thoughtworks.com/insights/articles/fitness-function-driven-development) |
| YAGNI: do not build for a consumer that does not exist | No versioning, no DTCG build, no package. Each has a written trigger (ADRs 0001, 0002, 0006). | Martin Fowler, [Yagni](https://martinfowler.com/bliki/Yagni.html) |
| Strangler fig: replace a system piece by piece while it keeps running | The slice moved one screen and 75 imports without touching the ~28 `FormField` callers. The roadmap moves the rest the same way. | Martin Fowler, [Strangler fig application](https://martinfowler.com/bliki/StranglerFigApplication.html) |

## 2. Where it paid off

1. The adapter made the migration invisible. Splitting `FormField` into a DS composite and an app adapter meant 28 callers did not change. The design system got a pure component, the app kept its i18n, and the split *is* the boundary. This is the most transferable lesson of the session: when a component mixes concerns, put an adapter where the old component was and leave its callers alone.
2. Naming tokens by role found a real bug before it shipped. `--color-text-muted` would have generated `text-muted`, which already exists as shadcn's cream page ground, so text would have rendered cream on cream. Having to choose a role name (`content`) forced a look at the existing vocabulary. With raw values the clash would have stayed hidden.
3. One focus token fixed a defect the review measured. #391 (a 2.5:1 ring) existed because four focus mechanisms grew side by side. A single `--color-focus` used by a single utility fixed Button and Input, and also uncovered a second bug: the first invalid field's ring was red on red, so invisible.
4. Stories with no providers are a test of the dependency rule. If a component renders in Storybook without a router, i18n or a query client, it does not depend on them. That check costs nothing once Storybook is set up, and it answers the question the import graph can only approximate.
5. Zero cycles made extraction cheap, and the boundary rules now keep it that way. Phase 1 measured that before anything moved, which is why the slice could be small.
6. The roadmap writes itself from the measurements. Because Phase 1 counted things (11 selects, 8 checkboxes, 9 pills), the estimates in `04-roadmap.md` rest on call-site counts and not on feel.

## 3. Where it was overkill for this size

For a one-person site, I would not repeat these as they are:

1. Two boundary tools. `eslint-plugin-boundaries` and `dependency-cruiser` check the same matrix. One gives editor feedback, the other runs in CI and draws the graph, but for one developer either alone would do. I would keep `dependency-cruiser` (it has no silent no-op mode, it catches cycles and it draws the graph) and drop the ESLint plugin. In v7 the plugin silently checked nothing until `import/resolver` knew about `.ts`, and finding that out was the costliest friction of the slice.
2. Five layers for about 25 components. The line between "composite" and "pattern" did no work yet: `PageSection` could sit in either. Three layers (tokens, components, app) would have taught the same dependency rule with less filing. More layers earn their place when different people own them.
3. Storybook next to an existing `/dev/ui`. It is the right tool, and the provider-free check (§2.4) is real. But it is the heaviest dependency tree in the repo, it needs its own Vite config, and the alias is now declared in four places. For a single consumer, an extended `/dev/ui` plus the boundary lint would have covered most of it.
4. ADRs in a second folder. Keeping design-system ADRs in `docs/design-system/adr/`, apart from the repo's `docs/adr/`, fit a learning project you can delete in one go. In a real codebase it splits the decision log in two, and someone will look in the wrong one.
5. The semantic tier added up front. Only tokens a component used were added, which was the right restraint. Even so, with one look and no themes, `bg-action` and `bg-violet` are two names for one value. The tier pays when a second theme, or a second meaning for violet, shows up. The stage override in step 1.1 is the first real use.

None of these was wasted as learning, but on a small project you should be able to defend dropping each of them when someone asks "why so much?".

## 4. What to do differently in a larger, multi-team setting

| Topic | Here | With several teams |
| --- | --- | --- |
| Distribution | In-app module, alias `@ds`. | A package with an `exports` map from day one, because the boundary has to hold against people who never read the ADR. Built (approach 3) once more than one app consumes it. |
| Versioning | None (ADR 0006). | Semver with Changesets, a changelog people actually read, and a deprecation policy: a component is marked deprecated for at least one minor version, with a codemod where possible, before it is removed. |
| Ownership | One person decides. | A `CODEOWNERS` entry for the design-system folder, and an RFC step for new components ("does this belong in the DS or in your feature?"). [Conway's law](https://martinfowler.com/bliki/ConwaysLaw.html) applies: the layer boundaries will follow team boundaries whether you plan them or not, so plan them. |
| Contribution model | Write it yourself. | Decide whether the DS team builds everything (a bottleneck) or reviews contributions (a quality risk). Most teams end up federated: product teams contribute and the DS team curates. |
| Tokens | CSS is the source. | DTCG JSON as the source, generated to CSS, Figma variables and native platforms, because designers own the values and need to change them without a frontend PR. |
| Visual regression | Deferred; pixel diffs by hand. | Required. With many contributors, review cannot catch a 1 px radius change. Baselines are generated in CI on Linux only. |
| Adoption | Every call site moves in the same PR. | Not possible across teams. Measure adoption instead: count raw `<select>`s per repo over time and publish the number. A guard that fails the build is only fair once the replacement has existed for a release. |
| Accessibility | The DS promises a11y and tests it per component. | The same, plus a written support matrix (browsers, screen readers) and an a11y owner, because a promise needs someone who answers for it. |
| Documentation | Stories and ADRs. | Add usage guidance: when to use a component and when not to. Misuse is often a correct component in the wrong place. |

## 5. Habits worth keeping from this session

1. Measure before you design. Phase 1's counts decided the slice scope, the roadmap order and the estimates.
2. Prove that a guard can fail. The boundary plugin passed everything until it was broken on purpose. Every rule in this design system was checked with a file that violates it, and the roadmap keeps that as part of the definition of done.
3. Write the trigger, not just the deferral. "No versioning *until there is a second consumer*" is a decision someone can act on later. "No versioning for now" is not.
4. Measure a visual baseline against itself first. The pixel diff showed every pixel changed until the font-path trap was found. Comparing `main` with `main` first shows the noise floor, and anything above it is real.
