// FlatDesk: complaint tracker and announcement board for apartment buildings.
// This file draws the screens. Other files do the rest:
//   store.js   saves the data (Firebase, or this browser)
//   roster.js  reads the admin's residents sheet and checks people against it
//   photo.js   shrinks photos for complaints and announcements
//   i18n.js    all on-screen text, in English and Hindi

import * as store from "./store.js";
import { checkResident, readResidentsFile, parsePastedList, RESIDENT_FILE_TYPES, sampleSheetUrl, flatKey, nameKey } from "./roster.js";
import { shrinkPhoto, isSafePhoto } from "./photo.js";
import { t, has, getLang, setLang, LANGUAGES } from "./i18n.js";

// ---------- Settings ----------

const CATEGORIES = ["Water", "Electricity", "Lift", "Plumbing", "Garbage", "Security", "Parking", "Other"];
const STATUSES = ["reported", "progress", "resolved"];

const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_DAYS = 3;       // complaints open this long turn red
const QUIET_ADMIN_DAYS = 2;   // no admin update for this long → "Needs attention"
const PIN_PATTERN = /^[0-9]{6,12}$/; // admin PINs: 6 to 12 digits

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
let editingId = null;    // the complaint you're editing, if any

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
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minsAgo", mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("hoursAgo", hours);
  return t("daysAgo", Math.round(hours / 24));
}

// 5 hours, 2.1 days...
function duration(ms) {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return t("hours", Math.max(1, Math.round(hours)));
  return t("days", (hours / 24).toFixed(1).replace(/\.0$/, ""));
}

function userKey() {
  return user.name + "|" + user.flat;
}

function statusPill(status) {
  return `<span class="pill status-${status}">${t("status." + status)}</span>`;
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
    () => toast(t("linkCopied")),
    () => toast(t("copyFailed"))
  );
}

// ---------- How long complaints have been waiting ----------

function daysOpen(c) {
  return Math.floor((Date.now() - c.createdAt) / DAY);
}

function isOverdue(c) {
  return c.status !== "resolved" && daysOpen(c) >= OVERDUE_DAYS;
}

function lastAdminUpdate(c) {
  const times = c.updates.filter((u) => u.admin).map((u) => u.at);
  return times.length ? Math.max(...times) : null;
}

// Open a long time, or the admin hasn't said anything for a while
function needsAttention(c) {
  if (c.status === "resolved") return false;
  const quietSince = lastAdminUpdate(c) ?? c.createdAt;
  return isOverdue(c) || Date.now() - quietSince >= QUIET_ADMIN_DAYS * DAY;
}

function attentionReason(c) {
  const last = lastAdminUpdate(c);
  if (!last) return t("noAdminUpdate");
  return t("noUpdateFor", Math.floor((Date.now() - last) / DAY));
}

// Average time from "posted" to "resolved"
function averageFixTime() {
  const times = data.complaints
    .filter((c) => c.status === "resolved" && !c.hidden)
    .map((c) => {
      const resolved = c.updates.filter((u) => u.status === "resolved").pop();
      return resolved ? resolved.at - c.createdAt : 0;
    })
    .filter((ms) => ms > 0);
  if (!times.length) return null;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

function overdueBadge(c) {
  return isOverdue(c) ? `<span class="pill overdue">${t("openDays", daysOpen(c))}</span>` : "";
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
  const recover = path.match(/^\/recover\/([A-Za-z0-9]+)$/);
  if (recover) return showRecover(recover[1].toUpperCase());
  if (!user) return showLanding();

  // Make sure this building's data is loaded before showing it
  if (store.currentCode !== user.code) {
    render(skeleton());
    const found = await store.openBuilding(user.code);
    if (!found) {
      logOut();
      toast(t("buildingGone"));
      return route();
    }
    if (currentPath() !== path) return; // you moved on while it was loading
  }
  if (!stillOnList()) return;

  if (path === "/new") return showNewComplaint();
  if (path === "/announce") return user.isAdmin ? showNewAnnouncement() : go("/");
  if (path === "/residents") return user.isAdmin ? showResidents() : go("/");
  if (path === "/account") return user.isAdmin ? go("/") : showAccount();
  if (path.startsWith("/c/")) return showComplaint(path.slice(3));
  showBoard();
}

// If the admin removed you from the residents list, you're logged out
function stillOnList() {
  const b = store.building;
  if (user.isAdmin || b.open || !checkResident(b.residents, user.name, user.flat).error) return true;
  logOut();
  toast(t("removedFromList"));
  go("/");
  route();
  return false;
}

// Called when the data changes (you or someone else posted something).
// Redraws the board, complaint or residents page quietly, but never wipes a form you're typing in.
function refresh() {
  if (!user || store.currentCode !== user.code || !stillOnList()) return;
  const path = currentPath();
  const typing = [...app.querySelectorAll("input:not([type=file]):not([readonly]), textarea")].some((el) => el.value);
  if (path === "/") showBoard(true);
  else if (path.startsWith("/c/") && !typing) showComplaint(path.slice(3), true);
  else if (path === "/residents") showResidents(true); // keeps what you've typed, see showResidents
}

// live = true means "same screen, new data": skip the slide-in animation and keep the scroll position
function render(html, live = false) {
  app.innerHTML = `<div class="${live ? "live" : "screen"}">${html}</div>`;
  if (!live) window.scrollTo(0, 0);
}

function drawTopbar() {
  const who = document.getElementById("who");
  who.innerHTML = `
    <button class="btn btn-small" id="lang" lang="${LANGUAGES[getLang()].next}">${LANGUAGES[getLang()].switchLabel}</button>
    ${user ? `
      ${user.isAdmin
        ? `<span class="who-name">${esc(user.name)} · ${esc(user.flat)}</span>`
        : `<a class="who-name who-link" href="#/account" title="${t("yourAccount")}">${esc(user.name)} · ${esc(user.flat)}</a>`}
      ${user.isAdmin ? `<span class="role-pill">${t("admin")}</span>` : ""}
      <button class="btn btn-small" id="logout">${t("logOut")}</button>
    ` : ""}
  `;

  // Admins get a purple look and a strip saying they're in admin view, so it's obvious which is which
  const isAdmin = Boolean(user && user.isAdmin);
  document.body.classList.toggle("admin-mode", isAdmin);
  const banner = document.getElementById("mode-banner");
  banner.hidden = !isAdmin;
  if (isAdmin) banner.textContent = t("adminView", user.buildingName);

  document.getElementById("lang").onclick = () => {
    setLang(LANGUAGES[getLang()].next);
    route(); // draw the same screen again in the new language
  };

  const logout = document.getElementById("logout");
  if (logout) logout.onclick = () => {
    logOut();
    go("/");
    route();
  };
}

// --- Landing page (not logged in) ---

function showLanding() {
  render(`
    <section class="landing-hero">
      <span class="eyebrow">${t("eyebrow")}</span>
      <h1>${t("heroTitle")}</h1>
      <p>${t("heroText")}</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-big" href="#/register">${t("registerApartment")}</a>
        <button class="btn btn-big" id="try-demo">${t("tryDemo")}</button>
      </div>
    </section>

    <form class="card code-card" id="code-form">
      <label for="code">${t("haveCode")}</label>
      <div class="code-row">
        <input id="code" required maxlength="8" placeholder="K7QM3P" autocomplete="off" autocapitalize="characters">
        <button class="btn btn-primary">${t("join")}</button>
      </div>
      <p class="small muted">${t("inviteOpensDirectly")}</p>
    </form>

    <div class="section-title">${t("howItWorks")}</div>
    <div class="steps">
      ${[1, 2, 3].map((n, i) => `
        <div class="card step appear" style="--i:${i}">
          <span class="step-num">${n}</span>
          <h2>${t("step" + n + "Title")}</h2>
          <p class="muted">${t("step" + n + "Text")}</p>
        </div>
      `).join("")}
    </div>
  `);

  document.getElementById("code-form").onsubmit = (e) => {
    e.preventDefault();
    go("/b/" + document.getElementById("code").value.trim().toUpperCase());
  };

  document.getElementById("try-demo").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const demo = await store.createDemo(); // a fresh demo building just for this visitor
      go("/b/" + demo.code);
    } catch (err) {
      console.error(err);
      toast(t("demoFailed"));
      e.target.disabled = false;
    }
  };
}

// --- Register a building (admin) ---

// Turns a sheet-reading problem into a message in the current language
function sheetError(err) {
  return has(err.message) ? t(err.message) : t("sheetUnreadable");
}

function showRegister() {
  let residents = null; // filled in once a sheet is read

  render(`
    <div class="page-head">
      <h1>${t("registerApartment")}</h1>
      <a href="#/">${t("cancel")}</a>
    </div>
    <form class="card" id="register-form">
      <div class="field">
        <label for="b-name">${t("buildingName")}</label>
        <input id="b-name" required maxlength="60" placeholder="${t("buildingNameEg")}">
      </div>
      <div class="row">
        <div class="field">
          <label for="r-name">${t("yourName")}</label>
          <input id="r-name" required maxlength="40" autocomplete="name">
        </div>
        <div class="field">
          <label for="r-flat">${t("yourFlat")}</label>
          <input id="r-flat" required maxlength="10" placeholder="${t("flatEg")}">
        </div>
      </div>
      <div class="field">
        <label for="r-pin">${t("adminPinNew")}</label>
        <input id="r-pin" required type="password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12">
        <p class="hint">${t("adminPinHint")}</p>
      </div>
      <div class="field">
        <label for="r-email">${t("recoveryEmail")}</label>
        <input id="r-email" required type="email" maxlength="100" autocomplete="email" placeholder="name@example.com">
        <p class="hint">${t("recoveryEmailHint")}</p>
      </div>
      ${photoField(t("buildingPhoto"), t("buildingPhotoHint"))}
      <div class="field">
        <label for="r-file">${t("residentsList")}</label>
        <input id="r-file" type="file" accept="${RESIDENT_FILE_TYPES}">
        <p class="hint">${t("residentsListHint")}
          <a href="${sampleSheetUrl()}" download="flatdesk-residents-sample.csv">${t("sampleSheet")}</a></p>
        ${pasteBox("r-paste")}
        <div id="sheet-result" aria-live="polite"></div>
      </div>
      <p class="form-error" id="register-error" hidden></p>
      <button class="btn btn-primary" id="create-btn">${t("createBuilding")}</button>
    </form>
  `);

  let photo = null;
  bindPhotoField(document.getElementById("create-btn"), (p) => (photo = p));

  const result = document.getElementById("sheet-result");
  const errorBox = document.getElementById("register-error");
  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const fileInput = document.getElementById("r-file");
  const pasteInput = document.getElementById("r-paste");

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    residents = null;
    if (!file) return (result.innerHTML = "");
    pasteInput.value = ""; // use one or the other
    result.innerHTML = `<p class="hint">${esc(t("reading", file.name))}</p>`;
    try {
      const sheet = await readResidentsFile(file);
      residents = sheet.residents;
      result.innerHTML = sheetPreview(sheet);
    } catch (err) {
      result.innerHTML = `<p class="form-error">${esc(sheetError(err))}</p>`;
    }
  };

  // The preview updates as they paste or type
  pasteInput.oninput = () => {
    residents = null;
    fileInput.value = "";
    if (!pasteInput.value.trim()) return (result.innerHTML = "");
    try {
      const list = parsePastedList(pasteInput.value);
      residents = list.residents;
      result.innerHTML = sheetPreview(list);
    } catch (err) {
      result.innerHTML = `<p class="form-error">${esc(t("pasteNoRows"))}</p>`;
    }
  };

  document.getElementById("register-form").onsubmit = async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    if (!photo) {
      showError(t("addBuildingPhoto"));
      document.getElementById("photo-input").focus();
      return;
    }
    if (!residents) {
      result.innerHTML = `<p class="form-error">${t("addListFirst")}</p>`;
      document.getElementById("r-file").focus();
      return;
    }

    const name = document.getElementById("b-name").value.trim();
    const adminName = document.getElementById("r-name").value.trim();
    const adminFlat = document.getElementById("r-flat").value.trim().toUpperCase();
    const pin = document.getElementById("r-pin").value;
    const email = document.getElementById("r-email").value.trim().toLowerCase();

    // Make sure the admin is on the list too
    const list = [...residents];
    if (!list.some((r) => flatKey(r.flat) === flatKey(adminFlat))) list.push({ name: adminName, flat: adminFlat });

    const button = document.getElementById("create-btn");
    button.disabled = true;
    button.textContent = t("creating");
    try {
      const b = await store.createBuilding(
        { name, adminName, adminFlat, photo, residents: list, open: false, createdAt: Date.now() },
        pin,
        email
      );
      const session = await store.adminLogin(b, pin);
      rememberRecoveryEmail(b.code, email);
      user = { code: b.code, buildingName: b.name, name: adminName, flat: adminFlat, isAdmin: true, session };
      saveUser();
      showRegistered(b);
    } catch (err) {
      console.error(err);
      // Firebase explains email problems with codes like "auth/invalid-email"
      const emailProblems = {
        "auth/invalid-email": "badEmail",
        "auth/operation-not-allowed": "emailSetupOff",
        "auth/too-many-requests": "tooManyTries",
        "auth/network-request-failed": "saveFailed",
      };
      showError(t(emailProblems[err.code] || "createFailed"));
      button.disabled = false;
      button.textContent = t("createBuilding");
    }
  };
}

// "No sheet? Paste the list instead", opens a text box
function pasteBox(id) {
  return `
    <details class="paste-box">
      <summary>${t("pasteInstead")}</summary>
      <p class="hint">${t("pasteHint")}</p>
      <textarea id="${id}" rows="6" placeholder="A-101 Nivash&#10;B-304 - Priya Sharma&#10;Ravi Kumar, C-12"></textarea>
    </details>
  `;
}

function sheetPreview({ residents, skipped }) {
  const flats = new Set(residents.map((r) => flatKey(r.flat))).size;
  return `
    <div class="sheet-ok appear">
      <p><strong>${t("foundResidents", residents.length, flats)}</strong>
        ${skipped ? `<span class="muted">${t("skippedRows", skipped)}</span>` : ""}</p>
      <table class="mini-table">
        <thead><tr><th>${t("name")}</th><th>${t("flat")}</th></tr></thead>
        <tbody>
          ${residents.slice(0, 5).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.flat)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${residents.length > 5 ? `<p class="hint">${t("andMore", residents.length - 5)}</p>` : ""}
    </div>
  `;
}

// Shown right after registering: the invite link to send to residents
function showRegistered(b) {
  drawTopbar();
  render(`
    <div class="card done-card">
      <div class="done-icon" aria-hidden="true">✓</div>
      <h1>${esc(t("isOnFlatDesk", b.name))}</h1>
      <p class="muted">${t("sendLinkText")}</p>
      ${inviteBox(b)}
      <a class="btn btn-primary" href="#/" style="margin-top:20px">${t("goToBoard")}</a>
    </div>
  `);
  bindInviteBox(b);
}

function inviteBox(b) {
  return `
    <div class="invite">
      <div class="invite-code">${t("buildingCode")} <strong>${esc(b.code)}</strong></div>
      <div class="code-row">
        <input id="invite-link" readonly value="${esc(inviteLink(b.code))}">
        <button type="button" class="btn" id="copy-invite">${t("copy")}</button>
      </div>
      <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${whatsappLink(t("inviteMessage", b.name, inviteLink(b.code)))}">${t("shareWhatsApp")}</a>
    </div>
  `;
}

function bindInviteBox(b) {
  document.getElementById("copy-invite").onclick = () => copyText(inviteLink(b.code));
  document.getElementById("invite-link").onfocus = (e) => e.target.select();
}

// --- Join a building (resident or admin) ---

// This device remembers the admin's recovery email for each building it registered or recovered,
// so a PIN changed from the recovery email works at the normal admin login straight away
const RECOVERY_KEY = "flatdesk-recovery";

function rememberedRecoveryEmail(code) {
  try {
    return (JSON.parse(localStorage.getItem(RECOVERY_KEY)) || {})[code] || "";
  } catch (e) {
    return "";
  }
}

function rememberRecoveryEmail(code, email) {
  try {
    const saved = JSON.parse(localStorage.getItem(RECOVERY_KEY)) || {};
    saved[code] = email;
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(saved));
  } catch (e) {}
}

// Which resident this is, for passwords: their flat + the name on the list
function memberId(name, flat) {
  return flatKey(flat) + "_" + nameKey(name).replace(/\s+/g, "-");
}

async function showJoin(code, after) {
  render(skeleton());
  let b;
  try {
    if (code === "DEMO") {
      // Old shared demo link: make a fresh personal demo instead
      const demo = await store.createDemo();
      return location.replace("#/b/" + demo.code);
    }
    b = await store.getBuilding(code);
  } catch (err) {
    console.error(err);
  }
  if (currentPath().indexOf("/b/") !== 0) return; // you moved on while it was loading
  if (!b) {
    render(`
      <div class="card empty">
        <h2>${esc(t("noBuilding", code))}</h2>
        <p style="margin-top:8px">${t("checkCode")} <a href="#/">${t("backToStart")}</a></p>
      </div>
    `);
    return;
  }

  render(`
    ${isSafePhoto(b.photo) ? `<img class="building-photo join-photo" src="${b.photo}" alt="${esc(b.name)}">` : ""}
    <div class="hero">
      <span class="eyebrow">${t("joining")}</span>
      <h1>${esc(b.name)}</h1>
      <p>${t("joinText")}</p>
    </div>
    <form class="card login" id="join-form">
      <div class="field">
        <label for="flat">${t("flatNumber")}</label>
        <input id="flat" required maxlength="10" placeholder="${t("flatEg2")}">
      </div>
      <div class="field">
        <label for="name">${t("yourName")}</label>
        <input id="name" required maxlength="40" autocomplete="name">
      </div>
      <div class="field" id="password-field" hidden>
        <label for="password">${t("password")}</label>
        <input id="password" type="password" maxlength="40" autocomplete="current-password">
        <p class="hint">${t("forgotPasswordHint")}</p>
      </div>
      <div class="field">
        <label class="check"><input type="checkbox" id="is-admin"> ${t("iAmAdmin")}</label>
      </div>
      <div class="field" id="pin-field" hidden>
        <label for="pin">${t("adminPin")}</label>
        <input id="pin" type="password" inputmode="numeric" maxlength="12">
        ${b.open ? "" : `<p class="hint"><a href="#/recover/${esc(b.code)}">${t("forgotPin")}</a></p>`}
      </div>
      <div class="field" id="rec-field" hidden>
        <label for="rec-email-login">${t("recoveryEmail")}</label>
        <input id="rec-email-login" type="email" autocomplete="email">
        <p class="hint">${t("changedPinByEmailHint")}</p>
      </div>
      <p class="form-error" id="join-error" hidden></p>
      <button class="btn btn-primary" id="join-btn" style="width:100%">${t("continue")}</button>
      ${b.open ? `<p class="demo-note">${t("demoNote")}</p>` : ""}
    </form>
  `);

  const adminBox = document.getElementById("is-admin");
  const pinField = document.getElementById("pin-field");
  const pinInput = document.getElementById("pin");
  const passwordField = document.getElementById("password-field");
  const passwordInput = document.getElementById("password");
  const errorBox = document.getElementById("join-error");
  const joinBtn = document.getElementById("join-btn");
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
    errorBox.hidden = true;
    const name = document.getElementById("name").value.trim();
    let flat = document.getElementById("flat").value.trim().toUpperCase();
    const isAdmin = adminBox.checked;
    let session = null;
    let member = null;
    const usedPassword = !passwordField.hidden && passwordInput.value;

    joinBtn.disabled = true;
    try {
      if (isAdmin) {
        const pin = pinInput.value;
        session = await store.adminLogin(b, pin);
        if (!session && !b.open && !b.pinHash) {
          // Maybe they just set this PIN on the recovery email's page: finish that now
          const recField = document.getElementById("rec-field");
          const email = document.getElementById("rec-email-login").value.trim().toLowerCase() || rememberedRecoveryEmail(b.code);
          if (email && PIN_PATTERN.test(pin)) {
            try {
              await store.recoverPin(b.code, email, pin);
              session = await store.adminLogin(b, pin);
              rememberRecoveryEmail(b.code, email);
            } catch (err) {
              console.error(err);
            }
          }
          if (!session && recField.hidden) {
            recField.hidden = false; // ask for the recovery email next time
            return showError(t("wrongPinOrEmail"));
          }
        }
        if (!session) return showError(t("wrongPin"));
      } else {
        let listedName = name;
        if (!b.open) {
          const check = checkResident(b.residents, name, flat);
          if (check.error) return showError(t(check.error, check.flat));
          flat = check.resident.flat; // the flat as written on the list; the name stays as they typed it
          listedName = check.resident.name;
        }
        member = memberId(listedName, flat);
        const result = await store.residentLogin(b.code, member, usedPassword || null);
        if (result === "needPassword") {
          // This resident added a password: ask for it
          passwordField.hidden = false;
          passwordInput.required = true;
          passwordInput.focus();
          return showError(t("needPassword"));
        }
        if (result === "wrong") return showError(t("wrongPassword"));
      }
    } catch (err) {
      console.error(err);
      return showError(t("saveFailed"));
    } finally {
      joinBtn.disabled = false;
    }

    user = { code: b.code, buildingName: b.name, name, flat, isAdmin, session, member, hasPassword: Boolean(usedPassword) };
    saveUser();
    toast(t("welcome", name));
    go(after);
  };
}

// --- Forgot admin PIN: recovery by email ---

async function showRecover(code) {
  render(skeleton());
  let b = null;
  try {
    b = await store.getBuilding(code);
  } catch (err) {
    console.error(err);
  }
  if (!b || b.open) {
    render(`<div class="card empty"><h2>${esc(t("noBuilding", code))}</h2><p style="margin-top:8px"><a href="#/">${t("backToStart")}</a></p></div>`);
    return;
  }

  render(`
    <div class="page-head">
      <div>
        <div class="small muted">${esc(b.name)}</div>
        <h1>${t("forgotPinTitle")}</h1>
      </div>
      <a href="#/b/${esc(code)}">${t("cancel")}</a>
    </div>

    <div class="section-title" style="margin-top:0">${t("recoverStep1")}</div>
    <form class="card" id="send-form">
      <p class="muted" style="margin-bottom:14px">${t("recoverStep1Text")}</p>
      <div class="field">
        <label for="rec-email">${t("recoveryEmail")}</label>
        <input id="rec-email" required type="email" autocomplete="email">
      </div>
      <p class="form-ok" id="send-ok" hidden>${t("recoverySent")}</p>
      <button class="btn btn-primary">${t("sendLink")}</button>
    </form>

    <div class="section-title">${t("recoverStep2")}</div>
    <form class="card" id="signin-form">
      <p class="muted" style="margin-bottom:14px">${t("recoverStep2Text")}</p>
      <div class="field">
        <label for="rec-email2">${t("recoveryEmail")}</label>
        <input id="rec-email2" required type="email" autocomplete="email">
      </div>
      <div class="field">
        <label for="rec-pin">${t("newPinFromEmail")}</label>
        <input id="rec-pin" required type="password" inputmode="numeric" autocomplete="new-password" maxlength="12">
      </div>
      <p class="form-error" id="signin-error" hidden></p>
      <button class="btn btn-primary">${t("saveNewPin")}</button>
    </form>
  `);

  document.getElementById("send-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("rec-email").value.trim().toLowerCase();
    try {
      await store.sendRecoveryEmail(email, inviteLink(code));
      rememberRecoveryEmail(code, email);
    } catch (err) {
      console.error(err); // don't say whether the email exists; just show the same message
    }
    document.getElementById("send-ok").hidden = false;
    document.getElementById("rec-email2").value = email;
  };

  document.getElementById("signin-form").onsubmit = async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("signin-error");
    const showError = (key) => {
      errorBox.textContent = t(key);
      errorBox.hidden = false;
    };
    errorBox.hidden = true;
    const email = document.getElementById("rec-email2").value.trim().toLowerCase();
    const pin = document.getElementById("rec-pin").value;
    // What they typed on the email's page must be a proper PIN
    if (!PIN_PATTERN.test(pin)) return showError("pinMustBeDigits");
    try {
      await store.recoverPin(code, email, pin);
      rememberRecoveryEmail(code, email);
      // PIN saved: log them straight in as admin
      const session = await store.adminLogin(b, pin);
      user = { code: b.code, buildingName: b.name, name: b.adminName || t("admin"), flat: b.adminFlat || "", isAdmin: true, session };
      saveUser();
      toast(t("pinChanged"));
      go("/");
    } catch (err) {
      console.error(err);
      showError(has(err.message) ? err.message : "saveFailed");
    }
  };
}

// --- Your account (residents): add or change a password ---

function showAccount() {
  render(`
    <div class="page-head">
      <h1>${t("yourAccount")}</h1>
      <a href="#/">${t("backToBoard")}</a>
    </div>
    <div class="card">
      <div class="small muted">${esc(store.building.name)}</div>
      <h2>${esc(user.name)} · ${esc(user.flat)}</h2>
    </div>

    <div class="section-title">${t("password")}</div>
    <form class="card" id="password-form">
      <p class="muted" style="margin-bottom:14px">${user.hasPassword ? t("hasPasswordText") : t("addPasswordText")}</p>
      ${user.hasPassword ? `
        <div class="field">
          <label for="current-password">${t("currentPassword")}</label>
          <input id="current-password" type="password" required maxlength="40" autocomplete="current-password">
        </div>
      ` : ""}
      <div class="field">
        <label for="new-password">${t("newPassword")}</label>
        <input id="new-password" type="password" required minlength="4" maxlength="40" autocomplete="new-password">
        <p class="hint">${t("passwordHint")}</p>
      </div>
      <p class="form-error" id="password-error" hidden></p>
      <button class="btn btn-primary">${user.hasPassword ? t("changePassword") : t("addPassword")}</button>
    </form>
  `);

  document.getElementById("password-form").onsubmit = async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById("password-error");
    errorBox.hidden = true;
    const current = document.getElementById("current-password")?.value || null;
    const next = document.getElementById("new-password").value;
    const member = user.member || memberId(user.name, user.flat);
    try {
      const ok = await store.setPassword(user.code, member, next, current);
      if (!ok) {
        errorBox.textContent = user.hasPassword ? t("wrongPassword") : t("passwordAlreadySet");
        errorBox.hidden = false;
        return;
      }
      user.member = member;
      user.hasPassword = true;
      saveUser();
      toast(t("passwordSaved"));
      go("/");
    } catch (err) {
      console.error(err);
      toast(t("saveFailed"));
    }
  };
}

// --- Board (home screen) ---

function showBoard(live = false) {
  const all = data.complaints.filter((c) => !c.hidden); // hidden ones only show in the admin's "Hidden" filter
  const hidden = data.complaints.filter((c) => c.hidden);
  const count = (s) => all.filter((c) => c.status === s).length;
  const fixTime = averageFixTime();
  if (filter === "hidden" && (!user.isAdmin || !hidden.length)) filter = "all";

  // Unresolved first, then the ones with the most "me too", then newest
  const shown = (filter === "hidden" ? hidden : all)
    .filter((c) => filter === "all" || filter === "hidden" || c.status === filter)
    .sort((a, b) =>
      (a.status === "resolved") - (b.status === "resolved") ||
      b.meToo.length - a.meToo.length ||
      b.createdAt - a.createdAt
    );

  // Admin's to-do list: oldest first
  const attention = user.isAdmin
    ? all.filter(needsAttention).sort((a, b) => a.createdAt - b.createdAt)
    : [];

  const announcements = [...data.announcements].sort((a, b) => b.createdAt - a.createdAt);
  const isEmpty = !data.complaints.length && !announcements.length; // a brand new building (hidden ones count)

  render(`
    ${isSafePhoto(store.building.photo) ? `<img class="building-photo" src="${store.building.photo}" alt="${esc(store.building.name)}">` : ""}
    <div class="page-head">
      <div>
        <div class="small muted">${t("buildingBoard")}</div>
        <h1>${esc(store.building.name)}</h1>
      </div>
      <a class="btn btn-primary" href="#/new">${t("newComplaint")}</a>
    </div>

    ${user.isAdmin ? `
      <div class="admin-bar">
        <span>${t("admin")}</span>
        <a class="btn btn-small" href="#/announce">${t("postAnnouncementBtn")}</a>
        <a class="btn btn-small" href="#/residents">${t("residentsAndInvite")}</a>
      </div>
    ` : ""}

    ${isEmpty ? welcomeCard() : `
    <div class="stats">
      ${STATUSES.map((s, i) => `
        <div class="card stat stat-${s} appear" style="--i:${i}"><div class="stat-num">${count(s)}</div><div class="small muted">${t("status." + s)}</div></div>
      `).join("")}
      <div class="card stat stat-time appear" style="--i:3"><div class="stat-num">${fixTime ? duration(fixTime) : "—"}</div><div class="small muted">${t("avgFixTime")}</div></div>
    </div>

    ${attention.length ? `
      <div class="section-title attention-title">${t("needsAttention")} (${attention.length})</div>
      <p class="hint" style="margin:-6px 0 10px">${t("needsAttentionHint")}</p>
      <div class="stack">
        ${attention.map((c, i) => `
          <a class="card card-link attention appear" style="--i:${i}" href="#/c/${c.id}">
            <div class="complaint-top">
              <h2>${esc(c.title)}</h2>
              ${statusPill(c.status)}
            </div>
            <div class="complaint-meta">
              ${overdueBadge(c)}
              <span>${attentionReason(c)}</span>
              <span>·</span>
              <span>${esc(c.flat)}</span>
            </div>
          </a>
        `).join("")}
      </div>
    ` : ""}

    <div class="section-title">${t("announcements")}</div>
    <div class="stack">
      ${announcements.length ? announcements.map(announcementCard).join("") : `<div class="card empty">${t("noAnnouncements")}</div>`}
    </div>

    <div class="section-title">${t("complaints")}</div>
    <div class="chips" role="group" aria-label="${t("complaints")}">
      ${chip("all", t("all") + " (" + all.length + ")")}
      ${STATUSES.map((s) => chip(s, t("status." + s))).join("")}
      ${user.isAdmin && hidden.length ? chip("hidden", t("hiddenChip", hidden.length)) : ""}
    </div>
    <div class="stack">
      ${shown.length ? shown.map(complaintCard).join("") : `<div class="card empty">${t("nothingHere")}</div>`}
    </div>
    `}
  `, live);

  app.querySelectorAll(".chip").forEach((btn) => {
    btn.onclick = () => {
      filter = btn.dataset.filter;
      showBoard();
    };
  });

  app.querySelectorAll("[data-photo]").forEach((btn) => {
    btn.onclick = () => openPhoto(data.announcements.find((a) => a.id === btn.dataset.photo).photo);
  });

  app.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.onclick = () => {
      store.removeAnnouncement(btn.dataset.remove);
      toast(t("announcementRemoved"));
    };
  });
}

// Shown instead of an empty board, with what to do first
function welcomeCard() {
  if (user.isAdmin) {
    return `
      <div class="card welcome appear">
        <h2>${t("welcomeAdminTitle")}</h2>
        <p class="muted">${t("welcomeAdminText")}</p>
        <ol class="welcome-steps">
          <li>${t("tipShare")}</li>
          <li>${t("tipAnnounce")}</li>
          <li>${t("tipResidents")}</li>
        </ol>
        <div class="actions">
          <a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${whatsappLink(t("inviteMessage", store.building.name, inviteLink(user.code)))}">${t("shareInvite")}</a>
          <a class="btn" href="#/announce">${t("postAnnouncementBtn")}</a>
        </div>
      </div>
    `;
  }
  return `
    <div class="card welcome appear">
      <h2>${esc(t("welcomeResidentTitle", store.building.name))}</h2>
      <p class="muted">${t("welcomeResidentText")}</p>
      <div class="actions">
        <a class="btn btn-primary" href="#/new">${t("postFirst")}</a>
      </div>
    </div>
  `;
}

// Grey placeholder cards while a building loads
function skeleton() {
  return `
    <div class="skeleton-wrap" role="status">
      <span class="visually-hidden">${t("loading")}</span>
      <div class="skeleton" style="width:40%;height:28px"></div>
      <div class="skeleton" style="height:84px"></div>
      <div class="skeleton" style="height:84px"></div>
      <div class="skeleton" style="height:84px"></div>
    </div>
  `;
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
        ${user.isAdmin ? `<button class="btn btn-small" data-remove="${a.id}">${t("remove")}</button>` : ""}
      </div>
      ${a.when ? `<div class="announce-when">${esc(a.when)}</div>` : ""}
      ${a.body ? `<p style="margin-top:6px">${esc(a.body)}</p>` : ""}
      ${isSafePhoto(a.photo) ? `
        <button class="photo-full" data-photo="${a.id}" aria-label="${t("photoAlt")}">
          <img src="${a.photo}" alt="${t("photoAlt")}" loading="lazy">
        </button>
      ` : ""}
      <a class="btn btn-small btn-whatsapp" style="margin-top:12px" href="${whatsappLink(shareAnnouncementText(a))}" target="_blank" rel="noopener">${t("shareWhatsApp")}</a>
    </div>
  `;
}

function complaintCard(c, i) {
  const photo = isSafePhoto(c.photo) ? `<img class="thumb" src="${c.photo}" alt="${t("hasPhoto")}" loading="lazy">` : "";
  return `
    <a class="card card-link complaint-card appear" style="--i:${i}" href="#/c/${c.id}">
      <div class="complaint-main">
        <div class="complaint-top">
          <h2>${esc(c.title)}</h2>
          ${statusPill(c.status)}
        </div>
        <div class="complaint-meta">
          ${c.hidden ? `<span class="pill pill-hidden">${t("hiddenLabel")}</span>` : ""}
          <span class="pill pill-cat">${t("cat." + c.category)}</span>
          ${overdueBadge(c)}
          <span>${esc(c.flat)}</span>
          <span>·</span>
          <span>${timeAgo(c.createdAt)}</span>
          ${c.meToo.length ? `<span>·</span><span>${t("othersAffected", c.meToo.length)}</span>` : ""}
        </div>
      </div>
      ${photo}
    </a>
  `;
}

// --- Residents list and invite link (admin only) ---

function showResidents(live = false) {
  const b = store.building;
  // When redrawing with new data, keep whatever the admin has typed in the boxes
  const kept = {};
  if (live) ["add-name", "add-flat", "add-paste", "r-search"].forEach((id) => (kept[id] = document.getElementById(id)?.value || ""));

  const residents = [...(b.residents || [])].sort((x, y) =>
    x.flat.localeCompare(y.flat, undefined, { numeric: true }) || x.name.localeCompare(y.name)
  );

  render(`
    <div class="page-head">
      <h1>${t("residents")}</h1>
      <a href="#/">${t("backToBoard")}</a>
    </div>

    <div class="section-title" style="margin-top:0">${t("inviteLink")}</div>
    <div class="card">${inviteBox(b)}</div>

    ${b.open ? `<div class="section-title">${t("demoAnyone")}</div>` : `
      <div class="section-title">${t("addResident")}</div>
      <form class="card" id="add-form">
        <div class="add-row">
          <input id="add-name" required maxlength="40" placeholder="${t("name")}" aria-label="${t("name")}">
          <input id="add-flat" required maxlength="10" placeholder="${t("flat")}" aria-label="${t("flat")}">
          <button class="btn btn-primary">${t("add")}</button>
        </div>
        <label for="add-file" class="hint" style="margin-top:14px;font-weight:500">${t("addFromSheet")}</label>
        <input id="add-file" type="file" accept="${RESIDENT_FILE_TYPES}">
        ${pasteBox("add-paste")}
        <button type="button" class="btn btn-small" id="add-pasted" style="margin-top:8px">${t("addPasted")}</button>
      </form>

      <div class="section-title">${t("peopleOnList", residents.length)}</div>
      <div class="card">
        <input id="r-search" placeholder="${t("searchResidents")}" style="margin-bottom:12px">
        <table class="mini-table" id="r-table">
          <thead><tr><th>${t("name")}</th><th>${t("flat")}</th><th><span class="visually-hidden">${t("remove")}</span></th></tr></thead>
          <tbody>
            ${residents.map((r, i) => `
              <tr>
                <td>${esc(r.name)}</td>
                <td>${esc(r.flat)}</td>
                <td class="row-actions">
                  ${canResetPasswords() ? `<button class="btn btn-small" data-reset="${i}">${t("resetPassword")}</button>` : ""}
                  <button class="btn btn-small btn-danger" data-resident="${i}">${t("remove")}</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `}
  `, live);

  bindInviteBox(b);
  if (b.open) return;
  Object.entries(kept).forEach(([id, value]) => (document.getElementById(id).value = value));

  // Add one person
  document.getElementById("add-form").onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("add-name").value.trim();
    const flat = document.getElementById("add-flat").value.trim().toUpperCase();
    if (isOnList(residents, name, flat)) return toast(t("alreadyOnList"));
    document.getElementById("add-name").value = "";
    document.getElementById("add-flat").value = "";
    store.addResidents([{ name, flat }]);
    toast(t("added", 1));
  };

  // Add everyone from another sheet or a pasted list (people already on the list are skipped)
  const addMany = (people) => {
    const fresh = people.filter((r) => !isOnList(residents, r.name, r.flat));
    if (fresh.length) store.addResidents(fresh);
    toast(fresh.length ? t("added", fresh.length) : t("alreadyOnList"));
  };

  document.getElementById("add-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      addMany((await readResidentsFile(file)).residents);
    } catch (err) {
      toast(sheetError(err));
    }
    e.target.value = "";
  };

  // A resident forgot their password: remove it, so they can log in with name + flat and set a new one
  app.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.onclick = async () => {
      const r = residents[btn.dataset.reset];
      if (!confirm(t("confirmResetPassword", r.name, r.flat))) return;
      try {
        await store.resetPassword(user.code, memberId(r.name, r.flat), user.session);
        toast(t("passwordReset", r.name));
      } catch (err) {
        console.error(err);
        toast(t("saveFailed"));
      }
    };
  });

  // Keep the paste box open if it was open before a redraw
  const pasteArea = document.getElementById("add-paste");
  if (pasteArea.value) pasteArea.closest("details").open = true;

  document.getElementById("add-pasted").onclick = () => {
    if (!pasteArea.value.trim()) return pasteArea.closest("details").open = true;
    try {
      const people = parsePastedList(pasteArea.value).residents;
      pasteArea.value = "";
      addMany(people);
    } catch (err) {
      toast(t("pasteNoRows"));
    }
  };

  // Remove someone
  app.querySelectorAll("[data-resident]").forEach((btn) => {
    btn.onclick = () => {
      const r = residents[btn.dataset.resident];
      if (!confirm(t("confirmRemove", r.name, r.flat))) return;
      store.removeResident(r);
      toast(t("removedResident", r.name));
    };
  });

  const search = document.getElementById("r-search");
  search.oninput = () => {
    const q = search.value.toLowerCase();
    document.querySelectorAll("#r-table tbody tr").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(q);
    });
  };
  search.oninput();
}

// Only admins who logged in with the new private PIN have a session the database trusts
function canResetPasswords() {
  return Boolean(user.session) && user.session !== "old";
}

function isOnList(list, name, flat) {
  return list.some((r) => flatKey(r.flat) === flatKey(flat) && nameKey(r.name) === nameKey(name));
}

// --- New complaint ---

function showNewComplaint() {
  let photo = null; // the shrunk photo, once one is picked

  render(`
    <div class="page-head">
      <h1>${t("newComplaintTitle")}</h1>
      <a href="#/">${t("cancel")}</a>
    </div>
    <form class="card" id="complaint-form">
      <div class="field">
        <label for="title">${t("whatProblem")}</label>
        <input id="title" required maxlength="80" placeholder="${t("problemEg")}">
      </div>
      <div class="field">
        <label for="category">${t("category")}</label>
        <select id="category">
          ${CATEGORIES.map((c) => `<option value="${c}">${t("cat." + c)}</option>`).join("")}
        </select>
      </div>
      <div id="similar" aria-live="polite"></div>
      <div class="field">
        <label for="desc">${t("details")}</label>
        <textarea id="desc" maxlength="500" placeholder="${t("detailsEg")}"></textarea>
      </div>
      ${photoField()}
      <button class="btn btn-primary" id="post-btn">${t("postComplaint")}</button>
    </form>
  `);

  const titleInput = document.getElementById("title");
  const categoryInput = document.getElementById("category");
  const showSimilar = () => drawSimilar(titleInput.value, categoryInput.value);
  titleInput.oninput = showSimilar;
  categoryInput.onchange = showSimilar;

  bindPhotoField(document.getElementById("post-btn"), (p) => (photo = p));

  document.getElementById("complaint-form").onsubmit = (e) => {
    e.preventDefault();
    const now = Date.now();
    const complaint = {
      id: newId(),
      title: titleInput.value.trim(),
      desc: document.getElementById("desc").value.trim(),
      category: categoryInput.value,
      flat: user.flat,
      author: user.name,
      createdAt: now,
      status: "reported",
      meToo: [],
      updates: [{ status: "reported", text: "Complaint posted", at: now }],
    };
    if (photo) complaint.photo = photo;
    store.addComplaint(complaint);
    toast(t("complaintPosted"));
    go("/c/" + complaint.id);
  };
}

// --- "Is it one of these?" duplicate check ---

// Common words that don't tell us what the problem is
const STOP_WORDS = new Set([
  "the", "and", "for", "not", "since", "from", "with", "near", "our", "has", "have", "are",
  "was", "this", "that", "there", "block", "floor", "flat", "today", "morning", "evening",
  "night", "working", "problem", "issue", "very", "again", "still", "please",
  "नहीं", "सुबह", "शाम", "रात", "समस्या", "ब्लॉक", "फ्लैट",
]);

// "Lights not working!" → ["light"]. Works for Hindi words too.
function keywords(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => (/^[a-z]+s$/.test(w) && w.length > 3 ? w.slice(0, -1) : w));
}

// Open complaints that share words with what's being typed. Same category counts extra.
function findSimilar(title, category) {
  const words = new Set(keywords(title));
  if (!words.size) return [];
  return data.complaints
    .filter((c) => c.status !== "resolved" && !c.hidden)
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
      <p class="similar-head">${t("similarHead")}</p>
      ${matches.map((c) => `
        <div class="similar-item">
          <div>
            <div class="similar-title">${esc(c.title)}</div>
            <div class="small muted">${t("status." + c.status)} · ${t("flatsAffected", c.meToo.length + 1)}</div>
          </div>
          <button type="button" class="btn btn-small" data-same="${c.id}">${t("meToo")}</button>
        </div>
      `).join("")}
    </div>
  `;

  box.querySelectorAll("[data-same]").forEach((btn) => {
    btn.onclick = () => {
      const c = data.complaints.find((x) => x.id === btn.dataset.same);
      if (!c.meToo.includes(userKey())) store.setMeToo(c, userKey(), true);
      toast(t("addedToComplaint"));
      go("/c/" + c.id);
    };
  });
}

// --- WhatsApp messages ---

function shareComplaintText(c) {
  return t("shareComplaint", c.title, t("status." + c.status), c.meToo.length + 1, pageLink("/b/" + user.code + "/c/" + c.id));
}

function shareAnnouncementText(a) {
  return [
    `📢 ${a.title}`,
    a.when ? `🕒 ${a.when}` : "",
    a.body,
    "",
    `${t("shareAnnouncementMore")} ${inviteLink(user.code)}`,
  ].filter((line, i) => line || i === 3).join("\n");
}

// --- Optional photo, used on complaints and announcements ---

function photoField(label = t("photo"), hint = "") {
  return `
    <div class="field">
      <span class="label">${label}</span>
      <label class="btn photo-pick" id="photo-pick">
        <input type="file" id="photo-input" accept="image/*" class="visually-hidden">
        ${t("addPhoto")}
      </label>
      ${hint ? `<p class="hint">${hint}</p>` : ""}
      <div id="photo-preview"></div>
    </div>
  `;
}

// onPhoto gets the shrunk photo, or null when it's removed.
// The submit button is paused while a photo is being prepared.
function bindPhotoField(submitBtn, onPhoto) {
  const input = document.getElementById("photo-input");
  const preview = document.getElementById("photo-preview");
  const pick = document.getElementById("photo-pick");

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    preview.innerHTML = `<p class="hint">${t("preparingPhoto")}</p>`;
    submitBtn.disabled = true;
    try {
      const photo = await shrinkPhoto(file);
      onPhoto(photo);
      preview.innerHTML = `
        <div class="photo-preview appear">
          <img src="${photo}" alt="${t("photoAlt")}">
          <button type="button" class="btn btn-small" id="photo-remove">${t("removePhoto")}</button>
        </div>
      `;
      pick.hidden = true;
      document.getElementById("photo-remove").onclick = () => {
        onPhoto(null);
        preview.innerHTML = "";
        input.value = "";
        pick.hidden = false;
      };
    } catch (err) {
      onPhoto(null);
      preview.innerHTML = `<p class="form-error">${t("photoFailed")}</p>`;
    }
    submitBtn.disabled = false;
  };
}

// --- Full-size photo ---

function openPhoto(src) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", t("photoAlt"));
  box.innerHTML = `
    <img src="${src}" alt="${t("photoAlt")}">
    <button class="btn btn-small lightbox-close">${t("close")}</button>
  `;
  const close = () => {
    box.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  box.onclick = close;
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  box.querySelector(".lightbox-close").focus();
}

// --- One complaint, with its history ---

function showComplaint(id, live = false) {
  const c = data.complaints.find((x) => x.id === id);
  if (!c) {
    render(`<div class="card empty">${t("complaintGone")} <a href="#/">${t("backToBoardLink")}</a></div>`, live);
    return;
  }
  if (c.hidden && !user.isAdmin) {
    render(`<div class="card empty">${t("complaintHidden")} <a href="#/">${t("backToBoardLink")}</a></div>`, live);
    return;
  }

  const mine = c.meToo.includes(userKey());
  const ownComplaint = c.author === user.name && c.flat === user.flat;
  const editing = editingId === c.id && ownComplaint;

  render(`
    <div class="page-head">
      <a href="#/">${t("backToBoard")}</a>
      ${statusPill(c.status)}
    </div>

    ${c.hidden ? `<p class="form-error">${t("hiddenNotice")}</p>` : ""}

    <div class="card">
      ${editing ? `
        <form id="edit-form">
          <div class="field">
            <label for="edit-title">${t("whatProblem")}</label>
            <input id="edit-title" required maxlength="80" value="${esc(c.title)}">
          </div>
          <div class="field">
            <label for="edit-desc">${t("details")}</label>
            <textarea id="edit-desc" maxlength="500">${esc(c.desc)}</textarea>
          </div>
          <div class="actions" style="margin-top:0">
            <button class="btn btn-primary">${t("save")}</button>
            <button type="button" class="btn" id="edit-cancel">${t("cancel")}</button>
          </div>
        </form>
      ` : `<h1>${esc(c.title)}</h1>`}
      <div class="complaint-meta">
        <span class="pill pill-cat">${t("cat." + c.category)}</span>
        ${overdueBadge(c)}
        <span>${esc(t("byAuthor", c.author, c.flat))}</span>
        <span>·</span>
        <span>${timeAgo(c.createdAt)}</span>
        ${c.editedAt ? `<span>·</span><span>${t("edited")}</span>` : ""}
      </div>
      ${c.desc && !editing ? `<p style="margin-top:14px">${esc(c.desc)}</p>` : ""}
      ${isSafePhoto(c.photo) ? `
        <button class="photo-full" id="photo-open" aria-label="${t("photoAlt")}">
          <img src="${c.photo}" alt="${t("photoAlt")}">
        </button>
      ` : ""}

      <div class="actions">
        ${ownComplaint ? "" : `
          <button class="btn metoo${mine ? " on" : ""}" id="metoo" aria-pressed="${mine}">
            ${mine ? t("youHaveThis") : t("meToo")} · <span class="metoo-count${bumpMeToo ? " bump" : ""}">${c.meToo.length}</span>
          </button>
        `}
        <a class="btn btn-whatsapp" href="${whatsappLink(shareComplaintText(c))}" target="_blank" rel="noopener">${t("shareWhatsApp")}</a>
        ${ownComplaint && !editing ? `<button class="btn" id="edit-btn">${t("edit")}</button>` : ""}
      </div>
      ${ownComplaint && c.meToo.length ? `<p class="small muted" style="margin-top:14px">${t("othersHaveIt", c.meToo.length)}</p>` : ""}
    </div>

    <div class="section-title">${t("updates")}</div>
    <div class="card">
      <ul class="timeline">
        ${c.updates.map((u) => `
          <li class="t-${u.status}">
            <div class="t-body${u.id && u.id === glowUpdateId ? " glow" : ""}">
              <div><strong>${t("status." + u.status)}</strong> <span class="small muted">· ${timeAgo(u.at)}${u.admin ? " · " + t("admin") : ""}</span></div>
              <div>${!u.admin && u.text === "Complaint posted" ? t("complaintPosted") : esc(u.text)}</div>
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

  const photoBtn = document.getElementById("photo-open");
  if (photoBtn) photoBtn.onclick = () => openPhoto(c.photo);

  const meTooBtn = document.getElementById("metoo");
  if (meTooBtn) meTooBtn.onclick = () => toggleMeToo(c);

  const form = document.getElementById("update-form");
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    postUpdate(c);
  };

  // Admin: hide spam or jokes from the board (or bring them back)
  const hideBtn = document.getElementById("hide-btn");
  if (hideBtn) hideBtn.onclick = () => {
    if (!c.hidden && !confirm(t("confirmHide"))) return;
    store.updateComplaint(c, { hidden: !c.hidden });
    toast(c.hidden ? t("complaintUnhidden") : t("complaintHiddenToast"));
  };

  // The person who posted it can fix the title or details
  const editBtn = document.getElementById("edit-btn");
  if (editBtn) editBtn.onclick = () => {
    editingId = c.id;
    showComplaint(c.id, true);
    document.getElementById("edit-title").focus();
  };
  const editForm = document.getElementById("edit-form");
  if (editForm) {
    document.getElementById("edit-cancel").onclick = () => {
      editingId = null;
      showComplaint(c.id, true);
    };
    editForm.onsubmit = (e) => {
      e.preventDefault();
      const title = document.getElementById("edit-title").value.trim();
      const desc = document.getElementById("edit-desc").value.trim();
      editingId = null;
      // clear the boxes first, so the page is allowed to redraw with the new text
      document.getElementById("edit-title").value = "";
      document.getElementById("edit-desc").value = "";
      store.updateComplaint(c, { title, desc, editedAt: Date.now() });
      toast(t("complaintSaved"));
    };
  }
}

function adminControls(c) {
  return `
    <div class="section-title admin-title">${t("adminPostUpdate")}</div>
    <form class="card admin-card" id="update-form">
      <div class="field">
        <label for="new-status">${t("status")}</label>
        <select id="new-status">
          ${STATUSES.map((s) => `<option value="${s}"${s === c.status ? " selected" : ""}>${t("status." + s)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="note">${t("noteForResidents")}</label>
        <input id="note" required maxlength="200" placeholder="${t("noteEg")}">
      </div>
      <button class="btn btn-primary">${t("postUpdate")}</button>
    </form>
    <div class="admin-hide">
      <button class="btn btn-small ${c.hidden ? "" : "btn-danger"}" id="hide-btn">${c.hidden ? t("unhide") : t("hideFromBoard")}</button>
      <span class="hint">${c.hidden ? "" : t("hideHint")}</span>
    </div>
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
  toast(status === "resolved" ? t("markedResolved") : t("updatePosted"));
}

// --- New announcement (admin only) ---

function showNewAnnouncement() {
  render(`
    <div class="page-head">
      <h1>${t("postAnnouncement")}</h1>
      <a href="#/">${t("cancel")}</a>
    </div>
    <form class="card" id="announce-form">
      <div class="field">
        <label for="a-title">${t("title")}</label>
        <input id="a-title" required maxlength="80" placeholder="${t("titleEg")}">
      </div>
      <div class="field">
        <label for="a-when">${t("when")}</label>
        <input id="a-when" maxlength="60" placeholder="${t("whenEg")}">
      </div>
      <div class="field">
        <label for="a-body">${t("details")}</label>
        <textarea id="a-body" maxlength="400"></textarea>
      </div>
      ${photoField()}
      <button class="btn btn-primary" id="post-btn">${t("postAnnouncement")}</button>
    </form>
  `);

  let photo = null;
  bindPhotoField(document.getElementById("post-btn"), (p) => (photo = p));

  document.getElementById("announce-form").onsubmit = (e) => {
    e.preventDefault();
    const announcement = {
      id: newId(),
      title: document.getElementById("a-title").value.trim(),
      when: document.getElementById("a-when").value.trim(),
      body: document.getElementById("a-body").value.trim(),
      createdAt: Date.now(),
    };
    if (photo) announcement.photo = photo;
    store.addAnnouncement(announcement);
    toast(t("announcementPosted"));
    go("/");
  };
}

// ---------- Start ----------

store
  .startStore({
    onChange: refresh,
    onError: (err) => {
      console.error(err);
      toast(t("saveFailed"));
    },
  })
  .then(() => {
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((err) => {
    console.error(err);
    app.innerHTML = `<div class="card empty">${t("loadFailed")} ${esc(err.message)}</div>`;
  });
