// app.js — WhisperWall frontend logic
const API = "/api";

const state = {
  colleges: [],
  currentCollege: null,
  category: "All",
  tag: null,
  sort: "newest",
  search: "",
  view: "feed",
  currentDetailId: null,
};

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
async function init() {
  await loadColleges();
  await refreshSidebar();
  await loadFeed();
  await loadTrending();
  await loadLivePoll();
  bindEvents();
}

async function loadColleges() {
  state.colleges = await api("/colleges");
  const picker = $("#collegePicker");
  const composerCollege = $("#composerCollege");
  const pollCollege = $("#pollCollege");
  [picker, composerCollege, pollCollege].forEach((el) => (el.innerHTML = ""));

  state.colleges.forEach((c) => {
    [picker, composerCollege, pollCollege].forEach((el) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      el.appendChild(opt);
    });
  });

  state.currentCollege = state.colleges[0]?.name || null;
  picker.value = state.currentCollege;
}

async function refreshSidebar() {
  const categories = await api("/categories");
  const categoryList = $("#categoryList");
  categoryList.innerHTML = "";
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (cat === state.category ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => {
      state.category = cat;
      refreshSidebar();
      loadFeed();
    };
    categoryList.appendChild(btn);
  });

  const tags = await api(`/tags?college=${encodeURIComponent(state.currentCollege || "")}`);
  const tagList = $("#tagList");
  tagList.innerHTML = "";
  tags.slice(0, 12).forEach((tag) => {
    const chip = document.createElement("button");
    chip.className = "tag-chip" + (tag === state.tag ? " active" : "");
    chip.textContent = tag;
    chip.onclick = () => {
      state.tag = state.tag === tag ? null : tag;
      refreshSidebar();
      loadFeed();
    };
    tagList.appendChild(chip);
  });

  const communityList = $("#communityList");
  communityList.innerHTML = "";
  state.colleges.forEach((c) => {
    const item = document.createElement("div");
    item.className = "community-item" + (c.name === state.currentCollege ? " active" : "");
    item.textContent = c.name;
    item.onclick = () => switchCollege(c.name);
    communityList.appendChild(item);
  });
}

async function switchCollege(name) {
  state.currentCollege = name;
  state.tag = null;
  $("#collegePicker").value = name;
  await refreshSidebar();
  await loadFeed();
  await loadTrending();
  await loadLivePoll();
}

// ---------- Feed ----------
async function loadFeed() {
  const feedList = $("#feedList");
  const feedStatus = $("#feedStatus");
  feedStatus.classList.remove("hidden");
  feedStatus.textContent = "Loading confessions…";
  feedList.innerHTML = "";

  const params = new URLSearchParams({
    college: state.currentCollege || "",
    category: state.category,
    sort: state.sort,
  });
  if (state.tag) params.set("tag", state.tag);
  if (state.search) params.set("search", state.search);

  try {
    const confessions = await api(`/confessions?${params.toString()}`);
    feedStatus.classList.add("hidden");
    if (confessions.length === 0) {
      feedStatus.classList.remove("hidden");
      feedStatus.textContent = "No confessions yet. Be the first to whisper something.";
      return;
    }
    confessions.forEach((c) => feedList.appendChild(renderCard(c)));
  } catch (e) {
    feedStatus.textContent = "Couldn't load confessions: " + e.message;
  }
}

function renderCard(c) {
  const card = document.createElement("div");
  card.className = "confession-card";
  card.innerHTML = `
    <div class="card-dot"></div>
    <div class="card-top">
      <div class="card-meta">Anonymous #${c.anon_number} · ${timeAgo(c.created_at)}</div>
      <div class="card-category">${escapeHtml(c.category)}</div>
    </div>
    <div class="card-content">${escapeHtml(c.content)}</div>
    <div class="card-tags">${c.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
    <div class="card-bottom">
      <div class="reactions">
        ${c.reactions.map((r) => `<button class="reaction-btn" data-id="${c.id}" data-emoji="${r.emoji}">${r.emoji} <span>${r.count}</span></button>`).join("")}
      </div>
      <div class="card-actions">
        <a class="comment-link" data-id="${c.id}">${c.commentCount} comments</a>
        <a class="report-link" data-id="${c.id}">Report</a>
      </div>
    </div>
  `;

  card.querySelectorAll(".reaction-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const res = await api(`/confessions/${btn.dataset.id}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji: btn.dataset.emoji }),
      });
      const reaction = res.find((r) => r.emoji === btn.dataset.emoji);
      btn.querySelector("span").textContent = reaction.count;
    });
  });

  card.querySelector(".report-link").addEventListener("click", async (e) => {
    e.stopPropagation();
    await api(`/confessions/${e.target.dataset.id}/report`, { method: "POST" });
    showToast("Confession reported. Our moderators will review it.");
  });

  card.addEventListener("click", () => openDetail(c.id));

  return card;
}

// ---------- Detail modal ----------
async function openDetail(id) {
  state.currentDetailId = id;
  const c = await api(`/confessions/${id}`);
  const content = $("#detailContent");
  content.innerHTML = `
    <div class="detail-card">
      <div class="card-top">
        <div class="card-meta">Anonymous #${c.anon_number} · ${timeAgo(c.created_at)}</div>
        <div class="card-category">${escapeHtml(c.category)}</div>
      </div>
      <div class="card-content">${escapeHtml(c.content)}</div>
      <div class="card-tags">${c.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
      <div class="reactions" style="margin-top:12px;">
        ${c.reactions.map((r) => `<button class="reaction-btn" data-emoji="${r.emoji}">${r.emoji} <span>${r.count}</span></button>`).join("")}
      </div>
    </div>
    <h3 style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:var(--text-dim); margin-bottom:10px;">Comments</h3>
    <div class="detail-comments" id="detailComments">
      ${c.comments.length === 0 ? '<div style="color:var(--text-faint); font-size:12px;">No comments yet.</div>' : c.comments.map((cm) => `
        <div class="comment-item">
          <div class="comment-meta">Anonymous · ${timeAgo(cm.created_at)}</div>
          ${escapeHtml(cm.content)}
        </div>`).join("")}
    </div>
    <form class="comment-form" id="detailCommentForm">
      <input type="text" id="detailCommentInput" placeholder="Add an anonymous comment…" maxlength="300" required />
      <button type="submit">Post</button>
    </form>
  `;

  content.querySelectorAll(".reaction-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await api(`/confessions/${id}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji: btn.dataset.emoji }),
      });
      const reaction = res.find((r) => r.emoji === btn.dataset.emoji);
      btn.querySelector("span").textContent = reaction.count;
      loadFeed();
    });
  });

  $("#detailCommentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#detailCommentInput");
    if (!input.value.trim()) return;
    await api(`/confessions/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: input.value }),
    });
    input.value = "";
    openDetail(id);
    loadFeed();
  });

  $("#detailOverlay").classList.remove("hidden");
}

// ---------- Trending ----------
async function loadTrending() {
  const trending = await api(`/trending?college=${encodeURIComponent(state.currentCollege || "")}`);
  const list = $("#trendingList");
  list.innerHTML = "";
  trending.forEach((t, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<b>#${i + 1}</b><span class="t-text">${escapeHtml(t.content.slice(0, 70))}${t.content.length > 70 ? "…" : ""}</span><span class="t-meta">${t.total} reactions · ${escapeHtml(t.category)}</span>`;
    li.onclick = () => openDetail(t.id);
    list.appendChild(li);
  });
  if (trending.length === 0) {
    list.innerHTML = '<li style="color:var(--text-faint);">Nothing trending yet.</li>';
  }
}

// ---------- Live poll (right rail) ----------
async function loadLivePoll() {
  const polls = await api(`/polls?college=${encodeURIComponent(state.currentCollege || "")}&activeOnly=true`);
  const panel = $("#livePollContent");
  if (polls.length === 0) {
    panel.innerHTML = '<div style="color:var(--text-faint); font-size:12px;">No active poll for this college yet.</div>';
    return;
  }
  const poll = polls[0];
  panel.innerHTML = renderPoll(poll);
  bindPollVotes(panel, poll);
}

function renderPoll(poll) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0) || 1;
  return `
    <div class="poll-q">${escapeHtml(poll.question)}</div>
    ${poll.options.map((o) => {
      const pct = Math.round((o.votes / total) * 100);
      return `
      <div class="poll-option" data-poll="${poll.id}" data-option="${o.id}">
        <div class="poll-bar-bg">
          <div class="poll-bar-fill" style="width:${pct}%"></div>
          <div class="poll-bar-label"><span>${escapeHtml(o.option_text)}</span><span>${pct}%</span></div>
        </div>
      </div>`;
    }).join("")}
    <div class="poll-total">${total} vote${total === 1 ? "" : "s"}</div>
  `;
}

function bindPollVotes(container, poll) {
  container.querySelectorAll(".poll-option").forEach((el) => {
    el.addEventListener("click", async () => {
      const options = await api(`/polls/${el.dataset.poll}/vote/${el.dataset.option}`, { method: "POST" });
      poll.options = options;
      container.innerHTML = renderPoll(poll);
      bindPollVotes(container, poll);
      loadPolls();
    });
  });
}

// ---------- Polls view ----------
async function loadPolls() {
  const polls = await api(`/polls?college=${encodeURIComponent(state.currentCollege || "")}`);
  const list = $("#pollsList");
  list.innerHTML = "";
  if (polls.length === 0) {
    list.innerHTML = '<div style="color:var(--text-faint);">No polls yet for this community.</div>';
    return;
  }
  polls.forEach((poll) => {
    const card = document.createElement("div");
    card.className = "poll-card";
    card.innerHTML = renderPoll(poll) + `<div class="poll-meta">${escapeHtml(poll.college_name)}</div>`;
    list.appendChild(card);
    bindPollVotes(card, poll);
  });
}

// ---------- Communities view ----------
async function loadCommunitiesView() {
  const grid = $("#communitiesGrid");
  grid.innerHTML = "";
  state.colleges.forEach((c) => {
    const card = document.createElement("div");
    card.className = "community-card" + (c.name === state.currentCollege ? " active" : "");
    card.innerHTML = `<h4>${escapeHtml(c.name)}</h4><p>Tap to switch community feed</p>`;
    card.onclick = () => {
      switchCollege(c.name);
      loadCommunitiesView();
    };
    grid.appendChild(card);
  });
}

// ---------- View switching ----------
function switchView(view) {
  state.view = view;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  $("#feedList").classList.toggle("hidden", view !== "feed");
  $(".feed-toolbar").classList.toggle("hidden", view !== "feed");
  $("#communitiesView").classList.toggle("hidden", view !== "communities");
  $("#pollsView").classList.toggle("hidden", view !== "polls");

  if (view === "trending") {
    // reuse feed list but sorted by top reactions
    $("#feedList").classList.remove("hidden");
    state.sort = "top";
    $$(".sort-btn").forEach((b) => b.classList.toggle("active", b.dataset.sort === "top"));
    loadFeed();
  }
  if (view === "communities") loadCommunitiesView();
  if (view === "polls") loadPolls();
}

// ---------- Events ----------
function bindEvents() {
  $("#collegePicker").addEventListener("change", (e) => switchCollege(e.target.value));

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  $$(".sort-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      $$(".sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadFeed();
    })
  );

  let searchTimeout;
  $("#searchBox").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = e.target.value.trim();
      loadFeed();
    }, 300);
  });

  // Composer modal
  $("#openComposer").addEventListener("click", () => {
    $("#composerCollege").value = state.currentCollege;
    $("#composerOverlay").classList.remove("hidden");
  });
  $("#closeComposer").addEventListener("click", () => $("#composerOverlay").classList.add("hidden"));
  $("#composerOverlay").addEventListener("click", (e) => {
    if (e.target.id === "composerOverlay") $("#composerOverlay").classList.add("hidden");
  });
  $("#composerContent").addEventListener("input", (e) => {
    $("#charCount").textContent = e.target.value.length;
  });

  $("#confessionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/confessions", {
        method: "POST",
        body: JSON.stringify({
          collegeName: $("#composerCollege").value,
          category: $("#composerCategory").value,
          content: $("#composerContent").value,
          tags: $("#composerTags").value,
        }),
      });
      $("#composerOverlay").classList.add("hidden");
      $("#confessionForm").reset();
      $("#charCount").textContent = "0";
      showToast("Posted anonymously ✨");
      await refreshSidebar();
      await loadFeed();
      await loadTrending();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // Poll composer modal
  $("#openPollComposer").addEventListener("click", () => {
    $("#pollCollege").value = state.currentCollege;
    $("#pollComposerOverlay").classList.remove("hidden");
  });
  $("#closePollComposer").addEventListener("click", () => $("#pollComposerOverlay").classList.add("hidden"));
  $("#pollComposerOverlay").addEventListener("click", (e) => {
    if (e.target.id === "pollComposerOverlay") $("#pollComposerOverlay").classList.add("hidden");
  });
  $("#addPollOption").addEventListener("click", () => {
    const wrap = $("#pollOptionsWrap");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "poll-option-input";
    input.placeholder = `Option ${wrap.children.length + 1}`;
    wrap.appendChild(input);
  });

  $("#pollForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const options = Array.from($$(".poll-option-input"))
      .map((i) => i.value.trim())
      .filter(Boolean);
    if (options.length < 2) {
      showToast("Add at least 2 options");
      return;
    }
    try {
      await api("/polls", {
        method: "POST",
        body: JSON.stringify({
          collegeName: $("#pollCollege").value,
          question: $("#pollQuestion").value,
          options,
        }),
      });
      $("#pollComposerOverlay").classList.add("hidden");
      $("#pollForm").reset();
      showToast("Poll created!");
      loadPolls();
      loadLivePoll();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // New college form (communities view)
  $("#newCollegeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#newCollegeInput");
    if (!input.value.trim()) return;
    try {
      await api("/colleges", { method: "POST", body: JSON.stringify({ name: input.value.trim() }) });
      input.value = "";
      await loadColleges();
      loadCommunitiesView();
      showToast("Community created!");
    } catch (err) {
      showToast("Error: " + err.message);
    }
  });

  // Detail modal close
  $("#closeDetail").addEventListener("click", () => $("#detailOverlay").classList.add("hidden"));
  $("#detailOverlay").addEventListener("click", (e) => {
    if (e.target.id === "detailOverlay") $("#detailOverlay").classList.add("hidden");
  });

  // event delegation for feed comment links (in case card re-renders)
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("comment-link")) {
      openDetail(e.target.dataset.id);
    }
  });
}

init();
