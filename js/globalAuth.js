/* =========================================================
   CONNECTA — GLOBAL AUTHENTICATION
   File: js/globalAuth.js

   PURPOSE
   - Provides one authentication/session system for CONNECTA
   - Firebase Authentication is the source of truth
   - All protected pages use the same logged-in user
   - Loads the user's Firestore profile
   - Handles suspended/banned accounts
   - Provides logout
   - Prevents pages from depending on dashboard.html
========================================================= */

import {
    auth,
    db
} from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const LOGIN_PAGE = "login.html";
const USER_COLLECTION = "users";

const CACHE_KEY = "connectaGlobalUser";


/* =========================================================
   STATE
========================================================= */

let currentAuthUser = null;
let currentProfile = null;

let authReadyPromise = null;


/* =========================================================
   BASIC USER CACHE
========================================================= */

function saveUserCache(profile) {

    if (!profile) {
        return;
    }

    try {

        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                uid: profile.uid || "",
                displayName:
                    profile.displayName || "",
                username:
                    profile.username || "",
                photoURL:
                    profile.photoURL || "",
                isVerified:
                    profile.isVerified === true,
                status:
                    profile.status || "active"
            })
        );

    } catch (error) {

        console.warn(
            "Could not save CONNECTA user cache:",
            error
        );
    }
}


function clearUserCache() {

    try {

        localStorage.removeItem(
            CACHE_KEY
        );

    } catch {
        /* Ignore */
    }
}


/* =========================================================
   AUTH STATE
========================================================= */

function waitForAuth() {

    if (authReadyPromise) {
        return authReadyPromise;
    }

    authReadyPromise =
        new Promise(resolve => {

            const unsubscribe =
                onAuthStateChanged(
                    auth,
                    user => {

                        unsubscribe();

                        currentAuthUser =
                            user || null;

                        resolve(
                            currentAuthUser
                        );
                    }
                );

        });

    return authReadyPromise;
}


/* =========================================================
   LOAD FIRESTORE PROFILE
========================================================= */

async function loadUserProfile(user) {

    if (!user) {
        return null;
    }

    try {

        const userRef =
            doc(
                db,
                USER_COLLECTION,
                user.uid
            );

        const snapshot =
            await getDoc(
                userRef
            );

        if (!snapshot.exists()) {

            console.warn(
                "CONNECTA profile does not exist:",
                user.uid
            );

            return {

                uid:
                    user.uid,

                displayName:
                    user.displayName || "",

                username:
                    "",

                email:
                    user.email || "",

                phone:
                    "",

                photoURL:
                    user.photoURL || "",

                isVerified:
                    false,

                status:
                    "active"
            };
        }

        const profile =
            snapshot.data();

        return {

            ...profile,

            uid:
                user.uid,

            email:
                profile.email ||
                user.email ||
                "",

            displayName:
                profile.displayName ||
                user.displayName ||
                "",

            photoURL:
                profile.photoURL ||
                user.photoURL ||
                ""
        };

    } catch (error) {

        console.error(
            "Could not load CONNECTA profile:",
            error
        );

        throw error;
    }
}


/* =========================================================
   ACCOUNT STATUS
========================================================= */

function getAccountStatus(profile) {

    const status =
        String(
            profile?.status ||
            "active"
        ).toLowerCase();

    return {

        status,

        active:
            status === "active",

        suspended:
            status === "suspended",

        banned:
            status === "banned",

        blocked:
            status === "suspended" ||
            status === "banned"
    };
}


/* =========================================================
   REDIRECT TO LOGIN
========================================================= */

function redirectToLogin() {

    const currentPage =
        window.location.pathname
            .split("/")
            .pop();

    if (
        currentPage ===
        LOGIN_PAGE
    ) {
        return;
    }

    window.location.replace(
        LOGIN_PAGE
    );
}


/* =========================================================
   REQUIRE AUTHENTICATED USER
========================================================= */

async function getCurrentConnectaUser(
    options = {}
) {

    const {
        redirect = true,
        allowBlocked = false
    } = options;

    try {

        const user =
            await waitForAuth();

        if (!user) {

            if (redirect) {
                redirectToLogin();
            }

            return null;
        }

        currentAuthUser =
            user;

        /*
         * Always use Firebase Auth UID
         * to locate the CONNECTA profile.
         */
        const profile =
            await loadUserProfile(
                user
            );

        currentProfile =
            profile;

        const accountStatus =
            getAccountStatus(
                profile
            );

        /*
         * Save only safe basic information
         * to local cache.
         */
        saveUserCache(
            profile
        );

        if (
            accountStatus.blocked &&
            !allowBlocked
        ) {

            console.warn(
                `CONNECTA account is ${accountStatus.status}.`
            );

            await logout(
                false
            );

            return null;
        }

        return {

            authUser:
                user,

            profile,

            uid:
                user.uid,

            accountStatus,

            isAuthenticated:
                true
        };

    } catch (error) {

        console.error(
            "CONNECTA authentication error:",
            error
        );

        if (redirect) {

            redirectToLogin();
        }

        return null;
    }
}


/* =========================================================
   GET AUTH USER ONLY
========================================================= */

async function getFirebaseUser() {

    const user =
        await waitForAuth();

    return user || null;
}


/* =========================================================
   GET CURRENT PROFILE
========================================================= */

function getCurrentProfile() {

    return currentProfile;
}


/* =========================================================
   GET CURRENT AUTH USER
========================================================= */

function getCurrentAuthUser() {

    return currentAuthUser;
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout(
    redirect = true
) {

    try {

        await signOut(
            auth
        );

    } catch (error) {

        console.error(
            "CONNECTA logout error:",
            error
        );

    } finally {

        currentAuthUser =
            null;

        currentProfile =
            null;

        clearUserCache();

        if (redirect) {

            window.location.replace(
                LOGIN_PAGE
            );
        }
    }
}


/* =========================================================
   EXPORTS
========================================================= */

export {

    getCurrentConnectaUser,

    getFirebaseUser,

    getCurrentProfile,

    getCurrentAuthUser,

    getAccountStatus,

    logout
};
