/* =========================================================
   CONNECTA PWA SERVICE WORKER
   FAST CACHE-FIRST VERSION
========================================================= */

const CACHE_NAME = "connecta-pwa-v3";


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

const STATIC_DESTINATIONS = new Set([

    "script",
    "style",
    "image",
    "font"

]);


/* =========================================================
   INSTALL
========================================================= */

self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
                .open(CACHE_NAME)
                .then(async cache => {

                    /*
                     * Don't allow one missing file to
                     * break the entire service worker.
                     */

                    await Promise.allSettled(

                        APP_SHELL.map(
                            url =>
                                cache.add(url)
                        )

                    );

                })

        );


        /*
         * Activate immediately.
         */

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
                .then(cacheNames => {

                    return Promise.all(

                        cacheNames

                            .filter(
                                name =>
                                    name.startsWith(
                                        "connecta-pwa-"
                                    ) &&
                                    name !== CACHE_NAME
                            )

                            .map(
                                name =>
                                    caches.delete(name)
                            )

                    );

                })

                .then(() =>
                    self.clients.claim()
                )

        );

    }
);


/* =========================================================
   HELPERS
========================================================= */


/*
 * Only handle requests belonging to
 * the CONNECTA website itself.
 */

function isSameOrigin(request) {

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


/*
 * Don't allow API/Firebase/payment requests
 * to enter the PWA cache.
 */

function isExcludedRequest(request) {

    const url =
        new URL(
            request.url
        );


    const pathname =
        url.pathname.toLowerCase();


    const hostname =
        url.hostname.toLowerCase();


    /* API */

    if (
        pathname.startsWith("/api/")
    ) {

        return true;

    }


    /* Firebase / Google services */

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


    /* OptimaPay */

    if (
        hostname.includes(
            "optimapay"
        )
    ) {

        return true;

    }


    return false;

}


/*
 * Check whether a response can safely
 * be stored in Cache Storage.
 */

function isCacheableResponse(response) {

    if (!response) {
        return false;
    }


    /*
     * Only successful responses.
     */

    if (
        response.status !== 200
    ) {

        return false;

    }


    /*
     * Opaque responses are not cached
     * by this service worker.
     */

    if (
        response.type === "opaque"
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

        /*
         * Cache in background.
         */

        updateCache(
            request,
            response
        );

    }


    return response;

}


/* =========================================================
   NAVIGATION
=========================================================

   HTML pages:

   1. Try network first
   2. Update cache
   3. If offline, use cached page
   4. Finally use cached index.html
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

            /*
             * Save the latest HTML.
             */

            updateCache(
                request,
                response
            );


            /*
             * Also update index.html when
             * this is the root page.
             */

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


        /*
         * First try the exact requested page.
         */

        const exactMatch =
            await cache.match(
                request
            );


        if (exactMatch) {

            return exactMatch;

        }


        /*
         * Then try index.html.
         */

        const indexMatch =
            await cache.match(
                "/index.html"
            );


        if (indexMatch) {

            return indexMatch;

        }


        /*
         * Last fallback.
         */

        return new Response(

            `
            <!DOCTYPE html>

            <html>

            <head>

                <meta
                    charset="UTF-8"
                >

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
                status: 503,
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
=========================================================

   JS / CSS / images / fonts:

   1. Check cache FIRST
   2. Return immediately if found
   3. Refresh cache in background
   4. If not cached, fetch network
   5. Save response
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

        /*
         * IMPORTANT:
         *
         * Return cached file immediately.
         *
         * This is what makes the PWA feel
         * much faster on repeat launches.
         */

        fetchAndCache(
            request
        ).catch(
            () => {}
        );


        return cached;

    }


    /*
     * Not cached yet.
     */

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

        /*
         * No cached version and no network.
         */

        return new Response(
            "",
            {
                status: 503
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

        /*
         * Use cache immediately.
         */

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
                status: 503
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


        /*
         * Only GET requests.
         */

        if (
            request.method !== "GET"
        ) {

            return;

        }


        /*
         * Don't interfere with
         * external requests.
         */

        if (
            !isSameOrigin(
                request
            )
        ) {

            return;

        }


        /*
         * Never cache APIs or payment
         * requests.
         */

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


        /*
         * Navigation / HTML page.
         */

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


        /*
         * Static assets.
         */

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


        /*
         * Manifest, favicon and other
         * same-origin GET resources.
         */

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


        /*
         * Everything else.
         */

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
