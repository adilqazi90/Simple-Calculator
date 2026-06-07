/**
 * Calculus — script.js
 * Author: CodeAlpha Internship · Task 2
 *
 * Architecture:
 *  - State machine (state object → render → DOM)
 *  - Pure evaluate() using safe arithmetic (no eval)
 *  - Event delegation on keypad
 *  - Keyboard handler mapped to actions
 *  - History panel with click-to-recall
 *  - Theme persistence via localStorage
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   1. STATE
   ═══════════════════════════════════════════════════════ */

const state = {
  current:        '0',     // what's shown in the main display
  expression:     '',      // the full expression shown above
  operator:       null,    // pending operator (+, −, ×, ÷)
  operand1:       null,    // stored first operand (as number)
  waitingForOp2:  false,   // true after operator pressed
  justComputed:   false,   // true after = pressed
  hasError:       false,
};

const history = [];        // [{ expr, result }]

/* ═══════════════════════════════════════════════════════
   2. DOM REFERENCES
   ═══════════════════════════════════════════════════════ */

const displayMain   = document.getElementById('display-main');
const displayExpr   = document.getElementById('display-expr');
const btnCopy       = document.getElementById('btn-copy');
const copyToast     = document.getElementById('copy-toast');
const historyPanel  = document.getElementById('history-panel');
const historyList   = document.getElementById('history-list');
const historyEmpty  = document.getElementById('history-empty');
const btnHistory    = document.getElementById('btn-history');
const btnClearHist  = document.getElementById('btn-clear-history');
const btnTheme      = document.getElementById('btn-theme');
const keypad        = document.querySelector('.keypad');
const backspaceBtn  = document.querySelector('[data-action="backspace"]');

/* ═══════════════════════════════════════════════════════
   3. RENDER
   ═══════════════════════════════════════════════════════ */

function render() {
  // Main display
  displayMain.textContent = formatDisplay(state.current);
  displayMain.classList.toggle('is-error',  state.hasError);
  displayMain.classList.toggle('is-result', state.justComputed && !state.hasError);

  // Auto-shrink for long numbers
  const len = state.current.length;
  if (len > 14)      displayMain.style.fontSize = 'clamp(1rem, 3vw, 1.4rem)';
  else if (len > 10) displayMain.style.fontSize = 'clamp(1.4rem, 4vw, 1.8rem)';
  else if (len > 7)  displayMain.style.fontSize = 'clamp(1.8rem, 6vw, 2.2rem)';
  else               displayMain.style.fontSize  = '';

  // Expression line
  displayExpr.textContent = state.expression;

  // Active operator highlight
  document.querySelectorAll('.key-op').forEach(btn => {
    btn.classList.toggle(
      'active-op',
      btn.dataset.value === state.operator && state.waitingForOp2
    );
  });

  // Copy button visibility (show when there's a computed result or non-zero number)
  const showCopy = state.current !== '0' && state.current !== 'Error' && !state.hasError;
  btnCopy.classList.toggle('visible', showCopy);
}

function formatDisplay(val) {
  if (val === 'Error') return 'Error';
  // If it's a valid number, format large integers with locale separators
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  // Don't format if user is still typing decimals
  if (val.endsWith('.') || val.endsWith('0') && val.includes('.')) return val;
  // Limit floating-point noise
  const str = parseFloat(num.toPrecision(12)).toString();
  return str;
}

/* ═══════════════════════════════════════════════════════
   4. SAFE ARITHMETIC (no eval)
   ═══════════════════════════════════════════════════════ */

function compute(a, op, b) {
  a = parseFloat(a);
  b = parseFloat(b);
  if (isNaN(a) || isNaN(b)) return null;

  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': {
      if (b === 0) return null; // Division by zero
      return a / b;
    }
    default: return null;
  }
}

/* Tidy result: no floating-point noise, max 10 significant digits */
function tidyResult(n) {
  if (n === null) return null;
  if (!isFinite(n)) return null;
  // Round to 10 significant figures to remove floating-point dust
  const rounded = parseFloat(n.toPrecision(10));
  return rounded.toString();
}

/* ═══════════════════════════════════════════════════════
   5. ACTIONS
   ═══════════════════════════════════════════════════════ */

function actionDigit(digit) {
  if (state.hasError) return;

  // After = or after operator, start fresh
  if (state.justComputed) {
    state.current       = digit;
    state.expression    = '';
    state.justComputed  = false;
    render(); return;
  }

  if (state.waitingForOp2) {
    state.current       = digit;
    state.waitingForOp2 = false;
    render(); return;
  }

  // Prevent leading zeros
  if (state.current === '0' && digit !== '.') {
    state.current = digit;
  } else {
    // Limit length
    if (state.current.length >= 16) return;
    state.current += digit;
  }
  render();
}

function actionDecimal() {
  if (state.hasError) return;
  if (state.waitingForOp2 || state.justComputed) {
    state.current       = '0.';
    state.waitingForOp2 = false;
    state.justComputed  = false;
    render(); return;
  }
  if (!state.current.includes('.')) {
    state.current += '.';
    render();
  }
}

function actionOperator(op) {
  if (state.hasError) return;

  const cur = parseFloat(state.current);

  // Chain operators: compute previous pending op first
  if (state.operator && !state.waitingForOp2) {
    const result = tidyResult(compute(state.operand1, state.operator, cur));
    if (result === null) { triggerError('Error'); return; }
    state.operand1  = result;
    state.current   = result;
  } else {
    state.operand1 = state.current;
  }

  state.operator      = op;
  state.waitingForOp2 = true;
  state.justComputed  = false;
  state.expression    = `${formatDisplay(state.operand1)} ${op}`;
  render();
}

function actionEquals() {
  if (state.hasError) return;
  if (!state.operator || state.waitingForOp2) return; // nothing to compute

  const a   = state.operand1;
  const b   = state.current;
  const op  = state.operator;
  const exprText = `${formatDisplay(a)} ${op} ${formatDisplay(b)} =`;

  const raw    = compute(a, op, b);
  const result = tidyResult(raw);

  if (result === null) {
    triggerError(op === '÷' ? 'Div by 0' : 'Error');
    addHistory(exprText, 'Error');
    return;
  }

  // Push to history
  addHistory(exprText, result);

  state.current      = result;
  state.expression   = exprText;
  state.operator     = null;
  state.operand1     = null;
  state.waitingForOp2 = false;
  state.justComputed  = true;
  render();
}

function actionClear() {
  state.current       = '0';
  state.expression    = '';
  state.operator      = null;
  state.operand1      = null;
  state.waitingForOp2 = false;
  state.justComputed  = false;
  state.hasError      = false;
  render();
}

function actionBackspace() {
  if (state.hasError || state.justComputed) { actionClear(); return; }
  if (state.waitingForOp2) return;
  state.current = state.current.length > 1
    ? state.current.slice(0, -1)
    : '0';
  render();
}

function actionSign() {
  if (state.hasError) return;
  const num = parseFloat(state.current);
  if (isNaN(num) || num === 0) return;
  state.current = (num * -1).toString();
  render();
}

function actionPercent() {
  if (state.hasError) return;
  const num = parseFloat(state.current);
  if (isNaN(num)) return;
  // If there's a pending operation, calculate percent of operand1
  if (state.operator && state.operand1 !== null) {
    const base = parseFloat(state.operand1);
    state.current = tidyResult((base * num) / 100);
  } else {
    state.current = tidyResult(num / 100);
  }
  state.justComputed = false;
  render();
}

function triggerError(msg) {
  state.current   = msg || 'Error';
  state.hasError  = true;
  state.expression = '';
  render();
}

/* ═══════════════════════════════════════════════════════
   6. DISPATCH — maps action name → function
   ═══════════════════════════════════════════════════════ */

function dispatch(action, value) {
  switch (action) {
    case 'digit':     actionDigit(value);    break;
    case 'decimal':   actionDecimal();       break;
    case 'operator':  actionOperator(value); break;
    case 'equals':    actionEquals();        break;
    case 'clear':     actionClear();         break;
    case 'backspace': actionBackspace();     break;
    case 'sign':      actionSign();          break;
    case 'percent':   actionPercent();       break;
  }
}

/* ═══════════════════════════════════════════════════════
   7. EVENT DELEGATION — keypad clicks
   ═══════════════════════════════════════════════════════ */

function handleKeyClick(e) {
  const key = e.target.closest('[data-action]');
  if (!key) return;
  dispatch(key.dataset.action, key.dataset.value);
  flashKey(key);
}

keypad.addEventListener('click', handleKeyClick);
backspaceBtn.addEventListener('click', () => {
  dispatch('backspace');
  flashKey(backspaceBtn);
});

function flashKey(el) {
  el.classList.remove('kbd-flash');
  // Reflow to restart animation
  void el.offsetWidth;
  el.classList.add('kbd-flash');
}

/* ═══════════════════════════════════════════════════════
   8. KEYBOARD SUPPORT
   ═══════════════════════════════════════════════════════ */

const KEY_MAP = {
  '0': ['digit', '0'],  '1': ['digit', '1'],  '2': ['digit', '2'],
  '3': ['digit', '3'],  '4': ['digit', '4'],  '5': ['digit', '5'],
  '6': ['digit', '6'],  '7': ['digit', '7'],  '8': ['digit', '8'],
  '9': ['digit', '9'],
  '.': ['decimal', ''],   ',': ['decimal', ''],
  '+': ['operator', '+'], '-': ['operator', '−'],
  '*': ['operator', '×'], '/': ['operator', '÷'],
  'Enter': ['equals', ''],   '=': ['equals', ''],
  'Escape': ['clear', ''],
  'Backspace': ['backspace', ''],
  'Delete':    ['clear', ''],
  '%': ['percent', ''],
};

document.addEventListener('keydown', e => {
  // Don't steal from buttons / inputs
  if (e.target.closest('.icon-btn, .text-btn')) return;

  const mapped = KEY_MAP[e.key];
  if (!mapped) return;

  // Special shortcut: H = toggle history, T = toggle theme
  if (e.key === 'h' || e.key === 'H') { toggleHistory(); return; }
  if (e.key === 't' || e.key === 'T') { toggleTheme();   return; }

  e.preventDefault();
  dispatch(mapped[0], mapped[1]);

  // Flash the corresponding button
  const selector = mapped[0] === 'digit'
    ? `[data-action="digit"][data-value="${mapped[1]}"]`
    : mapped[0] === 'operator'
    ? `[data-action="operator"][data-value="${mapped[1]}"]`
    : `[data-action="${mapped[0]}"]`;
  const btn = document.querySelector(selector);
  if (btn) flashKey(btn);
});

/* ═══════════════════════════════════════════════════════
   9. COPY RESULT
   ═══════════════════════════════════════════════════════ */

btnCopy.addEventListener('click', async () => {
  if (state.current === '0' || state.hasError) return;
  try {
    await navigator.clipboard.writeText(state.current);
    showToast();
  } catch {
    // Fallback: select text approach
    const ta = document.createElement('textarea');
    ta.value = state.current;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast();
  }
});

let toastTimer = null;
function showToast() {
  copyToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => copyToast.classList.remove('show'), 1600);
}

/* ═══════════════════════════════════════════════════════
   10. HISTORY PANEL
   ═══════════════════════════════════════════════════════ */

let historyOpen = false;

function addHistory(expr, result) {
  history.unshift({ expr, result });
  if (history.length > 50) history.pop(); // cap at 50 entries
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyEmpty.hidden = false;
    historyList.querySelectorAll('.history-item').forEach(el => el.remove());
    return;
  }
  historyEmpty.hidden = true;

  // Remove old items (keep empty msg node)
  historyList.querySelectorAll('.history-item').forEach(el => el.remove());

  history.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.tabIndex  = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${entry.expr} equals ${entry.result}. Click to recall.`);
    li.innerHTML = `
      <div class="history-expr">${entry.expr}</div>
      <div class="history-result">${entry.result}</div>
    `;
    // Click to recall result
    li.addEventListener('click', () => recallHistory(entry));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); recallHistory(entry); }
    });
    historyList.appendChild(li);
  });
}

function recallHistory(entry) {
  state.current      = entry.result;
  state.expression   = entry.expr;
  state.operator     = null;
  state.operand1     = null;
  state.waitingForOp2 = false;
  state.justComputed  = true;
  state.hasError      = false;
  render();
}

function toggleHistory() {
  historyOpen = !historyOpen;
  historyPanel.classList.toggle('open', historyOpen);
  historyPanel.setAttribute('aria-hidden', (!historyOpen).toString());
  btnHistory.setAttribute('aria-expanded', historyOpen.toString());
}

btnHistory.addEventListener('click', toggleHistory);

btnClearHist.addEventListener('click', () => {
  history.length = 0;
  renderHistory();
});

/* ═══════════════════════════════════════════════════════
   11. THEME TOGGLE
   ═══════════════════════════════════════════════════════ */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('calculus-theme', theme);
  btnTheme.setAttribute('aria-label',
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  );
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

btnTheme.addEventListener('click', toggleTheme);

/* Restore saved or system preference */
const savedTheme = localStorage.getItem('calculus-theme')
  || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
applyTheme(savedTheme);

/* ═══════════════════════════════════════════════════════
   12. INIT
   ═══════════════════════════════════════════════════════ */

function init() {
  render();
  renderHistory();
}

init();
