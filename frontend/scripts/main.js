const state = {
  items: [],
  type: "expense",
  file: null,
  previewUrl: "",
  chartData: [],
};

const fileEl = document.getElementById("file");
const previewEl = document.getElementById("preview");
const dropEl = document.getElementById("drop");
const errorEl = document.getElementById("error");
const typeIncomeBtn = document.getElementById("typeIncome");
const typeExpenseBtn = document.getElementById("typeExpense");
const amountEl = document.getElementById("amount");
const categoryEl = document.getElementById("category");
const datetimeEl = document.getElementById("datetime");
const noteEl = document.getElementById("note");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const extractBtn = document.getElementById("extractBtn");
const clearBtn = document.getElementById("clearBtn");
const emptyEl = document.getElementById("empty");
const tableEl = document.getElementById("table");
const tbodyEl = document.getElementById("tbody");
const sumIncome = document.getElementById("sumIncome");
const sumExpense = document.getElementById("sumExpense");
const sumBalance = document.getElementById("sumBalance");
const mIncome = document.getElementById("mIncome");
const mExpense = document.getElementById("mExpense");
const mBalance = document.getElementById("mBalance");
const pieCanvas = document.getElementById("pie");
const chartEmpty = document.getElementById("chartEmpty");

datetimeEl.value = new Date().toISOString().slice(0, 16);
refreshTypeButtons();
refreshEntries();

fileEl.onchange = (e) => setFile(e.target.files?.[0] || null);
["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  dropEl.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});
dropEl.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files?.[0];
  if (f) setFile(f);
});
typeIncomeBtn.onclick = () => {
  state.type = "income";
  refreshTypeButtons();
};
typeExpenseBtn.onclick = () => {
  state.type = "expense";
  refreshTypeButtons();
};
clearBtn.onclick = () => {
  setFile(null);
  fileEl.value = "";
};
resetBtn.onclick = () => {
  amountEl.value = "";
  categoryEl.value = "";
  noteEl.value = "";
  datetimeEl.value = new Date().toISOString().slice(0, 16);
  state.type = "expense";
  refreshTypeButtons();
  window.uiHelpers?.showToast?.("Form reset", "info");
};

extractBtn.onclick = async () => {
  errorEl.textContent = "";
  if (!state.file) {
    errorEl.textContent = "Please choose an image.";
    window.uiHelpers?.showToast?.("Please choose an image first", "warn");
    return;
  }
  window.uiHelpers?.setButtonLoading?.(extractBtn, true, "Extracting…");
  try {
    const parsed = await extractSlipAPI(state.file);
    if (parsed.type)
      state.type =
        parsed.type.toLowerCase() === "income" ? "income" : "expense";
    amountEl.value = parsed.amount ?? "";
    categoryEl.value = parsed.category || "";
    noteEl.value = parsed.note || "";
    const dt = parsed.datetime_local || parsed.datetime || parsed.datetime_utc;
    if (dt) window.uiHelpers?.setDatetimeInputFromISO?.(datetimeEl, dt);
    refreshTypeButtons();
    window.uiHelpers?.showToast?.("Extracted fields from slip", "ok");
  } catch (e) {
    errorEl.textContent = e.message || "Failed to extract.";
    window.uiHelpers?.showToast?.("Extraction failed", "error");
    console.error(e);
  } finally {
    window.uiHelpers?.setButtonLoading?.(extractBtn, false);
  }
};

saveBtn.onclick = async () => {
  errorEl.textContent = "";
  const amt = Number(amountEl.value);
  if (!amt) {
    errorEl.textContent = "Invalid amount";
    window.uiHelpers?.showToast?.("Invalid amount", "warn");
    return;
  }
  const entry = {
    type: state.type,
    amount: amt,
    category: categoryEl.value || "Other",
    note: noteEl.value || "",
    datetime: datetimeEl.value,
    image_url: "",
  };
  window.uiHelpers?.setButtonLoading?.(saveBtn, true, "Saving…");
  try {
    await createEntryAPI(entry);
    amountEl.value = "";
    noteEl.value = "";
    setFile(null);
    fileEl.value = "";
    await refreshEntries();
    window.uiHelpers?.showToast?.("Saved entry", "ok");
  } catch (e) {
    errorEl.textContent = "Save failed";
    window.uiHelpers?.showToast?.("Save failed", "error");
    console.error(e);
  } finally {
    window.uiHelpers?.setButtonLoading?.(saveBtn, false);
  }
};

async function refreshEntries() {
  try {
    state.items = await listEntriesAPI();
  } catch {
    state.items = [];
  }
  state.items.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  render();
}

function setFile(f) {
  state.file = f;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if (f) {
    state.previewUrl = URL.createObjectURL(f);
    previewEl.src = state.previewUrl;
    previewEl.style.display = "";
    window.uiHelpers?.showToast?.("Image loaded", "info", 1400);
  } else {
    state.previewUrl = "";
    previewEl.style.display = "none";
  }
}
function refreshTypeButtons() {
  if (state.type === "income") {
    typeIncomeBtn.classList.remove("outline");
    typeExpenseBtn.classList.add("outline");
  } else {
    typeIncomeBtn.classList.add("outline");
    typeExpenseBtn.classList.remove("outline");
  }
}

function render() {
  const items = state.items;
  emptyEl.style.display = items.length ? "none" : "";
  tableEl.style.display = items.length ? "" : "none";
  tbodyEl.innerHTML = "";
  for (const x of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(x.datetime).toLocaleString()}</td>
      <td><span class="tag" data-toggle="${x._id}">${x.type}</span></td>
      <td><input class="table-input" data-edit-cat="${
        x._id
      }" value="${escapeHtml(x.category)}" style="width:12ch"/></td>
      <td><input class="table-input" data-edit-amt="${
        x._id
      }" type="number" min="0" step="0.01" value="${x.amount}"/></td>
      <td><input class="table-input" data-edit-note="${
        x._id
      }" value="${escapeHtml(x.note)}" style="width:24ch"/></td>
      <td style="text-align:right">
        <button class="outline" data-save="${x._id}">Save</button>
        <button class="outline" data-del="${x._id}">Delete</button>
      </td>`;
    tbodyEl.appendChild(tr);
  }
  tbodyEl.querySelectorAll("button[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await deleteEntryAPI(b.dataset.del);
          await refreshEntries();
          window.uiHelpers?.showToast?.("Deleted entry", "ok");
        } catch (e) {
          window.uiHelpers?.showToast?.("Delete failed", "error");
          console.error(e);
        }
      })
  );
  tbodyEl.querySelectorAll("span[data-toggle]").forEach(
    (s) =>
      (s.onclick = () => {
        const id = s.dataset.toggle;
        const newType =
          s.textContent.trim() === "income" ? "expense" : "income";
        updateEntryAPI(id, { type: newType })
          .then(() => {
            refreshEntries();
            window.uiHelpers?.showToast?.(`Type → ${newType}`, "info");
          })
          .catch((e) => {
            window.uiHelpers?.showToast?.("Update failed", "error");
            console.error(e);
          });
      })
  );
  tbodyEl.querySelectorAll("button[data-save]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.save;
        const amt = Number(
          tbodyEl.querySelector(`input[data-edit-amt="${id}"]`).value
        );
        const cat =
          tbodyEl.querySelector(`input[data-edit-cat="${id}"]`).value ||
          "Other";
        const note =
          tbodyEl.querySelector(`input[data-edit-note="${id}"]`).value || "";
        if (!amt) {
          window.uiHelpers?.showToast?.("Amount invalid", "warn");
          return;
        }
        updateEntryAPI(id, { amount: amt, category: cat, note })
          .then(() => {
            refreshEntries();
            window.uiHelpers?.showToast?.("Updated", "ok");
          })
          .catch((e) => {
            window.uiHelpers?.showToast?.("Update failed", "error");
            console.error(e);
          });
      })
  );
  const income = items
    .filter((x) => x.type === "income")
    .reduce((s, x) => s + x.amount, 0);
  const expense = items
    .filter((x) => x.type === "expense")
    .reduce((s, x) => s + x.amount, 0);
  const balance = income - expense;
  sumIncome.textContent = currencyTHB(income);
  sumExpense.textContent = currencyTHB(expense);
  sumBalance.textContent = currencyTHB(balance);
  mIncome.textContent = sumIncome.textContent;
  mExpense.textContent = sumExpense.textContent;
  mBalance.textContent = sumBalance.textContent;
  // Pie data
  const catMap = new Map();
  for (const it of items.filter((x) => x.type === "expense")) {
    catMap.set(it.category, (catMap.get(it.category) || 0) + it.amount);
  }
  const data = Array.from(catMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));
  state.chartData = data; // <— keep last data for resize redraw
  drawPie(pieCanvas, data);
  chartEmpty.style.display = data.length ? "none" : "";
}

window.addEventListener('resize', ()=>{
  if (state.chartData) drawPie(pieCanvas, state.chartData);
});