import express from "express";
import Entry from "../models/Entry.js";
// import crypto from "crypto";

const router = express.Router();

// READ all
router.get("/", async (req, res) => {
  const list = await Entry.find().sort({ datetime: -1 }).lean();
  res.json(list);
});

// CREATE
router.post("/", async (req, res) => {
  try {
    const { type, amount, category, note, datetime, image_url } = req.body || {};
    if (!type || !amount || !datetime) return res.status(400).json({ error: "Missing fields" });
    const doc = await Entry.create({
       type: type === "income" ? "income" : "expense",
       amount: Number(amount),
       category: category || "Other",
       note: note || "",
       datetime: new Date(datetime),
       image_url: image_url || ""
     });
    res.status(201).json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Create failed" });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    for (const k of ["type", "amount", "category", "note", "datetime", "image_url"]) {
      if (k in req.body) patch[k] = k === "datetime" ? new Date(req.body[k]) : req.body[k];
    }
    if ("type" in patch) patch.type = patch.type === "income" ? "income" : "expense";
    if ("amount" in patch) patch.amount = Number(patch.amount);

    const doc = await Entry.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await Entry.findByIdAndDelete(id).lean();
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
