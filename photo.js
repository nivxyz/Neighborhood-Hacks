// Shrinks a photo so it fits inside a complaint in the database.
// Phone photos are often 3–5 MB; this turns them into a JPEG of about 100–300 KB.

const MAX_SIDE = 1200;          // longest side in pixels
const MAX_BYTES = 300 * 1024;   // Firestore allows 1 MB per complaint, so stay well under it

// A photo of a residents register for the AI to read: bigger and sharper, so handwriting stays readable
export const FOR_READING = { maxSide: 2000, maxBytes: 1500 * 1024, quality: 0.85 };

export async function shrinkPhoto(file, { maxSide = MAX_SIDE, maxBytes = MAX_BYTES, quality = 0.8 } = {}) {
  const img = await loadImage(file);
  let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  let url;

  // Try smaller and lower quality until it fits
  for (let tries = 0; tries < 6; tries++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    url = canvas.toDataURL("image/jpeg", quality);
    if (url.length * 0.75 <= maxBytes) break; // base64 text is about 4/3 the size of the real bytes
    quality -= 0.1;
    scale *= 0.85;
  }
  return url;
}

// Only show photos that really are the JPEGs we made (not something else typed into the database)
export function isSafePhoto(url) {
  return typeof url === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("photo"));
    };
    img.src = url;
  });
}
