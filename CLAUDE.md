# CLAUDE.md

This file provides development guidance for Alphabet Shift Spectrum.

## Project overview

Alphabet Shift Spectrum is a dependency-free browser tool for comparing all 26 Caesar shifts. It presents shifted text, A-Z counts, a heatmap, chi-square rankings against reference English frequencies, and an exact-binomial rare-letter screen.

The tool presents evidence for manual inspection. It does not prove the correct plaintext, key, language, or cipher type.

## Architecture

- `index.html`: semantic page structure and strict CSP
- `logic.js`: DOM-independent shift, frequency, exact-binomial, and chi-square logic
- `messages.js`: complete Japanese and English UI dictionaries
- `script.js`: rendering, language switching, tabs, and modal behavior
- `style.css`: shared tokens and components
- `style-mobile.css`: mobile-first layout
- `style-tablet.css`: enhancements from 600px
- `style-laptop.css`: enhancements from 900px
- `test/`: Node.js built-in tests

The static app must work over HTTP(S) and by opening `index.html` through `file://`. Do not add external runtime dependencies.

## Statistical model

### Rare-letter screen

The screen checks J, K, Q, X, and Z for each shift. It uses the largest reference frequency among the five, `p = 0.00772`, as a shared upper bound.

```text
k = min { k : P(X >= k) <= alpha / 5 }
X ~ Bin(n, p), p = 0.00772, alpha = 0.003
```

`logic.js` computes the exact discrete binomial distribution with relative weights around its mode. Do not replace this with a normal approximation. The binomial standard deviation is `sqrt(np(1-p))`, but it is explanatory only.

The Bonferroni adjustment applies to five letters within one shift. Do not describe it as a 99.7% confidence interval across all 26 shifts.

### Chi-square ranking

Each shift is ranked by Pearson's chi-square statistic against the reference A-Z distribution. A smaller score is only a relative clue. Do not label the first-ranked shift as correct or attach a confidence percentage.

## Development

No build or dependency installation is required.

```text
npm test
node --check logic.js
node --check messages.js
node --check script.js
```

## UI requirements

- Keep Japanese and English dictionaries key-for-key identical.
- Re-render all derived results after a language change.
- Clear generated results when the input changes so stale analysis is never shown as current.
- Keep page-level width within 320px and 390px viewports; wide data tables and the heatmap may scroll inside their own containers.
- Preserve visible focus, keyboard tab navigation, modal focus containment, and 44px touch targets.
- Keep unimplemented tabs hidden.
