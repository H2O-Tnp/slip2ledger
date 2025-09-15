import express from "express";
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { mime, dataBase64 } = req.body || {};
    const debug = String(req.query.debug || "0") === "1";
    if (!mime || !dataBase64)
      return res.status(400).json({ error: "Missing image" });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "Server missing GOOGLE_API_KEY" });

    const MODEL = "gemini-2.0-flash";
    const prompt = [
      "You are a receipt/slip parser for Thai/English payment slips.",
      "Return STRICT JSON ONLY with keys:",
      '{ "type":"income|expense", "amount": number, "category": string, "note": string, "datetime": string }',
      "Rules:",
      "- 'type' must be either 'income' or 'expense'.",
      "- 'amount' is a number (THB).",
      "- 'category' from {Shopping, Pay Bill, Food, Transport, Groceries, Health, Entertainment, Education, Salary, Transfer, Other}.",
      "- 'note' is short free text (merchant or ref).",
      "- 'datetime' MUST be ISO 8601 local time without timezone offset (e.g., 2025-09-14T13:45:00). If multiple dates appear, pick the payment date. If unsure, leave empty.",
      "Examples: 14/09/2025 13:45, 14-09-2025 13:45:21, 2025-09-14 13:45, 14 Sep 2025 1:45 PM, 14 ก.ย. 2568 13:45, เวลา 13:45 น. วันที่ 14/09/2568",
      "Output JSON only.",
    ].join("\n");

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: dataBase64 } },
          ],
        },
      ],
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!resp.ok) {
      const t = await resp.text();
      let payload = t;
      try { payload = JSON.parse(t); } catch {}
      // common cases to help you debug quickly
      const code = payload?.error?.code;
      const message = payload?.error?.message || payload?.message || String(t).slice(0, 800);
      return res.status(502).json({
        error: "Gemini error",
        code,
        detail: message
      });
    }

    const data = await resp.json();
    const rawText =
      (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text)
        .join("\n") || "";
    const modelParsed = parseAIJSON(rawText);

    const dateInfo = extractDateTimeFromText(rawText);
    const picked = pickBestDateTime({
      modelIso: normalizeToISO(modelParsed.datetime),
      regexLocal: dateInfo.datetimeLocal,
      regexUtc: dateInfo.datetimeUTC,
    });

    const result = {
      type: normalizeType(modelParsed.type),
      amount: normalizeAmount(modelParsed.amount),
      category: modelParsed.category || "Other",
      note: modelParsed.note || "",
      datetime: picked.local,
      datetime_local: picked.local,
      datetime_utc: picked.utc,
    };
    if (debug) {
      result.raw_model_text = rawText;
      result.model_raw_datetime = modelParsed.datetime || "";
      result.date_debug = dateInfo;
    }
    return res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI extract failed" });
  }
});

function parseAIJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      return {
        type: obj.type || obj.transaction_type || obj.income_expense || "",
        amount: obj.amount ?? obj.total ?? obj.value ?? 0,
        category: obj.category || obj.tag || "",
        note: obj.note || obj.description || "",
        datetime: obj.datetime || obj.date || "",
      };
    } catch {}
  }
  const lower = text.toLowerCase();
  const type = /(income|received|deposit|top[- ]?up|เงินเข้า|รับเงิน)/.test(
    lower
  )
    ? "income"
    : /(expense|paid|pay|withdraw|โอนออก|ชำระ|ตัดบัตร|หักบัญชี)/.test(lower)
    ? "expense"
    : "expense";
  const amtMatch =
    text
      .replace(/,/g, "")
      .match(/(total|amount|ยอด|จำนวน|paid|sum)\s*[:=]?\s*([\d.]+)/i) ||
    text
      .replace(/,/g, "")
      .match(/\b([\d]+(?:\.[\d]{1,2})?)\b\s*(thb|baht|฿)?/i);
  const amount = amtMatch ? Number(amtMatch[2] || amtMatch[1]) : 0;
  const catMap = {
    bill: "Pay Bill",
    electricity: "Pay Bill",
    water: "Pay Bill",
    internet: "Pay Bill",
    food: "Food",
    groceries: "Groceries",
    taxi: "Transport",
    grab: "Transport",
    transport: "Transport",
    education: "Education",
    tuition: "Education",
    health: "Health",
    hospital: "Health",
    salary: "Salary",
    transfer: "Transfer",
    shopping: "Shopping",
  };
  const catMatch = lower.match(
    /(shopping|bill|pay bill|electricity|water|internet|food|groceries|transport|taxi|grab|education|tuition|health|hospital|salary|transfer)/
  );
  const category = catMatch
    ? catMap[catMatch[1]] || firstUpper(catMatch[1])
    : "Other";
  return { type, amount, category, note: "", datetime: "" };
}
function normalizeType(t) {
  return String(t || "")
    .toLowerCase()
    .includes("income")
    ? "income"
    : "expense";
}
function normalizeAmount(a) {
  const n = Number(a);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function firstUpper(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function normalizeToISO(s) {
  if (!s || typeof s !== "string") return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}
function pickBestDateTime({ modelIso, regexLocal, regexUtc }) {
  const now = Date.now();
  const within = (iso) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    const days = Math.abs(t - now) / 86400000;
    return days <= 365 * 3;
  };
  if (within(modelIso)) {
    const local = isoToLocalNoTZ(modelIso);
    return { local, utc: new Date(modelIso).toISOString() };
  }
  if (regexLocal && regexUtc) return { local: regexLocal, utc: regexUtc };
  const nowLocal = isoToLocalNoTZ(new Date().toISOString());
  return { local: nowLocal, utc: new Date().toISOString() };
}
function isoToLocalNoTZ(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// --- replace the whole function in backend/routes/ai.js ---
function extractDateTimeFromText(text){
  const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const blob = lines.join(" ␤ ");

  const thMonths = {
    "ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12,
    "มกราคม":1,"กุมภาพันธ์":2,"มีนาคม":3,"เมษายน":4,"พฤษภาคม":5,"มิถุนายน":6,"กรกฎาคม":7,"สิงหาคม":8,"กันยายน":9,"ตุลาคม":10,"พ नवंबर":11,"ธันวาคม":12
  };
  const enMonths = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12 };

  // Ensure /g flag helper
  const withG = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');

  const timePatterns = [
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(am|pm)?\b/i,
    /\b([01]?\d|2[0-3])[.:]([0-5]\d)(?:[:.]([0-5]\d))?\s*(น\.|นาฬิกา)?\b/
  ];
  const datePatterns = [
    /\b(20\d{2}|19\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/,                                   // YYYY-MM-DD
    /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{2,4})\b/,                                           // DD-MM-YY/YY
    /\b(0?[1-9]|[12]\d|3[01])\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2}|19\d{2})\b/i, // 13 Sep 2025
    /\b(0?[1-9]|[12]\d|3[01])\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(25\d{2}|20\d{2}|19\d{2})\b/
  ];

  // ---- time parsing ----
  const timeHits = [];
  for (const re of timePatterns) {
    const g = withG(re);
    let m;
    while ((m = g.exec(blob))) timeHits.push(m);
  }
  const time = timeHits[0];
  const t = {
    raw: time?.[0] || "",
    h: parseInt(time?.[1] || "12", 10) || 12,
    mi: parseInt(time?.[2] || "0", 10) || 0,
    s: parseInt(time?.[3] || "0", 10) || 0,
    ampm: (time?.[4] || "").toLowerCase()
  };
  if (t.ampm === "pm" && t.h < 12) t.h += 12;
  if (t.ampm === "am" && t.h === 12) t.h = 0;

  // ---- date parsing ----
  const rawDates = [];
  for (const re of datePatterns) {
    const g = withG(re);
    let m;
    while ((m = g.exec(blob))) rawDates.push({ re, m, raw: m[0] });
  }

  const now = Date.now();
  const candidates = [];
  for (const { re, m, raw } of rawDates) {
    let y, mo, d, beAdjusted = false;
    if (re === datePatterns[0]) { // YYYY-MM-DD
      y = +m[1]; mo = +m[2]; d = +m[3];
    } else if (re === datePatterns[1]) { // DD-MM-YY/YY(YY)
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      if (y >= 2500) { y -= 543; beAdjusted = true; } // Buddhist year
    } else if (re === datePatterns[2]) { // 13 Sep 2025
      d = +m[1]; mo = enMonths[m[2].toLowerCase()] || 0; y = +m[3];
    } else { // Thai month words
      d = +m[1]; const monWord = m[2]; mo = thMonths[monWord] || 0; y = +m[3];
      if (y >= 2500) { y -= 543; beAdjusted = true; }
    }
    if (!(y>=1900 && y<=2100) || !(mo>=1 && mo<=12) || !(d>=1 && d<=31)) continue;

    const dtLocal = new Date(y, mo - 1, d, t.h, t.mi, t.s);
    const scoreDays = Math.abs(dtLocal.getTime() - now) / 86400000;
    // Assume Bangkok (UTC+7) for UTC representation
    const dtUtc = new Date(Date.UTC(y, mo - 1, d, t.h - 7, t.mi, t.s));
    candidates.push({ y, mo, d, h: t.h, mi: t.mi, s: t.s, rawDate: raw, rawTime: t.raw, beAdjusted, dtLocal, dtUtc, scoreDays });
  }

  candidates.sort((a,b) => (a.scoreDays - b.scoreDays) || (b.y - a.y));
  const chosen = candidates[0];

  if (!chosen) {
    const nowD = new Date();
    return {
      datetimeLocal: toLocalNoTZ(nowD),
      datetimeUTC: nowD.toISOString(),
      foundDateText: "", foundTimeText: "",
      beYearAdjusted: false, pickedStrategy: "fallback(now)", candidates: []
    };
  }

  return {
    datetimeLocal: toLocalNoTZ(chosen.dtLocal),
    datetimeUTC: chosen.dtUtc.toISOString(),
    foundDateText: chosen.rawDate,
    foundTimeText: chosen.rawTime,
    beYearAdjusted: chosen.beAdjusted,
    pickedStrategy: "closest-to-today",
    candidates: candidates.slice(0,5).map(c => ({ date: toLocalNoTZ(c.dtLocal), scoreDays: c.scoreDays, beAdjusted: c.beAdjusted, rawDate: c.rawDate }))
  };
}

function toLocalNoTZ(d){
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// function toLocalNoTZ(d) {
//   const pad = (n) => String(n).padStart(2, "0");
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
//     d.getHours()
//   )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
// }

export default router;
