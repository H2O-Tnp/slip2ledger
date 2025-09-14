// ===== Backend config =====
const BACKEND_URL = location.origin.replace(/\/+$/,''); // same origin

// ===== State =====
const state = { items: [], type: 'expense', file: null, previewUrl: '' };

// ===== Elements =====
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

// defaults
datetimeEl.value = new Date().toISOString().slice(0,16);
refreshTypeButtons();
listEntries();

// ===== Events =====
fileEl.onchange = (e)=>setFile(e.target.files?.[0] || null);
['dragenter','dragover','dragleave','drop'].forEach(evt=>{
  dropEl.addEventListener(evt,(e)=>{e.preventDefault();e.stopPropagation();});
});
dropEl.addEventListener('drop',(e)=>{const f=e.dataTransfer.files?.[0]; if(f) setFile(f);});
typeIncomeBtn.onclick = ()=>{ state.type='income'; refreshTypeButtons(); };
typeExpenseBtn.onclick = ()=>{ state.type='expense'; refreshTypeButtons(); };
clearBtn.onclick = ()=>{ setFile(null); fileEl.value=''; };
resetBtn.onclick = ()=>{ amountEl.value=''; categoryEl.value=''; noteEl.value=''; datetimeEl.value=new Date().toISOString().slice(0,16); state.type='expense'; refreshTypeButtons(); };

extractBtn.onclick = async ()=>{
  errorEl.textContent='';
  if(!state.file){ errorEl.textContent='Please choose an image of a slip first.'; return; }
  extractBtn.disabled=true; extractBtn.textContent='Extracting…';
  try{
    const base64 = await toBase64(state.file);
    const resp = await fetch(`${BACKEND_URL}/ai/extract`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mime: state.file.type || 'image/jpeg', dataBase64: base64 })
    });
    if(!resp.ok) throw new Error('AI error '+resp.status+' '+await resp.text());
    const parsed = await resp.json(); // {type,amount,category,note}
    if(parsed.type) state.type = parsed.type.toLowerCase()==='income'?'income':'expense';
    amountEl.value = (parsed.amount ?? '') + '';
    categoryEl.value = parsed.category || '';
    noteEl.value = parsed.note || '';
    refreshTypeButtons();
  }catch(e){ errorEl.textContent = e.message || 'Failed to extract.'; console.error(e); }
  finally{ extractBtn.disabled=false; extractBtn.textContent='Extract with AI'; }
};

saveBtn.onclick = async ()=>{
  errorEl.textContent='';
  const amt = Number(amountEl.value);
  if(!amt || Number.isNaN(amt)){ errorEl.textContent='Please enter a valid amount.'; return; }
  const entry = {
    type: state.type,
    amount: amt,
    category: categoryEl.value || 'Other',
    note: noteEl.value || '',
    datetime: datetimeEl.value,
    image_url: ''
  };
  const r = await fetch(`${BACKEND_URL}/entries`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(entry)
  });
  if(!r.ok){ errorEl.textContent='Save failed.'; return; }
  amountEl.value=''; noteEl.value=''; setFile(null); fileEl.value='';
  await listEntries();
};

// ===== CRUD helpers =====
async function listEntries(){
  const r = await fetch(`${BACKEND_URL}/entries`);
  const items = r.ok ? await r.json() : [];
  state.items = items.sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));
  render();
}

async function deleteEntry(id){
  const r = await fetch(`${BACKEND_URL}/entries/${encodeURIComponent(id)}`,{method:'DELETE'});
  if(r.ok){ await listEntries(); }
}

async function updateEntry(id, patch){
  const r = await fetch(`${BACKEND_URL}/entries/${encodeURIComponent(id)}`,{
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch)
  });
  if(r.ok){ await listEntries(); }
}

// ===== UI helpers =====
function setFile(f){
  state.file=f;
  if(state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if(f){ state.previewUrl=URL.createObjectURL(f); previewEl.src=state.previewUrl; previewEl.style.display=''; }
  else{ state.previewUrl=''; previewEl.src=''; previewEl.style.display='none'; }
}

function refreshTypeButtons(){
  if(state.type==='income'){ typeIncomeBtn.classList.remove('outline'); typeExpenseBtn.classList.add('outline'); }
  else{ typeIncomeBtn.classList.add('outline'); typeExpenseBtn.classList.remove('outline'); }
}

function toBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result.split(',')[1]);
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function currencyTHB(n){
  if(n===''||n==null||Number.isNaN(n)) return '–';
  try{ return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(n)); }catch{ return String(n); }
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function render(){
  const items = state.items;
  emptyEl.style.display = items.length ? 'none' : '';
  tableEl.style.display = items.length ? '' : 'none';
  tbodyEl.innerHTML = '';
  for(const x of items){
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(x.datetime).toLocaleString()}</td>
      <td style="text-transform:capitalize">
        <span class="tag" title="Click to toggle type" data-toggle="${x._id}">${x.type}</span>
      </td>
      <td>
        <input data-edit-cat="${x._id}" type="text" value="${escapeHtml(x.category)}" style="width:12ch"/>
      </td>
      <td>
        <input data-edit-amt="${x._id}" type="number" min="0" step="0.01" value="${x.amount}"/>
      </td>
      <td title="${escapeHtml(x.note)}" style="max-width:26ch; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        <input data-edit-note="${x._id}" type="text" value="${escapeHtml(x.note)}" style="width:24ch"/>
      </td>
      <td style="text-align:right">
        <button class="outline" data-save="${x._id}">Save</button>
        <button class="outline" data-del="${x._id}">Delete</button>
      </td>`;
    tbodyEl.appendChild(tr);
  }

  // actions
  tbodyEl.querySelectorAll('button[data-del]').forEach(b=>b.onclick=()=>deleteEntry(b.getAttribute('data-del')));
  tbodyEl.querySelectorAll('span[data-toggle]').forEach(s=>s.onclick=()=>{
    const id=s.getAttribute('data-toggle');
    const newType = s.textContent.trim()==='income'?'expense':'income';
    updateEntry(id,{type:newType});
  });
  tbodyEl.querySelectorAll('button[data-save]').forEach(b=>b.onclick=()=>{
    const id=b.getAttribute('data-save');
    const amt = Number(tbodyEl.querySelector(`input[data-edit-amt="${id}"]`).value);
    const cat = tbodyEl.querySelector(`input[data-edit-cat="${id}"]`).value || 'Other';
    const note= tbodyEl.querySelector(`input[data-edit-note="${id}"]`).value || '';
    if(!amt || Number.isNaN(amt)) return alert('Amount invalid');
    updateEntry(id,{amount:amt, category:cat, note});
  });

  // sums
  const income = items.filter(x=>x.type==='income').reduce((s,x)=>s+x.amount,0);
  const expense= items.filter(x=>x.type==='expense').reduce((s,x)=>s+x.amount,0);
  const balance= income-expense;
  sumIncome.textContent = currencyTHB(income);
  sumExpense.textContent = currencyTHB(expense);
  sumBalance.textContent = currencyTHB(balance);
  mIncome.textContent = sumIncome.textContent;
  mExpense.textContent = sumExpense.textContent;
  mBalance.textContent = sumBalance.textContent;

  // pie
  const catMap = new Map();
  for(const it of items.filter(x=>x.type==='expense')){
    catMap.set(it.category,(catMap.get(it.category)||0)+it.amount);
  }
  const data = Array.from(catMap.entries()).map(([name,value])=>({name,value}));
  drawPie(pieCanvas,data);
  chartEmpty.style.display = data.length?'none':'';
}

function drawPie(canvas,data){
  const ctx=canvas.getContext('2d');
  const {width,height}=canvas;
  ctx.clearRect(0,0,width,height);
  if(!data.length)return;
  const total=data.reduce((s,d)=>s+d.value,0);
  const cx=width/2, cy=height/2, r=Math.min(width,height)/2-10;
  let start=-Math.PI/2;
  const colors=['#8884d8','#82ca9d','#ffc658','#8dd1e1','#a4de6c','#d0ed57','#ff8042','#00c49f','#ffbb28','#0088FE','#AA66CC'];
  data.forEach((d,i)=>{
    const angle=(d.value/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+angle); ctx.closePath();
    ctx.fillStyle=colors[i%colors.length]; ctx.fill();
    const mid=start+angle/2;
    const lx=cx+Math.cos(mid)*r*0.65, ly=cy+Math.sin(mid)*r*0.65;
    ctx.fillStyle='#111827'; ctx.font='12px system-ui,-apple-system,Segoe UI,Roboto';
    const pct=Math.round((d.value/total)*100);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`${d.name} ${pct}%`,lx,ly);
    start+=angle;
  });
}
