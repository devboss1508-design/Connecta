// ============================================================
// CONNECTA FIREBASE CONFIGURATION
// ============================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    initializeFirestore,
    getFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
    getStorage
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";


// ============================================================
// FIREBASE WEB APP CONFIG
// ============================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyCRDtEYFvigP9ofUwnPrOLbAKqegK2Z7c",

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
// INITIALIZE FIREBASE
// ============================================================

const app =
    initializeApp(
        firebaseConfig
    );


// ============================================================
// FIREBASE AUTH
// ============================================================

const auth =
    getAuth(
        app
    );


// ============================================================
// FIRESTORE
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
