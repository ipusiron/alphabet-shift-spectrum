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
    messageType: 'info'
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

  function renderDynamicResults() {
    renderShiftResults();
    renderHeatmap();
    renderRankResults();
    renderFilterResults();
    updateThresholdDisplay();
  }

  function clearAnalysis() {
    appState.normalizedText = '';
    appState.analyzedRows = [];
    appState.thresholdInfo = null;
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

    const thresholdInfo = Core.calculateRareLetterThreshold(normalizedText.length);
    appState.normalizedText = normalizedText;
    appState.thresholdInfo = { ...thresholdInfo, n: normalizedText.length };
    appState.analyzedRows = Core.analyzeRows(
      Core.generateAllShifts(normalizedText),
      thresholdInfo.threshold
    );
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
  }

  document.addEventListener('DOMContentLoaded', init);
}());
