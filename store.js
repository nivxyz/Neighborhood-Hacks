// Where FlatDesk keeps its data.
// If firebase-config.js is filled in, everything is saved in Firebase (Cloud Firestore),
// so every phone sees the same board and changes show up live.
// If not, it falls back to saving in this browser only, which is handy for testing.

import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const LOCAL_KEY = "flatdesk-data";

export const data = { complaints: [], announcements: [] };
export const usingFirebase = Boolean(firebaseConfig.projectId);

let onChange = () => {};
let onError = () => {};
let fb; // Firestore functions, loaded only when Firebase is used
let db;

export async function startStore(handlers) {
  onChange = handlers.onChange;
  onError = handlers.onError;
  if (usingFirebase) await startFirebase();
  else startLocal();
}

// ---------- Changing data ----------
// Every change goes through one of these. When the data changes, onChange() redraws the screen.

export function addComplaint(complaint) {
  if (!usingFirebase) {
    data.complaints.push(complaint);
    return saveLocal();
  }
  send(fb.setDoc(fb.doc(db, "complaints", complaint.id), complaint));
}

export function setMeToo(complaint, userKey, on) {
  if (!usingFirebase) {
    complaint.meToo = on
      ? [...complaint.meToo, userKey]
      : complaint.meToo.filter((k) => k !== userKey);
    return saveLocal();
  }
  // arrayUnion/arrayRemove stop two people tapping at the same moment from overwriting each other
  send(fb.updateDoc(fb.doc(db, "complaints", complaint.id), {
    meToo: on ? fb.arrayUnion(userKey) : fb.arrayRemove(userKey),
  }));
}

export function addUpdate(complaint, update) {
  if (!usingFirebase) {
    complaint.updates.push(update);
    complaint.status = update.status;
    return saveLocal();
  }
  send(fb.updateDoc(fb.doc(db, "complaints", complaint.id), {
    updates: fb.arrayUnion(update),
    status: update.status,
  }));
}

export function addAnnouncement(announcement) {
  if (!usingFirebase) {
    data.announcements.push(announcement);
    return saveLocal();
  }
  send(fb.setDoc(fb.doc(db, "announcements", announcement.id), announcement));
}

export function removeAnnouncement(id) {
  if (!usingFirebase) {
    data.announcements = data.announcements.filter((a) => a.id !== id);
    return saveLocal();
  }
  send(fb.deleteDoc(fb.doc(db, "announcements", id)));
}

// ---------- Browser-only mode ----------

function startLocal() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
  } catch (e) {}
  Object.assign(data, saved || sampleData());
}

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {}
  onChange();
}

// ---------- Firebase mode ----------

async function startFirebase() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  fb = await import(`${SDK}/firebase-firestore.js`);
  db = fb.getFirestore(initializeApp(firebaseConfig));

  // Wait for both lists to load once. After that, listen() keeps them up to date.
  await Promise.all([listen("complaints"), listen("announcements")]);

  // Brand new database: add the example complaints so the board isn't empty
  if (!data.complaints.length && !data.announcements.length) {
    const sample = sampleData();
    const batch = fb.writeBatch(db);
    sample.complaints.forEach((c) => batch.set(fb.doc(db, "complaints", c.id), c));
    sample.announcements.forEach((a) => batch.set(fb.doc(db, "announcements", a.id), a));
    await batch.commit();
  }
}

// Runs every time anyone changes this collection, on any phone
function listen(name) {
  return new Promise((resolve, reject) => {
    let first = true;
    fb.onSnapshot(
      fb.collection(db, name),
      (snap) => {
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
  });
}

function send(promise) {
  promise.catch(onError);
}

// ---------- Example data ----------

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
