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
  const UNIFORM_FREQUENCIES = Object.freeze(Object.fromEntries(
    [...ALPHABET].map((letter) => [letter, 1 / ALPHABET.length])
  ));
  const P_MAX = ENGLISH_FREQUENCIES.K;
  const FAMILY_ALPHA = 0.003;
  const MAX_INPUT_LETTERS = 20000;
  const ANALYSIS_RECORD_SCHEMA = 'alphabet-shift-spectrum-analysis';
  const ANALYSIS_RECORD_VERSION = 1;

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
      return { shift, text, letterCount: text.length, freq: calculateFrequency(text) };
    });
  }

  function validateFrequencyCounts(frequency, expectedTotal = null) {
    if (!frequency || typeof frequency !== 'object' || Array.isArray(frequency)) {
      throw new TypeError('frequency must be an A-Z count object');
    }
    const sanitized = {};
    let total = 0;
    for (const letter of ALPHABET) {
      const count = frequency[letter];
      if (!Number.isInteger(count) || count < 0 || count > MAX_INPUT_LETTERS) {
        throw new RangeError('frequency counts must be non-negative supported integers');
      }
      sanitized[letter] = count;
      total += count;
    }
    if (total < 1 || total > MAX_INPUT_LETTERS) {
      throw new RangeError(`frequency total must be from 1 to ${MAX_INPUT_LETTERS}`);
    }
    if (expectedTotal !== null && total !== expectedTotal) {
      throw new RangeError('frequency total does not match the declared letter count');
    }
    return { frequency: sanitized, total };
  }

  function createRowsFromFrequency(baseFrequency) {
    const { frequency, total } = validateFrequencyCounts(baseFrequency);
    return Array.from({ length: ALPHABET.length }, (_, shift) => {
      const shifted = {};
      for (let index = 0; index < ALPHABET.length; index += 1) {
        shifted[ALPHABET[(index + shift) % ALPHABET.length]] = frequency[ALPHABET[index]];
      }
      return { shift, text: null, letterCount: total, freq: shifted };
    });
  }

  function createReferenceProfile(profileId, corpus = '') {
    if (profileId === 'english') {
      return {
        id: 'english',
        corpusLetterCount: 0,
        smoothing: 0,
        frequencies: ENGLISH_FREQUENCIES
      };
    }
    if (profileId === 'uniform') {
      return {
        id: 'uniform',
        corpusLetterCount: 0,
        smoothing: 0,
        frequencies: UNIFORM_FREQUENCIES
      };
    }
    if (profileId !== 'custom') {
      throw new RangeError('unknown reference profile');
    }

    const normalized = normalizeText(corpus);
    if (normalized.length < 1 || normalized.length > MAX_INPUT_LETTERS) {
      throw new RangeError(`custom corpus must contain from 1 to ${MAX_INPUT_LETTERS} A-Z letters`);
    }
    const counts = calculateFrequency(normalized);
    const smoothing = 1;
    const denominator = normalized.length + (smoothing * ALPHABET.length);
    const frequencies = Object.fromEntries([...ALPHABET].map((letter) => [
      letter,
      (counts[letter] + smoothing) / denominator
    ]));
    return {
      id: 'custom',
      corpusLetterCount: normalized.length,
      smoothing,
      frequencies
    };
  }

  function getRowLetterCount(row) {
    if (Number.isInteger(row?.letterCount) && row.letterCount > 0) return row.letterCount;
    if (typeof row?.text === 'string' && row.text.length > 0) return row.text.length;
    return Object.values(row?.freq ?? {}).reduce((sum, count) => sum + count, 0);
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

  function getTopChiSquareContributions(
    row,
    limit = 5,
    expectedFrequencies = ENGLISH_FREQUENCIES
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > ALPHABET.length) {
      throw new RangeError('limit must be an integer from 1 to 26');
    }

    return calculateChiSquareContributions(row.freq, getRowLetterCount(row), expectedFrequencies)
      .sort((a, b) => {
        const contributionDifference = b.contribution - a.contribution;
        return contributionDifference === 0
          ? a.letter.localeCompare(b.letter)
          : contributionDifference;
      })
      .slice(0, limit);
  }

  function rankShiftsByChiSquare(rows, expectedFrequencies = ENGLISH_FREQUENCIES) {
    const scored = rows.map((row) => ({
      ...row,
      chiSquare: calculateChiSquare(row.freq, getRowLetterCount(row), expectedFrequencies)
    }));

    const sorted = [...scored].sort((a, b) => {
      const scoreDifference = a.chiSquare - b.chiSquare;
      const tieTolerance = Number.EPSILON
        * Math.max(1, Math.abs(a.chiSquare), Math.abs(b.chiSquare))
        * 100;
      return Math.abs(scoreDifference) <= tieTolerance
        ? a.shift - b.shift
        : scoreDifference;
    });
    const rankByShift = new Map(sorted.map((row, index) => [row.shift, index + 1]));

    return scored.map((row) => ({ ...row, chiSquareRank: rankByShift.get(row.shift) }));
  }

  function analyzeRows(rows, threshold, expectedFrequencies = ENGLISH_FREQUENCIES) {
    return rankShiftsByChiSquare(rows, expectedFrequencies).map((row) => {
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
    if (!Number.isFinite(pMax) || pMax <= 0 || pMax > 0.5) {
      throw new RangeError('pMax must be above 0 and at most 0.5');
    }
    if (!Number.isFinite(familyAlpha) || familyAlpha <= 0 || familyAlpha > 0.2) {
      throw new RangeError('familyAlpha must be above 0 and at most 0.2');
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

  function simulateBinomialUpperTail({ sampleSize, p, threshold, trials, seed }) {
    validateBinomialInputs(sampleSize, p);
    if (sampleSize < 1 || sampleSize > MAX_INPUT_LETTERS) {
      throw new RangeError(`sampleSize must be from 1 to ${MAX_INPUT_LETTERS}`);
    }
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > sampleSize + 1) {
      throw new RangeError('threshold must be an integer from 0 to n + 1');
    }
    if (!Number.isInteger(trials) || trials < 100 || trials > 20000) {
      throw new RangeError('trials must be an integer from 100 to 20000');
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError('seed must be a 32-bit unsigned integer');
    }

    const probabilities = createBinomialProbabilities(sampleSize, p);
    const cumulative = new Float64Array(probabilities.length);
    let running = 0;
    for (let index = 0; index < probabilities.length; index += 1) {
      running += probabilities[index];
      cumulative[index] = running;
    }
    cumulative[cumulative.length - 1] = 1;

    let state = (seed >>> 0) || 0x9e3779b9;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    };
    let exceedances = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      const target = random();
      let low = 0;
      let high = cumulative.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (cumulative[middle] >= target) high = middle;
        else low = middle + 1;
      }
      if (low >= threshold) exceedances += 1;
    }

    const estimate = exceedances / trials;
    const exact = binomialUpperTail(sampleSize, p, threshold);
    return {
      sampleSize,
      p,
      threshold,
      trials,
      seed,
      exceedances,
      estimate,
      exact,
      absoluteError: Math.abs(estimate - exact)
    };
  }

  function createAnalysisRecord({
    baseFrequency,
    analyzedRows,
    thresholdInfo,
    referenceProfile,
    sensitivitySettings
  }) {
    const { frequency, total } = validateFrequencyCounts(baseFrequency, thresholdInfo?.n);
    if (!referenceProfile || !['english', 'uniform', 'custom'].includes(referenceProfile.id)) {
      throw new TypeError('referenceProfile is invalid');
    }
    const sensitivitySeries = createThresholdSensitivitySeries(sensitivitySettings);
    const summary = createAnalysisSummary(analyzedRows, thresholdInfo, 5);
    return {
      schema: ANALYSIS_RECORD_SCHEMA,
      version: ANALYSIS_RECORD_VERSION,
      inputAggregate: {
        letterCount: total,
        frequencies: frequency
      },
      referenceProfile: {
        id: referenceProfile.id,
        corpusLetterCount: referenceProfile.corpusLetterCount,
        smoothing: referenceProfile.smoothing,
        frequencies: Object.fromEntries([...ALPHABET].map((letter) => [
          letter,
          referenceProfile.frequencies[letter]
        ]))
      },
      rareLetterModel: {
        pMax: thresholdInfo.pMax,
        familyAlpha: thresholdInfo.familyAlpha,
        comparisonCount: thresholdInfo.comparisonCount
      },
      sensitivitySettings: {
        sampleSize: sensitivitySettings.sampleSize,
        pMax: sensitivitySettings.pMax,
        familyAlpha: sensitivitySettings.familyAlpha,
        comparisonCount: sensitivitySettings.comparisonCount,
        useBonferroni: sensitivitySettings.useBonferroni
      },
      result: {
        ...summary,
        sensitivityThresholds: sensitivitySeries.map((item) => ({
          factor: item.factor,
          sampleSize: item.sampleSize,
          threshold: item.threshold,
          perComparisonAlpha: item.perComparisonAlpha
        }))
      }
    };
  }

  function parseAnalysisRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('analysis record must be an object');
    }
    if (value.schema !== ANALYSIS_RECORD_SCHEMA || value.version !== ANALYSIS_RECORD_VERSION) {
      throw new RangeError('unsupported analysis record schema or version');
    }
    const letterCount = value.inputAggregate?.letterCount;
    if (!Number.isInteger(letterCount) || letterCount < 1 || letterCount > MAX_INPUT_LETTERS) {
      throw new RangeError('analysis record letter count is invalid');
    }
    const { frequency } = validateFrequencyCounts(value.inputAggregate?.frequencies, letterCount);

    const profileId = value.referenceProfile?.id;
    let referenceProfile;
    if (profileId === 'english' || profileId === 'uniform') {
      referenceProfile = createReferenceProfile(profileId);
    } else if (profileId === 'custom') {
      const storedFrequencies = value.referenceProfile?.frequencies;
      const frequencies = {};
      let total = 0;
      for (const letter of ALPHABET) {
        const item = storedFrequencies?.[letter];
        if (!Number.isFinite(item) || item <= 0 || item >= 1) {
          throw new RangeError('custom reference frequencies are invalid');
        }
        frequencies[letter] = item;
        total += item;
      }
      if (Math.abs(total - 1) > 1e-9) {
        throw new RangeError('custom reference frequencies must sum to one');
      }
      const corpusLetterCount = value.referenceProfile?.corpusLetterCount;
      if (!Number.isInteger(corpusLetterCount) || corpusLetterCount < 1 || corpusLetterCount > MAX_INPUT_LETTERS) {
        throw new RangeError('custom corpus letter count is invalid');
      }
      if (value.referenceProfile?.smoothing !== 1) {
        throw new RangeError('custom reference smoothing is invalid');
      }
      referenceProfile = { id: 'custom', corpusLetterCount, smoothing: 1, frequencies };
    } else {
      throw new RangeError('analysis record reference profile is invalid');
    }

    const rare = value.rareLetterModel;
    if (
      typeof rare?.pMax !== 'number'
      || !Number.isFinite(rare.pMax)
      || rare.pMax <= 0
      || rare.pMax > 0.5
      || typeof rare?.familyAlpha !== 'number'
      || !Number.isFinite(rare.familyAlpha)
      || rare.familyAlpha <= 0
      || rare.familyAlpha > 0.2
      || !Number.isInteger(rare?.comparisonCount)
      || rare.comparisonCount < 1
      || rare.comparisonCount > ALPHABET.length
    ) {
      throw new RangeError('analysis record rare-letter model is invalid');
    }
    const thresholdInfo = {
      ...calculateRareLetterThreshold(
        letterCount,
        rare.pMax,
        rare.familyAlpha,
        rare.comparisonCount
      ),
      n: letterCount
    };
    const sensitivitySettings = {
      sampleSize: value.sensitivitySettings?.sampleSize,
      pMax: value.sensitivitySettings?.pMax,
      familyAlpha: value.sensitivitySettings?.familyAlpha,
      comparisonCount: value.sensitivitySettings?.comparisonCount,
      useBonferroni: value.sensitivitySettings?.useBonferroni
    };
    createThresholdSensitivitySeries(sensitivitySettings);
    const analyzedRows = analyzeRows(
      createRowsFromFrequency(frequency),
      thresholdInfo.threshold,
      referenceProfile.frequencies
    );
    const record = createAnalysisRecord({
      baseFrequency: frequency,
      analyzedRows,
      thresholdInfo,
      referenceProfile,
      sensitivitySettings
    });
    return { record, analyzedRows, thresholdInfo, referenceProfile, sensitivitySettings };
  }

  return Object.freeze({
    ALPHABET,
    LOW_FREQ_LETTERS,
    ENGLISH_FREQUENCIES,
    UNIFORM_FREQUENCIES,
    P_MAX,
    FAMILY_ALPHA,
    MAX_INPUT_LETTERS,
    ANALYSIS_RECORD_SCHEMA,
    ANALYSIS_RECORD_VERSION,
    normalizeText,
    applyShift,
    calculateFrequency,
    generateAllShifts,
    createRowsFromFrequency,
    createReferenceProfile,
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
    createAnalysisSummary,
    simulateBinomialUpperTail,
    createAnalysisRecord,
    parseAnalysisRecord
  });
}));
