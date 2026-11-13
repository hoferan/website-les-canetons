---
name: whats-next
description: Use when the user asks "what's next?", what to work on, or which issue to pick up, usually at the start of a session in this repository.
---

# What's next

The GitHub milestones and issues are the roadmap. Read them live every time,
because memory and earlier sessions go stale within a day.

## 1. Read the state

```bash
node .claude/skills/whats-next/roadmap.mjs
```

The script fetches `origin` and prints:

- `origin/main` and the milestone in progress
- the open pull requests
- the open issues of every milestone up to the one in progress
- every `priority:high` issue, best first

The `<-` hints come from labels and body text:

- `#401 step 6, earlier steps still open: …` is the issue's place in a tracking
  issue's order.
- `mentions open` and `mentions closed` show the state of every issue the body
  names. A mention alone is not a dependency.
- `decisions first?`, `content label` and `host/cutover?` are guesses. The
  body decides.

Then run the `READ THE BODIES` command it prints last.

## 2. Pick

1. An open pull request comes first. Finishing it (red checks, review, the
   merge) beats starting anything new.
2. Then the milestone in progress, whenever it has an actionable issue. Only
   if it has none, take the lowest R number that does. `Design system — later`
   is never next unless the user asks for it.
3. Inside a milestone, skip an issue whose earlier tracker steps are still
   open. Among the rest, `priority:high` comes before `medium` before `low`,
   and then the lower issue number.

An issue is not actionable when its body says that:

- decisions must be made first ("to settle", "the brainstorm decides")
- it waits for content the user has to supply
- it can only be done on a server, or waits for the QA/PROD cutover
- it depends on an issue that is still open

Mocks or screenshots that the body asks for are part of the work, so they
never block an issue. If the milestone in progress has only issues that need
decisions, recommend the brainstorm for the first of them.

The alternative is the first issue in the `priority:high` list that sits
outside the chosen milestone and has no open earlier steps. The read command
already includes it.

## 3. Answer

Keep it short and in the user's language:

- one line on the state: what merged last and which pull requests are open
- the recommendation, and in one or two lines why it is ready now
- the alternative
- one line for each other open issue of the milestone in progress, and one
  line for each lower milestone, with why it is not next. Later milestones
  get no line.

Then ask with AskUserQuestion. Put the recommendation first and mark it
"(Recommended)".

## 4. After the pick

One issue is one session, and this fresh session is that session. Work the
picked issue here, on a branch cut from `origin/main` and named after the issue.
If its body asks for a brainstorm, start with the brainstorming skill. If the
user picks several, keep the first and offer one new session per extra issue,
with the issue number as the brief.
