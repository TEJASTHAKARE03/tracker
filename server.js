// server.js — Nova build (Mongo Atlas + stats + validation)
require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // serve html & assets in this folder

// ---- Mongo connection ----
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/tracker";
mongoose
  .connect(uri, {
    dbName: "tracker",
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4, // prefer IPv4 (Windows DNS stability)
  })
  .then(() => console.log("MongoDB connected"))
  .catch((e) => console.error("MongoDB error:", e.message));
mongoose.connection.on("error", (e) =>
  console.error("Mongoose connection error:", e?.message || e)
);

// ---- Schemas ----
const opts = { timestamps: true };
const phoneRegex = /^[0-9+\-\s()]{6,20}$/;

const StaffSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
  opts
);
const ServiceSchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
  opts
);
const CategorySchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true } },
  opts
);

// case-insensitive unique
const collation = { locale: "en", strength: 2 };
StaffSchema.index({ name: 1 }, { unique: true, collation });
ServiceSchema.index({ name: 1 }, { unique: true, collation });
CategorySchema.index({ name: 1 }, { unique: true, collation });

const CallSchema = new mongoose.Schema(
  {
    callerName: { type: String, trim: true, required: true },
    callerPhone: { type: String, trim: true, match: phoneRegex },
    datetime: { type: Date, required: true },
    personRequested: { type: String, trim: true },
    notes: { type: String, trim: true },
    notifyEmail: Boolean,
    notifyWhatsApp: Boolean,
  },
  opts
);

const FollowupSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      trim: true,
      enum: ["Pending", "In Progress", "Completed", "No Follow-up Needed"],
    },
    dueDate: Date,
    staff: { type: String, trim: true },
    emailReminder: Boolean,
    waReminder: Boolean,
  },
  opts
);

const RequestSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, match: phoneRegex },
    email: { type: String, trim: true },
    service: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  opts
);

const IssueSchema = new mongoose.Schema(
  {
    customerName: { type: String, trim: true },
    phone: { type: String, trim: true, match: phoneRegex },
    vehicleModel: { type: String, trim: true },
    category: { type: String, trim: true },
    description: { type: String, trim: true },
    priority: { type: String, trim: true, enum: ["Low", "Medium", "High"], default: "Low" },
    staff: { type: String, trim: true },
    dueDate: Date,
    status: { type: String, trim: true, default: "Open" },
  },
  opts
);

const Staff = mongoose.model("Staff", StaffSchema);
const Service = mongoose.model("Service", ServiceSchema);
const Category = mongoose.model("Category", CategorySchema);
const Call = mongoose.model("Call", CallSchema);
const Followup = mongoose.model("Followup", FollowupSchema);
const Request = mongoose.model("Request", RequestSchema);
const Issue = mongoose.model("Issue", IssueSchema);

// seed
(async () => {
  if ((await Staff.countDocuments()) === 0) {
    await Staff.insertMany([
      { name: "Front Desk" },
      { name: "PPF Lead" },
      { name: "Workshop Manager" },
      { name: "Sales — Ayesha" },
      { name: "Sales — Rohan" },
    ]);
  }
  if ((await Service.countDocuments()) === 0) {
    await Service.insertMany([
      { name: "Paint Protection Film" },
      { name: "Ceramic Coating" },
      { name: "Detailing" },
    ]);
  }
  if ((await Category.countDocuments()) === 0) {
    await Category.insertMany([
      { name: "PPF — Peeling" },
      { name: "PPF — Bubbles" },
      { name: "Coating — Haze" },
      { name: "Fitment — Rattling" },
      { name: "Other" },
    ]);
  }
})().catch(console.error);

// helpers
const safeCreate = (Model) => async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name required" });
    const existed = await Model.findOne({ name }).collation(collation);
    if (existed) return res.json(existed);
    const doc = await Model.create({ name });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// staff/services/categories
app.get("/api/staff", async (_req, res) => res.json(await Staff.find().sort({ name: 1 })));
app.post("/api/staff", safeCreate(Staff));
app.delete("/api/staff/:id", async (req, res) => {
  await Staff.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.get("/api/services", async (_req, res) => res.json(await Service.find().sort({ name: 1 })));
app.post("/api/services", safeCreate(Service));
app.delete("/api/services/:id", async (req, res) => {
  await Service.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.get("/api/categories", async (_req, res) => res.json(await Category.find().sort({ name: 1 })));
app.post("/api/categories", safeCreate(Category));
app.delete("/api/categories/:id", async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// calls & followups
app.post("/api/calls", async (req, res) => {
  try {
    const call = await Call.create(req.body);
    res.json(call);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/calls", async (_req, res) => res.json(await Call.find().sort({ createdAt: -1 })));

app.post("/api/followups", async (req, res) => {
  try {
    const f = await Followup.create(req.body);
    res.json(f);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/followups", async (_req, res) => res.json(await Followup.find().sort({ createdAt: -1 })));

// customer requests
app.post("/api/requests", async (req, res) => {
  try {
    const r = await Request.create(req.body);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/requests", async (_req, res) => res.json(await Request.find().sort({ createdAt: -1 })));

// service issues
app.post("/api/issues", async (req, res) => {
  try {
    const i = await Issue.create(req.body);
    res.json(i);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/issues", async (_req, res) => res.json(await Issue.find().sort({ createdAt: -1 })));
app.patch("/api/issues/:id/resolve", async (req, res) => {
  const i = await Issue.findByIdAndUpdate(req.params.id, { status: "Resolved" }, { new: true });
  res.json(i);
});

// stats for KPIs/charts
app.get("/api/stats", async (_req, res) => {
  try {
    const now = new Date();
    const s = new Date(now); s.setHours(0,0,0,0);
    const e = new Date(now); e.setHours(23,59,59,999);

    const todaysCalls = await Call.countDocuments({ createdAt: { $gte: s, $lte: e } });
    const openFollowups = await Followup.countDocuments({ status: { $in: ["Pending", "In Progress"] } });
    const totalFollowups = await Followup.countDocuments({});
    const completionRate = totalFollowups === 0 ? 0 : Math.round(((totalFollowups - openFollowups) / totalFollowups) * 100);

    const frequentCallers = await Call.aggregate([
      { $group: { _id: { callerName: "$callerName", callerPhone: "$callerPhone" }, times: { $sum: 1 }, lastCall: { $max: "$datetime" } } },
      { $sort: { times: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, callerName: "$_id.callerName", callerPhone: "$_id.callerPhone", times: 1, lastCall: 1 } }
    ]);

    const since = new Date(now.getTime() - 30*24*60*60*1000);
    const callsPerStaffAgg = await Call.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$personRequested", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      todaysCalls,
      openFollowups,
      completionRate,
      frequentCallers,
      callsPerStaff: callsPerStaffAgg.map(x => ({ label: x._id || "Unassigned", count: x.count })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// root
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
