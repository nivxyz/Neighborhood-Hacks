// Where FlatDesk keeps its data.
// Each apartment building gets its own space, found by its building code:
//   buildings/{code}                  name, photo, residents list
//   buildings/{code}/complaints/...   that building's complaints
//   buildings/{code}/announcements/...
//   buildings/{code}/private/admin    admin PIN and recovery email (nobody can read it,
//                                     except the admin after signing in with that email)
//   buildings/{code}/secrets/...      residents' password hashes (nobody can read them)
//   buildings/{code}/sessions/...     proof someone typed the right PIN or password
// If firebase-config.js is filled in, everything is saved in Firebase (Cloud Firestore),
// so every phone sees the same board and changes show up live.
// If not, it falls back to saving in this browser only, which is handy for testing.

import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const LOCAL_KEY = "flatdesk-local";
export const DEMO_PIN = "123456";

export const data = { complaints: [], announcements: [] };
export const usingFirebase = Boolean(firebaseConfig.projectId);
export let currentCode = null; // the building whose data is loaded right now
export let building = null;    // that building's info (name, residents...)

let onChange = () => {};
let onError = () => {};
let fb; // Firestore functions, loaded only when Firebase is used
let db;
let app;
let fbAuth; // Firebase Authentication, loaded only for the recovery email
let stopListening = [];
let localDb; // browser-only mode: { buildings: { CODE: { info, private, secrets, complaints, announcements } } }

export async function startStore(handlers) {
  onChange = handlers.onChange;
  onError = handlers.onError;
  if (usingFirebase) {
    const { initializeApp } = await import(`${SDK}/firebase-app.js`);
    fb = await import(`${SDK}/firebase-firestore.js`);
    app = initializeApp(firebaseConfig);
    db = fb.getFirestore(app);
  } else {
    try {
      localDb = JSON.parse(localStorage.getItem(LOCAL_KEY));
    } catch (e) {}
    localDb = localDb || { buildings: {} };
  }
}

// ---------- Buildings ----------

export async function getBuilding(code) {
  if (!usingFirebase) return localDb.buildings[code]?.info || null;
  const snap = await fb.getDoc(fb.doc(db, "buildings", code));
  return snap.exists() ? snap.data() : null;
}

// Makes a new building with a random code. The PIN and recovery email go in a private
// document next to it. Also sets up the recovery email with Firebase, so "Forgot PIN?" works.
export async function createBuilding(info, pin, email) {
  await setUpRecoveryEmail(email);
  return saveNewBuilding(info, pin, email, {});
}

// Every visitor who taps "Try the demo" gets their own copy, so nobody sees anyone else's test posts
export async function createDemo() {
  const info = { name: "Demo Apartments", open: true, demo: true, residents: [], createdAt: Date.now() };
  return saveNewBuilding(info, DEMO_PIN, null, sampleData());
}

async function saveNewBuilding(info, pin, email, extra) {
  for (let tries = 0; tries < 5; tries++) {
    const code = randomCode();
    const newBuilding = { ...info, code };
    const secret = { email, pin, pinHash: await hashPin(code, pin) };

    if (!usingFirebase) {
      if (localDb.buildings[code]) continue;
      localDb.buildings[code] = {
        info: newBuilding, private: secret, secrets: {},
        complaints: extra.complaints || [], announcements: extra.announcements || [],
      };
      saveLocal(false);
      return newBuilding;
    }
    try {
      // The rules only allow creating a building that doesn't exist yet,
      // so if this code is already taken, it's refused and we try another one.
      const batch = fb.writeBatch(db);
      batch.set(fb.doc(db, "buildings", code), newBuilding);
      batch.set(fb.doc(db, "buildings", code, "private", "admin"), secret);
      (extra.complaints || []).forEach((c) => batch.set(ref("complaints", c.id, code), c));
      (extra.announcements || []).forEach((a) => batch.set(ref("announcements", a.id, code), a));
      await batch.commit();
      return newBuilding;
    } catch (err) {
      if (err.code !== "permission-denied") throw err;
    }
  }
  throw new Error("Couldn't create the building. Please try again.");
}

// Loads one building's info, complaints and announcements, and keeps them up to date.
// Returns false if the building doesn't exist.
export async function openBuilding(code) {
  if (code === currentCode) return true;
  closeBuilding();

  const info = await getBuilding(code);
  if (!info) return false;
  currentCode = code;
  building = info;

  if (!usingFirebase) {
    data.complaints = localDb.buildings[code].complaints;
    data.announcements = localDb.buildings[code].announcements;
    return true;
  }
  await Promise.all([
    listenToBuilding(code),
    listen(code, "complaints"),
    listen(code, "announcements"),
  ]);
  return true;
}

export function closeBuilding() {
  stopListening.forEach((stop) => stop());
  stopListening = [];
  currentCode = null;
  building = null;
  data.complaints = [];
  data.announcements = [];
}

export async function hashPin(code, pin) {
  const bytes = new TextEncoder().encode("flatdesk:" + code + ":" + pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function passwordHash(code, member, password) {
  return hashPin(code, "password:" + member + ":" + password);
}

// ---------- Logging in ----------
// The PIN and passwords can't be read by anyone, so instead of checking them here,
// we write a "session" with the scrambled PIN/password. The database rules only accept it
// if it matches, so an accepted session means it was right.

// Returns a session id if the PIN is right, or null if it's wrong
export async function adminLogin(b, pin) {
  const proof = await hashPin(b.code, pin);
  if (b.pinHash) return proof === b.pinHash ? "old" : null; // buildings made before the PIN went private

  if (!usingFirebase) return localDb.buildings[b.code].private.pinHash === proof ? "local" : null;
  const session = randomId();
  try {
    await fb.setDoc(fb.doc(db, "buildings", b.code, "sessions", session), { role: "admin", proof, at: Date.now() });
    return session;
  } catch (err) {
    if (err.code === "permission-denied") return null;
    throw err;
  }
}

// Returns "ok", "needPassword" (this resident has a password and none was given) or "wrong"
export async function residentLogin(code, member, password) {
  const proof = password ? await passwordHash(code, member, password) : null;

  if (!usingFirebase) {
    const saved = localDb.buildings[code].secrets?.[member] || null;
    if (!saved) return "ok";
    if (!proof) return "needPassword";
    return saved === proof ? "ok" : "wrong";
  }
  try {
    await fb.setDoc(fb.doc(db, "buildings", code, "sessions", randomId()), { role: "resident", member, proof, at: Date.now() });
    return "ok";
  } catch (err) {
    if (err.code === "permission-denied") return proof ? "wrong" : "needPassword";
    throw err;
  }
}

// Add or change a resident's password. Returns false if the current password was wrong.
export async function setPassword(code, member, newPassword, currentPassword) {
  const passHash = await passwordHash(code, member, newPassword);
  const oldProof = currentPassword ? await passwordHash(code, member, currentPassword) : null;

  if (!usingFirebase) {
    const b = localDb.buildings[code];
    b.secrets = b.secrets || {};
    if (b.secrets[member] && b.secrets[member] !== oldProof) return false;
    b.secrets[member] = passHash;
    saveLocal(false);
    return true;
  }
  try {
    await fb.setDoc(fb.doc(db, "buildings", code, "secrets", member), { passHash, oldProof });
    return true;
  } catch (err) {
    if (err.code === "permission-denied") return false;
    throw err;
  }
}

// Admin removes a resident's password (they forgot it). Needs the admin's session.
export async function resetPassword(code, member, adminSession) {
  if (!usingFirebase) {
    delete localDb.buildings[code].secrets?.[member];
    return saveLocal(false);
  }
  await fb.setDoc(fb.doc(db, "buildings", code, "secrets", member), { passHash: null, oldProof: null, adminSession });
}

// ---------- Recovery email (forgot PIN) ----------
// Firebase Authentication sends the emails. At registration we make an account for the
// recovery email with a random password nobody knows. "Forgot PIN?" emails a link whose
// "new password" page is where the admin types their new PIN.

async function auth() {
  if (!fbAuth) {
    const mod = await import(`${SDK}/firebase-auth.js`);
    fbAuth = { ...mod, instance: mod.getAuth(app) };
  }
  return fbAuth;
}

async function setUpRecoveryEmail(email) {
  if (!usingFirebase) return;
  const a = await auth();
  try {
    await a.createUserWithEmailAndPassword(a.instance, email, randomId() + randomId());
  } catch (err) {
    if (err.code !== "auth/email-already-in-use") throw err; // already set up (e.g. admin of two buildings)
  }
  await a.signOut(a.instance);
}

// returnTo: a FlatDesk link for the "Continue" button on the email's page. That only works if
// this website is in Firebase's authorized domains, so if Firebase refuses it, send without it.
export async function sendRecoveryEmail(email, returnTo) {
  if (!usingFirebase) return;
  const a = await auth();
  try {
    await a.sendPasswordResetEmail(a.instance, email, { url: returnTo });
  } catch (err) {
    if (!String(err.code).includes("continue-uri")) throw err;
    await a.sendPasswordResetEmail(a.instance, email);
  }
}

// The new PIN the admin typed on the email's "new password" page becomes the building's PIN.
// Signing in with the recovery email + that new PIN proves it's them, then we save it.
// Throws "wrongLogin" or "notThisBuilding".
export async function recoverPin(code, email, newPin) {
  const pinHash = await hashPin(code, newPin);
  if (!usingFirebase) {
    const secret = localDb.buildings[code]?.private;
    if (!secret || secret.email !== email) throw new Error("notThisBuilding");
    Object.assign(secret, { pin: newPin, pinHash });
    return saveLocal(false);
  }
  const a = await auth();
  try {
    await a.signInWithEmailAndPassword(a.instance, email, newPin);
  } catch (err) {
    throw new Error("wrongLogin");
  }
  try {
    await fb.updateDoc(fb.doc(db, "buildings", code, "private", "admin"), { pin: newPin, pinHash });
  } catch (err) {
    throw new Error("notThisBuilding");
  } finally {
    await a.signOut(a.instance);
  }
}

// ---------- Changing data ----------
// Every change goes through one of these. When the data changes, onChange() redraws the screen.

export function addComplaint(complaint) {
  if (!usingFirebase) {
    data.complaints.push(complaint);
    return saveLocal();
  }
  send(fb.setDoc(ref("complaints", complaint.id), complaint));
}

export function setMeToo(complaint, userKey, on) {
  if (!usingFirebase) {
    complaint.meToo = on
      ? [...complaint.meToo, userKey]
      : complaint.meToo.filter((k) => k !== userKey);
    return saveLocal();
  }
  // arrayUnion/arrayRemove stop two people tapping at the same moment from overwriting each other
  send(fb.updateDoc(ref("complaints", complaint.id), {
    meToo: on ? fb.arrayUnion(userKey) : fb.arrayRemove(userKey),
  }));
}

export function addUpdate(complaint, update) {
  if (!usingFirebase) {
    complaint.updates.push(update);
    complaint.status = update.status;
    return saveLocal();
  }
  send(fb.updateDoc(ref("complaints", complaint.id), {
    updates: fb.arrayUnion(update),
    status: update.status,
  }));
}

// Edit a complaint, or hide it from the board (admin)
export function updateComplaint(complaint, fields) {
  if (!usingFirebase) {
    Object.assign(complaint, fields);
    return saveLocal();
  }
  send(fb.updateDoc(ref("complaints", complaint.id), fields));
}

export function addAnnouncement(announcement) {
  if (!usingFirebase) {
    data.announcements.push(announcement);
    return saveLocal();
  }
  send(fb.setDoc(ref("announcements", announcement.id), announcement));
}

export function removeAnnouncement(id) {
  if (!usingFirebase) {
    data.announcements = data.announcements.filter((a) => a.id !== id);
    return saveLocal();
  }
  send(fb.deleteDoc(ref("announcements", id)));
}

// The residents list (admin only). arrayUnion/arrayRemove change just those people,
// so two admins editing at once don't wipe each other's changes.
export function addResidents(people) {
  if (!usingFirebase) {
    building.residents.push(...people);
    return saveLocal();
  }
  send(fb.updateDoc(fb.doc(db, "buildings", currentCode), { residents: fb.arrayUnion(...people) }));
}

export function removeResident(person) {
  if (!usingFirebase) {
    building.residents = building.residents.filter((r) => !(r.name === person.name && r.flat === person.flat));
    localDb.buildings[currentCode].info = building;
    return saveLocal();
  }
  send(fb.updateDoc(fb.doc(db, "buildings", currentCode), {
    residents: fb.arrayRemove({ name: person.name, flat: person.flat }),
  }));
}

// ---------- Helpers ----------

function ref(collection, id, code = currentCode) {
  return fb.doc(db, "buildings", code, collection, id);
}

// Runs every time anyone changes this collection, on any phone
function listen(code, name) {
  return new Promise((resolve, reject) => {
    let first = true;
    const stop = fb.onSnapshot(
      fb.collection(db, "buildings", code, name),
      (snap) => {
        if (code !== currentCode) return; // switched to another building meanwhile
        data[name] = snap.docs.map((d) => d.data());
        if (first) {
          first = false;
          resolve();
        } else {
          onChange();
        }
      },
      (err) => (first ? reject(err) : onError(err))
    );
    stopListening.push(stop);
  });
}

// Keeps the building's info (like the residents list) up to date
function listenToBuilding(code) {
  return new Promise((resolve, reject) => {
    let first = true;
    const stop = fb.onSnapshot(
      fb.doc(db, "buildings", code),
      (snap) => {
        if (code !== currentCode || !snap.exists()) return;
        building = snap.data();
        if (first) {
          first = false;
          resolve();
        } else {
          onChange();
        }
      },
      (err) => (first ? reject(err) : onError(err))
    );
    stopListening.push(stop);
  });
}

function send(promise) {
  promise.catch(onError);
}

function saveLocal(notify = true) {
  if (currentCode && localDb.buildings[currentCode]) {
    localDb.buildings[currentCode].complaints = data.complaints;
    localDb.buildings[currentCode].announcements = data.announcements;
  }
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(localDb));
  } catch (e) {}
  if (notify) onChange();
}

// A long random id that can't be guessed
function randomId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(36).padStart(2, "0")).join("");
}

// 6 characters, without ones that are easy to mix up (0/O, 1/I)
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint32Array(6));
  return [...random].map((n) => chars[n % chars.length]).join("");
}

// ---------- Example data for the demo building ----------

function sampleData() {
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  return {
    complaints: [
      {
        id: "c1",
        title: "Lift in B block stuck on 3rd floor",
        desc: "The lift stops between floors and the door won't open. Elderly residents are using the stairs.",
        category: "Lift",
        flat: "B-304",
        author: "Priya",
        createdAt: now - 26 * hour,
        status: "progress",
        meToo: ["Ravi|B-201", "Anil|B-502", "Meena|B-105"],
        updates: [
          { status: "reported", text: "Complaint posted", at: now - 26 * hour },
          { status: "progress", text: "Technician called. Coming tomorrow morning.", at: now - 20 * hour, admin: true },
        ],
      },
      {
        id: "c2",
        title: "Garbage not collected near gate 2",
        desc: "Bins have been full for three days and stray dogs are pulling bags out.",
        category: "Garbage",
        flat: "A-102",
        author: "Ravi",
        createdAt: now - 5 * hour,
        status: "reported",
        meToo: ["Priya|B-304"],
        updates: [{ status: "reported", text: "Complaint posted", at: now - 5 * hour }],
      },
      {
        id: "c3",
        title: "Corridor light not working, 2nd floor A block",
        desc: "Very dark at night near the staircase.",
        category: "Electricity",
        flat: "A-203",
        author: "Meena",
        createdAt: now - 72 * hour,
        status: "resolved",
        meToo: [],
        updates: [
          { status: "reported", text: "Complaint posted", at: now - 72 * hour },
          { status: "progress", text: "Electrician informed.", at: now - 60 * hour, admin: true },
          { status: "resolved", text: "Bulb and switch replaced.", at: now - 48 * hour, admin: true },
        ],
      },
    ],
    announcements: [
      {
        id: "a1",
        title: "No water supply Sunday morning",
        body: "Overhead tank cleaning. Please store water on Saturday night.",
        when: "Sunday, 9 AM to 1 PM",
        createdAt: now - 3 * hour,
      },
    ],
  };
}
