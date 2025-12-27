# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alphabet Shift Spectrum is a web-based cryptanalysis support tool that visualizes letter frequency distributions across all 26 alphabet shifts. It's designed for Caesar cipher and monoalphabetic shift cipher analysis.

## Architecture

- **Single Page Application (SPA)** with tab-based navigation
- **Tech stack**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **UI language**: Japanese

### Tab Structure
- Tab1: Shift & Frequency Table - Input text and generate 26 shifts with A-Z frequency counts
- Tab2: Frequency Analysis & Filtering - Heatmap display and low-frequency letter (J,K,Q,X,Z) analysis with M-threshold filtering
- Tab3/Tab4: Reserved for future features

### Core Data Structure
```js
rows = [
  {
    shift: 0,
    text: "...",
    freq: { A:0, B:1, ... Z:0 }
  }
]
```

### Processing Flow
1. Normalize input text (uppercase, remove non-alpha)
2. Generate 0-25 shifts
3. Calculate A-Z frequency for each shift
4. Compute analysis metrics (S, M)

## Threshold Formula

For filtering candidate shifts:
- N = total text length
- p_max = max expected frequency among {J,K,Q,X,Z} (default: 0.00772)
- M_threshold = ceil(N * p_max + 3 * sqrt(N * p_max))
- Shifts where max(J,K,Q,X,Z) >= M_threshold are rejected

## Development

Static HTML/CSS/JS project - open `index.html` directly in browser. No build step required.

## Mobile-First CSS Guidelines

This project follows mobile-first design principles (see `.claude/skills/mobile-first-web-ui/SKILL.md`):
- Base CSS targets mobile (360-414px)
- Breakpoints: 600px (tablet), 900px (laptop/PC)
- Use CSS Grid/Flexbox for layouts
- Prefer `rem`/`em` units over `px`
- CSS files may be split: style.css (base), style-mobile.css, style-tablet.css, style-laptop.css
