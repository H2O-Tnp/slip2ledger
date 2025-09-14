import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import entriesRouter from "./routes/entries.js";
import aiRouter from "./routes/ai.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error("Missing MONGO_URL in .env");
  process.exit(1);
}
mongoose.connect(MONGO_URL).then(() => console.log("MongoDB connected")).catch(err => { console.error(err); process.exit(1); });

app.use("/entries", entriesRouter);
app.use("/ai", aiRouter);

// static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.join(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));
app.get("*", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

const PORT = process.env.PORT || 3221;
app.listen(PORT, () => console.log(`Server ready at http://localhost:${PORT}`));
