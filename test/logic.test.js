'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../logic.js');

function bruteBinomialUpperTail(n, p, observed) {
  if (observed <= 0) return 1;
  if (observed > n) return 0;
  let probability = (1 - p) ** n;
  let tail = observed === 0 ? probability : 0;
  for (let k = 0; k < n; k += 1) {
    probability *= ((n - k) / (k + 1)) * (p / (1 - p));
    if (k + 1 >= observed) tail += probability;
  }
  return tail;
}

test('normalizeText keeps only ASCII A-Z and uppercases input', () => {
  assert.equal(Core.normalizeText('Khoor, World! 123 ä'), 'KHOORWORLD');
});

test('applyShift supports positive, negative, and wrapped shifts', () => {
  assert.equal(Core.applyShift('XYZ', 3), 'ABC');
  assert.equal(Core.applyShift('ABC', -3), 'XYZ');
  assert.equal(Core.applyShift('ABC', 29), 'DEF');
});

test('calculateFrequency returns all 26 counts', () => {
  const frequency = Core.calculateFrequency('ABBAZ');
  assert.equal(Object.keys(frequency).length, 26);
  assert.deepEqual({ A: frequency.A, B: frequency.B, Z: frequency.Z }, { A: 2, B: 2, Z: 1 });
});

test('generateAllShifts creates 26 deterministic rows', () => {
  const rows = Core.generateAllShifts('ABC');
  assert.equal(rows.length, 26);
  assert.equal(rows[0].text, 'ABC');
  assert.equal(rows[25].text, 'ZAB');
});

test('binomial upper tail agrees with direct summation for small samples', () => {
  for (const n of [1, 10, 25, 100]) {
    for (const observed of [0, 1, 2, Math.min(n, 6), n + 1]) {
      const actual = Core.binomialUpperTail(n, Core.P_MAX, observed);
      const expected = bruteBinomialUpperTail(n, Core.P_MAX, observed);
      assert.ok(Math.abs(actual - expected) < 1e-12, `${n}/${observed}: ${actual} != ${expected}`);
    }
  }
});

test('exact threshold is the smallest count meeting the adjusted tail bound', () => {
  for (const n of [1, 10, 100, 1000]) {
    const result = Core.calculateRareLetterThreshold(n);
    const alpha = result.perComparisonAlpha;
    assert.ok(Core.binomialUpperTail(n, Core.P_MAX, result.threshold) <= alpha);
    if (result.threshold > 0) {
      assert.ok(Core.binomialUpperTail(n, Core.P_MAX, result.threshold - 1) > alpha);
    }
  }
});

test('reported binomial standard deviation includes the (1-p) factor', () => {
  const result = Core.calculateRareLetterThreshold(1000);
  assert.equal(result.stdDev, Math.sqrt(1000 * Core.P_MAX * (1 - Core.P_MAX)));
});

test('Bonferroni adjustment cannot lower the threshold', () => {
  const single = Core.calculateRareLetterThreshold(1000, Core.P_MAX, 0.003, 1);
  const five = Core.calculateRareLetterThreshold(1000, Core.P_MAX, 0.003, 5);
  assert.ok(five.threshold >= single.threshold);
  assert.ok(Math.abs(five.perComparisonAlpha - 0.0006) < Number.EPSILON);
});

test('rare-letter screen treats the threshold as inclusive', () => {
  const row = Core.generateAllShifts('JJJJAAAA')[0];
  const analyzed = Core.analyzeRows([row], 4)[0];
  assert.equal(analyzed.passesRareLetterScreen, false);
  assert.deepEqual(analyzed.flaggedLetters, ['J']);
});

test('chi-square ranking recovers a shifted reference-like distribution', () => {
  const n = 10000;
  const referenceText = [...Core.ALPHABET].map((letter) => (
    letter.repeat(Math.round(Core.ENGLISH_FREQUENCIES[letter] * n))
  )).join('');
  const ciphertext = Core.applyShift(referenceText, 7);
  const ranked = Core.rankShiftsByChiSquare(Core.generateAllShifts(ciphertext));
  const best = ranked.find((row) => row.chiSquareRank === 1);
  assert.equal(best.shift, 19);
});

test('partitionAnalyzedRows preserves all rows', () => {
  const threshold = Core.calculateRareLetterThreshold(50).threshold;
  const analyzed = Core.analyzeRows(Core.generateAllShifts('THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG'), threshold);
  const groups = Core.partitionAnalyzedRows(analyzed);
  assert.equal(groups.within.length + groups.flagged.length, 26);
});

test('large supported input produces a finite exact threshold', () => {
  const result = Core.calculateRareLetterThreshold(Core.MAX_INPUT_LETTERS);
  assert.ok(Number.isInteger(result.threshold));
  assert.ok(result.threshold > result.expected);
});

test('per-letter chi-square contributions add up to the total score', () => {
  const row = Core.generateAllShifts('THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG')[0];
  const contributions = Core.calculateChiSquareContributions(row.freq, row.text.length);
  const total = contributions.reduce((sum, item) => sum + item.contribution, 0);
  assert.equal(contributions.length, 26);
  assert.ok(Math.abs(total - Core.calculateChiSquare(row.freq, row.text.length)) < 1e-12);
});

test('top chi-square contributions are sorted and retain their evidence fields', () => {
  const row = Core.generateAllShifts('EEEEEEEEEEETAOINSHRDLU')[0];
  const top = Core.getTopChiSquareContributions(row, 5);
  assert.equal(top.length, 5);
  assert.ok(top.every((item) => (
    typeof item.letter === 'string'
    && Number.isInteger(item.observed)
    && Number.isFinite(item.expected)
    && Number.isFinite(item.difference)
    && Number.isFinite(item.contribution)
  )));
  for (let index = 1; index < top.length; index += 1) {
    assert.ok(top[index - 1].contribution >= top[index].contribution);
  }
});

test('threshold sensitivity series compares half, base, and double sample sizes', () => {
  const adjusted = Core.createThresholdSensitivitySeries({
    sampleSize: 100,
    pMax: Core.P_MAX,
    familyAlpha: Core.FAMILY_ALPHA,
    comparisonCount: 5,
    useBonferroni: true
  });
  assert.deepEqual(adjusted.map((item) => item.sampleSize), [50, 100, 200]);
  assert.ok(adjusted.every((item) => (
    Math.abs(item.perComparisonAlpha - 0.0006) < Number.EPSILON
  )));
  assert.ok(adjusted[0].threshold <= adjusted[1].threshold);
  assert.ok(adjusted[1].threshold <= adjusted[2].threshold);

  const unadjusted = Core.createThresholdSensitivitySeries({
    sampleSize: 100,
    comparisonCount: 5,
    useBonferroni: false
  });
  assert.ok(unadjusted.every((item) => item.perComparisonAlpha === Core.FAMILY_ALPHA));
  assert.ok(adjusted[1].threshold >= unadjusted[1].threshold);
});

test('analysis summary contains reproducible conditions without plaintext', () => {
  const text = 'KHOORZRUOG';
  const thresholdInfo = {
    ...Core.calculateRareLetterThreshold(text.length),
    n: text.length
  };
  const rows = Core.analyzeRows(
    Core.generateAllShifts(text),
    thresholdInfo.threshold
  );
  const summary = Core.createAnalysisSummary(rows, thresholdInfo, 5);
  assert.equal(summary.textLength, text.length);
  assert.equal(summary.topShifts.length, 5);
  assert.equal(summary.withinCount + summary.flaggedCount, 26);
  assert.equal(Object.hasOwn(summary, 'text'), false);
  assert.equal(JSON.stringify(summary).includes(text), false);
});

test('reference profiles include an uninformative uniform control and a smoothed custom corpus', () => {
  const uniform = Core.createReferenceProfile('uniform');
  assert.ok([...Core.ALPHABET].every((letter) => uniform.frequencies[letter] === 1 / 26));

  const custom = Core.createReferenceProfile('custom', 'AAAAAB');
  const total = Object.values(custom.frequencies).reduce((sum, value) => sum + value, 0);
  assert.equal(custom.corpusLetterCount, 6);
  assert.equal(custom.smoothing, 1);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(custom.frequencies.A > custom.frequencies.B);
  assert.ok(custom.frequencies.B > custom.frequencies.C);
});

test('uniform reference gives every Caesar shift the same chi-square score', () => {
  const rows = Core.rankShiftsByChiSquare(
    Core.generateAllShifts('THEQUICKBROWNFOX'),
    Core.UNIFORM_FREQUENCIES
  );
  const score = rows[0].chiSquare;
  assert.ok(rows.every((row) => Math.abs(row.chiSquare - score) < 1e-12));
  assert.deepEqual(rows.map((row) => row.chiSquareRank), [...Array(26).keys()].map((index) => index + 1));
});

test('seeded Monte Carlo is reproducible and approaches the exact binomial tail', () => {
  const config = { sampleSize: 100, p: Core.P_MAX, threshold: 4, trials: 20000, seed: 107 };
  const first = Core.simulateBinomialUpperTail(config);
  const second = Core.simulateBinomialUpperTail(config);
  assert.deepEqual(first, second);
  assert.ok(first.exceedances >= 0 && first.exceedances <= first.trials);
  assert.ok(first.absoluteError < 0.01, `${first.estimate} versus ${first.exact}`);
});

test('analysis record round-trip recalculates aggregate results without plaintext or corpus text', () => {
  const text = 'KHOORZRUOG';
  const baseFrequency = Core.calculateFrequency(text);
  const profile = Core.createReferenceProfile('custom', 'THIS IS A REFERENCE CORPUS');
  const thresholdInfo = { ...Core.calculateRareLetterThreshold(text.length), n: text.length };
  const analyzedRows = Core.analyzeRows(
    Core.generateAllShifts(text),
    thresholdInfo.threshold,
    profile.frequencies
  );
  const sensitivitySettings = {
    sampleSize: text.length,
    pMax: Core.P_MAX,
    familyAlpha: Core.FAMILY_ALPHA,
    comparisonCount: 5,
    useBonferroni: true
  };
  const record = Core.createAnalysisRecord({
    baseFrequency,
    analyzedRows,
    thresholdInfo,
    referenceProfile: profile,
    sensitivitySettings
  });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(text), false);
  assert.equal(serialized.includes('REFERENCECORPUS'), false);

  const tampered = JSON.parse(serialized);
  tampered.result.topShifts[0].shift = 999;
  const restored = Core.parseAnalysisRecord(tampered);
  assert.equal(restored.analyzedRows.length, 26);
  assert.equal(restored.thresholdInfo.n, text.length);
  assert.equal(restored.referenceProfile.id, 'custom');
  assert.deepEqual(restored.record.result.topShifts, record.result.topShifts);
  assert.notEqual(restored.record.result.topShifts[0].shift, 999);
});

test('analysis record rejects a mismatched aggregate total', () => {
  const record = {
    schema: Core.ANALYSIS_RECORD_SCHEMA,
    version: Core.ANALYSIS_RECORD_VERSION,
    inputAggregate: { letterCount: 2, frequencies: Core.calculateFrequency('A') },
    referenceProfile: { id: 'english' },
    rareLetterModel: { pMax: Core.P_MAX, familyAlpha: Core.FAMILY_ALPHA, comparisonCount: 5 },
    sensitivitySettings: {
      sampleSize: 2,
      pMax: Core.P_MAX,
      familyAlpha: Core.FAMILY_ALPHA,
      comparisonCount: 5,
      useBonferroni: true
    }
  };
  assert.throws(() => Core.parseAnalysisRecord(record), /does not match/);
});
