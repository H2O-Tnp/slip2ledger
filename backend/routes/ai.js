import express from "express";

const router = express.Router();

/**
 * POST /ai/extract[?debug=1]
 * body: { mime: string, dataBase64: string }
 * returns: { type, amount, category, note, datetime } (+ debug fields if ?debug=1)
 */
router.post("/extract", async (req, res) => {
  try {
    const { mime, dataBase64 } = req.body || {};
    const debug = String(req.query.debug || "0") === "1";

    if (!mime || !dataBase64) return res.status(400).json({ error: "Missing image" });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server missing GOOGLE_API_KEY" });

    const MODEL = "gemini-1.5-flash";

    // --- Prompt: make Gemini output strict JSON and include datetime in ISO 8601 ---
    const prompt = [
      "You are a receipt/slip parser for Thai/English payment slips.",
      "Return STRICT JSON ONLY with keys:",
      '{ "type":"income|expense", "amount": number, "category": string, "note": string, "datetime": string }',
      "Rules:",
      "- 'type' must be either 'income' or 'expense' (infer from context like 'paid', 'top up', 'received', 'transfer in/out').",
      "- 'amount' is a number (THB).",
      "- 'category' from {Shopping, Pay Bill, Food, Transport, Groceries, Health, Entertainment, Education, Salary, Transfer, Other}.",
      "- 'note' is short free text (e.g., merchant, method, ref).",
      "- 'datetime' MUST be ISO 8601 local time without timezone offset (e.g., 2025-09-14T13:45:00). If the slip shows date/time, use it. If multiple dates appear, pick the PAYMENT date.",
      "- If you cannot find a clear date/time, leave 'datetime' empty (do NOT invent).",
      "",
      "Examples of valid date/time on Thai slips (to recognize):",
      "- 14/09/2025 13:45",
      "- 14-09-2025 13:45:21",
      "- 14.09.2025 13:45",
      "- 2025-09-14 13:45",
      "- 14 Sep 2025 1:45 PM",
      "- 14 ก.ย. 2568 13:45",
      "- 14 กันยายน 2568 13:45 น.",
      "- เวลา 13:45 น. วันที่ 14/09/2568",
      "",
      "Output JSON only. No markdown, no extra commentary."
    ].join("\n");

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: dataBase64 } }
          ]
        }
      ]
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: "Gemini error", detail: t });
    }

    const data = await resp.json();
    const rawText = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text)
      .join("\n") || "";

    // Parse model JSON (best-effort)
    const modelParsed = parseAIJSON(rawText);

    // If datetime missing/empty or suspicious, run our robust date extractor on the raw text lines
    const dateInfo = extractDateTimeFromText(rawText);
    const finalDatetimeISO =
      normalizeToISO(modelParsed.datetime) ||
      dateInfo.datetimeISO ||
      new Date().toISOString();

    const result = {
      type: normalizeType(modelParsed.type),
      amount: normalizeAmount(modelParsed.amount),
      category: modelParsed.category || "Other",
      note: modelParsed.note || "",
      datetime: finalDatetimeISO
    };

    if (debug) {
      result.raw_model_text = rawText;
      result.date_debug = dateInfo;
      result.model_raw_datetime = modelParsed.datetime || "";
    }

    return res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI extract failed" });
  }
});

/** ---------- Helpers ---------- **/

function parseAIJSON(text) {
  // Try to locate a JSON block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      return {
        type: obj.type || obj.transaction_type || obj.income_expense || "",
        amount: obj.amount ?? obj.total ?? obj.value ?? 0,
        category: obj.category || obj.tag || "",
        note: obj.note || obj.description || "",
        datetime: obj.datetime || obj.date || ""
      };
    } catch {
      // fallthrough
    }
  }
  // Minimal fallback from text
  const lower = text.toLowerCase();
  const type =
    /(income|received|deposit|top[- ]?up|เงินเข้า|รับเงิน)/.test(lower) ? "income" :
    /(expense|paid|pay|withdraw|โอนออก|ชำระ|ตัดบัตร|หักบัญชี)/.test(lower) ? "expense" : "expense";

  // amount heuristics
  const amtMatch =
    text.replace(/,/g, "").match(/(total|amount|ยอด|จำนวน|paid|sum)\s*[:=]?\s*([\d.]+)/i) ||
    text.replace(/,/g, "").match(/\b([\d]+(?:\.[\d]{1,2})?)\b\s*(thb|baht|฿)?/i);
  const amount = amtMatch ? Number(amtMatch[2] || amtMatch[1]) : 0;

  // category heuristic
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
    shopping: "Shopping"
  };
  const catMatch = lower.match(
    /(shopping|bill|pay bill|electricity|water|internet|food|groceries|transport|taxi|grab|education|tuition|health|hospital|salary|transfer)/
  );
  const category = catMatch ? catMap[catMatch[1]] || firstUpper(catMatch[1]) : "Other";

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
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

/**
 * Extract date & time robustly from mixed Thai/English text.
 * Returns { datetimeISO, foundDateText, foundTimeText, beYearAdjusted, pickedStrategy, candidates }
 */
function extractDateTimeFromText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blob = lines.join(" ␤ ");

  const candidates = [];

  // --- Month maps (Thai & English) ---
  const thMonths = {
    "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
    "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
    "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4, "พฤษภาคม": 5, "มิถุนายน": 6,
    "กรกฎาคม": 7, "สิงหาคม": 8, "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12
  };
  const enMonths = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  };

  // --- Time patterns ---
  const timePatterns = [
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(am|pm)?\b/i,  // 13:45[:21] [AM/PM]
    /\b([01]?\d|2[0-3])[.:]([0-5]\d)(?:[:.]([0-5]\d))?\s*(น\.|นาฬิกา)?\b/ // 13.45 น.
  ];

  // --- Date patterns ---
  const datePatterns = [
    // 2025-09-14 or 2025/09/14 or 2025.09.14
    /\b(20\d{2}|19\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/,
    // 14/09/2025 or 14-09-2025 or 14.09.2025
    /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{2,4})\b/,
    // 14 Sep 2025  / 14 Sept 2025
    /\b(0?[1-9]|[12]\d|3[01])\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2}|19\d{2})\b/i,
    // 14 ก.ย. 2568   /   14 กันยายน 2568
    /\b(0?[1-9]|[12]\d|3[01])\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(25\d{2}|20\d{2}|19\d{2})\b/
  ];

  // Find all time tokens
  const timeHits = matchAll(blob, timePatterns).map((m) => ({
    raw: m[0],
    h: toInt(m[1]),
    mi: toInt(m[2]),
    s: toInt(m[3] || "0"),
    ampm: (m[4] || "").toLowerCase()
  }));

  // Find all date tokens (multiple formats)
  const dateHits = [];
  for (const re of datePatterns) {
    for (const m of blob.matchAll(re)) {
      dateHits.push({ re, m, raw: m[0] });
    }
  }

  // Convert dateHits into normalized y/m/d candidates
  for (const { re, m, raw } of dateHits) {
    let y, mo, d, beAdjusted = false;

    if (re === datePatterns[0]) {
      // YYYY-MM-DD
      y = toInt(m[1]); mo = toInt(m[2]); d = toInt(m[3]);
    } else if (re === datePatterns[1]) {
      // DD-MM-YYYY (or YY)
      d = toInt(m[1]); mo = toInt(m[2]); y = toInt(m[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000; // 2-digit year heuristic
      if (y >= 2500) { y -= 543; beAdjusted = true; } // Thai BE
    } else if (re === datePatterns[2]) {
      // 14 Sep 2025
      d = toInt(m[1]); mo = enMonths[m[2].toLowerCase()] || 0; y = toInt(m[3]);
    } else {
      // Thai month words
      d = toInt(m[1]);
      const monWord = m[2];
      mo = thMonths[monWord] || thMonths[normalizeThaiMonthKey(monWord)] || 0;
      y = toInt(m[3]);
      if (y >= 2500) { y -= 543; beAdjusted = true; }
    }

    if (validYMD(y, mo, d)) {
      candidates.push({ rawDate: raw, y, mo, d, beAdjusted });
    }
  }

  // If multiple dates exist, choose the one closest to time text or the one containing keywords
  // Simple strategy: take the first plausible date (receipts usually show the transaction date near top).
  const chosen = candidates[0] || null;

  // Pick a time, default to 12:00:00 if not found
  const t = timeHits[0] || { h: 12, mi: 0, s: 0, ampm: "" };

  // Normalize 12-hour clock if AM/PM provided
  let H = t.h;
  if (t.ampm === "pm" && H < 12) H += 12;
  if (t.ampm === "am" && H === 12) H = 0;

  let datetimeISO = "";
  if (chosen) {
    // Construct local datetime; toISOString() converts to UTC, which is okay for storage
    const dt = new Date(chosen.y, chosen.mo - 1, chosen.d, H, t.mi, t.s);
    datetimeISO = isNaN(dt.getTime()) ? "" : dt.toISOString();
  }

  return {
    datetimeISO,
    foundDateText: chosen?.rawDate || "",
    foundTimeText: timeHits[0]?.raw || "",
    beYearAdjusted: !!chosen?.beAdjusted,
    pickedStrategy: chosen ? "regex(date)+regex(time)" : "fallback(now)",
    candidates: candidates.slice(0, 5)
  };
}

/** Utils **/
function matchAll(text, patterns) {
  const hits = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) hits.push(m);
  }
  return hits;
}
function toInt(s) { return parseInt(String(s || "0"), 10) || 0; }
function validYMD(y, m, d) {
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // rough check; detailed month/day validation can be added if needed
  return true;
}
function normalizeThaiMonthKey(s = "") {
  // normalize oddly punctuated Thai abbreviations like ก.ย. (keep as is) — just a placeholder
  return s;
}

export default router;