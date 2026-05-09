# AGENTS.md

## Purpose
This document defines **only the rules that match the current codebase** (`index.html`) and must be kept in sync after each completed implementation instruction.

## Sync Rule (User Requirement)
- After completing any implementation instruction, update this file if behavior, data shape, storage key, or UX flow changed.
- If a rule is no longer reflected in code, remove it immediately.
- Never keep speculative or future-only rules.

## Current App Contract (must match code)

### Stack and entry
- App is a single-file client app in `index.html` (inline HTML/CSS/JS).
- UI styling uses Tailwind utility classes loaded via CDN in `index.html`.
- Runtime logic, state management, sentence data, and rendering are implemented in inline `<script>` without React runtime.

### Sentence data contract
- `DEFAULT_LINES` is a flat array of bilingual strings in format `English — Korean` (em dash) or `English - Korean` (hyphen).
- `parseLines(lines)` must:
  - support both separators,
  - map each parsed line to `{ id, english, korean, mastered, starred }`,
  - drop invalid lines with missing side(s).

### Normalization and search/quiz behavior
- `normalize(text)` lowercases and removes punctuation except Korean syllables, numbers, and whitespace.
- Search must match against combined `english + korean` normalized text.
- Quiz grading logic:
  - empty input: prompt user to type answer,
  - exact normalized match: mark as mastered,
  - near match (substring/partial threshold): return near-correct feedback,
  - otherwise return incorrect feedback.

### Local persistence contract
- LocalStorage key must remain: `const-english-sentences-v4`.
- On load:
  - if saved array exists and its length is at least `DEFAULT_LINES.length`, use saved data,
  - otherwise initialize from parsed defaults.
- On sentence state change (`mastered`, `starred`, reset), persist full `sentences` array.

### Navigation and state behavior
- `safeSetIndex(next)` wraps index within filtered length and resets `answer`/`feedback`.
- When filtered result is empty, index resets to 0.
- Random selection must avoid selecting current index when possible.
- `resetProgress()` clears both `mastered` and `starred`, and resets index/input/feedback.

### UI behavior contract
- Modes: `card` and `quiz`.
- On initial app load, the first displayed sentence is auto-played once via speech synthesis.
- After sentence navigation actions (`previous`, `next`, `random`, sidebar pick), the newly displayed sentence is auto-played via speech synthesis.
- Speech playback reads English first, then Korean meaning for the same sentence.
- Card mode: toggle Korean meaning visibility.
- Quiz mode: show Korean prompt, allow Enter key submit.
- Buttons support: previous/next/random, listen (speech synthesis), star toggle, mastered toggle, progress reset.
- Buttons support: previous/next/random, listen (speech synthesis), autoplay toggle, star toggle, mastered toggle, progress reset.
- Sidebar supports query filtering and selecting sentence by filtered index.
- Sidebar auto-scrolls to keep the currently displayed sentence visible near the top when the displayed sentence changes.
- Autoplay behavior: reads English then Korean for current sentence, waits 0.1 seconds, then advances to next sentence and repeats through the full sentence list until the last (365th) sentence, then stops automatically.

### Self-test contract
- `runSelfTests()` is executed at startup and validates:
  - parsing both separators,
  - normalize punctuation behavior,
  - invalid line rejection,
  - all defaults parse,
  - `DEFAULT_LINES.length === 365`.

## Update Checklist (use whenever work is completed)
1. Compare changed code with each section above.
2. Update changed rules.
3. Remove stale rules not represented in code.
4. Keep wording concrete and testable.
