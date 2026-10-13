# Alphabet Shift Spectrum - 26-Shift Frequency Visualizer

![GitHub Repo stars](https://img.shields.io/github/stars/ipusiron/alphabet-shift-spectrum?style=social)
![GitHub forks](https://img.shields.io/github/forks/ipusiron/alphabet-shift-spectrum?style=social)
![GitHub last commit](https://img.shields.io/github/last-commit/ipusiron/alphabet-shift-spectrum)
![GitHub license](https://img.shields.io/github/license/ipusiron/alphabet-shift-spectrum)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://ipusiron.github.io/alphabet-shift-spectrum/)

**Day107 - Security Tools Made with Generative AI 200**

[日本語](README.md)

**Alphabet Shift Spectrum** is an educational web tool for comparing all 26 alphabet shifts used by a Caesar cipher. From the same input, it shows shifted texts, A-Z counts, a heatmap, a chi-square ranking against reference English letter frequencies, and a rare-letter screen.

Neither the ranking nor the screen identifies a correct plaintext or key. Results are particularly unstable for short texts, names, and non-English text, so inspect actual words and context as well.

---

## 🌐 Demo

👉 **[https://ipusiron.github.io/alphabet-shift-spectrum/](https://ipusiron.github.io/alphabet-shift-spectrum/)**

The tool runs directly in the browser. Input stays in the browser and is not sent to a server.

---

## 📸 Screenshots

>![All 26 shifts](assets/screenshot.png)
>
>*All 26 shifted texts with A-Z counts*

>![Frequency heatmap and chi-square ranking](assets/screenshot1.png)
>
>*Frequency heatmap and fit ranking against English letter frequencies*

>![Rare-letter screen](assets/screenshot2.png)
>
>*Rare-letter screen using an exact upper binomial tail and a multiple-comparison adjustment*

---

## ✨ Features

### Shift list

- All 26 results obtained by adding shifts 0 through 25 to the input
- A-Z letter counts for every shift
- “Within screen” and “Flagged” rare-letter states
- Chi-square rank against reference English letter frequencies

### Analysis

- 26-shift by 26-letter frequency heatmap
- Five smallest chi-square values against a reference English distribution
- Rare-letter screen for J, K, Q, X, and Z
- Exact upper binomial tail threshold with a Bonferroni adjustment
- Complete Japanese and English interface

Tabs without implemented features are not shown.

---

## 📖 Usage

1. Enter ciphertext. Only ASCII letters A-Z are analyzed; spaces, digits, punctuation, and other characters are removed.
2. Select “Generate 26 shifts.”
3. In “Shift list,” compare the text, chi-square rank, and rare-letter state.
4. In “Analysis,” review the heatmap, top five ranks, threshold, and screen results.
5. Do not decide from a rank alone; inspect readable words, grammar, and context.

Changing the input clears stale results. Generate again for the current input. The limit is 20,000 valid letters.

---

## 🔬 Calculations

### Shifts

`Shift s` adds `+s (mod 26)` to every input letter. For example, applying `Shift 23` to `KHOOR` produces `HELLO`.

### Chi-square ranking

For each shift, A-Z counts are compared with reference English letter frequencies:

```text
χ² = Σ (observed count - expected count)² / expected count
```

A smaller value is closer to the reference distribution, but the smallest value is not necessarily the correct shift. Short texts and specialized vocabulary can substantially change the ranking.

### Rare-letter screen

The screen checks J, K, Q, X, and Z together. It uses `p = 0.00772`, the largest reference frequency among those five letters, as a shared upper-bound model and directly evaluates an upper binomial tail.

```text
k = min { k : P(X ≥ k) ≤ α / 5 }
X ~ Bin(n, p),  p = 0.00772,  α = 0.003
```

If any of the five letters occurs at least `k` times, the shift is flagged for review. For example, `k = 6` for 100 valid letters and `k = 19` for 1,000 letters.

The binomial standard deviation is `√(np(1-p))`. The tool does not use a normal approximation for the threshold; it numerically evaluates the exact discrete distribution. Because five letters are checked, each upper-tail comparison uses the Bonferroni-adjusted level `α / 5`.

---

## ⚠️ Interpretation and limitations

- A flag asks for review; it is not an instruction to discard a shift.
- The Bonferroni adjustment covers five letters within each shift, not a “99.7% confidence interval” across all 26 shifts.
- The calculation uses a simplified English model with independent letters and a fixed probability.
- Natural-language letters are dependent, and observed frequencies vary with style, domain, and names.
- The chi-square ranking does not prove naturalness, meaning, cipher type, or the correct key.
- For a cipher other than a Caesar shift, none of the 26 rows may be the correct plaintext.

This is an educational tool for comparing diagnostic evidence. It cannot prove or automatically determine a decryption.

---

## 🎯 Use cases

### Uses specific to this tool

- **Observe disagreement between diagnostics:** for a short input such as `KHOOR ZRUOG`, readable `Shift 23` may not rank first by chi-square, demonstrating that frequency alone cannot determine meaning.
- **Compare sample size and threshold:** the change from `k = 6` at 100 letters to `k = 19` at 1,000 letters shows why a fixed count is not appropriate.
- **Learn about multiple comparisons:** the method panel explains why a five-letter screen divides `α` by five.
- **Watch a frequency distribution rotate:** across all 26 shifts, peaks move between heatmap columns while counts are preserved.

### General uses

- Manual analysis of Caesar ciphers and key-length-one Vigenère ciphers
- Teaching letter frequency, the binomial distribution, chi-square, and multiple comparisons
- Initial inspection of CTF challenges and puzzles
- Constructing examples where frequency-only guesses fail

Related example: [POLYALPHABETIC SUBSTITUTION PUZZLE 03 (Cypher)](https://akademeia.info/?p=36264)

---

## 🔗 References

- [NIST/SEMATECH e-Handbook: Binomial Distribution](https://www.itl.nist.gov/div898/handbook/eda/section3/eda366i.htm)
- [NIST/SEMATECH e-Handbook: Bonferroni's method](https://www.itl.nist.gov/div898/handbook/prc/section4/prc473.htm)

---

## 📁 Directory structure

```text
alphabet-shift-spectrum/
├── .github/workflows/test.yml # Node.js 22 test workflow
├── assets/                    # README screenshots
├── docs/                      # Japanese design documents
├── test/
│   ├── logic.test.js          # Core regression tests
│   └── ui-contract.test.js    # Bilingual UI, CSP, and documentation contracts
├── scripts/browser-smoke.mjs  # Optional Chromium browser smoke test
├── favicon.svg                # Site icon
├── index.html                 # Page structure and CSP
├── logic.js                   # Shift, frequency, and statistics core
├── messages.js                # Japanese and English messages
├── script.js                  # Rendering and interaction
├── style.css                  # Shared styles
├── style-mobile.css           # Mobile-first layout
├── style-tablet.css           # Enhancements from 600px
├── style-laptop.css           # Enhancements from 900px
├── package.json               # Test command
├── README.md                  # Japanese documentation
├── README.en.md               # English documentation
├── CLAUDE.md                  # Development guidance
└── LICENSE                    # MIT License
```

---

## 💻 Requirements

- A modern browser (Chrome, Firefox, Safari, or Edge)
- JavaScript enabled
- No external library, build step, or server communication
- Direct `file://` use by opening `index.html`

Run the tests with Node.js 22 and `npm test`. No dependency installation is required.

---

## 📄 License

See `LICENSE` for the source-code license (MIT License).

---

## 🛠️ About this tool

This tool is part of the “Security Tools Made with Generative AI 200” project, a 100-day effort to build and publish security-related tools with AI assistance.

For the project and other tools, see:

🔗 [https://akademeia.info/?page_id=44607](https://akademeia.info/?page_id=44607)
