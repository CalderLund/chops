# Agent Interaction Protocol

This document defines how expert agents collaborate in the guitar-teacher project. All agents MUST follow these rules.

## The Opus/Sonnet Division

Expert agents run on **Opus** — they think, analyze, review, and make decisions. They do NOT write code directly.

When code changes are needed, experts delegate to **Sonnet sub-agents** via the Task tool:

```
Task tool with:
  subagent_type: "general-purpose"
  model: "sonnet"
  mode: "bypassPermissions"
  prompt: [Precise instructions — files, changes, patterns, tests to run]
```

### Why This Pattern
- Opus is better at reasoning about architecture, invariants, and trade-offs
- Sonnet is fast and effective at implementing well-specified changes
- The expert's job is to make the spec precise enough that the sub-agent can't get it wrong
- This naturally produces better code: the expert thinks deeply, the sub-agent executes cleanly

### Delegation Rules
1. **Be maximally specific.** Tell the sub-agent which files to change, what the change looks like, and which patterns to follow from existing code. Don't say "fix the migration" — say "add an idempotent ALTER TABLE in runMigrations() after line N, checking with PRAGMA table_info first."
2. **Include the rules.** Tell the sub-agent which CLAUDE.md rules apply. The sub-agent doesn't have CLAUDE.md in context unless you include the relevant rules in the prompt.
3. **Include the verification step.** Tell the sub-agent to run `npm test` after changes and report the result.
4. **Review the output.** Read the sub-agent's changes. If they got it wrong, spawn another sub-agent with corrected instructions. Don't iterate with the same sub-agent.

## Big Decision Protocol

Not every change needs a plan. But big decisions do. Use this protocol when the change involves ANY of:
- Adding or modifying a dimension
- Changing the scoring model or candidate generation
- Schema migrations or compound ID format changes
- New feature categories (technique track, focus tags, etc.)
- Architectural changes that touch 3+ files
- Anything that could break the 1-dimension-change invariant

### The Process

**Step 1: Enter plan mode.** Use `EnterPlanMode` to signal that you're planning, not implementing yet.

**Step 2: Analyze.** Read all relevant code. Understand the current state thoroughly.

**Step 3: Consult experts.** Spawn the relevant expert agents to get their perspective BEFORE committing to a plan:

```
Task tool with:
  subagent_type: "architect"  # or whichever expert is relevant
  model: "opus"
  prompt: "Review this proposed change: [description].
           Read these files: [list].
           Report: risks, CLAUDE.md rule conflicts, and your recommendation."
```

Spawn multiple experts in parallel when their domains don't overlap. Common patterns:
- New dimension → architect + domain-expert + db-expert
- Scoring change → domain-expert + tester
- Schema change → db-expert + architect
- New feature → architect + domain-expert + devex-expert

**Step 4: Synthesize.** Collect expert feedback. Resolve conflicts. Write the plan incorporating their recommendations.

**Step 5: Exit plan mode.** Use `ExitPlanMode` to present the plan for approval. The plan should include:
- What changes, in which files
- Which CLAUDE.md rules apply
- Expert opinions received and how they were incorporated
- Risk assessment
- Test strategy

**Step 6: Implement.** Only after approval, delegate implementation to Sonnet sub-agents.

### When NOT to Use This Protocol
- Bug fixes with obvious root cause (just fix it)
- Adding a test for existing behavior
- Updating CLAUDE.md rules
- Pure read-only audits and reviews

## Core Principles

1. **CLAUDE.md is the shared source of truth.** Read it before doing anything. Update it (via sub-agent) when you find new invariants or mistakes.
2. **Agent memory is your personal notebook.** Use it to track domain-specific patterns across sessions.
3. **Findings have severity levels:**
   - `CRITICAL` — Breaks core invariants (1-dim-change, data integrity). Must fix immediately.
   - `WARNING` — Likely to cause bugs or confusion. Should fix soon.
   - `SUGGESTION` — Improvement opportunity. Fix when convenient.
4. **Be specific, not generic.** Every finding must reference a file path, line number, and concrete failure scenario.

## Team Communication Protocol

When working on a team with other agents:

1. **Claim work before starting.** Use TaskUpdate to set yourself as owner and mark in_progress.
2. **Report findings via SendMessage** to the team lead with: what you found, severity, file reference, recommended fix.
3. **Update CLAUDE.md** (via sub-agent) for cross-cutting discoveries that apply to all future work.
4. **Update agent memory** for domain-specific patterns only you would catch.
5. **Don't duplicate other agents' work.** Check TaskList first.
6. **Mark tasks completed when done.** Use TaskUpdate.

## Self-Improvement Loop

After every session:
1. If you made a mistake or missed something, add a rule to CLAUDE.md (via sub-agent).
2. If you found a recurring domain pattern, record it in your agent memory.
3. If an existing rule was wrong, fix it (via sub-agent).

The system gets better every time an agent runs.

## Spawning Expert Agents

The auditor (or any team lead) can spawn experts via the Task tool:

```
Task tool with:
  subagent_type: "architect"    # or "tester", "db-expert", "domain-expert", "devex-expert"
  model: "opus"                 # experts always use opus
  prompt: [What to review, what to report back]
```

Experts can also spawn each other when they need a different domain's perspective.
