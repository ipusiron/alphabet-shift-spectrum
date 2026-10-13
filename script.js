(function initAlphabetShiftApp() {
  'use strict';

  const Core = globalThis.AlphabetShiftCore;
  const Messages = globalThis.AlphabetShiftMessages;
  if (!Core || !Messages) {
    throw new Error('Application dependencies are unavailable.');
  }

  const STORAGE_KEY = 'alphabet-shift-spectrum-language';
  const appState = {
    language: 'ja',
    normalizedText: '',
    analyzedRows: [],
    thresholdInfo: null,
    activeTab: 'tab1',
    messageKey: '',
    messageVars: {},
    messageType: 'info',
    copyStatusKey: '',
    copyFallbackVisible: false,
    referenceProfile: Core.createReferenceProfile('english'),
    monteCarloResult: null,
    monteCarloStatusKey: '',
    importedRecord: null,
    recordStatusKey: ''
  };
  let modalReturnFocus = null;

  function interpolate(template, variables = {}) {
    return template.replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }

  function t(key, variables = {}) {
    const dictionary = Messages[appState.language] ?? Messages.ja;
    return interpolate(dictionary[key] ?? Messages.ja[key] ?? key, variables);
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDecimal(value, digits = 2) {
    return Number(value).toFixed(digits);
  }

  function formatProbability(value) {
    if (value < 0.001) return value.toExponential(2);
    return Number(value.toFixed(6)).toString();
  }

  function getStoredLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'en' ? 'en' : 'ja';
    } catch {
      return 'ja';
    }
  }

  function storeLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Language switching still works when storage is unavailable.
    }
  }

  function applyStaticTranslations() {
    document.documentElement.lang = appState.language;
    document.title = t('documentTitle');
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
    });
    document.getElementById('language-toggle').textContent = t('languageButton');
  }

  function updateCharacterCount() {
    const normalizedLength = Core.normalizeText(document.getElementById('cipher-input').value).length;
    const count = document.getElementById('char-count');
    count.textContent = t('charCount', { count: normalizedLength, max: Core.MAX_INPUT_LETTERS });
    count.classList.toggle('over-limit', normalizedLength > Core.MAX_INPUT_LETTERS);
    return normalizedLength;
  }

  function getProfileLabel(profileId) {
    const keys = {
      english: 'profileEnglish',
      uniform: 'profileUniform',
      custom: 'profileCustom'
    };
    return t(keys[profileId] ?? 'profileEnglish');
  }

  function updateProfileControls() {
    const profileId = document.getElementById('profile-select').value;
    const customFields = document.getElementById('custom-profile-fields');
    customFields.hidden = profileId !== 'custom';
    const corpusLength = Core.normalizeText(document.getElementById('profile-corpus').value).length;
    const count = document.getElementById('profile-corpus-count');
    count.textContent = t('charCount', { count: corpusLength, max: Core.MAX_INPUT_LETTERS });
    count.classList.toggle('over-limit', corpusLength > Core.MAX_INPUT_LETTERS);
    const descriptionKeys = {
      english: 'profileEnglishDescription',
      uniform: 'profileUniformDescription',
      custom: 'profileCustomDescription'
    };
    document.getElementById('profile-description').textContent = t(descriptionKeys[profileId]);
  }

  function readReferenceProfile() {
    const profileId = document.getElementById('profile-select').value;
    const corpus = document.getElementById('profile-corpus').value;
    return Core.createReferenceProfile(profileId, corpus);
  }

  function renderActiveProfile() {
    const existing = document.getElementById('active-profile');
    if (!existing) return;
    const profile = appState.referenceProfile;
    existing.textContent = profile.id === 'custom'
      ? t('profileCustomActive', {
        profile: getProfileLabel(profile.id),
        count: profile.corpusLetterCount
      })
      : t('profileActive', { profile: getProfileLabel(profile.id) });
  }

  function showMessage(key, variables = {}, type = 'info') {
    appState.messageKey = key;
    appState.messageVars = variables;
    appState.messageType = type;
    const message = document.getElementById('input-message');
    message.textContent = key ? t(key, variables) : '';
    message.className = `input-message ${type}`;
  }

  function createFrequencyTable(row) {
    const wrapper = createElement('div', 'freq-table-wrapper');
    wrapper.tabIndex = 0;

    const table = createElement('table', 'freq-table');
    const caption = createElement('caption', 'visually-hidden', t('shiftApplied', { shift: row.shift }));
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const letter of Core.ALPHABET) {
      const header = createElement('th', Core.LOW_FREQ_LETTERS.includes(letter) ? 'low-freq-letter' : '', letter);
      header.scope = 'col';
      headerRow.appendChild(header);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const dataRow = document.createElement('tr');
    for (const letter of Core.ALPHABET) {
      dataRow.appendChild(createElement(
        'td',
        Core.LOW_FREQ_LETTERS.includes(letter) ? 'low-freq-letter' : '',
        row.freq[letter]
      ));
    }
    tbody.appendChild(dataRow);
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  function renderShiftResults() {
    const container = document.getElementById('shift-results');
    container.replaceChildren();
    if (appState.analyzedRows.length === 0) {
      container.appendChild(createElement('p', 'placeholder-message', t('shiftsPlaceholder')));
      return;
    }

    for (const row of appState.analyzedRows) {
      const statusClass = row.passesRareLetterScreen ? 'within' : 'flagged';
      const card = createElement('article', `shift-card ${statusClass}`);
      card.id = `shift-${row.shift}`;

      const header = createElement('div', 'shift-header');
      const heading = createElement('h2', 'shift-number', `Shift ${row.shift}`);
      const badges = createElement('div', 'shift-badges');
      badges.appendChild(createElement('span', 'rank-badge', t('chiRankShort', { rank: row.chiSquareRank })));
      badges.appendChild(createElement(
        'span',
        `shift-status ${statusClass}`,
        t(row.passesRareLetterScreen ? 'within' : 'flagged')
      ));
      header.append(heading, badges);
      card.appendChild(header);
      card.appendChild(createElement('p', 'shift-text', row.text));
      card.appendChild(createFrequencyTable(row));
      container.appendChild(card);
    }
  }

  function getHeatmapClass(count, maxCount) {
    if (maxCount === 0 || count === 0) return 'heat-zero';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'heat-low';
    if (ratio < 0.5) return 'heat-mid';
    if (ratio < 0.75) return 'heat-high';
    return 'heat-max';
  }

  function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    container.replaceChildren();
    if (appState.analyzedRows.length === 0) {
      container.appendChild(createElement('p', 'placeholder-message', t('heatmapPlaceholder')));
      return;
    }

    let maxCount = 0;
    for (const row of appState.analyzedRows) {
      for (const letter of Core.ALPHABET) {
        maxCount = Math.max(maxCount, row.freq[letter]);
      }
    }

    const grid = createElement('div', 'heatmap-grid');
    grid.setAttribute('role', 'table');
    grid.setAttribute('aria-label', t('heatmapHeading'));

    const corner = createElement('div', 'heatmap-header', '');
    corner.dataset.col = '0';
    corner.setAttribute('role', 'columnheader');
    grid.appendChild(corner);
    [...Core.ALPHABET].forEach((letter, columnIndex) => {
      const header = createElement(
        'div',
        `heatmap-header${Core.LOW_FREQ_LETTERS.includes(letter) ? ' low-freq' : ''}`,
        letter
      );
      header.dataset.col = String(columnIndex + 1);
      header.setAttribute('role', 'columnheader');
      grid.appendChild(header);
    });

    appState.analyzedRows.forEach((row, rowIndex) => {
      const label = createElement('div', 'heatmap-row-label', `S${row.shift}`);
      label.dataset.row = String(rowIndex + 1);
      label.dataset.col = '0';
      label.setAttribute('role', 'rowheader');
      grid.appendChild(label);

      [...Core.ALPHABET].forEach((letter, columnIndex) => {
        const count = row.freq[letter];
        const cell = createElement(
          'div',
          `heatmap-cell ${getHeatmapClass(count, maxCount)}${Core.LOW_FREQ_LETTERS.includes(letter) ? ' low-freq-col' : ''}`,
          count
        );
        const accessibleText = t('heatmapCell', { shift: row.shift, letter, count });
        cell.dataset.row = String(rowIndex + 1);
        cell.dataset.col = String(columnIndex + 1);
        cell.title = accessibleText;
        cell.setAttribute('role', 'cell');
        cell.setAttribute('aria-label', accessibleText);
        grid.appendChild(cell);
      });
    });

    container.appendChild(grid);
    initHeatmapHighlight(grid);
  }

  function initHeatmapHighlight(grid) {
    function clearHighlight() {
      grid.querySelectorAll('.heatmap-highlight-cell, .heatmap-highlight-row, .heatmap-highlight-col')
        .forEach((element) => element.classList.remove(
          'heatmap-highlight-cell',
          'heatmap-highlight-row',
          'heatmap-highlight-col'
        ));
    }

    grid.querySelectorAll('.heatmap-cell').forEach((cell) => {
      cell.addEventListener('pointerenter', () => {
        clearHighlight();
        const { row, col } = cell.dataset;
        cell.classList.add('heatmap-highlight-cell');
        grid.querySelectorAll(`[data-row="${row}"]`).forEach((element) => element.classList.add('heatmap-highlight-row'));
        grid.querySelectorAll(`[data-col="${col}"]`).forEach((element) => element.classList.add('heatmap-highlight-col'));
      });
    });
    grid.addEventListener('pointerleave', clearHighlight);
  }

  function renderRankResults() {
    const container = document.getElementById('rank-results');
    container.replaceChildren();
    if (appState.analyzedRows.length === 0) {
      container.appendChild(createElement('p', 'placeholder-message', t('chiPlaceholder')));
      return;
    }

    const rankedRows = [...appState.analyzedRows]
      .sort((a, b) => a.chiSquareRank - b.chiSquareRank)
      .slice(0, 5);
    const list = createElement('ol', 'rank-list');
    for (const row of rankedRows) {
      const item = document.createElement('li');
      const rank = createElement('span', 'rank-position', t('chiRank', { rank: row.chiSquareRank }));
      const shift = createElement('strong', 'rank-shift', `Shift ${row.shift}`);
      const score = createElement('span', 'rank-score', t('chiScore', { score: row.chiSquare.toFixed(2) }));
      item.append(rank, shift, score);
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  function renderContributionResults() {
    const container = document.getElementById('chi-contribution-results');
    container.replaceChildren();
    if (appState.analyzedRows.length === 0) {
      container.appendChild(createElement('p', 'placeholder-message', t('contributionPlaceholder')));
      return;
    }

    const rankedRows = [...appState.analyzedRows]
      .sort((a, b) => a.chiSquareRank - b.chiSquareRank)
      .slice(0, 3);

    for (const row of rankedRows) {
      const card = createElement('article', 'contribution-card');
      const heading = createElement('h4', '', `${t('chiRank', { rank: row.chiSquareRank })} · Shift ${row.shift}`);
      const score = createElement('p', 'contribution-total', t('chiScore', {
        score: formatDecimal(row.chiSquare)
      }));
      const wrapper = createElement('div', 'contribution-table-wrapper');
      wrapper.tabIndex = 0;
      const table = createElement('table', 'contribution-table');
      table.appendChild(createElement(
        'caption',
        'visually-hidden',
        t('contributionCaption', { shift: row.shift })
      ));

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['', 'observed', 'expected', 'difference', 'contribution'].forEach((key) => {
        const header = createElement('th', '', key ? t(key) : 'A–Z');
        header.scope = 'col';
        headerRow.appendChild(header);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const item of Core.getTopChiSquareContributions(
        row,
        5,
        appState.referenceProfile.frequencies
      )) {
        const dataRow = document.createElement('tr');
        const letter = createElement('th', '', item.letter);
        letter.scope = 'row';
        dataRow.appendChild(letter);
        dataRow.appendChild(createElement('td', '', item.observed));
        dataRow.appendChild(createElement('td', '', formatDecimal(item.expected)));
        dataRow.appendChild(createElement('td', '', formatDecimal(item.difference)));
        dataRow.appendChild(createElement('td', '', formatDecimal(item.contribution)));
        tbody.appendChild(dataRow);
      }
      table.appendChild(tbody);
      wrapper.appendChild(table);
      card.append(heading, score, wrapper);
      container.appendChild(card);
    }
  }

  function createFilterGroup(rows, isWithin) {
    const group = createElement('section', `filter-group ${isWithin ? 'within' : 'flagged'}`);
    group.appendChild(createElement(
      'h4',
      '',
      t(isWithin ? 'withinGroup' : 'flaggedGroup', { count: rows.length })
    ));
    const list = createElement('div', 'filter-list');
    if (rows.length === 0) {
      list.appendChild(createElement('span', 'placeholder-message compact', t('none')));
    }
    for (const row of rows) {
      const item = createElement('span', `filter-item ${isWithin ? 'within' : 'flagged'}`);
      item.appendChild(createElement('strong', '', `Shift ${row.shift}`));
      item.appendChild(createElement('span', 'metric-value', t('resultStats', {
        max: row.maxLowFreq,
        sum: row.sumLowFreq
      })));
      if (!isWithin) {
        item.appendChild(createElement('span', 'flagged-letters', t('flaggedLetters', {
          letters: row.flaggedLetters.join(', ')
        })));
      }
      list.appendChild(item);
    }
    group.appendChild(list);
    return group;
  }

  function renderFilterResults() {
    const container = document.getElementById('filter-results');
    container.replaceChildren();
    if (appState.analyzedRows.length === 0) {
      container.appendChild(createElement('p', 'placeholder-message', t('filterPlaceholder')));
      return;
    }
    const groups = Core.partitionAnalyzedRows(appState.analyzedRows);
    container.append(createFilterGroup(groups.within, true), createFilterGroup(groups.flagged, false));
  }

  function updateThresholdDisplay() {
    document.getElementById('text-length').textContent = appState.thresholdInfo?.n ?? 0;
    document.getElementById('rare-threshold').textContent = appState.thresholdInfo?.threshold ?? '-';
  }

  function readSensitivityInputs() {
    return {
      sampleSize: Number(document.getElementById('sensitivity-n').value),
      pMax: Number(document.getElementById('sensitivity-p').value),
      familyAlpha: Number(document.getElementById('sensitivity-alpha').value),
      comparisonCount: Number(document.getElementById('sensitivity-comparisons').value),
      useBonferroni: document.getElementById('sensitivity-adjust').checked
    };
  }

  function setSensitivityDefaults(sampleSize = 100) {
    document.getElementById('sensitivity-n').value = String(sampleSize);
    document.getElementById('sensitivity-p').value = String(Core.P_MAX);
    document.getElementById('sensitivity-alpha').value = String(Core.FAMILY_ALPHA);
    document.getElementById('sensitivity-comparisons').value = String(Core.LOW_FREQ_LETTERS.length);
    document.getElementById('sensitivity-adjust').checked = true;
  }

  function isSensitivityConfigValid(config) {
    return Number.isInteger(config.sampleSize)
      && config.sampleSize >= 1
      && config.sampleSize <= Core.MAX_INPUT_LETTERS
      && Number.isFinite(config.pMax)
      && config.pMax > 0
      && config.pMax <= 0.5
      && Number.isFinite(config.familyAlpha)
      && config.familyAlpha > 0
      && config.familyAlpha <= 0.2
      && Number.isInteger(config.comparisonCount)
      && config.comparisonCount >= 1
      && config.comparisonCount <= Core.ALPHABET.length;
  }

  function getSensitivityScaleKey(factor) {
    if (factor < 1) return 'sensitivityHalf';
    if (factor > 1) return 'sensitivityDouble';
    return 'sensitivityBase';
  }

  function renderSensitivityLab() {
    const message = document.getElementById('sensitivity-message');
    const container = document.getElementById('sensitivity-results');
    container.replaceChildren();
    message.textContent = '';

    const config = readSensitivityInputs();
    const valid = isSensitivityConfigValid(config);
    document.getElementById('monte-carlo-run').disabled = !valid;

    if (!valid) {
      message.textContent = t('sensitivityInvalid');
      message.className = 'sensitivity-message error';
      return;
    }

    let series;
    try {
      series = Core.createThresholdSensitivitySeries(config);
    } catch {
      message.textContent = t('sensitivityInvalid');
      message.className = 'sensitivity-message error';
      return;
    }

    message.className = 'sensitivity-message info';
    message.textContent = t(
      config.useBonferroni ? 'sensitivityAdjusted' : 'sensitivityUnadjusted',
      { alpha: formatProbability(series[0].perComparisonAlpha) }
    );

    const wrapper = createElement('div', 'sensitivity-table-wrapper');
    wrapper.tabIndex = 0;
    const table = createElement('table', 'sensitivity-table');
    table.appendChild(createElement('caption', 'visually-hidden', t('sensitivityTableCaption')));
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['sensitivityScale', 'textLength', 'sensitivityExpected', 'sensitivityThreshold', 'sensitivityPerAlpha', 'sensitivityGraph']
      .forEach((key) => {
        const header = createElement('th', '', t(key));
        header.scope = 'col';
        headerRow.appendChild(header);
      });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const maxThreshold = Math.max(1, ...series.map((item) => item.threshold));
    const tbody = document.createElement('tbody');
    for (const item of series) {
      const row = document.createElement('tr');
      row.dataset.factor = String(item.factor);
      row.dataset.threshold = String(item.threshold);
      const scale = createElement('th', '', t(getSensitivityScaleKey(item.factor)));
      scale.scope = 'row';
      row.appendChild(scale);
      row.appendChild(createElement('td', '', item.sampleSize));
      row.appendChild(createElement('td', '', formatDecimal(item.expected, 3)));
      row.appendChild(createElement('td', 'sensitivity-threshold-value', item.threshold));
      row.appendChild(createElement('td', '', formatProbability(item.perComparisonAlpha)));
      const graphCell = document.createElement('td');
      const progress = document.createElement('progress');
      progress.max = maxThreshold;
      progress.value = item.threshold;
      progress.setAttribute('aria-label', `${t(getSensitivityScaleKey(item.factor))}: k=${item.threshold}`);
      graphCell.appendChild(progress);
      row.appendChild(graphCell);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  function renderMonteCarloResult() {
    const container = document.getElementById('monte-carlo-result');
    container.replaceChildren();
    if (!appState.monteCarloResult) {
      container.appendChild(createElement(
        'p',
        appState.monteCarloStatusKey ? 'input-message error' : 'placeholder-message',
        t(appState.monteCarloStatusKey || 'monteCarloPlaceholder')
      ));
      return;
    }

    const result = appState.monteCarloResult;
    const list = createElement('dl', 'monte-carlo-values');
    const rows = [
      t('monteCarloCondition', {
        n: result.sampleSize,
        p: formatProbability(result.p),
        threshold: result.threshold,
        seed: result.seed
      }),
      t('monteCarloExact', {
        threshold: result.threshold,
        value: formatProbability(result.exact)
      }),
      t('monteCarloEstimate', {
        value: formatProbability(result.estimate),
        hits: result.exceedances,
        trials: result.trials
      }),
      t('monteCarloError', { value: formatProbability(result.absoluteError) })
    ];
    rows.forEach((textValue, index) => {
      const item = createElement('div', index === 0 ? 'monte-carlo-condition' : 'monte-carlo-value');
      item.appendChild(createElement('span', '', textValue));
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function handleMonteCarloSubmit(event) {
    event.preventDefault();
    const config = readSensitivityInputs();
    const trials = Number(document.getElementById('monte-carlo-trials').value);
    const seed = Number(document.getElementById('monte-carlo-seed').value);
    if (
      !isSensitivityConfigValid(config)
      || !Number.isInteger(trials)
      || trials < 100
      || trials > 20000
      || !Number.isInteger(seed)
      || seed < 0
      || seed > 0xffffffff
    ) {
      appState.monteCarloResult = null;
      appState.monteCarloStatusKey = 'monteCarloInvalid';
      renderMonteCarloResult();
      return;
    }

    try {
      const base = Core.createThresholdSensitivitySeries(config)
        .find((item) => item.factor === 1);
      appState.monteCarloResult = Core.simulateBinomialUpperTail({
        sampleSize: base.sampleSize,
        p: config.pMax,
        threshold: base.threshold,
        trials,
        seed
      });
      appState.monteCarloStatusKey = '';
    } catch {
      appState.monteCarloResult = null;
      appState.monteCarloStatusKey = 'monteCarloInvalid';
    }
    renderMonteCarloResult();
  }

  function handleSensitivityMutation() {
    appState.monteCarloResult = null;
    appState.monteCarloStatusKey = '';
    renderSensitivityLab();
    renderMonteCarloResult();
    renderRecordSection();
  }

  function buildAnalysisSummaryText() {
    const summary = Core.createAnalysisSummary(appState.analyzedRows, appState.thresholdInfo, 5);
    const lines = [
      t('summaryTitle'),
      t('summaryLength', { count: summary.textLength }),
      t('summaryProfile', { profile: getProfileLabel(appState.referenceProfile.id) }),
      t('summaryModel', {
        p: summary.pMax,
        alpha: summary.familyAlpha,
        comparisons: summary.comparisonCount,
        threshold: summary.threshold
      }),
      t('summaryTopHeading')
    ];
    summary.topShifts.forEach((row) => lines.push(t('summaryShift', {
      rank: row.rank,
      shift: row.shift,
      score: formatDecimal(row.chiSquare)
    })));
    lines.push(t('summaryCounts', {
      within: summary.withinCount,
      flagged: summary.flaggedCount
    }));
    lines.push(t('summaryLimit'));
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through for file:// and restricted clipboard contexts.
      }
    }

    const buffer = createElement('textarea', 'clipboard-buffer');
    buffer.value = text;
    buffer.setAttribute('readonly', '');
    document.body.appendChild(buffer);
    buffer.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    buffer.remove();
    return copied;
  }

  function renderCopyControls() {
    const button = document.getElementById('copy-summary-btn');
    button.disabled = appState.analyzedRows.length === 0;
    document.getElementById('copy-status').textContent = appState.copyStatusKey
      ? t(appState.copyStatusKey)
      : '';
    const fallback = document.getElementById('copy-fallback');
    fallback.hidden = !appState.copyFallbackVisible || appState.analyzedRows.length === 0;
    if (!fallback.hidden) {
      document.getElementById('copy-fallback-text').value = buildAnalysisSummaryText();
    }
  }

  async function handleCopySummary() {
    if (appState.analyzedRows.length === 0) return;
    const copied = await copyText(buildAnalysisSummaryText());
    appState.copyStatusKey = copied ? 'copySummarySuccess' : 'copySummaryFailure';
    appState.copyFallbackVisible = !copied;
    renderCopyControls();
    if (!copied) {
      const fallbackText = document.getElementById('copy-fallback-text');
      fallbackText.focus();
      fallbackText.select();
    }
  }

  function buildCurrentAnalysisRecord() {
    if (appState.analyzedRows.length === 0 || !appState.thresholdInfo) return null;
    const sensitivitySettings = readSensitivityInputs();
    if (!isSensitivityConfigValid(sensitivitySettings)) return null;
    return Core.createAnalysisRecord({
      baseFrequency: Core.calculateFrequency(appState.normalizedText),
      analyzedRows: appState.analyzedRows,
      thresholdInfo: appState.thresholdInfo,
      referenceProfile: appState.referenceProfile,
      sensitivitySettings
    });
  }

  function renderRecordSection() {
    const saveButton = document.getElementById('record-save-btn');
    const clearButton = document.getElementById('record-clear-btn');
    const status = document.getElementById('record-status');
    const container = document.getElementById('record-results');
    const canSave = appState.analyzedRows.length > 0
      && isSensitivityConfigValid(readSensitivityInputs());
    saveButton.disabled = !canSave;
    clearButton.disabled = !appState.importedRecord;
    status.textContent = appState.recordStatusKey ? t(appState.recordStatusKey) : '';
    status.className = `record-status ${appState.recordStatusKey === 'recordInvalid' || appState.recordStatusKey === 'recordTooLarge' ? 'error' : 'success'}`;
    container.replaceChildren();

    if (!appState.importedRecord) {
      container.appendChild(createElement('p', 'placeholder-message', t('recordPlaceholder')));
      return;
    }

    const record = appState.importedRecord.record;
    const summary = record.result;
    const article = createElement('article', 'record-summary-card');
    article.appendChild(createElement('h3', '', t('recordSummary')));
    const facts = createElement('div', 'record-facts');
    facts.append(
      createElement('p', '', t('recordProfile', {
        profile: getProfileLabel(record.referenceProfile.id)
      })),
      createElement('p', '', t('recordThreshold', {
        count: summary.textLength,
        threshold: summary.threshold
      })),
      createElement('p', '', t('recordCounts', {
        within: summary.withinCount,
        flagged: summary.flaggedCount
      }))
    );
    const heading = createElement('h4', '', t('recordTopHeading'));
    const list = createElement('ol', 'record-rank-list');
    summary.topShifts.forEach((row) => list.appendChild(createElement('li', '', t('recordTopItem', {
      rank: row.rank,
      shift: row.shift,
      score: formatDecimal(row.chiSquare)
    }))));
    article.append(facts, heading, list);
    container.appendChild(article);
  }

  function handleSaveRecord() {
    let record;
    try {
      record = buildCurrentAnalysisRecord();
    } catch {
      record = null;
    }
    if (!record) {
      appState.recordStatusKey = 'recordInvalid';
      renderRecordSection();
      return;
    }
    const blob = new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'alphabet-shift-spectrum-analysis.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    appState.recordStatusKey = 'recordSaved';
    renderRecordSection();
  }

  async function handleRecordFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      appState.importedRecord = null;
      appState.recordStatusKey = 'recordTooLarge';
      renderRecordSection();
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      appState.importedRecord = Core.parseAnalysisRecord(parsed);
      appState.recordStatusKey = 'recordLoaded';
    } catch {
      appState.importedRecord = null;
      appState.recordStatusKey = 'recordInvalid';
    }
    renderRecordSection();
  }

  function clearImportedRecord() {
    appState.importedRecord = null;
    appState.recordStatusKey = '';
    renderRecordSection();
  }

  function renderDynamicResults() {
    renderShiftResults();
    renderHeatmap();
    renderRankResults();
    renderContributionResults();
    renderFilterResults();
    updateThresholdDisplay();
    renderSensitivityLab();
    renderMonteCarloResult();
    renderCopyControls();
    renderActiveProfile();
    updateProfileControls();
    renderRecordSection();
  }

  function clearAnalysis() {
    appState.normalizedText = '';
    appState.analyzedRows = [];
    appState.thresholdInfo = null;
    appState.copyStatusKey = '';
    appState.copyFallbackVisible = false;
    renderDynamicResults();
  }

  function handleGenerate() {
    const normalizedText = Core.normalizeText(document.getElementById('cipher-input').value);
    if (normalizedText.length === 0) {
      clearAnalysis();
      showMessage('enterLetters', {}, 'error');
      return;
    }
    if (normalizedText.length > Core.MAX_INPUT_LETTERS) {
      clearAnalysis();
      showMessage('tooLong', { max: Core.MAX_INPUT_LETTERS }, 'error');
      return;
    }

    let referenceProfile;
    try {
      referenceProfile = readReferenceProfile();
    } catch {
      clearAnalysis();
      showMessage('profileCustomRequired', {}, 'error');
      return;
    }

    const thresholdInfo = Core.calculateRareLetterThreshold(normalizedText.length);
    appState.normalizedText = normalizedText;
    appState.referenceProfile = referenceProfile;
    appState.thresholdInfo = { ...thresholdInfo, n: normalizedText.length };
    appState.analyzedRows = Core.analyzeRows(
      Core.generateAllShifts(normalizedText),
      thresholdInfo.threshold,
      referenceProfile.frequencies
    );
    appState.copyStatusKey = '';
    appState.copyFallbackVisible = false;
    appState.monteCarloResult = null;
    appState.monteCarloStatusKey = '';
    document.getElementById('sensitivity-n').value = String(normalizedText.length);
    renderDynamicResults();
    showMessage('ready', { count: normalizedText.length }, 'success');
  }

  function handleInputChange() {
    const normalizedLength = updateCharacterCount();
    const currentText = Core.normalizeText(document.getElementById('cipher-input').value);
    if (appState.analyzedRows.length > 0 && currentText !== appState.normalizedText) {
      clearAnalysis();
      showMessage('inputChanged', {}, 'info');
    }
    if (normalizedLength > Core.MAX_INPUT_LETTERS) {
      showMessage('tooLong', { max: Core.MAX_INPUT_LETTERS }, 'error');
    }
  }

  function handleProfileMutation() {
    const hadAnalysis = appState.analyzedRows.length > 0;
    updateProfileControls();
    try {
      appState.referenceProfile = readReferenceProfile();
    } catch {
      const selectedId = document.getElementById('profile-select').value;
      appState.referenceProfile = {
        ...Core.createReferenceProfile('english'),
        id: selectedId,
        corpusLetterCount: 0
      };
    }
    if (hadAnalysis) {
      clearAnalysis();
      showMessage('profileChanged', {}, 'info');
    } else {
      renderActiveProfile();
    }
  }

  function switchTab(tabId, moveFocus = false) {
    const targetButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (!targetButton) return;

    document.querySelectorAll('.tab-button').forEach((button) => {
      const active = button === targetButton;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const active = panel.id === `${tabId}-panel`;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    appState.activeTab = tabId;
    if (moveFocus) targetButton.focus();
  }

  function initTabs() {
    const tabs = [...document.querySelectorAll('.tab-button')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
      button.addEventListener('keydown', (event) => {
        let targetIndex = null;
        if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') targetIndex = 0;
        if (event.key === 'End') targetIndex = tabs.length - 1;
        if (targetIndex !== null) {
          event.preventDefault();
          switchTab(tabs[targetIndex].dataset.tab, true);
        }
      });
    });
  }

  function getFocusableElements(container) {
    return [...container.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  }

  function openModal() {
    const modal = document.getElementById('formula-modal');
    modalReturnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.modal-close').focus();
  }

  function closeModal() {
    const modal = document.getElementById('formula-modal');
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (
      modalReturnFocus
      && typeof modalReturnFocus.focus === 'function'
      && document.contains(modalReturnFocus)
    ) {
      modalReturnFocus.focus();
    }
  }

  function initModal() {
    const modal = document.getElementById('formula-modal');
    document.getElementById('formula-help-btn').addEventListener('click', openModal);
    modal.querySelectorAll('[data-modal-close]').forEach((element) => element.addEventListener('click', closeModal));
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(modal);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function switchLanguage() {
    appState.language = appState.language === 'ja' ? 'en' : 'ja';
    storeLanguage(appState.language);
    applyStaticTranslations();
    updateCharacterCount();
    renderDynamicResults();
    if (appState.messageKey) {
      showMessage(appState.messageKey, appState.messageVars, appState.messageType);
    }
  }

  function init() {
    appState.language = getStoredLanguage();
    applyStaticTranslations();
    updateCharacterCount();
    initTabs();
    initModal();
    renderDynamicResults();

    document.getElementById('language-toggle').addEventListener('click', switchLanguage);
    document.getElementById('generate-btn').addEventListener('click', handleGenerate);
    document.getElementById('cipher-input').addEventListener('input', handleInputChange);
    document.getElementById('profile-select').addEventListener('change', handleProfileMutation);
    document.getElementById('profile-corpus').addEventListener('input', handleProfileMutation);
    document.getElementById('copy-summary-btn').addEventListener('click', handleCopySummary);
    document.getElementById('record-save-btn').addEventListener('click', handleSaveRecord);
    document.getElementById('record-load-btn').addEventListener('click', () => {
      document.getElementById('record-file').click();
    });
    document.getElementById('record-file').addEventListener('change', handleRecordFile);
    document.getElementById('record-clear-btn').addEventListener('click', clearImportedRecord);
    document.getElementById('sensitivity-form').addEventListener('submit', (event) => event.preventDefault());
    document.getElementById('sensitivity-form').addEventListener('input', handleSensitivityMutation);
    document.getElementById('sensitivity-reset').addEventListener('click', () => {
      setSensitivityDefaults(appState.thresholdInfo?.n ?? 100);
      handleSensitivityMutation();
    });
    document.getElementById('monte-carlo-form').addEventListener('submit', handleMonteCarloSubmit);
    document.getElementById('monte-carlo-form').addEventListener('input', () => {
      appState.monteCarloResult = null;
      appState.monteCarloStatusKey = '';
      renderMonteCarloResult();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
}());
