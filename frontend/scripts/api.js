async function listEntriesAPI() {
  const r = await fetch(`${BACKEND_URL}/entries`);
  return r.ok ? await r.json() : [];
}
async function createEntryAPI(entry) {
  const r = await fetch(`${BACKEND_URL}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error("Create failed");
  return await r.json();
}
async function updateEntryAPI(id, patch) {
  const r = await fetch(`${BACKEND_URL}/entries/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Update failed");
  return await r.json();
}
async function deleteEntryAPI(id) {
  const r = await fetch(`${BACKEND_URL}/entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error("Delete failed");
  return true;
}
async function extractSlipAPI(file) {
  const base64 = await new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => res(rd.result.split(",")[1]);
    rd.onerror = rej;
    rd.readAsDataURL(file);
  });
  const resp = await fetch(`${BACKEND_URL}/ai?debug=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mime: file.type || "image/jpeg",
      dataBase64: base64,
    }),
  });
  const text = await resp.text(); // always read response
  if (!resp.ok) {
    let err;
    try {
      err = JSON.parse(text);
    } catch {
      err = { error: text };
    }
    const msg = err.detail || err.error || "AI error";
    throw new Error(msg);
  }
  return JSON.parse(text);
}
