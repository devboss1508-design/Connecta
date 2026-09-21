/* =========================================================
   CONNECTA — GLOBAL AUTHENTICATION + PRESENCE
   File: js/globalAuth.js

   PURPOSE
   - One authentication/session system for CONNECTA
   - Firebase Authentication is the source of truth
   - Works on ALL protected pages
   - Automatically marks authenticated users ONLINE
   - Keeps lastSeen updated while the page is active
   - Handles suspended/banned accounts
   - Provides logout
   - Does not depend on dashboard.html
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
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const LOGIN_PAGE =
    "login.html";

const USER_COLLECTION =
    "users";

const CACHE_KEY =
    "connectaGlobalUser";

/*
 * Presence heartbeat.
 *
 * Every 30 seconds the active page tells Firestore
 * that the user is still online.
 */
const PRESENCE_INTERVAL =
    30 * 1000;


/*
 * A user whose lastSeen is older than this amount
 * should be treated as offline by UI code.
 *
 * 90 seconds gives enough room for a slow network
 * or a page transition.
 */
const ONLINE_TIMEOUT =
    90 * 1000;


/* =========================================================
   STATE
========================================================= */

let currentAuthUser = null;

let currentProfile = null;

let authReadyPromise = null;

let presenceTimer = null;


/* =========================================================
   BASIC USER CACHE
========================================================= */

function saveUserCache(
    profile
) {

    if (!profile) {
        return;
    }


    try {

        localStorage.setItem(

            CACHE_KEY,

            JSON.stringify({

                uid:
                    profile.uid ||
                    "",

                displayName:
                    profile.displayName ||
                    "",

                username:
                    profile.username ||
                    "",

                photoURL:
                    profile.photoURL ||
                    "",

                isVerified:
                    profile.isVerified === true,

                status:
                    profile.status ||
                    "active"
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

async function loadUserProfile(
    user
) {

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


        if (
            !snapshot.exists()
        ) {

            console.warn(
                "CONNECTA profile does not exist:",
                user.uid
            );


            return {

                uid:
                    user.uid,

                displayName:
                    user.displayName ||
                    "",

                username:
                    "",

                email:
                    user.email ||
                    "",

                phone:
                    "",

                photoURL:
                    user.photoURL ||
                    "",

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
   MARK USER ONLINE
========================================================= */

async function markUserOnline(
    user
) {

    if (!user?.uid) {

        return;
    }


    try {

        await setDoc(

            doc(
                db,
                USER_COLLECTION,
                user.uid
            ),

            {

                isOnline:
                    true,

                lastSeen:
                    serverTimestamp()
            },

            {
                merge: true
            }
        );

    } catch (error) {

        /*
         * Presence failure should NOT log the user
         * out of CONNECTA.
         */

        console.warn(
            "CONNECTA presence update failed:",
            error
        );
    }
}


/* =========================================================
   START PRESENCE HEARTBEAT
========================================================= */

function startPresenceHeartbeat(
    user
) {

    if (!user?.uid) {

        return;
    }


    /*
     * Stop an old timer first.
     */
    stopPresenceHeartbeat();


    /*
     * Mark online immediately.
     */
    markUserOnline(
        user
    );


    /*
     * Keep updating while this page is active.
     */
    presenceTimer =
        setInterval(

            () => {

                /*
                 * Only continue if Firebase still
                 * has the same authenticated user.
                 */
                if (
                    currentAuthUser?.uid !==
                    user.uid
                ) {

                    stopPresenceHeartbeat();

                    return;
                }


                markUserOnline(
                    user
                );

            },

            PRESENCE_INTERVAL
        );
}


/* =========================================================
   STOP PRESENCE HEARTBEAT
========================================================= */

function stopPresenceHeartbeat() {

    if (
        presenceTimer
    ) {

        clearInterval(
            presenceTimer
        );

        presenceTimer =
            null;
    }
}


/* =========================================================
   RECENT ONLINE CHECK
========================================================= */

function isRecentlyOnline(
    profile
) {

    if (
        !profile ||
        profile.isOnline !== true
    ) {

        return false;
    }


    const lastSeen =
        profile.lastSeen;


    if (!lastSeen) {

        return false;
    }


    let timestamp = 0;


    if (
        typeof lastSeen.toMillis ===
        "function"
    ) {

        timestamp =
            lastSeen.toMillis();

    } else if (
        typeof lastSeen.toDate ===
        "function"
    ) {

        timestamp =
            lastSeen.toDate().getTime();

    } else if (
        typeof lastSeen.seconds ===
        "number"
    ) {

        timestamp =
            lastSeen.seconds * 1000;

    } else if (
        typeof lastSeen._seconds ===
        "number"
    ) {

        timestamp =
            lastSeen._seconds * 1000;

    } else {

        timestamp =
            new Date(
                lastSeen
            ).getTime();
    }


    if (
        !timestamp ||
        Number.isNaN(timestamp)
    ) {

        return false;
    }


    return (
        Date.now() -
        timestamp
    ) <=
    ONLINE_TIMEOUT;
}


/* =========================================================
   ACCOUNT STATUS
========================================================= */

function getAccountStatus(
    profile
) {

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

            stopPresenceHeartbeat();


            if (redirect) {

                redirectToLogin();
            }


            return null;
        }


        currentAuthUser =
            user;


        /*
         * Load CONNECTA profile.
         */
        const profile =
            await loadUserProfile(
                user
            );


        currentProfile =
            profile;


        /*
         * IMPORTANT:
         *
         * Every protected CONNECTA page that calls
         * getCurrentConnectaUser() now marks the
         * authenticated user ONLINE.
         *
         * This includes:
         *
         * dashboard.html
         * groups.html
         * group-chat.html
         * chat.html
         * profile.html
         * friends.html
         * stories.html
         * settings.html
         * verification.html
         * referrals.html
         * earn.html
         * etc.
         */
        startPresenceHeartbeat(
            user
        );


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


        /*
         * Block suspended/banned accounts
         * unless the page explicitly wants to
         * inspect the blocked account.
         */
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

        /*
         * Mark offline ONLY during an intentional
         * CONNECTA logout.
         *
         * We deliberately do NOT do this on
         * beforeunload/page navigation.
         */
        if (
            currentAuthUser?.uid
        ) {

            try {

                await setDoc(

                    doc(
                        db,
                        USER_COLLECTION,
                        currentAuthUser.uid
                    ),

                    {

                        isOnline:
                            false,

                        lastSeen:
                            serverTimestamp()
                    },

                    {
                        merge: true
                    }
                );

            } catch (presenceError) {

                console.warn(
                    "Could not mark user offline:",
                    presenceError
                );
            }
        }


        stopPresenceHeartbeat();


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


        stopPresenceHeartbeat();


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

    isRecentlyOnline,

    markUserOnline,

    startPresenceHeartbeat,

    stopPresenceHeartbeat,

    logout
};
