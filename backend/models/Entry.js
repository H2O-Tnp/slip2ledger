import mongoose from "mongoose";

const EntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["income", "expense"], required: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: "Other" },
    note: { type: String, default: "" },
    datetime: { type: Date, required: true },
    image_url: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("Entry", EntrySchema);
