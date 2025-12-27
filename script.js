/* ==========================================================================
   Alphabet Shift Spectrum - Main Application Logic
   ========================================================================== */

// ============================================================
// Constants & Configuration
// ============================================================
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOW_FREQ_LETTERS = ['J', 'K', 'Q', 'X', 'Z'];
const P_MAX = 0.00772; // Default max expected frequency for low-freq letters

// ============================================================
// State Management
// ============================================================
let appState = {
  inputText: '',
  normalizedText: '',
  rows: [],
  mThreshold: 0,
  activeTab: 'tab1'
};

// ============================================================
// Text Processing Functions
// ============================================================

/**
 * Normalize input text: uppercase, remove non-alphabetic characters
 * @param {string} text - Raw input text
 * @returns {string} - Normalized text (A-Z only)
 */
function normalizeText(text) {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Apply Caesar shift to text
 * @param {string} text - Normalized text
 * @param {number} shift - Shift amount (0-25)
 * @returns {string} - Shifted text
 */
function applyShift(text, shift) {
  return text.split('').map(char => {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return char;
    const newIndex = (index + shift) % 26;
    return ALPHABET[newIndex];
  }).join('');
}

/**
 * Calculate letter frequency for given text
 * @param {string} text - Text to analyze
 * @returns {Object} - Frequency object { A: count, B: count, ..., Z: count }
 */
function calculateFrequency(text) {
  const freq = {};
  for (const letter of ALPHABET) {
    freq[letter] = 0;
  }
  for (const char of text) {
    if (freq.hasOwnProperty(char)) {
      freq[char]++;
    }
  }
  return freq;
}

/**
 * Generate all 26 shift rows
 * @param {string} normalizedText - Normalized input text
 * @returns {Array} - Array of row objects
 */
function generateAllShifts(normalizedText) {
  const rows = [];
  for (let shift = 0; shift < 26; shift++) {
    const shiftedText = applyShift(normalizedText, shift);
    const freq = calculateFrequency(shiftedText);
    rows.push({
      shift: shift,
      text: shiftedText,
      freq: freq
    });
  }
  return rows;
}

// ============================================================
// Analysis Functions
// ============================================================

/**
 * Calculate M threshold based on text length
 * M_threshold = ceil(N * p_max + 3 * sqrt(N * p_max))
 * @param {number} n - Text length
 * @param {number} pMax - Max expected frequency (default 0.00772)
 * @returns {number} - M threshold value
 */
function calculateMThreshold(n, pMax = P_MAX) {
  if (n === 0) return 0;
  const expected = n * pMax;
  const stdDev = Math.sqrt(expected);
  return Math.ceil(expected + 3 * stdDev);
}

/**
 * Get max frequency among low-frequency letters (J,K,Q,X,Z)
 * @param {Object} freq - Frequency object
 * @returns {number} - Maximum count among J,K,Q,X,Z
 */
function getMaxLowFreqCount(freq) {
  return Math.max(...LOW_FREQ_LETTERS.map(letter => freq[letter]));
}

/**
 * Get sum of frequencies for low-frequency letters (J,K,Q,X,Z)
 * @param {Object} freq - Frequency object
 * @returns {number} - Sum of counts for J,K,Q,X,Z
 */
function getSumLowFreqCount(freq) {
  return LOW_FREQ_LETTERS.reduce((sum, letter) => sum + freq[letter], 0);
}

/**
 * Check if a shift is a candidate (not rejected by M threshold)
 * @param {Object} row - Row object with freq
 * @param {number} mThreshold - M threshold value
 * @returns {boolean} - True if candidate, false if rejected
 */
function isCandidate(row, mThreshold) {
  const maxLowFreq = getMaxLowFreqCount(row.freq);
  return maxLowFreq < mThreshold;
}

/**
 * Filter rows by M threshold
 * @param {Array} rows - All shift rows
 * @param {number} mThreshold - M threshold value
 * @returns {Object} - { candidates: Array, rejected: Array }
 */
function filterByMThreshold(rows, mThreshold) {
  const candidates = [];
  const rejected = [];

  for (const row of rows) {
    const maxLowFreq = getMaxLowFreqCount(row.freq);
    const sumLowFreq = getSumLowFreqCount(row.freq);
    const rowWithStats = { ...row, maxLowFreq, sumLowFreq };

    if (maxLowFreq < mThreshold) {
      candidates.push(rowWithStats);
    } else {
      rejected.push(rowWithStats);
    }
  }

  return { candidates, rejected };
}

// ============================================================
// UI Rendering Functions
// ============================================================

/**
 * Create frequency table element for a single shift
 * @param {Object} freq - Frequency object
 * @returns {HTMLElement} - Table wrapper element
 */
function createFrequencyTable(freq) {
  const wrapper = document.createElement('div');
  wrapper.className = 'freq-table-wrapper';

  const table = document.createElement('table');
  table.className = 'freq-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const letter of ALPHABET) {
    const th = document.createElement('th');
    th.textContent = letter;
    if (LOW_FREQ_LETTERS.includes(letter)) {
      th.className = 'low-freq-letter';
    }
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Data row
  const tbody = document.createElement('tbody');
  const dataRow = document.createElement('tr');
  for (const letter of ALPHABET) {
    const td = document.createElement('td');
    td.textContent = freq[letter];
    if (LOW_FREQ_LETTERS.includes(letter)) {
      td.className = 'low-freq-letter';
    }
    dataRow.appendChild(td);
  }
  tbody.appendChild(dataRow);
  table.appendChild(tbody);

  wrapper.appendChild(table);
  return wrapper;
}

/**
 * Render shift results table in Tab1
 * @param {Array} rows - Shift row data
 */
function renderShiftResults(rows) {
  const container = document.getElementById('shift-results');
  container.innerHTML = '';

  if (rows.length === 0) {
    container.innerHTML = '<p class="placeholder-message">シフト結果がありません</p>';
    return;
  }

  const mThreshold = appState.mThreshold;

  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'shift-card';

    const candidateStatus = isCandidate(row, mThreshold);
    if (candidateStatus) {
      card.classList.add('candidate');
    } else {
      card.classList.add('rejected');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'shift-header';

    const shiftNum = document.createElement('span');
    shiftNum.className = 'shift-number';
    shiftNum.textContent = `Shift ${row.shift}`;
    header.appendChild(shiftNum);

    const status = document.createElement('span');
    status.className = `shift-status ${candidateStatus ? 'candidate' : 'rejected'}`;
    status.textContent = candidateStatus ? '候補' : '除外';
    header.appendChild(status);

    card.appendChild(header);

    // Shifted text
    const textDiv = document.createElement('div');
    textDiv.className = 'shift-text';
    textDiv.textContent = row.text;
    card.appendChild(textDiv);

    // Frequency table
    const freqTable = createFrequencyTable(row.freq);
    card.appendChild(freqTable);

    container.appendChild(card);
  }
}

/**
 * Get heatmap cell color based on frequency
 * @param {number} count - Letter count
 * @param {number} maxCount - Maximum count in dataset
 * @returns {string} - CSS color value
 */
function getHeatmapColor(count, maxCount) {
  if (maxCount === 0 || count === 0) return 'var(--heatmap-zero)';

  const ratio = count / maxCount;

  if (ratio < 0.25) return 'var(--heatmap-low)';
  if (ratio < 0.50) return 'var(--heatmap-mid)';
  if (ratio < 0.75) return 'var(--heatmap-high)';
  return 'var(--heatmap-max)';
}

/**
 * Render heatmap in Tab2
 * @param {Array} rows - Shift row data
 */
function renderHeatmap(rows) {
  const container = document.getElementById('heatmap-container');
  container.innerHTML = '';

  if (rows.length === 0) {
    container.innerHTML = '<p class="placeholder-message">シフト生成後にヒートマップが表示されます</p>';
    return;
  }

  // Find max count for color scaling
  let maxCount = 0;
  for (const row of rows) {
    for (const letter of ALPHABET) {
      maxCount = Math.max(maxCount, row.freq[letter]);
    }
  }

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';

  const numCols = 27; // 1 label + 26 letters

  // Header row (empty corner + A-Z)
  const cornerCell = document.createElement('div');
  cornerCell.className = 'heatmap-header';
  cornerCell.dataset.col = '0';
  cornerCell.textContent = '';
  grid.appendChild(cornerCell);

  for (let colIdx = 0; colIdx < ALPHABET.length; colIdx++) {
    const letter = ALPHABET[colIdx];
    const headerCell = document.createElement('div');
    headerCell.className = 'heatmap-header';
    headerCell.dataset.col = String(colIdx + 1);
    if (LOW_FREQ_LETTERS.includes(letter)) {
      headerCell.classList.add('low-freq');
    }
    headerCell.textContent = letter;
    grid.appendChild(headerCell);
  }

  // Data rows
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Row label
    const rowLabel = document.createElement('div');
    rowLabel.className = 'heatmap-row-label';
    rowLabel.dataset.row = String(rowIdx + 1);
    rowLabel.dataset.col = '0';
    rowLabel.textContent = `S${row.shift}`;
    grid.appendChild(rowLabel);

    // Cells
    for (let colIdx = 0; colIdx < ALPHABET.length; colIdx++) {
      const letter = ALPHABET[colIdx];
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.row = String(rowIdx + 1);
      cell.dataset.col = String(colIdx + 1);
      if (LOW_FREQ_LETTERS.includes(letter)) {
        cell.classList.add('low-freq-col');
      }
      cell.textContent = row.freq[letter];
      cell.style.backgroundColor = getHeatmapColor(row.freq[letter], maxCount);
      cell.title = `Shift: ${row.shift}, ${letter}: ${row.freq[letter]}回`;
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);

  // Add hover highlighting
  initHeatmapHover(grid);
}

/**
 * Initialize heatmap hover highlighting
 * @param {HTMLElement} grid - The heatmap grid element
 */
function initHeatmapHover(grid) {
  const cells = grid.querySelectorAll('.heatmap-cell');

  cells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const row = cell.dataset.row;
      const col = cell.dataset.col;

      // Highlight current cell
      cell.classList.add('heatmap-highlight-cell');

      // Highlight row
      grid.querySelectorAll(`[data-row="${row}"]`).forEach(el => {
        el.classList.add('heatmap-highlight-row');
      });

      // Highlight column (including header)
      grid.querySelectorAll(`[data-col="${col}"]`).forEach(el => {
        el.classList.add('heatmap-highlight-col');
      });
    });

    cell.addEventListener('mouseleave', () => {
      // Remove all highlights
      grid.querySelectorAll('.heatmap-highlight-cell').forEach(el => {
        el.classList.remove('heatmap-highlight-cell');
      });
      grid.querySelectorAll('.heatmap-highlight-row').forEach(el => {
        el.classList.remove('heatmap-highlight-row');
      });
      grid.querySelectorAll('.heatmap-highlight-col').forEach(el => {
        el.classList.remove('heatmap-highlight-col');
      });
    });
  });
}

/**
 * Render filter results in Tab2
 * @param {Object} filterResult - { candidates, rejected }
 */
function renderFilterResults(filterResult) {
  const container = document.getElementById('filter-results');
  container.innerHTML = '';

  if (filterResult.candidates.length === 0 && filterResult.rejected.length === 0) {
    container.innerHTML = '<p class="placeholder-message">シフト生成後にフィルター結果が表示されます</p>';
    return;
  }

  // Candidates group
  const candidatesGroup = document.createElement('div');
  candidatesGroup.className = 'filter-group candidates';

  const candidatesTitle = document.createElement('h3');
  candidatesTitle.textContent = `候補シフト (${filterResult.candidates.length}件)`;
  candidatesGroup.appendChild(candidatesTitle);

  const candidatesList = document.createElement('div');
  candidatesList.className = 'filter-list';

  for (const row of filterResult.candidates) {
    const item = document.createElement('span');
    item.className = 'filter-item candidate';
    item.textContent = `Shift ${row.shift} `;
    const mValue = document.createElement('span');
    mValue.className = 'm-value';
    mValue.textContent = `(最大${row.maxLowFreq}, 合計${row.sumLowFreq})`;
    item.appendChild(mValue);
    candidatesList.appendChild(item);
  }

  if (filterResult.candidates.length === 0) {
    candidatesList.innerHTML = '<span class="placeholder-message">該当なし</span>';
  }

  candidatesGroup.appendChild(candidatesList);
  container.appendChild(candidatesGroup);

  // Rejected group
  const rejectedGroup = document.createElement('div');
  rejectedGroup.className = 'filter-group rejected';

  const rejectedTitle = document.createElement('h3');
  rejectedTitle.textContent = `除外シフト (${filterResult.rejected.length}件)`;
  rejectedGroup.appendChild(rejectedTitle);

  const rejectedList = document.createElement('div');
  rejectedList.className = 'filter-list';

  for (const row of filterResult.rejected) {
    const item = document.createElement('span');
    item.className = 'filter-item rejected';
    item.textContent = `Shift ${row.shift} `;
    const mValue = document.createElement('span');
    mValue.className = 'm-value';
    mValue.textContent = `(最大${row.maxLowFreq}, 合計${row.sumLowFreq})`;
    item.appendChild(mValue);
    rejectedList.appendChild(item);
  }

  if (filterResult.rejected.length === 0) {
    rejectedList.innerHTML = '<span class="placeholder-message">該当なし</span>';
  }

  rejectedGroup.appendChild(rejectedList);
  container.appendChild(rejectedGroup);
}

/**
 * Update threshold display in Tab2
 * @param {number} n - Text length
 * @param {number} mThreshold - Calculated threshold
 */
function updateThresholdDisplay(n, mThreshold) {
  document.getElementById('text-length').textContent = n;
  document.getElementById('m-threshold').textContent = mThreshold > 0 ? mThreshold : '-';
}

// ============================================================
// Tab Navigation
// ============================================================

/**
 * Switch to specified tab
 * @param {string} tabId - Target tab ID (tab1, tab2, etc.)
 */
function switchTab(tabId) {
  // Update buttons
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  // Update panels
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(panel => {
    const isActive = panel.id === `${tabId}-panel`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  appState.activeTab = tabId;
}

/**
 * Initialize tab navigation event listeners
 */
function initTabNavigation() {
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) {
        switchTab(btn.dataset.tab);
      }
    });
  });
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle generate button click
 */
function handleGenerate() {
  const input = document.getElementById('cipher-input').value;
  const normalizedText = normalizeText(input);

  if (normalizedText.length === 0) {
    alert('有効な英字を入力してください');
    return;
  }

  // Update state
  appState.inputText = input;
  appState.normalizedText = normalizedText;
  appState.rows = generateAllShifts(normalizedText);
  appState.mThreshold = calculateMThreshold(normalizedText.length);

  // Render Tab1
  renderShiftResults(appState.rows);

  // Update Tab2
  updateThresholdDisplay(normalizedText.length, appState.mThreshold);
  renderHeatmap(appState.rows);

  const filterResult = filterByMThreshold(appState.rows, appState.mThreshold);
  renderFilterResults(filterResult);
}

/**
 * Handle textarea input (update character count)
 * @param {Event} event - Input event
 */
function handleInputChange(event) {
  const text = event.target.value;
  const normalizedLength = normalizeText(text).length;
  document.getElementById('char-count').textContent = `有効文字数: ${normalizedLength}`;
}

// ============================================================
// Modal
// ============================================================

/**
 * Open modal
 * @param {string} modalId - Modal element ID
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close modal
 * @param {string} modalId - Modal element ID
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
}

/**
 * Initialize modal event listeners
 */
function initModal() {
  // Formula help button
  const helpBtn = document.getElementById('formula-help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => openModal('formula-modal'));
  }

  // Modal close buttons and backdrop
  document.querySelectorAll('.modal').forEach(modal => {
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal(modal.id));
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => closeModal(modal.id));
    }
  });

  // ESC key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden])').forEach(modal => {
        closeModal(modal.id);
      });
    }
  });
}

// ============================================================
// Initialization
// ============================================================

/**
 * Initialize the application
 */
function init() {
  initTabNavigation();
  initModal();

  // Event listeners
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('cipher-input').addEventListener('input', handleInputChange);
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
