// ============================================================
// CONNECTA FIREBASE CONFIGURATION
// ============================================================
// Frontend-safe Firebase Web App configuration.
//
// IMPORTANT:
// NEVER put a Firebase Admin SDK service-account private key
// in this file.
//
// This version enables persistent Firestore local caching so
// CONNECTA can display previously loaded data immediately
// while Firestore synchronizes in the background.
// ============================================================


import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";


import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";


import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


// ============================================================
// FIREBASE CONFIG
// ============================================================

const firebaseConfig = {

  apiKey:
    "AIzaSyCRDtEYFvigP9ofUwnEPrOLbAKqegK2Z7c",

  authDomain:
    "zantona-73561.firebaseapp.com",

  projectId:
    "zantona-73561",

  storageBucket:
    "zantona-73561.firebasestorage.app",

  messagingSenderId:
    "559643129887",

  appId:
    "1:559643129887:web:7ebc77550361397b0c3d2a"

};


// ============================================================
// INITIALIZE FIREBASE APP
// ============================================================

const app =
  initializeApp(
    firebaseConfig
  );


// ============================================================
// FIREBASE AUTHENTICATION
// ============================================================

const auth =
  getAuth(
    app
  );


// ============================================================
// FIRESTORE
// ============================================================
//
// Persistent local cache is important for CONNECTA.
//
// Example:
//
// User opens CONNECTA
//       ↓
// Previously cached chats/groups/profile appear
//       ↓
// Firestore connects in background
//       ↓
// New changes are synchronized
//
// This prevents every page from behaving like a completely
// new website visit.
//
// persistentMultipleTabManager() also allows Firestore
// persistence to work correctly when CONNECTA is opened in
// multiple browser tabs.
// ============================================================

let db;


try {

  db =
    initializeFirestore(
      app,
      {

        localCache:
          persistentLocalCache({

            tabManager:
              persistentMultipleTabManager()

          })

      }
    );


  console.log(
    "[CONNECTA] Firestore persistent cache enabled."
  );


} catch (error) {

  /*
   * Safe fallback.
   *
   * If persistent caching cannot be initialized on a
   * particular browser/environment, CONNECTA will still
   * function normally using the standard Firestore client.
   */

  console.warn(
    "[CONNECTA] Persistent Firestore cache unavailable. Using standard Firestore.",
    error
  );


  db =
    getFirestore(
      app
    );

}


// ============================================================
// FIREBASE STORAGE
// ============================================================

const storage =
  getStorage(
    app
  );


// ============================================================
// EXPORTS
// ============================================================

export {

  app,

  auth,

  db,

  storage,

  onAuthStateChanged

};
