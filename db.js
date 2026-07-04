// db.js — Database layer for WhisperWall
// Uses Node's BUILT-IN SQLite module (node:sqlite), available from Node v22.5+.
// No native compilation, no extra install headaches — just works.

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "whisperwall.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

// ---------- Schema ----------
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS colleges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS confessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anon_number INTEGER NOT NULL,
    college_id INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'Campus Life',
    content TEXT NOT NULL,
    tags TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reports INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (college_id) REFERENCES colleges(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    confession_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(confession_id, emoji),
    FOREIGN KEY (confession_id) REFERENCES confessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    confession_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (confession_id) REFERENCES confessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (college_id) REFERENCES colleges(id)
  );

  CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    option_text TEXT NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
  );
`);

// ---------- Seed data (only runs once, if empty) ----------
const collegeCount = db.prepare("SELECT COUNT(*) AS c FROM colleges").get().c;
if (collegeCount === 0) {
  const insertCollege = db.prepare("INSERT INTO colleges (name) VALUES (?)");
  ["Ashgrove University", "Erode Sengunthar Engineering College", "Riverdale Institute of Technology"].forEach(
    (name) => insertCollege.run(name)
  );

  const college = db.prepare("SELECT id FROM colleges WHERE name = ?").get("Ashgrove University");

  const insertConfession = db.prepare(`
    INSERT INTO confessions (anon_number, college_id, category, content, tags, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const seedConfessions = [
    {
      anon: 1042,
      category: "Academics",
      content: "Pulled an all-nighter for a final I studied the wrong chapter for. Walked out, sat in my car, and just laughed for ten minutes straight.",
      tags: "#finals,#allnighter",
      offset: "-2 hours",
      reactions: { "😭": 38, "😂": 52, "💜": 9, "😮": 3 },
    },
    {
      anon: 1041,
      category: "Roommates",
      content: "My roommate has been 'borrowing' my oat milk for three weeks and replacing the carton with water so it still looks full. I know. I've said nothing. I'm collecting evidence.",
      tags: "#dishes,#pettytheft",
      offset: "-3 hours",
      reactions: { "😮": 61, "😂": 88, "💜": 4, "😡": 12 },
    },
    {
      anon: 1039,
      category: "Relationships",
      content: "I've been going to the 4th floor library every Tuesday for a month because someone I like studies there. I have not learned a single thing about thermodynamics.",
      tags: "#librarystudy,#crush",
      offset: "-6 hours",
      reactions: { "😂": 70, "💜": 40, "😮": 13 },
    },
    {
      anon: 1035,
      category: "Wholesome",
      content: "A total stranger paid for my meal when my card wouldn't scan. Didn't even let me say thank you properly, just smiled and walked off. Restoring my faith in this campus.",
      tags: "#kindness",
      offset: "-9 hours",
      reactions: { "💜": 118, "😭": 20 },
    },
  ];

  for (const c of seedConfessions) {
    const info = insertConfession.run(c.anon, college.id, c.category, c.content, c.tags, c.offset);
    const confessionId = info.lastInsertRowid;
    const insertReaction = db.prepare(
      "INSERT INTO reactions (confession_id, emoji, count) VALUES (?, ?, ?)"
    );
    for (const [emoji, count] of Object.entries(c.reactions)) {
      insertReaction.run(confessionId, emoji, count);
    }
  }

  // seed comment
  const firstConfession = db.prepare("SELECT id FROM confessions WHERE anon_number = 1042").get();
  if (firstConfession) {
    db.prepare("INSERT INTO comments (confession_id, content) VALUES (?, ?)").run(
      firstConfession.id,
      "This is way too relatable, I did the same thing last semester 💀"
    );
  }

  // seed poll
  const pollInfo = db
    .prepare("INSERT INTO polls (college_id, question) VALUES (?, ?)")
    .run(college.id, "Best late-night study spot on campus?");
  const pollId = pollInfo.lastInsertRowid;
  const insertOption = db.prepare(
    "INSERT INTO poll_options (poll_id, option_text, votes) VALUES (?, ?, ?)"
  );
  insertOption.run(pollId, "4th Floor Library", 44);
  insertOption.run(pollId, "The 24hr Cafe", 31);
  insertOption.run(pollId, "Dorm Lounge", 18);
  insertOption.run(pollId, "Engineering Lab", 9);
}

module.exports = db;
