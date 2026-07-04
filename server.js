// server.js — WhisperWall backend
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const DEFAULT_EMOJIS = ["😭", "😂", "💜", "😮", "😡"];

// ---------------------------------------------------------------
// COLLEGES / COMMUNITIES
// ---------------------------------------------------------------
app.get("/api/colleges", (req, res) => {
  const colleges = db.prepare("SELECT * FROM colleges ORDER BY name").all();
  res.json(colleges);
});

app.post("/api/colleges", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "College name required" });
  try {
    const info = db.prepare("INSERT INTO colleges (name) VALUES (?)").run(name.trim());
    res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim() });
  } catch (e) {
    res.status(409).json({ error: "College already exists" });
  }
});

// ---------------------------------------------------------------
// CONFESSIONS
// GET  /api/confessions?college=Ashgrove University&category=Academics&tag=finals&sort=newest|top&search=text
// ---------------------------------------------------------------
app.get("/api/confessions", (req, res) => {
  const { college, category, tag, sort = "newest", search } = req.query;

  let query = `
    SELECT c.*, col.name AS college_name
    FROM confessions c
    JOIN colleges col ON col.id = c.college_id
    WHERE 1=1
  `;
  const params = [];

  if (college) {
    query += " AND col.name = ?";
    params.push(college);
  }
  if (category && category !== "All") {
    query += " AND c.category = ?";
    params.push(category);
  }
  if (tag) {
    query += " AND c.tags LIKE ?";
    params.push(`%${tag}%`);
  }
  if (search) {
    query += " AND c.content LIKE ?";
    params.push(`%${search}%`);
  }

  const confessions = db.prepare(query).all(...params);

  const reactionStmt = db.prepare("SELECT emoji, count FROM reactions WHERE confession_id = ?");
  const commentCountStmt = db.prepare("SELECT COUNT(*) AS c FROM comments WHERE confession_id = ?");

  let results = confessions.map((c) => {
    const reactions = reactionStmt.all(c.id);
    const reactionTotal = reactions.reduce((sum, r) => sum + r.count, 0);
    const commentCount = commentCountStmt.get(c.id).c;
    return {
      ...c,
      tags: c.tags ? c.tags.split(",").filter(Boolean) : [],
      reactions,
      reactionTotal,
      commentCount,
    };
  });

  if (sort === "top") {
    results.sort((a, b) => b.reactionTotal - a.reactionTotal);
  } else {
    results.sort((a, b) => b.id - a.id);
  }

  res.json(results);
});

app.get("/api/confessions/:id", (req, res) => {
  const confession = db
    .prepare(
      `SELECT c.*, col.name AS college_name FROM confessions c
       JOIN colleges col ON col.id = c.college_id WHERE c.id = ?`
    )
    .get(req.params.id);
  if (!confession) return res.status(404).json({ error: "Not found" });

  const reactions = db.prepare("SELECT emoji, count FROM reactions WHERE confession_id = ?").all(confession.id);
  const comments = db
    .prepare("SELECT * FROM comments WHERE confession_id = ? ORDER BY created_at ASC")
    .all(confession.id);

  res.json({
    ...confession,
    tags: confession.tags ? confession.tags.split(",").filter(Boolean) : [],
    reactions,
    comments,
  });
});

app.post("/api/confessions", (req, res) => {
  const { collegeName, category, content, tags } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Confession content is required" });
  }
  if (!collegeName) {
    return res.status(400).json({ error: "College is required" });
  }

  let college = db.prepare("SELECT id FROM colleges WHERE name = ?").get(collegeName);
  if (!college) {
    const info = db.prepare("INSERT INTO colleges (name) VALUES (?)").run(collegeName);
    college = { id: info.lastInsertRowid };
  }

  const maxAnon = db
    .prepare("SELECT MAX(anon_number) AS m FROM confessions WHERE college_id = ?")
    .get(college.id).m;
  const nextAnon = (maxAnon || 1000) + 1;

  const cleanTags = (tags || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(",");

  const info = db
    .prepare(
      `INSERT INTO confessions (anon_number, college_id, category, content, tags) VALUES (?, ?, ?, ?, ?)`
    )
    .run(nextAnon, college.id, category || "Campus Life", content.trim(), cleanTags);

  const confessionId = info.lastInsertRowid;
  const insertReaction = db.prepare(
    "INSERT INTO reactions (confession_id, emoji, count) VALUES (?, ?, 0)"
  );
  DEFAULT_EMOJIS.forEach((e) => insertReaction.run(confessionId, e));

  res.status(201).json({ id: Number(confessionId), anon_number: nextAnon });
});

app.post("/api/confessions/:id/report", (req, res) => {
  const confession = db.prepare("SELECT * FROM confessions WHERE id = ?").get(req.params.id);
  if (!confession) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE confessions SET reports = reports + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------
// REACTIONS
// ---------------------------------------------------------------
app.post("/api/confessions/:id/react", (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: "emoji required" });

  const existing = db
    .prepare("SELECT * FROM reactions WHERE confession_id = ? AND emoji = ?")
    .get(req.params.id, emoji);

  if (existing) {
    db.prepare("UPDATE reactions SET count = count + 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare("INSERT INTO reactions (confession_id, emoji, count) VALUES (?, ?, 1)").run(
      req.params.id,
      emoji
    );
  }

  const reactions = db
    .prepare("SELECT emoji, count FROM reactions WHERE confession_id = ?")
    .all(req.params.id);
  res.json(reactions);
});

// ---------------------------------------------------------------
// COMMENTS
// ---------------------------------------------------------------
app.get("/api/confessions/:id/comments", (req, res) => {
  const comments = db
    .prepare("SELECT * FROM comments WHERE confession_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json(comments);
});

app.post("/api/confessions/:id/comments", (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Comment cannot be empty" });

  const info = db
    .prepare("INSERT INTO comments (confession_id, content) VALUES (?, ?)")
    .run(req.params.id, content.trim());

  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(comment);
});

// ---------------------------------------------------------------
// CATEGORIES & TAGS (derived)
// ---------------------------------------------------------------
app.get("/api/categories", (req, res) => {
  res.json(["All", "Academics", "Relationships", "Roommates", "Campus Life", "Rant", "Wholesome"]);
});

app.get("/api/tags", (req, res) => {
  const { college } = req.query;
  let query = "SELECT c.tags FROM confessions c JOIN colleges col ON col.id = c.college_id WHERE 1=1";
  const params = [];
  if (college) {
    query += " AND col.name = ?";
    params.push(college);
  }
  const rows = db.prepare(query).all(...params);
  const tagCount = {};
  rows.forEach((r) => {
    (r.tags || "").split(",").filter(Boolean).forEach((t) => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  res.json(sorted);
});

// ---------------------------------------------------------------
// TRENDING
// ---------------------------------------------------------------
app.get("/api/trending", (req, res) => {
  const { college } = req.query;
  let query = `
    SELECT c.*, col.name AS college_name FROM confessions c
    JOIN colleges col ON col.id = c.college_id WHERE 1=1
  `;
  const params = [];
  if (college) {
    query += " AND col.name = ?";
    params.push(college);
  }
  const confessions = db.prepare(query).all(...params);
  const reactionStmt = db.prepare(
    "SELECT COALESCE(SUM(count),0) AS total FROM reactions WHERE confession_id = ?"
  );
  const withTotals = confessions
    .map((c) => ({ ...c, total: reactionStmt.get(c.id).total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  res.json(withTotals);
});

// ---------------------------------------------------------------
// POLLS
// ---------------------------------------------------------------
app.get("/api/polls", (req, res) => {
  const { college, activeOnly } = req.query;
  let query = `
    SELECT p.*, col.name AS college_name FROM polls p
    JOIN colleges col ON col.id = p.college_id WHERE 1=1
  `;
  const params = [];
  if (college) {
    query += " AND col.name = ?";
    params.push(college);
  }
  if (activeOnly === "true") {
    query += " AND p.active = 1";
  }
  query += " ORDER BY p.created_at DESC";

  const polls = db.prepare(query).all(...params);
  const optionStmt = db.prepare("SELECT * FROM poll_options WHERE poll_id = ?");
  const result = polls.map((p) => ({ ...p, options: optionStmt.all(p.id) }));
  res.json(result);
});

app.post("/api/polls", (req, res) => {
  const { collegeName, question, options } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: "Question and at least 2 options are required" });
  }
  let college = db.prepare("SELECT id FROM colleges WHERE name = ?").get(collegeName);
  if (!college) {
    const info = db.prepare("INSERT INTO colleges (name) VALUES (?)").run(collegeName);
    college = { id: info.lastInsertRowid };
  }
  const pollInfo = db
    .prepare("INSERT INTO polls (college_id, question) VALUES (?, ?)")
    .run(college.id, question.trim());
  const insertOption = db.prepare(
    "INSERT INTO poll_options (poll_id, option_text, votes) VALUES (?, ?, 0)"
  );
  options.forEach((opt) => insertOption.run(pollInfo.lastInsertRowid, opt.trim()));
  res.status(201).json({ id: Number(pollInfo.lastInsertRowid) });
});

app.post("/api/polls/:pollId/vote/:optionId", (req, res) => {
  const option = db
    .prepare("SELECT * FROM poll_options WHERE id = ? AND poll_id = ?")
    .get(req.params.optionId, req.params.pollId);
  if (!option) return res.status(404).json({ error: "Option not found" });
  db.prepare("UPDATE poll_options SET votes = votes + 1 WHERE id = ?").run(option.id);
  const options = db.prepare("SELECT * FROM poll_options WHERE poll_id = ?").all(req.params.pollId);
  res.json(options);
});

// ---------------------------------------------------------------
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`\n  WhisperWall server running → http://localhost:${PORT}\n`);
});
