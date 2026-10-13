(function initAlphabetShiftCore(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.AlphabetShiftCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAlphabetShiftCore() {
  'use strict';

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOW_FREQ_LETTERS = Object.freeze(['J', 'K', 'Q', 'X', 'Z']);
  const ENGLISH_FREQUENCIES = Object.freeze({
    A: 0.08167, B: 0.01492, C: 0.02782, D: 0.04253, E: 0.12702,
    F: 0.02228, G: 0.02015, H: 0.06094, I: 0.06966, J: 0.00153,
    K: 0.00772, L: 0.04025, M: 0.02406, N: 0.06749, O: 0.07507,
    P: 0.01929, Q: 0.00095, R: 0.05987, S: 0.06327, T: 0.09056,
    U: 0.02758, V: 0.00978, W: 0.02360, X: 0.00150, Y: 0.01974,
    Z: 0.00074
  });
  const P_MAX = ENGLISH_FREQUENCIES.K;
  const FAMILY_ALPHA = 0.003;
  const MAX_INPUT_LETTERS = 20000;

  function normalizeText(text) {
    return String(text ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  }

  function normalizeShift(shift) {
    if (!Number.isInteger(shift)) {
      throw new TypeError('shift must be an integer');
    }
    return ((shift % ALPHABET.length) + ALPHABET.length) % ALPHABET.length;
  }

  function applyShift(text, shift) {
    const normalizedShift = normalizeShift(shift);
    return String(text).split('').map((char) => {
      const index = ALPHABET.indexOf(char);
      return index === -1 ? char : ALPHABET[(index + normalizedShift) % ALPHABET.length];
    }).join('');
  }

  function calculateFrequency(text) {
    const frequency = {};
    for (const letter of ALPHABET) {
      frequency[letter] = 0;
    }

    for (const char of String(text)) {
      if (Object.prototype.hasOwnProperty.call(frequency, char)) {
        frequency[char] += 1;
      }
    }
    return frequency;
  }

  function generateAllShifts(normalizedText) {
    return Array.from({ length: ALPHABET.length }, (_, shift) => {
      const text = applyShift(normalizedText, shift);
      return { shift, text, freq: calculateFrequency(text) };
    });
  }

  function validateBinomialInputs(n, p) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError('n must be a non-negative integer');
    }
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new RangeError('p must be between 0 and 1');
    }
  }

  function createBinomialProbabilities(n, p) {
    validateBinomialInputs(n, p);
    const probabilities = new Float64Array(n + 1);

    if (p === 0) {
      probabilities[0] = 1;
      return probabilities;
    }
    if (p === 1) {
      probabilities[n] = 1;
      return probabilities;
    }

    const mode = Math.min(n, Math.floor((n + 1) * p));
    const weights = new Float64Array(n + 1);
    weights[mode] = 1;

    for (let k = mode; k > 0; k -= 1) {
      weights[k - 1] = weights[k]
        * (k / (n - k + 1))
        * ((1 - p) / p);
    }
    for (let k = mode; k < n; k += 1) {
      weights[k + 1] = weights[k]
        * ((n - k) / (k + 1))
        * (p / (1 - p));
    }

    let total = 0;
    for (const weight of weights) {
      total += weight;
    }
    for (let k = 0; k <= n; k += 1) {
      probabilities[k] = weights[k] / total;
    }
    return probabilities;
  }

  function binomialUpperTail(n, p, observed) {
    validateBinomialInputs(n, p);
    if (!Number.isInteger(observed)) {
      throw new TypeError('observed must be an integer');
    }
    if (observed <= 0) return 1;
    if (observed > n) return 0;

    const probabilities = createBinomialProbabilities(n, p);
    let tail = 0;
    for (let k = observed; k <= n; k += 1) {
      tail += probabilities[k];
    }
    return Math.min(1, Math.max(0, tail));
  }

  function calculateRareLetterThreshold(
    n,
    pMax = P_MAX,
    familyAlpha = FAMILY_ALPHA,
    comparisonCount = LOW_FREQ_LETTERS.length
  ) {
    validateBinomialInputs(n, pMax);
    if (!Number.isFinite(familyAlpha) || familyAlpha <= 0 || familyAlpha >= 1) {
      throw new RangeError('familyAlpha must be between 0 and 1');
    }
    if (!Number.isInteger(comparisonCount) || comparisonCount < 1) {
      throw new RangeError('comparisonCount must be a positive integer');
    }

    const perComparisonAlpha = familyAlpha / comparisonCount;
    const expected = n * pMax;
    const stdDev = Math.sqrt(n * pMax * (1 - pMax));

    if (n === 0) {
      return {
        threshold: 0,
        expected,
        stdDev,
        familyAlpha,
        perComparisonAlpha,
        comparisonCount,
        pMax
      };
    }

    const probabilities = createBinomialProbabilities(n, pMax);
    let upperTail = 0;
    let threshold = n + 1;
    for (let k = n; k >= 0; k -= 1) {
      upperTail += probabilities[k];
      if (upperTail > perComparisonAlpha) {
        threshold = k + 1;
        break;
      }
    }

    return {
      threshold,
      expected,
      stdDev,
      familyAlpha,
      perComparisonAlpha,
      comparisonCount,
      pMax
    };
  }

  function getMaxLowFreqCount(freq) {
    return Math.max(...LOW_FREQ_LETTERS.map((letter) => freq[letter] ?? 0));
  }

  function getSumLowFreqCount(freq) {
    return LOW_FREQ_LETTERS.reduce((sum, letter) => sum + (freq[letter] ?? 0), 0);
  }

  function getFlaggedLowFreqLetters(freq, threshold) {
    return LOW_FREQ_LETTERS.filter((letter) => (freq[letter] ?? 0) >= threshold);
  }

  function calculateChiSquare(freq, textLength, expectedFrequencies = ENGLISH_FREQUENCIES) {
    if (!Number.isInteger(textLength) || textLength <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    let score = 0;
    for (const letter of ALPHABET) {
      const expectedCount = textLength * expectedFrequencies[letter];
      const difference = (freq[letter] ?? 0) - expectedCount;
      score += (difference * difference) / expectedCount;
    }
    return score;
  }

  function rankShiftsByChiSquare(rows) {
    const scored = rows.map((row) => ({
      ...row,
      chiSquare: calculateChiSquare(row.freq, row.text.length)
    }));

    const sorted = [...scored].sort((a, b) => {
      const scoreDifference = a.chiSquare - b.chiSquare;
      return scoreDifference === 0 ? a.shift - b.shift : scoreDifference;
    });
    const rankByShift = new Map(sorted.map((row, index) => [row.shift, index + 1]));

    return scored.map((row) => ({ ...row, chiSquareRank: rankByShift.get(row.shift) }));
  }

  function analyzeRows(rows, threshold) {
    return rankShiftsByChiSquare(rows).map((row) => {
      const flaggedLetters = getFlaggedLowFreqLetters(row.freq, threshold);
      return {
        ...row,
        maxLowFreq: getMaxLowFreqCount(row.freq),
        sumLowFreq: getSumLowFreqCount(row.freq),
        flaggedLetters,
        passesRareLetterScreen: flaggedLetters.length === 0
      };
    });
  }

  function partitionAnalyzedRows(rows) {
    return rows.reduce((groups, row) => {
      groups[row.passesRareLetterScreen ? 'within' : 'flagged'].push(row);
      return groups;
    }, { within: [], flagged: [] });
  }

  return Object.freeze({
    ALPHABET,
    LOW_FREQ_LETTERS,
    ENGLISH_FREQUENCIES,
    P_MAX,
    FAMILY_ALPHA,
    MAX_INPUT_LETTERS,
    normalizeText,
    applyShift,
    calculateFrequency,
    generateAllShifts,
    createBinomialProbabilities,
    binomialUpperTail,
    calculateRareLetterThreshold,
    getMaxLowFreqCount,
    getSumLowFreqCount,
    getFlaggedLowFreqLetters,
    calculateChiSquare,
    rankShiftsByChiSquare,
    analyzeRows,
    partitionAnalyzedRows
  });
}));
