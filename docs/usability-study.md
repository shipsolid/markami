# Usability study protocol

A moderated study of first use and repeat use. It exists to test hypotheses from the 2026-10-10 adoption
audit; none of the targets below is a measured result.

## Questions the study answers

| # | Question | Hypothesis to test |
|---|---|---|
| 1 | Do new users reach a first saved visual edit quickly? | A first edit is saved within 60 seconds of installing |
| 2 | Do they understand why markami differs from other visual editors? | They can say, unprompted, that the source and Git diff stay small |
| 3 | Do edits ever surprise them? | No participant sees an unexpected Markdown change |
| 4 | Does the opt-in default-editor path work? | Participants find it, use it, and can reverse it |
| 5 | Does editing survive an external rewrite? | Edits next to an agent's changes feel safe and predictable |

## Privacy rules

- markami has no telemetry and this study adds none. Everything below is observation and consent-based
  self-report.
- Participants edit the public fixtures in `fixtures/marketplace/` or their own files **with their consent**;
  never ask for document content afterwards, and never copy it into notes.
- Record the screen only with explicit consent, store it outside the repository, and delete it within 30 days.
- Notes use participant IDs (`P01`…) only. Names, emails, and employers stay out of the repository.
- No incentive may depend on a review, rating, or star.

## Participants

- 10–15 developers or technical writers who keep Markdown in Git; at least half use an AI coding agent on docs.
- Have never used markami. Screen out contributors and anyone who has read the repository.
- Recruit through developer communities and your own network; log where each participant came from, and do not
  offer anything in exchange for a review or rating.

## Session (45 minutes)

Setup, before the participant arrives: a clean VS Code profile (`--user-data-dir` and `--extensions-dir` in a
scratch directory) with no markami, and a Git repository containing the fixtures. Ask them to think aloud and
say that the product, not the participant, is being tested.

| Task | Prompt (read as written) | Clock |
|---|---|---|
| T1 | "Install markami from the Marketplace and make and save one change to `release-notes.md`." | Install complete → first save |
| T2 | "Tick a task and change a cell in the table." | Start → both done |
| T3 | "Show me exactly what changed in Git." | Start → participant states the changed lines |
| T4 | "Go back to the plain text editor, then return." | Start → both done |
| T5 | While they edit, the moderator runs a script that rewrites a different section of the open file. "Keep going." | Observe only |
| T6 | "Make markami open every Markdown file, then undo that." | Start → both done |

Ask three closing questions: what would stop you using it daily, what surprised you, and how would you describe
it to a colleague. Do not explain features during tasks; note every hesitation longer than 10 seconds.

## Observation sheet (one per participant)

- Participant ID, source channel, VS Code version, OS.
- Per task: time, completed unaided (yes/no), errors, hesitations with the screen state when they happened.
- Verbatim quotes, not paraphrases.
- Severity of each issue: **S0** source changed unexpectedly or content lost; **S1** task blocked; **S2**
  recovered with effort; **S3** cosmetic or preference.

## Stop rule

Any S0 ends the session. Preserve the file bytes before and after, record exact steps and the VS Code and
markami versions, open an issue with a minimal redacted reproduction, and hold promotion until a regression test
for it exists and passes.

## Measures and decision rules

| Measure | Target (hypothesis) | How it is measured |
|---|---|---|
| First saved edit | ≤ 60 s | T1 clock, median and worst case |
| First-session completion | ≥ 90% of tasks unaided | Observation sheets |
| First-week repeat use | ≥ 50% | Opt-in check-in, below |
| Four-week repeat use | ≥ 35% | Opt-in check-in, below |
| Source-loss defects (S0) | 0 | Sessions and issue tracker |
| Would recommend | ≥ 8/10 median | One voluntary question |

- Any S0: fix and add a test before anything else.
- First-session completion under 90% or T1 over 60 s for more than a third of participants: fix onboarding before
  promoting.
- Repeat-use figures need at least 10 consenting participants; with fewer, report counts, not percentages.

## Follow-up check-ins

With consent, send two messages: after 7 days and after 28 days. Ask only: did you open a Markdown file in
markami this week, is it your default, and what is the one thing that would make you stop. Never ask for
document content.

## Reporting

Write the findings into `docs/delivery/progress.md` as a task: sample size, sources, per-task results with
quotes, S0–S3 counts, and the decision each rule above produced. Say plainly what was not measured. A result is
not a conversion or install claim.
