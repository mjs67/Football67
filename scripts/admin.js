// scripts/admin.js
// One place to initialise firebase-admin and hand back a ready Firestore
// handle. Every script used to repeat this block (in three slightly different
// flavours); they now all `import { db } from "./admin.js"`.
//
// Credential resolution order (most explicit wins):
//   1. GOOGLE_APPLICATION_CREDENTIALS pointing at a key file (CI / Actions)
//   2. ./serviceAccount.json in the project root (local manual runs)
//   3. Application Default Credentials (admin.initializeApp() with no args)
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";

if (!admin.apps.length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const sa = JSON.parse(readFileSync(credPath, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else if (existsSync("./serviceAccount.json")) {
    const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } else {
    admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS / ADC
  }
}

export const db = admin.firestore();
export { admin };
