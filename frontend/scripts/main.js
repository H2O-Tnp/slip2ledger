// ===== State =====
const state = { items: [], type: 'expense', file: null, previewUrl: '' };

// ===== DOM Elements =====
const fileEl = document.getElementById('file');
const previewEl = document.getElementById('preview');
const dropEl = document.getElementById('drop');
const errorEl = document.getElementById('error');

const typeIncomeBtn = document.getElementById('typeIncome');
const typeExpenseBtn = document.getElementById('typeExpense');
const amountEl = document.getElementById('amount');
const categoryEl = document.getElementById('category');
const datetimeEl = document.getElementById('datetime');
const noteEl = document.getElementById('note');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const extractBtn = document.getElementById('extractBtn');
const clearBtn = document.getElementById('clearBtn');

const emptyEl = document.getElementById('empty');
const tableEl = document.getElementById('table');
const tbodyEl = document.getElementById('tbody');

const sumIncome = document.getElementById('sumIncome');
const sumExpense = document.getElementById('sumExpense');
const sumBalance = document.getElementById('sumBalance');
const mIncome = document.getElementById('mIncome');
const mExpense = document.getElementById('mExpense');
const mBalance = document.getElementById('mBalance');

const pieCanvas = document.getElementById('pie');
const chartEmpty = document.getElementById('chartEmpty');

// ===== Init =====
datetimeEl.value = new Date().toISOString().slice(0, 16);
refreshTypeButtons();
refreshEntries();

// ===== Events =====
fileEl.onchange = e => setFile(e.target.files?.[0] || null);
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  dropEl.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
});
dropEl.addEventListener('drop', (e) => { const f = e.dataTransfer.files?.[0]; if (f) setFile(f); });
typeIncomeBtn.onclick = () => { state.type = 'income'; refreshTypeButtons(); };
typeExpenseBtn.onclick = () => { state.type = 'expense'; refreshTypeButtons(); };
clearBtn.onclick = () => { setFile(null); fileEl.value = ''; };
resetBtn.onclick = () => { amountEl.value = ''; categoryEl.value = ''; noteEl.value = ''; datetimeEl.value = new Date().toISOString().slice(0, 16); state.type = 'expense'; refreshTypeButtons(); };

extractBtn.onclick = async () => {
  errorEl.textContent = '';
  if (!state.file) { errorEl.textContent = 'Please choose an image.'; return; }
  extractBtn.disabled = true; extractBtn.textContent = 'Extracting…';
  try {
    const parsed = await extractSlipAPI(state.file);
    if (parsed.type) state.type = parsed.type;
    amountEl.value = parsed.amount ?? '';
    categoryEl.value = parsed.category || '';
    noteEl.value = parsed.note || '';
    refreshTypeButtons();
  } catch (e) { errorEl.textContent = e.message; }
  finally { extractBtn.disabled = false; extractBtn.textContent = 'Extract with AI'; }
};

saveBtn.onclick = async () => {
  errorEl.textContent = '';
  const amt = Number(amountEl.value);
  if (!amt) { errorEl.textContent = 'Invalid amount'; return; }
  const entry = {
    type: state.type,
    amount: amt,
    category: categoryEl.value || 'Other',
    note: noteEl.value || '',
    datetime: datetimeEl.value,
    image_url: ''
  };
  try {
    await createEntryAPI(entry);
    amountEl.value = ''; noteEl.value = ''; setFile(null); fileEl.value = '';
    await refreshEntries();
  } catch { errorEl.textContent = 'Save failed'; }
};

// ===== Helpers =====
async function refreshEntries() {
  state.items = await listEntriesAPI();
  state.items.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  render();
}

function setFile(f) {
  state.file = f;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if (f) { state.previewUrl = URL.createObjectURL(f); previewEl.src = state.previewUrl; previewEl.style.display = ''; }
  else { state.previewUrl = ''; previewEl.style.display = 'none'; }
}

function refreshTypeButtons() {
  if (state.type === 'income') { typeIncomeBtn.classList.remove('outline'); typeExpenseBtn.classList.add('outline'); }
  else { typeIncomeBtn.classList.add('outline'); typeExpenseBtn.classList.remove('outline'); }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function render() {
  const items = state.items;
  emptyEl.style.display = items.length ? 'none' : '';
  tableEl.style.display = items.length ? '' : 'none';
  tbodyEl.innerHTML = '';
  for (const x of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(x.datetime).toLocaleString()}</td>
      <td><span class="tag" data-toggle="${x._id}">${x.type}</span></td>
      <td><input data-edit-cat="${x._id}" value="${escapeHtml(x.category)}" style="width:12ch"/></td>
      <td><input data-edit-amt="${x._id}" type="number" value="${x.amount}"/></td>
      <td><input data-edit-note="${x._id}" value="${escapeHtml(x.note)}" style="width:24ch"/></td>
      <td style="text-align:right">
        <button class="outline" data-save="${x._id}">Save</button>
        <button class="outline" data-del="${x._id}">Delete</button>
      </td>`;
    tbodyEl.appendChild(tr);
  }

  tbodyEl.querySelectorAll('button[data-del]').forEach(b => b.onclick = () => deleteEntryAPI(b.dataset.del).then(refreshEntries));
  tbodyEl.querySelectorAll('span[data-toggle]').forEach(s => s.onclick = () => {
    const id = s.dataset.toggle; const newType = s.textContent === 'income' ? 'expense' : 'income';
    updateEntryAPI(id, { type: newType }).then(refreshEntries);
  });
  tbodyEl.querySelectorAll('button[data-save]').forEach(b => b.onclick = () => {
    const id = b.dataset.save;
    const amt = Number(tbodyEl.querySelector(`input[data-edit-amt="${id}"]`).value);
    const cat = tbodyEl.querySelector(`input[data-edit-cat="${id}"]`).value;
    const note = tbodyEl.querySelector(`input[data-edit-note="${id}"]`).value;
    updateEntryAPI(id, { amount: amt, category: cat, note }).then(refreshEntries);
  });

  const income = items.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0);
  const expense = items.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
  const balance = income - expense;
  sumIncome.textContent = currencyTHB(income);
  sumExpense.textContent = currencyTHB(expense);
  sumBalance.textContent = currencyTHB(balance);
  mIncome.textContent = sumIncome.textContent;
  mExpense.textContent = sumExpense.textContent;
  mBalance.textContent = sumBalance.textContent;

  const catMap = new Map();
  for (const it of items.filter(x => x.type === 'expense')) catMap.set(it.category, (catMap.get(it.category) || 0) + it.amount);
  const data = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));
  drawPie(pieCanvas, data);
  chartEmpty.style.display = data.length ? 'none' : '';
}
