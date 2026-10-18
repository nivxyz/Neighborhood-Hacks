// Where FlatDesk keeps its data.
// Each apartment building gets its own space, found by its building code:
//   buildings/{code}                  name, admin, residents list
//   buildings/{code}/complaints/...   that building's complaints
//   buildings/{code}/announcements/...
// If firebase-config.js is filled in, everything is saved in Firebase (Cloud Firestore),
// so every phone sees the same board and changes show up live.
// If not, it falls back to saving in this browser only, which is handy for testing.

import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const LOCAL_KEY = "flatdesk-local";
export const DEMO_CODE = "DEMO";

export const data = { complaints: [], announcements: [] };
export const usingFirebase = Boolean(firebaseConfig.projectId);
export let currentCode = null; // the building whose data is loaded right now
export let building = null;    // that building's info (name, residents...)

let onChange = () => {};
let onError = () => {};
let fb; // Firestore functions, loaded only when Firebase is used
let db;
let stopListening = [];
let localDb; // browser-only mode: { buildings: { CODE: { info, complaints, announcements } } }

export async function startStore(handlers) {
  onChange = handlers.onChange;
  onError = handlers.onError;
  if (usingFirebase) {
    const { initializeApp } = await import(`${SDK}/firebase-app.js`);
    fb = await import(`${SDK}/firebase-firestore.js`);
    db = fb.getFirestore(initializeApp(firebaseConfig));
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

// Makes a new building with a random code. The admin PIN is stored scrambled (hashed), never as-is.
export async function createBuilding(info, pin) {
  for (let tries = 0; tries < 5; tries++) {
    const code = randomCode();
    const newBuilding = { ...info, code, pinHash: await hashPin(code, pin) };

    if (!usingFirebase) {
      if (localDb.buildings[code]) continue;
      localDb.buildings[code] = { info: newBuilding, complaints: [], announcements: [] };
      saveLocal();
      return newBuilding;
    }
    try {
      // The rules only allow creating a building that doesn't exist yet,
      // so if this code is already taken, it's refused and we try another one.
      await fb.setDoc(fb.doc(db, "buildings", code), newBuilding);
      return newBuilding;
    } catch (err) {
      if (err.code !== "permission-denied") throw err;
    }
  }
  throw new Error("Couldn't create the building. Please try again.");
}

// The demo building judges can try without uploading a sheet. Made once, with example data.
export async function ensureDemo() {
  if (await getBuilding(DEMO_CODE)) return;
  const info = {
    code: DEMO_CODE,
    name: "Demo Apartments",
    adminName: "Demo admin",
    adminFlat: "A-001",
    open: true, // anyone can join, no residents list check
    residents: [],
    pinHash: await hashPin(DEMO_CODE, "1234"),
    createdAt: Date.now(),
  };
  const sample = sampleData();

  if (!usingFirebase) {
    localDb.buildings[DEMO_CODE] = { info, ...sample };
    return saveLocal(false);
  }
  const batch = fb.writeBatch(db);
  batch.set(fb.doc(db, "buildings", DEMO_CODE), info);
  sample.complaints.forEach((c) => batch.set(ref("complaints", c.id, DEMO_CODE), c));
  sample.announcements.forEach((a) => batch.set(ref("announcements", a.id, DEMO_CODE), a));
  await batch.commit();
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
