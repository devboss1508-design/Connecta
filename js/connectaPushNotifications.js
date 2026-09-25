/* =========================================================
   CONNECTA FCM PUSH NOTIFICATIONS
   Version 1.0
========================================================= */

import { auth, db } from "./firebase.js";

import {
    getMessaging,
    getToken,
    onMessage,
    deleteToken
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging.js";

import {
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const FCM_CONFIG = {

    /*
     * Public VAPID key generated in Firebase Console.
     */

    vapidKey:
        "BCqR1tQBX35JWEIWnpZuMj98YyIrNKuEXsFKi9zSgSrcX3TLNHvijkHHhOfb5JzKNTViUnr4g7kSgEoTRF3E1gU",

    /*
     * Your existing service worker.
     */

    serviceWorkerPath:
        "/service-worker.js",

    /*
     * Where device tokens will be stored.
     */

    tokenCollection:
        "pushTokens"

};


/* =========================================================
   STATE
========================================================= */

let messaging = null;

let serviceWorkerRegistration = null;

let currentFcmToken = null;

let foregroundListenerStarted = false;


/* =========================================================
   LOG PREFIX
========================================================= */

const LOG_PREFIX =
    "[CONNECTA FCM]";


/* =========================================================
   GET FIREBASE MESSAGING
========================================================= */

function getConnectaMessaging() {

    if (!messaging) {

        messaging =
            getMessaging();

    }

    return messaging;

}


/* =========================================================
   REGISTER SERVICE WORKER
========================================================= */

async function registerConnectaServiceWorker() {

    if (
        !("serviceWorker" in navigator)
    ) {

        console.warn(
            LOG_PREFIX,
            "Service workers are not supported."
        );

        return null;

    }


    try {

        /*
         * Register the EXISTING CONNECTA service worker.
         */

        serviceWorkerRegistration =
            await navigator.serviceWorker.register(

                FCM_CONFIG.serviceWorkerPath,

                {
                    scope: "/"
                }

            );


        console.log(
            LOG_PREFIX,
            "Service worker registered:",
            serviceWorkerRegistration.scope
        );


        /*
         * Wait until the service worker is ready.
         */

        await navigator.serviceWorker.ready;


        return serviceWorkerRegistration;

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Service worker registration failed:",
            error
        );

        return null;

    }

}


/* =========================================================
   CREATE SAFE TOKEN DOCUMENT ID
========================================================= */

/*
 * FCM tokens are long strings and can contain characters
 * that aren't ideal for Firestore document IDs.
 *
 * We create a deterministic safe ID from the token.
 */

async function createTokenDocumentId(
    token
) {

    const encoder =
        new TextEncoder();


    const data =
        encoder.encode(
            token
        );


    /*
     * Use SHA-256 where supported.
     */

    if (
        crypto?.subtle
    ) {

        const hashBuffer =
            await crypto.subtle.digest(
                "SHA-256",
                data
            );


        const hashArray =
            Array.from(
                new Uint8Array(
                    hashBuffer
                )
            );


        return hashArray
            .map(
                byte =>
                    byte
                        .toString(16)
                        .padStart(
                            2,
                            "0"
                        )
            )
            .join("");

    }


    /*
     * Fallback.
     */

    return btoa(
        token
    )
        .replace(
            /[^a-zA-Z0-9]/g,
            ""
        )
        .substring(
            0,
            100
        );

}


/* =========================================================
   SAVE FCM TOKEN
========================================================= */

async function saveFcmToken(
    user,
    token
) {

    if (
        !user ||
        !user.uid ||
        !token
    ) {

        return false;

    }


    try {

        const tokenId =
            await createTokenDocumentId(
                token
            );


        const tokenRef =
            doc(
                db,
                "users",
                user.uid,
                FCM_CONFIG.tokenCollection,
                tokenId
            );


        await setDoc(

            tokenRef,

            {

                uid:
                    user.uid,

                token:
                    token,

                platform:
                    "web",

                userAgent:
                    navigator.userAgent,

                language:
                    navigator.language || "",

                permission:
                    Notification.permission,

                createdAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp(),

                lastSeenAt:
                    serverTimestamp(),

                enabled:
                    true

            },

            {
                merge:
                    true
            }

        );


        console.log(
            LOG_PREFIX,
            "FCM token saved."
        );


        return true;

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Failed to save FCM token:",
            error
        );

        return false;

    }

}


/* =========================================================
   GET FCM TOKEN
========================================================= */

async function getConnectaFcmToken(
    user
) {

    if (
        !user
    ) {

        console.warn(
            LOG_PREFIX,
            "No authenticated user."
        );

        return null;

    }


    if (
        !("Notification" in window)
    ) {

        console.warn(
            LOG_PREFIX,
            "Browser notifications are not supported."
        );

        return null;

    }


    /*
     * If permission is not granted, don't silently
     * force the browser permission prompt.
     */

    if (
        Notification.permission !==
        "granted"
    ) {

        console.log(
            LOG_PREFIX,
            "Notification permission is not granted."
        );

        return null;

    }


    const registration =
        serviceWorkerRegistration ||
        await registerConnectaServiceWorker();


    if (
        !registration
    ) {

        return null;

    }


    try {

        const messagingInstance =
            getConnectaMessaging();


        const token =
            await getToken(

                messagingInstance,

                {

                    vapidKey:
                        FCM_CONFIG.vapidKey,

                    serviceWorkerRegistration:
                        registration

                }

            );


        if (!token) {

            console.warn(
                LOG_PREFIX,
                "FCM did not return a token."
            );

            return null;

        }


        currentFcmToken =
            token;


        console.log(
            LOG_PREFIX,
            "FCM token obtained."
        );


        await saveFcmToken(
            user,
            token
        );


        return token;

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Unable to obtain FCM token:",
            error
        );

        return null;

    }

}


/* =========================================================
   REQUEST NOTIFICATION PERMISSION
========================================================= */

async function requestConnectaNotificationPermission() {

    if (
        !("Notification" in window)
    ) {

        console.warn(
            LOG_PREFIX,
            "Notifications are not supported."
        );

        return "unsupported";

    }


    /*
     * Already granted.
     */

    if (
        Notification.permission ===
        "granted"
    ) {

        return "granted";

    }


    /*
     * Already denied.
     */

    if (
        Notification.permission ===
        "denied"
    ) {

        console.warn(
            LOG_PREFIX,
            "Notification permission was denied."
        );

        return "denied";

    }


    try {

        const permission =
            await Notification.requestPermission();


        console.log(
            LOG_PREFIX,
            "Notification permission:",
            permission
        );


        return permission;

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Permission request failed:",
            error
        );

        return "denied";

    }

}


/* =========================================================
   ENABLE PUSH NOTIFICATIONS
========================================================= */

async function enableConnectaPushNotifications(
    user = auth.currentUser
) {

    if (
        !user
    ) {

        console.warn(
            LOG_PREFIX,
            "Cannot enable push without login."
        );

        return {
            success:
                false,

            reason:
                "not_authenticated"

        };

    }


    /*
     * Request permission.
     *
     * This function should preferably be called
     * from a user action such as tapping:
     *
     * "Enable Notifications"
     */

    const permission =
        await requestConnectaNotificationPermission();


    if (
        permission !==
        "granted"
    ) {

        return {

            success:
                false,

            reason:
                permission

        };

    }


    /*
     * Register service worker.
     */

    const registration =
        await registerConnectaServiceWorker();


    if (
        !registration
    ) {

        return {

            success:
                false,

            reason:
                "service_worker_failed"

        };

    }


    /*
     * Obtain and save FCM token.
     */

    const token =
        await getConnectaFcmToken(
            user
        );


    if (
        !token
    ) {

        return {

            success:
                false,

            reason:
                "token_failed"

        };

    }


    return {

        success:
            true,

        token:
            token

    };

}


/* =========================================================
   REFRESH TOKEN IF ALREADY ENABLED
========================================================= */

async function refreshConnectaPushToken(
    user = auth.currentUser
) {

    if (
        !user
    ) {

        return null;

    }


    if (
        !("Notification" in window)
    ) {

        return null;

    }


    if (
        Notification.permission !==
        "granted"
    ) {

        return null;

    }


    try {

        const registration =
            await registerConnectaServiceWorker();


        if (
            !registration
        ) {

            return null;

        }


        return await getConnectaFcmToken(
            user
        );

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Token refresh failed:",
            error
        );

        return null;

    }

}


/* =========================================================
   FOREGROUND FCM MESSAGES
========================================================= */

function startForegroundFcmListener() {

    if (
        foregroundListenerStarted
    ) {

        return;

    }


    foregroundListenerStarted =
        true;


    try {

        const messagingInstance =
            getConnectaMessaging();


        onMessage(
            messagingInstance,

            payload => {

                console.log(
                    LOG_PREFIX,
                    "Foreground FCM message:",
                    payload
                );


                /*
                 * IMPORTANT:
                 *
                 * We intentionally DO NOT show another
                 * notification popup here.
                 *
                 * Your existing:
                 *
                 * connectaNotifications.js
                 *
                 * already displays the beautiful CONNECTA
                 * popup for foreground messages.
                 *
                 * This prevents duplicate notifications.
                 */

            }

        );

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Foreground listener failed:",
            error
        );

    }

}


/* =========================================================
   REMOVE CURRENT TOKEN
========================================================= */

async function removeConnectaPushToken(
    user = auth.currentUser
) {

    if (
        !user
    ) {

        return false;

    }


    try {

        const messagingInstance =
            getConnectaMessaging();


        /*
         * Delete the FCM registration from this browser.
         */

        await deleteToken(
            messagingInstance
        );


        /*
         * Remove our Firestore token record.
         */

        if (
            currentFcmToken
        ) {

            const tokenId =
                await createTokenDocumentId(
                    currentFcmToken
                );


            await deleteDoc(

                doc(
                    db,
                    "users",
                    user.uid,
                    FCM_CONFIG.tokenCollection,
                    tokenId
                )

            );

        }


        currentFcmToken =
            null;


        console.log(
            LOG_PREFIX,
            "FCM token removed."
        );


        return true;

    } catch (error) {

        console.error(
            LOG_PREFIX,
            "Failed to remove FCM token:",
            error
        );

        return false;

    }

}


/* =========================================================
   AUTOMATIC START
========================================================= */

/*
 * If the user has ALREADY granted notification
 * permission, we can refresh the token automatically.
 *
 * We do NOT automatically ask for permission here.
 *
 * This is important because browsers may block permission
 * prompts that happen without a user gesture.
 */

auth.onAuthStateChanged(
    async user => {

        if (!user) {

            currentFcmToken =
                null;

            return;

        }


        startForegroundFcmListener();


        /*
         * If permission has already been granted,
         * refresh/register the token.
         */

        if (
            "Notification" in window &&
            Notification.permission ===
                "granted"
        ) {

            await refreshConnectaPushToken(
                user
            );

        }

    }
);


/* =========================================================
   GLOBAL CONNECTA PUSH API
========================================================= */

window.CONNECTA_PUSH = {

    enable:
        enableConnectaPushNotifications,

    refresh:
        refreshConnectaPushToken,

    remove:
        removeConnectaPushToken,

    permission:
        () =>
            "Notification" in window
                ? Notification.permission
                : "unsupported",

    getToken:
        () =>
            currentFcmToken

};


/* =========================================================
   EXPORTS
========================================================= */

export {

    enableConnectaPushNotifications,

    refreshConnectaPushToken,

    removeConnectaPushToken,

    requestConnectaNotificationPermission

};
