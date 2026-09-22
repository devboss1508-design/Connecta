// frontend/js/firebase.js

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
    getStorage
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyCRDtEYFvigP9ofUwnEPrOlBAKqegK2Z7c",

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


const app =
    initializeApp(
        firebaseConfig
    );


const auth =
    getAuth(app);


const db =
    getFirestore(app);


const storage =
    getStorage(app);


export {
    app,
    auth,
    db,
    storage
};
