/**
 * Scaffold content written by `continuity init`. Each memory file starts with a
 * heading and a short italic placeholder so the planner can detect "still empty"
 * and suggest documenting it.
 */

export const TEMPLATES = {
  vision: `# Vision

_What is this project, and why does it matter? Replace this line._

## Mission

## Tagline
`,

  architecture: `# Architecture

_How is the system built? Components, data flow, key choices._

## Components

## Data flow
`,

  currentState: `# Current State

_Where things stand right now. Updated on every checkpoint._

## Working

## In progress

## Not started
`,

  decisions: `# Decisions

_Important decisions and why they were made. The decision journal._

`,

  bugs: `# Bugs

_Known bugs and broken behavior. One per line as a list item._

`,

  nextActions: `# Next Actions

_Concrete next steps. The planner turns these into tasks._

`,

  risks: `# Risks & Assumptions

_What could go wrong, and what we're assuming is true._

`,

  sessionLog: `# Session Log

_A chronological log of checkpoints. Newest at the bottom._

`,
};

export function rootDoc(name: string): string {
  return `# Continuity

**${name}** is tracked by Continuity — a persistent runtime that keeps AI work
moving across Claude, GPT, Cursor, Gemini, and future agents.

> Never lose AI project context again.

## How it works

\`\`\`
Goal → Plan → Task Queue → Agent Executes → Checkpoint
     → Review → Memory Update → Next Task → Handoff / Resume → Repeat
\`\`\`

## Everyday commands

| Command | What it does |
|---------|--------------|
| \`continuity wizard\` | Guided init, plan, next, and checkpoint flow |
| \`continuity status\` | Project dashboard: state, tasks, last checkpoint |
| \`continuity plan "<goal>"\` | Generate a scored task list from your goal + memory |
| \`continuity next\` | Start the single highest-leverage task |
| \`continuity checkpoint\` | Save what changed; regenerate handoffs |
| \`continuity decide\` | Record a decision in the journal |
| \`continuity recall "<query>"\` | Search project memory and decisions |
| \`continuity graph\` | Show the knowledge graph |
| \`continuity review\` | Audit risk, tests, docs, and the next best move |
| \`continuity handoff --to gpt\` | Write a paste-ready briefing for another agent |
| \`continuity resume\` | Print the best prompt to restart work right now |

## Where state lives

Everything is local, plain files under \`.continuity/\`. The markdown in
\`memory/\` is the source of truth; \`knowledge/\` is a rebuildable index over it.
`;
}
