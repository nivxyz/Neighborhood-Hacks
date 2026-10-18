// FlatDesk: complaint tracker and announcement board for apartment buildings.
// This file draws the screens. store.js saves the data (Firebase, or this browser).

import * as store from "./store.js";

// ---------- Settings ----------

const ADMIN_PIN = "1234"; // demo PIN for the building admin

const CATEGORIES = ["Water", "Electricity", "Lift", "Plumbing", "Garbage", "Security", "Parking", "Other"];

const STATUS = {
  reported: "Reported",
  progress: "In progress",
  resolved: "Resolved",
};

// ---------- Who is logged in (remembered on this device) ----------

const USER_KEY = "flatdesk-user";

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch (e) {
    return null;
  }
}

function saveUser() {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch (e) {}
}

// ---------- App state ----------

const data = store.data;
let user = loadUser();   // { name, flat, isAdmin }
let filter = "all";      // which complaints the board shows
let glowUpdateId = null; // the update that should glow after the admin posts it
let bumpMeToo = false;   // makes the "Me too" count bounce after you tap it

const app = document.getElementById("app");

// ---------- Small helpers ----------

// Stops people from typing HTML into a complaint and breaking the page
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.round(hours / 24);
  return days + "d ago";
}

function userKey() {
  return user.name + "|" + user.flat;
}

function statusPill(status) {
  return `<span class="pill status-${status}">${STATUS[status]}</span>`;
}

function toast(message) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

function go(path) {
  location.hash = path;
}

function currentPath() {
  return location.hash.slice(1) || "/";
}

// ---------- Screens ----------

// Picks which screen to show based on the part of the URL after #
function route() {
  const path = currentPath();
  drawTopbar();

  if (!user) return showLogin();

  if (path === "/new") return showNewComplaint();
  if (path === "/announce") return user.isAdmin ? showNewAnnouncement() : go("/");
  if (path.startsWith("/c/")) return showComplaint(path.slice(3));
  showBoard();
}

// Called when the data changes (you or someone else posted something).
// Redraws the board or complaint page quietly, but never wipes a form you're typing in.
function refresh() {
  if (!user) return;
  const path = currentPath();
  const note = document.getElementById("note");
  if (path === "/") showBoard(true);
  else if (path.startsWith("/c/") && !(note && note.value)) showComplaint(path.slice(3), true);
}

// live = true means "same screen, new data": skip the slide-in animation and keep the scroll position
function render(html, live = false) {
  app.innerHTML = `<div class="${live ? "live" : "screen"}">${html}</div>`;
  if (!live) window.scrollTo(0, 0);
}

function drawTopbar() {
  const who = document.getElementById("who");
  if (!user) {
    who.innerHTML = "";
    return;
  }
  who.innerHTML = `
    <span class="who-name">${esc(user.name)} · ${esc(user.flat)}${user.isAdmin ? " · Admin" : ""}</span>
    <button class="btn btn-small" id="logout">Log out</button>
  `;
  document.getElementById("logout").onclick = () => {
    user = null;
    saveUser();
    go("/");
    route();
  };
}

// --- Login ---

function showLogin() {
  render(`
    <div class="hero">
      <h1>Your building's complaints, in one place</h1>
      <p>No more complaints lost in the WhatsApp group. Post it, see who else has the same problem, and track it until it's fixed.</p>
    </div>
    <form class="card login" id="login-form">
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" required maxlength="40" autocomplete="name">
      </div>
      <div class="field">
        <label for="flat">Flat number</label>
        <input id="flat" required maxlength="10" placeholder="e.g. B-304">
      </div>
      <div class="field">
        <label class="check"><input type="checkbox" id="is-admin"> I'm the building admin</label>
      </div>
      <div class="field" id="pin-field" hidden>
        <label for="pin">Admin PIN</label>
        <input id="pin" type="password" inputmode="numeric" maxlength="10">
      </div>
      <button class="btn btn-primary" style="width:100%">Continue</button>
      <p class="demo-note">${store.usingFirebase
        ? "Demo version: everyone using this link shares the same board."
        : "Demo version: data is saved only in this browser."} The admin PIN is <strong>1234</strong>.</p>
    </form>
  `);

  const adminBox = document.getElementById("is-admin");
  const pinField = document.getElementById("pin-field");
  adminBox.onchange = () => (pinField.hidden = !adminBox.checked);

  document.getElementById("login-form").onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const flat = document.getElementById("flat").value.trim().toUpperCase();
    const isAdmin = adminBox.checked;

    if (isAdmin && document.getElementById("pin").value !== ADMIN_PIN) {
      toast("Wrong admin PIN");
      return;
    }
    user = { name, flat, isAdmin };
    saveUser();
    toast("Welcome, " + name);
    route();
  };
}

// --- Board (home screen) ---

function showBoard(live = false) {
  const all = data.complaints;
  const count = (s) => all.filter((c) => c.status === s).length;

  // Unresolved first, then the ones with the most "me too", then newest
  const shown = all
    .filter((c) => filter === "all" || c.status === filter)
    .sort((a, b) =>
      (a.status === "resolved") - (b.status === "resolved") ||
      b.meToo.length - a.meToo.length ||
      b.createdAt - a.createdAt
    );

  const announcements = [...data.announcements].sort((a, b) => b.createdAt - a.createdAt);

  render(`
    <div class="page-head">
      <h1>Building board</h1>
      <a class="btn btn-primary" href="#/new">+ New complaint</a>
    </div>

    <div class="stats">
      <div class="card stat stat-reported appear" style="--i:0"><div class="stat-num">${count("reported")}</div><div class="small muted">Reported</div></div>
      <div class="card stat stat-progress appear" style="--i:1"><div class="stat-num">${count("progress")}</div><div class="small muted">In progress</div></div>
      <div class="card stat stat-resolved appear" style="--i:2"><div class="stat-num">${count("resolved")}</div><div class="small muted">Resolved</div></div>
    </div>

    <div class="page-head" style="margin:28px 0 12px">
      <div class="section-title" style="margin:0">Announcements</div>
      ${user.isAdmin ? `<a class="btn btn-small" href="#/announce">+ Post announcement</a>` : ""}
    </div>
    <div class="stack">
      ${announcements.length ? announcements.map(announcementCard).join("") : `<div class="card empty">No announcements right now.</div>`}
    </div>

    <div class="section-title">Complaints</div>
    <div class="chips" role="group" aria-label="Filter complaints">
      ${chip("all", "All (" + all.length + ")")}
      ${chip("reported", "Reported")}
      ${chip("progress", "In progress")}
      ${chip("resolved", "Resolved")}
    </div>
    <div class="stack">
      ${shown.length ? shown.map(complaintCard).join("") : `<div class="card empty">Nothing here. Lucky building!</div>`}
    </div>
  `, live);

  app.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => {
      filter = btn.dataset.filter;
      showBoard();
    };
  });

  app.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.onclick = () => {
      store.removeAnnouncement(btn.dataset.remove);
      toast("Announcement removed");
    };
  });
}

function chip(value, label) {
  const active = filter === value;
  return `<button class="chip${active ? " active" : ""}" data-filter="${value}" aria-pressed="${active}">${label}</button>`;
}

function announcementCard(a, i) {
  return `
    <div class="card announce appear" style="--i:${i}">
      <div class="announce-head">
        <div>
          <div class="small muted">${timeAgo(a.createdAt)}</div>
          <h2>${esc(a.title)}</h2>
        </div>
        ${user.isAdmin ? `<button class="btn btn-small" data-remove="${a.id}">Remove</button>` : ""}
      </div>
      ${a.when ? `<div class="announce-when">${esc(a.when)}</div>` : ""}
      ${a.body ? `<p style="margin-top:6px">${esc(a.body)}</p>` : ""}
    </div>
  `;
}

function complaintCard(c, i) {
  return `
    <a class="card card-link appear" style="--i:${i}" href="#/c/${c.id}">
      <div class="complaint-top">
        <h2>${esc(c.title)}</h2>
        ${statusPill(c.status)}
      </div>
      <div class="complaint-meta">
        <span class="pill pill-cat">${esc(c.category)}</span>
        <span>${esc(c.flat)}</span>
        <span>·</span>
        <span>${timeAgo(c.createdAt)}</span>
        ${c.meToo.length ? `<span>·</span><span>${c.meToo.length} ${c.meToo.length === 1 ? "other" : "others"} affected</span>` : ""}
      </div>
    </a>
  `;
}

// --- New complaint ---

function showNewComplaint() {
  render(`
    <div class="page-head">
      <h1>New complaint</h1>
      <a href="#/">Cancel</a>
    </div>
    <form class="card" id="complaint-form">
      <div class="field">
        <label for="title">What's the problem?</label>
        <input id="title" required maxlength="80" placeholder="e.g. No water in C block since morning">
      </div>
      <div class="field">
        <label for="category">Category</label>
        <select id="category">
          ${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="desc">Details (optional)</label>
        <textarea id="desc" maxlength="500" placeholder="Where exactly, since when, anything else the admin should know"></textarea>
      </div>
      <button class="btn btn-primary">Post complaint</button>
    </form>
  `);

  document.getElementById("complaint-form").onsubmit = (e) => {
    e.preventDefault();
    const now = Date.now();
    const complaint = {
      id: newId(),
      title: document.getElementById("title").value.trim(),
      desc: document.getElementById("desc").value.trim(),
      category: document.getElementById("category").value,
      flat: user.flat,
      author: user.name,
      createdAt: now,
      status: "reported",
      meToo: [],
      updates: [{ status: "reported", text: "Complaint posted", at: now }],
    };
    store.addComplaint(complaint);
    toast("Complaint posted");
    go("/c/" + complaint.id);
  };
}

// --- One complaint, with its history ---

function showComplaint(id, live = false) {
  const c = data.complaints.find((x) => x.id === id);
  if (!c) {
    render(`<div class="card empty">That complaint doesn't exist any more. <a href="#/">Back to the board</a></div>`, live);
    return;
  }

  const mine = c.meToo.includes(userKey());
  const ownComplaint = c.author === user.name && c.flat === user.flat;

  render(`
    <div class="page-head">
      <a href="#/">← Board</a>
      ${statusPill(c.status)}
    </div>

    <div class="card">
      <h1>${esc(c.title)}</h1>
      <div class="complaint-meta">
        <span class="pill pill-cat">${esc(c.category)}</span>
        <span>by ${esc(c.author)}, ${esc(c.flat)}</span>
        <span>·</span>
        <span>${timeAgo(c.createdAt)}</span>
      </div>
      ${c.desc ? `<p style="margin-top:14px">${esc(c.desc)}</p>` : ""}

      ${ownComplaint ? "" : `
        <div style="margin-top:16px">
          <button class="btn metoo${mine ? " on" : ""}" id="metoo" aria-pressed="${mine}">
            ${mine ? "✓ You have this too" : "Me too"} · <span class="metoo-count${bumpMeToo ? " bump" : ""}">${c.meToo.length}</span>
          </button>
        </div>
      `}
      ${ownComplaint && c.meToo.length ? `<p class="small muted" style="margin-top:14px">${c.meToo.length} other ${c.meToo.length === 1 ? "flat has" : "flats have"} the same problem.</p>` : ""}
    </div>

    <div class="section-title">Updates</div>
    <div class="card">
      <ul class="timeline">
        ${c.updates.map((u) => `
          <li class="t-${u.status}">
            <div class="t-body${u.id && u.id === glowUpdateId ? " glow" : ""}">
              <div><strong>${STATUS[u.status]}</strong> <span class="small muted">· ${timeAgo(u.at)}${u.admin ? " · Admin" : ""}</span></div>
              <div>${esc(u.text)}</div>
            </div>
          </li>
        `).join("")}
      </ul>
    </div>

    ${user.isAdmin ? adminControls(c) : ""}
  `, live);

  // Scroll down to a new admin update so it can be seen glowing
  const glowing = app.querySelector(".glow");
  if (glowing) glowing.scrollIntoView({ block: "center" });
  glowUpdateId = null;
  bumpMeToo = false;

  const meTooBtn = document.getElementById("metoo");
  if (meTooBtn) meTooBtn.onclick = () => toggleMeToo(c);

  const form = document.getElementById("update-form");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    postUpdate(c);
  };
}

function adminControls(c) {
  return `
    <div class="section-title">Admin: post an update</div>
    <form class="card" id="update-form">
      <div class="field">
        <label for="new-status">Status</label>
        <select id="new-status">
          ${Object.keys(STATUS).map((s) => `<option value="${s}"${s === c.status ? " selected" : ""}>${STATUS[s]}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="note">Note for residents</label>
        <input id="note" required maxlength="200" placeholder="e.g. Plumber coming at 4 PM today">
      </div>
      <button class="btn btn-primary">Post update</button>
    </form>
  `;
}

function toggleMeToo(c) {
  bumpMeToo = true;
  store.setMeToo(c, userKey(), !c.meToo.includes(userKey()));
}

function postUpdate(c) {
  const note = document.getElementById("note");
  const status = document.getElementById("new-status").value;
  const update = { id: newId(), status, text: note.value.trim(), at: Date.now(), admin: true };

  note.value = ""; // clear it first, so the page is allowed to redraw with the new update
  glowUpdateId = update.id;
  store.addUpdate(c, update);
  toast(status === "resolved" ? "Marked as resolved" : "Update posted");
}

// --- New announcement (admin only) ---

function showNewAnnouncement() {
  render(`
    <div class="page-head">
      <h1>Post announcement</h1>
      <a href="#/">Cancel</a>
    </div>
    <form class="card" id="announce-form">
      <div class="field">
        <label for="a-title">Title</label>
        <input id="a-title" required maxlength="80" placeholder="e.g. Power cut for transformer repair">
      </div>
      <div class="field">
        <label for="a-when">When (optional)</label>
        <input id="a-when" maxlength="60" placeholder="e.g. Tuesday, 2 PM to 5 PM">
      </div>
      <div class="field">
        <label for="a-body">Details (optional)</label>
        <textarea id="a-body" maxlength="400"></textarea>
      </div>
      <button class="btn btn-primary">Post announcement</button>
    </form>
  `);

  document.getElementById("announce-form").onsubmit = (e) => {
    e.preventDefault();
    store.addAnnouncement({
      id: newId(),
      title: document.getElementById("a-title").value.trim(),
      when: document.getElementById("a-when").value.trim(),
      body: document.getElementById("a-body").value.trim(),
      createdAt: Date.now(),
    });
    toast("Announcement posted");
    go("/");
  };
}

// ---------- Start ----------

store
  .startStore({
    onChange: refresh,
    onError: (err) => {
      console.error(err);
      toast("Couldn't save. Check your internet and try again.");
    },
  })
  .then(() => {
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((err) => {
    console.error(err);
    app.innerHTML = `<div class="card empty">Couldn't load FlatDesk: ${esc(err.message)}</div>`;
  });
