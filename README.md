# WhisperWall — Anonymous Campus Confession Platform

Team 10 project. Full-stack web app: share confessions anonymously, react/comment,
explore trending posts, browse college communities, run polls, and report content.

## Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite, using Node's **built-in `node:sqlite` module** — no native
  compilation, no separate DB server to install. Requires **Node.js v22.5+**.
- **Frontend:** Plain HTML/CSS/JavaScript (no framework, no build step)

## Requirements

- Node.js **v22.5 or newer** (check with `node -v`). The app uses Node's built-in
  SQLite support, so nothing extra needs to be installed for the database.
  - If your Node version is older, download the latest LTS from https://nodejs.org

## Setup (VS Code)

1. Open this folder (`whisperwall/`) in VS Code.
2. Open a terminal (`` Ctrl+` ``) and install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser at **http://localhost:4000**

That's it — the database file is created automatically at `data/whisperwall.db`
the first time you run the server, pre-seeded with a few sample confessions,
a comment, and a live poll so the UI isn't empty on first load.

## Project structure

```
whisperwall/
├── package.json
├── data/                    ← SQLite DB file lives here (auto-created)
├── server/
│   ├── server.js            ← Express app + all REST API routes
│   └── db.js                ← Database schema + seed data
└── public/                  ← Frontend (served statically by Express)
    ├── index.html
    ├── style.css
    └── app.js
```

## Features implemented

- **Post confessions anonymously** — auto-incrementing anon number per college,
  category + tags, 600-char limit
- **Reactions** — emoji reactions (😭 😂 💜 😮 😡) per confession, live counts
- **Comments** — view and add anonymous comments on any confession
- **Trending** — right rail + "Trending" tab, ranked by total reactions
- **Communities** — switch between colleges, or create a new college community
- **Polls** — live poll widget in the sidebar, full Polls tab to create polls
  with custom options and vote
- **Report** — flag a confession as inappropriate (increments a report counter)
- **Categories & tags** — filter feed by category pill or tag chip, plus a
  live search box (debounced)

## API overview

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/colleges` | List all college communities |
| POST | `/api/colleges` | Create a new college community |
| GET | `/api/confessions` | List confessions (filters: college, category, tag, search, sort) |
| GET | `/api/confessions/:id` | Single confession with comments + reactions |
| POST | `/api/confessions` | Create a confession |
| POST | `/api/confessions/:id/report` | Report a confession |
| POST | `/api/confessions/:id/react` | Add/increment a reaction |
| GET/POST | `/api/confessions/:id/comments` | List / add comments |
| GET | `/api/categories` | Static category list |
| GET | `/api/tags` | Tag frequency list (optionally per college) |
| GET | `/api/trending` | Top 5 confessions by total reactions |
| GET | `/api/polls` | List polls (filters: college, activeOnly) |
| POST | `/api/polls` | Create a poll |
| POST | `/api/polls/:pollId/vote/:optionId` | Vote on a poll option |
| GET | `/api/health` | Health check |

## Notes / things you could extend for the project report

- No login system by design — the whole point is anonymity. If your project
  brief needs user accounts (e.g. to prevent duplicate votes/reactions), you
  could add a `users` table + session cookies, and store one row per
  `(user_id, confession_id, emoji)` in `reactions` instead of a running count.
- The `reports` counter is just a number on the confession right now — a real
  moderation queue would add an admin view that lists/deletes highly-reported
  posts.
- Swapping storage: since everything goes through `server/db.js`, moving to
  MySQL/PostgreSQL later mainly means rewriting that one file's queries.
