/* =========================================================
   CONNECTA PWA + FIREBASE FCM SERVICE WORKER
   Version 4
========================================================= */


/* =========================================================
   FIREBASE CLOUD MESSAGING
========================================================= */

/*
 * We use the Firebase COMPAT SDK here because this service
 * worker is loaded directly by the browser and is not bundled.
 *
 * Firebase officially supports this approach for service
 * workers that use importScripts().
 */

importScripts(
    "https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js"
);

importScripts(
    "https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js"
);


/* =========================================================
   FIREBASE CONFIG
========================================================= */

firebase.initializeApp({

    apiKey:
        "AIzaSyCRDtEYvigPofLBA2qK7z",

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

});


/* =========================================================
   FIREBASE MESSAGING
========================================================= */

const messaging =
    firebase.messaging();


/* =========================================================
   CONNECTA PWA CACHE
========================================================= */

const CACHE_NAME =
    "connecta-pwa-v4";


/* =========================================================
   APP SHELL
========================================================= */

const APP_SHELL = [

    "/",
    "/index.html",
    "/manifest.webmanifest",

    "/connecta-icon-192.png",
    "/connecta-icon-512.png"

];


/* =========================================================
   STATIC FILE TYPES
========================================================= */

const STATIC_DESTINATIONS =
    new Set([

        "script",
        "style",
        "image",
        "font"

    ]);


/* =========================================================
   FCM BACKGROUND MESSAGE
========================================================= */

/*
 * This runs when CONNECTA is not in the foreground.
 *
 * Our backend will later send data such as:
 *
 * {
 *   type: "private_message",
 *   senderName: "Dr. John Knec",
 *   message: "Hello",
 *   chatId: "..."
 * }
 *
 * or:
 *
 * {
 *   type: "group_message",
 *   groupName: "KCSE 2026 REVISION PAPERS",
 *   senderName: "Dr. John Knec",
 *   message: "New paper available",
 *   groupId: "..."
 * }
 */

messaging.onBackgroundMessage(
    payload => {

        console.log(
            "[CONNECTA FCM] Background message:",
            payload
        );


        const data =
            payload.data || {};


        /*
         * Sender
         */

        const senderName =
            data.senderName ||
            data.senderDisplayName ||
            "CONNECTA User";


        /*
         * Message
         */

        const messageText =
            data.message ||
            data.text ||
            "You have a new message.";


        /*
         * Notification type
         */

        const notificationType =
            data.type ||
            "private_message";


        /*
         * Group
         */

        const groupName =
            data.groupName ||
            "CONNECTA Group";


        /*
         * Title
         */

        let title =
            "💬 " + senderName;


        if (
            notificationType ===
            "group_message"
        ) {

            title =
                "👥 " + groupName;

        }


        /*
         * Notification options
         */

        const notificationOptions = {

            body:
                notificationType ===
                "group_message"

                    ? `${senderName}: ${messageText}`

                    : messageText,

            icon:
                "/connecta-icon-192.png",

            badge:
                "/connecta-icon-192.png",

            tag:
                data.messageId ||
                data.chatId ||
                data.groupId ||
                "connecta-message",

            renotify:
                true,

            data: {

                type:
                    notificationType,

                chatId:
                    data.chatId || "",

                groupId:
                    data.groupId || "",

                senderId:
                    data.senderId || "",

                url:
                    data.url || ""

            }

        };


        /*
         * Display notification.
         */

        return self.registration.showNotification(

            title,

            notificationOptions

        );

    }
);


/* =========================================================
   NOTIFICATION CLICK
========================================================= */

/*
 * Firebase recommends handling notificationclick so we
 * control exactly where the user goes after tapping.
 */

self.addEventListener(
    "notificationclick",
    event => {

        event.notification.close();


        const data =
            event.notification.data || {};


        let targetUrl =
            "/dashboard.html";


        /*
         * Private chat
         */

        if (
            data.type ===
            "private_message" &&
            data.chatId
        ) {

            targetUrl =
                `/chat.html?chatId=${encodeURIComponent(
                    data.chatId
                )}`;

        }


        /*
         * Group chat
         */

        else if (
            data.type ===
            "group_message" &&
            data.groupId
        ) {

            targetUrl =
                `/group-chat.html?groupId=${encodeURIComponent(
                    data.groupId
                )}`;

        }


        /*
         * Explicit URL supplied by backend
         */

        else if (
            data.url
        ) {

            targetUrl =
                data.url;

        }


        event.waitUntil(

            clients
                .matchAll({

                    type:
                        "window",

                    includeUncontrolled:
                        true

                })

                .then(
                    windowClients => {

                        /*
                         * Look for an existing CONNECTA
                         * window.
                         */

                        for (
                            const client
                            of windowClients
                        ) {

                            if (
                                "focus"
                                in client
                            ) {

                                return client
                                    .navigate(
                                        targetUrl
                                    )
                                    .then(
                                        () =>
                                            client.focus()
                                    );

                            }

                        }


                        /*
                         * No CONNECTA window exists.
                         *
                         * Open a new one.
                         */

                        if (
                            clients.openWindow
                        ) {

                            return clients.openWindow(
                                targetUrl
                            );

                        }

                    }

                )

        );

    }
);


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
                .open(
                    CACHE_NAME
                )

                .then(
                    async cache => {

                        await Promise.allSettled(

                            APP_SHELL.map(
                                url =>
                                    cache.add(url)
                            )

                        );

                    }

                )

        );


        self.skipWaiting();

    }
);


/* =========================================================
   ACTIVATE
========================================================= */

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches
                .keys()

                .then(
                    cacheNames => {

                        return Promise.all(

                            cacheNames

                                .filter(
                                    name =>
                                        name.startsWith(
                                            "connecta-pwa-"
                                        ) &&
                                        name !==
                                            CACHE_NAME
                                )

                                .map(
                                    name =>
                                        caches.delete(
                                            name
                                        )
                                )

                        );

                    }

                )

                .then(
                    () =>
                        self.clients.claim()
                )

        );

    }
);


/* =========================================================
   HELPERS
========================================================= */

function isSameOrigin(
    request
) {

    try {

        return (
            new URL(
                request.url
            ).origin ===
            self.location.origin
        );

    } catch {

        return false;

    }

}


function isExcludedRequest(
    request
) {

    const url =
        new URL(
            request.url
        );


    const pathname =
        url.pathname.toLowerCase();


    const hostname =
        url.hostname.toLowerCase();


    if (
        pathname.startsWith(
            "/api/"
        )
    ) {

        return true;

    }


    if (
        hostname.includes(
            "googleapis.com"
        ) ||

        hostname.includes(
            "firebaseapp.com"
        ) ||

        hostname.includes(
            "firebaseio.com"
        ) ||

        hostname.includes(
            "gstatic.com"
        )
    ) {

        return true;

    }


    if (
        hostname.includes(
            "optimapay"
        )
    ) {

        return true;

    }


    return false;

}


function isCacheableResponse(
    response
) {

    if (!response) {

        return false;

    }


    if (
        response.status !==
        200
    ) {

        return false;

    }


    if (
        response.type ===
        "opaque"
    ) {

        return false;

    }


    return true;

}


/* =========================================================
   CACHE UPDATE
========================================================= */

async function updateCache(
    request,
    response
) {

    if (
        !isCacheableResponse(
            response
        )
    ) {

        return;

    }


    try {

        const cache =
            await caches.open(
                CACHE_NAME
            );


        await cache.put(
            request,
            response.clone()
        );

    } catch (error) {

        console.warn(
            "[CONNECTA SW] Cache update failed:",
            error
        );

    }

}


/* =========================================================
   NETWORK FETCH + CACHE
========================================================= */

async function fetchAndCache(
    request
) {

    const response =
        await fetch(
            request
        );


    if (
        isCacheableResponse(
            response
        )
    ) {

        updateCache(
            request,
            response
        );

    }


    return response;

}


/* =========================================================
   NAVIGATION
========================================================= */

async function handleNavigation(
    request
) {

    try {

        const response =
            await fetch(
                request
            );


        if (
            isCacheableResponse(
                response
            )
        ) {

            updateCache(
                request,
                response
            );


            return response;

        }


        throw new Error(
            "Navigation response was not cacheable."
        );

    } catch {

        const cache =
            await caches.open(
                CACHE_NAME
            );


        const exactMatch =
            await cache.match(
                request
            );


        if (exactMatch) {

            return exactMatch;

        }


        const indexMatch =
            await cache.match(
                "/index.html"
            );


        if (indexMatch) {

            return indexMatch;

        }


        return new Response(

            `
            <!DOCTYPE html>

            <html>

            <head>

                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width,initial-scale=1"
                >

                <title>CONNECTA</title>

                <style>

                    body {
                        margin:0;
                        min-height:100vh;
                        display:grid;
                        place-items:center;
                        font-family:Arial,sans-serif;
                        background:#f4f8f5;
                        color:#17211b;
                    }

                    .box {
                        width:min(360px,90%);
                        padding:28px;
                        text-align:center;
                        background:#fff;
                        border-radius:20px;
                        box-shadow:
                            0 15px 40px
                            rgba(0,0,0,.08);
                    }

                    h2 {
                        margin-top:0;
                    }

                    p {
                        color:#718078;
                        line-height:1.5;
                    }

                </style>

            </head>

            <body>

                <div class="box">

                    <h2>
                        CONNECTA
                    </h2>

                    <p>
                        You're offline.
                        Please reconnect to
                        continue using CONNECTA.
                    </p>

                </div>

            </body>

            </html>
            `,

            {

                status:
                    503,

                headers: {

                    "Content-Type":
                        "text/html;charset=UTF-8"

                }

            }

        );

    }

}


/* =========================================================
   STATIC ASSETS
========================================================= */

async function handleStaticAsset(
    request
) {

    const cache =
        await caches.open(
            CACHE_NAME
        );


    const cached =
        await cache.match(
            request
        );


    if (cached) {

        fetchAndCache(
            request
        ).catch(
            () => {}
        );


        return cached;

    }


    try {

        const response =
            await fetch(
                request
            );


        if (
            isCacheableResponse(
                response
            )
        ) {

            await updateCache(
                request,
                response
            );

        }


        return response;

    } catch {

        return new Response(
            "",
            {
                status:503
            }
        );

    }

}


/* =========================================================
   OTHER SAME-ORIGIN GET REQUESTS
========================================================= */

async function handleOtherRequest(
    request
) {

    const cache =
        await caches.open(
            CACHE_NAME
        );


    const cached =
        await cache.match(
            request
        );


    if (cached) {

        fetchAndCache(
            request
        ).catch(
            () => {}
        );


        return cached;

    }


    try {

        const response =
            await fetch(
                request
            );


        if (
            isCacheableResponse(
                response
            )
        ) {

            updateCache(
                request,
                response
            );

        }


        return response;

    } catch {

        return new Response(
            "",
            {
                status:503
            }
        );

    }

}


/* =========================================================
   FETCH
========================================================= */

self.addEventListener(
    "fetch",
    event => {

        const request =
            event.request;


        if (
            request.method !==
            "GET"
        ) {

            return;

        }


        if (
            !isSameOrigin(
                request
            )
        ) {

            return;

        }


        if (
            isExcludedRequest(
                request
            )
        ) {

            return;

        }


        const url =
            new URL(
                request.url
            );


        if (
            request.mode ===
            "navigate"
        ) {

            event.respondWith(
                handleNavigation(
                    request
                )
            );

            return;

        }


        if (
            STATIC_DESTINATIONS.has(
                request.destination
            )
        ) {

            event.respondWith(
                handleStaticAsset(
                    request
                )
            );

            return;

        }


        if (
            url.pathname ===
            "/manifest.webmanifest"
        ) {

            event.respondWith(
                handleStaticAsset(
                    request
                )
            );

            return;

        }


        event.respondWith(
            handleOtherRequest(
                request
            )
        );

    }
);


/* =========================================================
   OPTIONAL MESSAGE CONTROL
========================================================= */

self.addEventListener(
    "message",
    event => {

        if (
            event.data?.type ===
            "SKIP_WAITING"
        ) {

            self.skipWaiting();

        }

    }
);
