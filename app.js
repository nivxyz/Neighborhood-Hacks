// FlatDesk: complaint tracker and announcement board for apartment buildings.
// This file draws the screens. store.js saves the data (Firebase, or this browser).
// roster.js reads the admin's residents sheet and checks people against it.

import * as store from "./store.js";
import { checkResident, readResidentsFile, sampleSheetUrl, flatKey } from "./roster.js";

// ---------- Settings ----------

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
    const saved = JSON.parse(localStorage.getItem(USER_KEY));
    return saved && saved.code ? saved : null; // older logins without a building don't count
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

function logOut() {
  user = null;
  saveUser();
  store.closeBuilding();
}

// ---------- App state ----------

const data = store.data;
let user = loadUser();   // { code, buildingName, name, flat, isAdmin }
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

// A full link to a page of this site, e.g. for WhatsApp
function pageLink(path) {
  return location.origin + location.pathname + "#" + path;
}

function inviteLink(code) {
  return pageLink("/b/" + code);
}

function whatsappLink(text) {
  return "https://wa.me/?text=" + encodeURIComponent(text);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => toast("Link copied"),
    () => toast("Couldn't copy. Select the link and copy it yourself.")
  );
}

// ---------- Screens ----------

// Picks which screen to show based on the part of the URL after #
async function route() {
  const path = currentPath();
  drawTopbar();

  // Invite links look like #/b/K7QM3P, or #/b/K7QM3P/c/<complaint> for a shared complaint
  const invite = path.match(/^\/b\/([A-Za-z0-9]+)(\/.*)?$/);
  if (invite) {
    const code = invite[1].toUpperCase();
    const after = invite[2] || "/";
    if (user && user.code === code) return go(after); // already joined: go straight there
    return showJoin(code, after);
  }

  if (path === "/register") return showRegister();
  if (!user) return showLanding();

  // Make sure this building's data is loaded before showing it
  if (store.currentCode !== user.code) {
    render(`<p class="empty">Loading…</p>`);
    const found = await store.openBuilding(user.code);
    if (!found) {
      logOut();
      toast("That building doesn't exist any more");
      return route();
    }
    if (currentPath() !== path) return; // you moved on while it was loading
  }

  if (path === "/new") return showNewComplaint();
  if (path === "/announce") return user.isAdmin ? showNewAnnouncement() : go("/");
  if (path === "/residents") return user.isAdmin ? showResidents() : go("/");
  if (path.startsWith("/c/")) return showComplaint(path.slice(3));
  showBoard();
}

// Called when the data changes (you or someone else posted something).
// Redraws the board or complaint page quietly, but never wipes a form you're typing in.
function refresh() {
  if (!user || store.currentCode !== user.code) return;
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
    logOut();
    go("/");
    route();
  };
}

// --- Landing page (not logged in) ---

function showLanding() {
  render(`
    <section class="landing-hero">
      <span class="eyebrow">For apartment buildings and housing societies</span>
      <h1>Your building's complaints, in one place</h1>
      <p>No more complaints lost in the WhatsApp group. Residents post problems, neighbours tap "Me too", and everyone can see when it's fixed.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-big" href="#/register">Register your apartment</a>
        <button class="btn btn-big" id="try-demo">Try the demo</button>
      </div>
    </section>

    <form class="card code-card" id="code-form">
      <label for="code">Got a building code from your admin?</label>
      <div class="code-row">
        <input id="code" required maxlength="8" placeholder="e.g. K7QM3P" autocomplete="off" autocapitalize="characters">
        <button class="btn btn-primary">Join</button>
      </div>
      <p class="small muted">Invite links from WhatsApp open your building directly.</p>
    </form>

    <div class="section-title">How it works</div>
    <div class="steps">
      <div class="card step appear" style="--i:0">
        <span class="step-num">1</span>
        <h2>Admin registers the building</h2>
        <p class="muted">The secretary or president uploads an Excel sheet of residents and their flat numbers.</p>
      </div>
      <div class="card step appear" style="--i:1">
        <span class="step-num">2</span>
        <h2>Residents join from WhatsApp</h2>
        <p class="muted">They tap the invite link and enter their flat number and name. Only people on the list get in.</p>
      </div>
      <div class="card step appear" style="--i:2">
        <span class="step-num">3</span>
        <h2>Every complaint gets tracked</h2>
        <p class="muted">Reported, in progress, resolved. Water and power cut notices stay pinned on top.</p>
      </div>
    </div>
  `);

  document.getElementById("code-form").onsubmit = (e) => {
    e.preventDefault();
    go("/b/" + document.getElementById("code").value.trim().toUpperCase());
  };

  document.getElementById("try-demo").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await store.ensureDemo();
      go("/b/" + store.DEMO_CODE);
    } catch (err) {
      console.error(err);
      toast("Couldn't open the demo. Check your internet.");
      e.target.disabled = false;
    }
  };
}

// --- Register a building (admin) ---

function showRegister() {
  let residents = null; // filled in once a sheet is read

  render(`
    <div class="page-head">
      <h1>Register your apartment</h1>
      <a href="#/">Cancel</a>
    </div>
    <form class="card" id="register-form">
      <div class="field">
        <label for="b-name">Apartment or society name</label>
        <input id="b-name" required maxlength="60" placeholder="e.g. Green Park Residency">
      </div>
      <div class="row">
        <div class="field">
          <label for="r-name">Your name</label>
          <input id="r-name" required maxlength="40" autocomplete="name">
        </div>
        <div class="field">
          <label for="r-flat">Your flat</label>
          <input id="r-flat" required maxlength="10" placeholder="e.g. A-101">
        </div>
      </div>
      <div class="field">
        <label for="r-pin">Admin PIN (4 to 8 digits)</label>
        <input id="r-pin" required type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8">
        <p class="hint">You'll use this to log in as admin. Don't share it.</p>
      </div>
      <div class="field">
        <label for="r-file">Residents list</label>
        <input id="r-file" type="file" accept=".xlsx,.xls,.csv">
        <p class="hint">An Excel or CSV sheet with a <strong>Name</strong> column and a <strong>Flat</strong> column, one row per resident.
          <a href="${sampleSheetUrl()}" download="flatdesk-residents-sample.csv">Download a sample sheet</a></p>
        <div id="sheet-result" aria-live="polite"></div>
      </div>
      <button class="btn btn-primary" id="create-btn">Create building</button>
    </form>
  `);

  const result = document.getElementById("sheet-result");

  document.getElementById("r-file").onchange = async (e) => {
    const file = e.target.files[0];
    residents = null;
    if (!file) return (result.innerHTML = "");
    result.innerHTML = `<p class="hint">Reading ${esc(file.name)}…</p>`;
    try {
      const sheet = await readResidentsFile(file);
      residents = sheet.residents;
      result.innerHTML = sheetPreview(sheet);
    } catch (err) {
      result.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  };

  document.getElementById("register-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!residents) {
      result.innerHTML = `<p class="form-error">Please add your residents list first.</p>`;
      document.getElementById("r-file").focus();
      return;
    }

    const name = document.getElementById("b-name").value.trim();
    const adminName = document.getElementById("r-name").value.trim();
    const adminFlat = document.getElementById("r-flat").value.trim().toUpperCase();
    const pin = document.getElementById("r-pin").value;

    // Make sure the admin is on the list too
    const list = [...residents];
    if (!list.some((r) => flatKey(r.flat) === flatKey(adminFlat))) list.push({ name: adminName, flat: adminFlat });

    const button = document.getElementById("create-btn");
    button.disabled = true;
    button.textContent = "Creating…";
    try {
      const b = await store.createBuilding(
        { name, adminName, adminFlat, residents: list, open: false, createdAt: Date.now() },
        pin
      );
      user = { code: b.code, buildingName: b.name, name: adminName, flat: adminFlat, isAdmin: true };
      saveUser();
      showRegistered(b);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't create the building");
      button.disabled = false;
      button.textContent = "Create building";
    }
  };
}

function sheetPreview({ residents, skipped }) {
  const flats = new Set(residents.map((r) => flatKey(r.flat))).size;
  return `
    <div class="sheet-ok appear">
      <p><strong>✓ Found ${residents.length} ${residents.length === 1 ? "resident" : "residents"} in ${flats} ${flats === 1 ? "flat" : "flats"}</strong>
        ${skipped ? `<span class="muted">(skipped ${skipped} ${skipped === 1 ? "row" : "rows"} with no name or flat)</span>` : ""}</p>
      <table class="mini-table">
        <thead><tr><th>Name</th><th>Flat</th></tr></thead>
        <tbody>
          ${residents.slice(0, 5).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.flat)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${residents.length > 5 ? `<p class="hint">…and ${residents.length - 5} more</p>` : ""}
    </div>
  `;
}

// Shown right after registering: the invite link to send to residents
function showRegistered(b) {
  drawTopbar();
  render(`
    <div class="card done-card">
      <div class="done-icon" aria-hidden="true">✓</div>
      <h1>${esc(b.name)} is on FlatDesk</h1>
      <p class="muted">Send this link to your building's WhatsApp group. Residents tap it and enter their flat number and name.</p>
      ${inviteBox(b)}
      <a class="btn btn-primary" href="#/" style="margin-top:20px">Go to your building's board</a>
    </div>
  `);
  bindInviteBox(b);
}

function inviteBox(b) {
  return `
    <div class="invite">
      <div class="invite-code">Building code <strong>${esc(b.code)}</strong></div>
      <div class="code-row">
        <input id="invite-link" readonly value="${esc(inviteLink(b.code))}">
        <button type="button" class="btn" id="copy-invite">Copy</button>
      </div>
      <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${whatsappLink(
        `🏢 ${b.name} now uses FlatDesk for complaints and notices.\n\nJoin here: ${inviteLink(b.code)}\nJust enter your flat number and name.`
      )}">Share on WhatsApp</a>
    </div>
  `;
}

function bindInviteBox(b) {
  document.getElementById("copy-invite").onclick = () => copyText(inviteLink(b.code));
  document.getElementById("invite-link").onfocus = (e) => e.target.select();
}

// --- Join a building (resident or admin) ---

async function showJoin(code, after) {
  render(`<p class="empty">Loading…</p>`);
  let b;
  try {
    b = await store.getBuilding(code);
  } catch (err) {
    console.error(err);
  }
  if (currentPath().indexOf("/b/") !== 0) return; // you moved on while it was loading
  if (!b) {
    render(`
      <div class="card empty">
        <h2>No building with code ${esc(code)}</h2>
        <p style="margin-top:8px">Check the code or the link your admin sent. <a href="#/">Back to the start</a></p>
      </div>
    `);
    return;
  }

  render(`
    <div class="hero">
      <span class="eyebrow">Joining</span>
      <h1>${esc(b.name)}</h1>
      <p>Enter your flat number and name as your building admin has them.</p>
    </div>
    <form class="card login" id="join-form">
      <div class="field">
        <label for="flat">Flat number</label>
        <input id="flat" required maxlength="10" placeholder="e.g. B-304">
      </div>
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" required maxlength="40" autocomplete="name">
      </div>
      <div class="field">
        <label class="check"><input type="checkbox" id="is-admin"> I'm the building admin</label>
      </div>
      <div class="field" id="pin-field" hidden>
        <label for="pin">Admin PIN</label>
        <input id="pin" type="password" inputmode="numeric" maxlength="8">
      </div>
      <p class="form-error" id="join-error" hidden></p>
      <button class="btn btn-primary" style="width:100%">Continue</button>
      ${b.open ? `<p class="demo-note">This is the demo building: any name and flat works. The admin PIN is <strong>1234</strong>.</p>` : ""}
    </form>
  `);

  const adminBox = document.getElementById("is-admin");
  const pinField = document.getElementById("pin-field");
  const pinInput = document.getElementById("pin");
  const errorBox = document.getElementById("join-error");
  adminBox.onchange = () => {
    pinField.hidden = !adminBox.checked;
    pinInput.required = adminBox.checked;
  };

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  document.getElementById("join-form").onsubmit = async (e) => {
    e.preventDefault();
    let name = document.getElementById("name").value.trim();
    let flat = document.getElementById("flat").value.trim().toUpperCase();
    const isAdmin = adminBox.checked;

    if (isAdmin) {
      if ((await store.hashPin(b.code, pinInput.value)) !== b.pinHash) return showError("Wrong admin PIN.");
    } else if (!b.open) {
      const check = checkResident(b.residents, name, flat);
      if (check.error) return showError(check.error);
      flat = check.resident.flat; // the flat as written on the list; the name stays as they typed it
    }

    user = { code: b.code, buildingName: b.name, name, flat, isAdmin };
    saveUser();
    toast("Welcome, " + name);
    go(after);
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
      <div>
        <div class="small muted">Building board</div>
        <h1>${esc(store.building.name)}</h1>
      </div>
      <a class="btn btn-primary" href="#/new">+ New complaint</a>
    </div>

    ${user.isAdmin ? `
      <div class="admin-bar">
        <span>Admin</span>
        <a class="btn btn-small" href="#/announce">+ Post announcement</a>
        <a class="btn btn-small" href="#/residents">Residents and invite link</a>
      </div>
    ` : ""}

    <div class="stats">
      <div class="card stat stat-reported appear" style="--i:0"><div class="stat-num">${count("reported")}</div><div class="small muted">Reported</div></div>
      <div class="card stat stat-progress appear" style="--i:1"><div class="stat-num">${count("progress")}</div><div class="small muted">In progress</div></div>
      <div class="card stat stat-resolved appear" style="--i:2"><div class="stat-num">${count("resolved")}</div><div class="small muted">Resolved</div></div>
    </div>

    <div class="section-title">Announcements</div>
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
      <a class="btn btn-small btn-whatsapp" style="margin-top:12px" href="${whatsappLink(shareAnnouncementText(a))}" target="_blank" rel="noopener">Share on WhatsApp</a>
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

// --- Residents list and invite link (admin only) ---

function showResidents() {
  const b = store.building;
  const residents = [...(b.residents || [])].sort((x, y) =>
    x.flat.localeCompare(y.flat, undefined, { numeric: true })
  );

  render(`
    <div class="page-head">
      <h1>Residents</h1>
      <a href="#/">← Board</a>
    </div>

    <div class="section-title" style="margin-top:0">Invite link</div>
    <div class="card">${inviteBox(b)}</div>

    <div class="section-title">${b.open ? "Demo building: anyone can join" : `${residents.length} people on the list`}</div>
    ${residents.length ? `
      <div class="card">
        <input id="r-search" placeholder="Search by name or flat" style="margin-bottom:12px">
        <table class="mini-table" id="r-table">
          <thead><tr><th>Name</th><th>Flat</th></tr></thead>
          <tbody>
            ${residents.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.flat)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    ` : ""}
  `);

  bindInviteBox(b);

  const search = document.getElementById("r-search");
  if (search) search.oninput = () => {
    const q = search.value.toLowerCase();
    document.querySelectorAll("#r-table tbody tr").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(q);
    });
  };
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
      <div id="similar" aria-live="polite"></div>
      <div class="field">
        <label for="desc">Details (optional)</label>
        <textarea id="desc" maxlength="500" placeholder="Where exactly, since when, anything else the admin should know"></textarea>
      </div>
      <button class="btn btn-primary">Post complaint</button>
    </form>
  `);

  const titleInput = document.getElementById("title");
  const categoryInput = document.getElementById("category");
  const showSimilar = () => drawSimilar(titleInput.value, categoryInput.value);
  titleInput.oninput = showSimilar;
  categoryInput.onchange = showSimilar;

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

// --- "Is it one of these?" duplicate check ---

// Common words that don't tell us what the problem is
const STOP_WORDS = new Set([
  "the", "and", "for", "not", "since", "from", "with", "near", "our", "has", "have", "are",
  "was", "this", "that", "there", "block", "floor", "flat", "today", "morning", "evening",
  "night", "working", "problem", "issue", "very", "again", "still", "please",
]);

// "Lights not working!" → ["light"]
function keywords(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

// Open complaints that share words with what's being typed. Same category counts extra.
function findSimilar(title, category) {
  const words = new Set(keywords(title));
  if (!words.size) return [];
  return data.complaints
    .filter((c) => c.status !== "resolved")
    .map((c) => {
      const shared = keywords(c.title + " " + c.desc).filter((w) => words.has(w));
      const score = new Set(shared).size + (c.category === category ? 1 : 0);
      return { c, score, shared: shared.length };
    })
    .filter((m) => m.shared && m.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.c);
}

function drawSimilar(title, category) {
  const box = document.getElementById("similar");
  const matches = findSimilar(title, category);
  if (!matches.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <div class="similar appear">
      <p class="similar-head">Is it one of these? Tap <strong>Me too</strong> instead of posting it again.</p>
      ${matches.map((c) => `
        <div class="similar-item">
          <div>
            <div class="similar-title">${esc(c.title)}</div>
            <div class="small muted">${STATUS[c.status]} · ${c.meToo.length + 1} ${c.meToo.length ? "flats" : "flat"} affected</div>
          </div>
          <button type="button" class="btn btn-small" data-same="${c.id}">Me too</button>
        </div>
      `).join("")}
    </div>
  `;

  box.querySelectorAll("[data-same]").forEach((btn) => {
    btn.onclick = () => {
      const c = data.complaints.find((x) => x.id === btn.dataset.same);
      if (!c.meToo.includes(userKey())) store.setMeToo(c, userKey(), true);
      toast("Added you to this complaint");
      go("/c/" + c.id);
    };
  });
}

// --- WhatsApp messages ---

function shareComplaintText(c) {
  const affected = c.meToo.length + 1;
  return [
    `🚨 ${c.title}`,
    `${STATUS[c.status]} · ${affected} ${affected === 1 ? "flat" : "flats"} affected`,
    "",
    `Same problem? Tap "Me too" here: ${pageLink("/b/" + user.code + "/c/" + c.id)}`,
  ].join("\n");
}

function shareAnnouncementText(a) {
  return [
    `📢 ${a.title}`,
    a.when ? `🕒 ${a.when}` : "",
    a.body,
    "",
    `More on FlatDesk: ${inviteLink(user.code)}`,
  ].filter((line, i) => line || i === 3).join("\n");
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

      <div class="actions">
        ${ownComplaint ? "" : `
          <button class="btn metoo${mine ? " on" : ""}" id="metoo" aria-pressed="${mine}">
            ${mine ? "✓ You have this too" : "Me too"} · <span class="metoo-count${bumpMeToo ? " bump" : ""}">${c.meToo.length}</span>
          </button>
        `}
        <a class="btn btn-whatsapp" href="${whatsappLink(shareComplaintText(c))}" target="_blank" rel="noopener">Share on WhatsApp</a>
      </div>
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
