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
