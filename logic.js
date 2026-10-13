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

    return calculateChiSquareContributions(freq, textLength, expectedFrequencies)
      .reduce((score, item) => score + item.contribution, 0);
  }

  function calculateChiSquareContributions(
    freq,
    textLength,
    expectedFrequencies = ENGLISH_FREQUENCIES
  ) {
    if (!Number.isInteger(textLength) || textLength <= 0) {
      return [];
    }

    return [...ALPHABET].map((letter) => {
      const observed = freq[letter] ?? 0;
      const expected = textLength * expectedFrequencies[letter];
      const difference = observed - expected;
      return {
        letter,
        observed,
        expected,
        difference,
        contribution: (difference * difference) / expected
      };
    });
  }

  function getTopChiSquareContributions(row, limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > ALPHABET.length) {
      throw new RangeError('limit must be an integer from 1 to 26');
    }

    return calculateChiSquareContributions(row.freq, row.text.length)
      .sort((a, b) => {
        const contributionDifference = b.contribution - a.contribution;
        return contributionDifference === 0
          ? a.letter.localeCompare(b.letter)
          : contributionDifference;
      })
      .slice(0, limit);
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

  function createThresholdSensitivitySeries({
    sampleSize,
    pMax = P_MAX,
    familyAlpha = FAMILY_ALPHA,
    comparisonCount = LOW_FREQ_LETTERS.length,
    useBonferroni = true
  }) {
    if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > MAX_INPUT_LETTERS) {
      throw new RangeError(`sampleSize must be an integer from 1 to ${MAX_INPUT_LETTERS}`);
    }
    if (typeof useBonferroni !== 'boolean') {
      throw new TypeError('useBonferroni must be a boolean');
    }
    if (!Number.isInteger(comparisonCount) || comparisonCount < 1 || comparisonCount > ALPHABET.length) {
      throw new RangeError('comparisonCount must be an integer from 1 to 26');
    }

    const factors = [0.5, 1, 2];
    const seenSizes = new Set();
    const adjustmentCount = useBonferroni ? comparisonCount : 1;
    const series = [];

    for (const factor of factors) {
      const n = Math.max(1, Math.min(MAX_INPUT_LETTERS, Math.round(sampleSize * factor)));
      if (seenSizes.has(n)) continue;
      seenSizes.add(n);
      series.push({
        factor,
        sampleSize: n,
        requestedComparisonCount: comparisonCount,
        useBonferroni,
        ...calculateRareLetterThreshold(n, pMax, familyAlpha, adjustmentCount)
      });
    }
    return series;
  }

  function createAnalysisSummary(rows, thresholdInfo, topCount = 5) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new RangeError('rows must contain analyzed shift results');
    }
    if (!thresholdInfo || !Number.isInteger(thresholdInfo.n) || thresholdInfo.n < 1) {
      throw new TypeError('thresholdInfo must include a positive integer n');
    }
    if (!Number.isInteger(topCount) || topCount < 1 || topCount > rows.length) {
      throw new RangeError('topCount must fit within the analyzed rows');
    }

    const groups = partitionAnalyzedRows(rows);
    const topShifts = [...rows]
      .sort((a, b) => a.chiSquareRank - b.chiSquareRank)
      .slice(0, topCount)
      .map((row) => ({
        rank: row.chiSquareRank,
        shift: row.shift,
        chiSquare: row.chiSquare
      }));

    return {
      textLength: thresholdInfo.n,
      pMax: thresholdInfo.pMax,
      familyAlpha: thresholdInfo.familyAlpha,
      comparisonCount: thresholdInfo.comparisonCount,
      perComparisonAlpha: thresholdInfo.perComparisonAlpha,
      threshold: thresholdInfo.threshold,
      withinCount: groups.within.length,
      flaggedCount: groups.flagged.length,
      topShifts
    };
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
    calculateChiSquareContributions,
    getTopChiSquareContributions,
    rankShiftsByChiSquare,
    analyzeRows,
    partitionAnalyzedRows,
    createThresholdSensitivitySeries,
    createAnalysisSummary
  });
}));
