/* =========================================================
   CONNECTA NOTIFICATION ENGINE
   Version: 1.0

   Safe standalone notification layer.
   Does NOT modify:
   - chat.js
   - group-chat.js
   - dashboard.js
   - Firestore message structure
========================================================= */

import {
    auth,
    db
} from "./firebase.js";

import {
    collection,
    query,
    where,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const NOTIFICATION_CONFIG = {

    /*
     * How long the in-app popup remains visible.
     */
    popupDuration:
        4500,

    /*
     * Prevent the same message from generating
     * another notification.
     */
    processedLimit:
        200,

    /*
     * Storage key for processed messages.
     */
    storageKey:
        "connectaProcessedNotifications_v1"

};


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let stopPrivateMessages = null;

let notificationStarted = false;

let processedMessages = new Set();

let notificationPermissionRequested = false;


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {

    return document.getElementById(id);

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

    return String(
        value ?? ""
    )

        .replace(
            /[&<>"']/g,
            character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[character])
        );

}


/* =========================================================
   LOAD PROCESSED NOTIFICATIONS
========================================================= */

function loadProcessedNotifications() {

    try {

        const raw =
            localStorage.getItem(
                NOTIFICATION_CONFIG.storageKey
            );


        if (!raw) {

            return;

        }


        const values =
            JSON.parse(raw);


        if (
            !Array.isArray(values)
        ) {

            return;

        }


        processedMessages =
            new Set(
                values
            );

    } catch (error) {

        console.warn(
            "CONNECTA notification history could not be loaded:",
            error
        );

    }

}


/* =========================================================
   SAVE PROCESSED NOTIFICATIONS
========================================================= */

function saveProcessedNotifications() {

    try {

        const values =
            Array.from(
                processedMessages
            ).slice(
                -NOTIFICATION_CONFIG.processedLimit
            );


        localStorage.setItem(

            NOTIFICATION_CONFIG.storageKey,

            JSON.stringify(
                values
            )

        );

    } catch (error) {

        console.warn(
            "CONNECTA notification history could not be saved:",
            error
        );

    }

}


/* =========================================================
   MARK MESSAGE PROCESSED
========================================================= */

function markMessageProcessed(
    messageId
) {

    if (!messageId) {

        return;

    }


    processedMessages.add(
        messageId
    );


    /*
     * Keep the local set small.
     */

    if (
        processedMessages.size >
        NOTIFICATION_CONFIG.processedLimit
    ) {

        const values =
            Array.from(
                processedMessages
            ).slice(
                -NOTIFICATION_CONFIG.processedLimit
            );


        processedMessages =
            new Set(
                values
            );

    }


    saveProcessedNotifications();

}


/* =========================================================
   MESSAGE PREVIEW
========================================================= */

function getMessagePreview(
    message
) {

    if (
        message.type === "image" ||
        message.imageUrl ||
        message.photoURL ||
        message.photoUrl
    ) {

        return "📷 Photo";

    }


    const text =
        String(
            message.text || ""
        ).trim();


    if (!text) {

        return "New message";

    }


    return text.length > 90

        ? `${text.slice(0, 87)}...`

        : text;

}


/* =========================================================
   GET SENDER NAME
========================================================= */

function getSenderName(
    message
) {

    return (
        message.senderName ||
        message.displayName ||
        message.senderDisplayName ||
        "CONNECTA User"
    );

}


/* =========================================================
   CREATE NOTIFICATION CONTAINER
========================================================= */

function ensureNotificationContainer() {

    let container =
        $("connectaNotificationContainer");


    if (container) {

        return container;

    }


    container =
        document.createElement(
            "div"
        );


    container.id =
        "connectaNotificationContainer";


    container.setAttribute(
        "aria-live",
        "polite"
    );


    container.setAttribute(
        "aria-atomic",
        "true"
    );


    container.style.cssText = `
        position: fixed;
        top: calc(
            14px +
            env(safe-area-inset-top, 0px)
        );
        left: 12px;
        right: 12px;
        z-index: 999999;

        display: flex;
        flex-direction: column;
        gap: 8px;

        pointer-events: none;
    `;


    document.body.appendChild(
        container
    );


    return container;

}


/* =========================================================
   SHOW IN-APP POPUP
========================================================= */

function showInAppNotification(
    message
) {

    const container =
        ensureNotificationContainer();


    const senderName =
        getSenderName(
            message
        );


    const preview =
        getMessagePreview(
            message
        );


    const notification =
        document.createElement(
            "button"
        );


    notification.type =
        "button";


    notification.className =
        "connecta-message-notification";


    notification.style.cssText = `
        width: 100%;
        max-width: 430px;
        margin: 0 auto;

        display: flex;
        align-items: center;
        gap: 11px;

        padding: 12px 14px;

        border: 0;
        border-radius: 17px;

        background: #ffffff;
        color: #17211b;

        box-shadow:
            0 10px 35px
            rgba(0,0,0,.18);

        text-align: left;

        cursor: pointer;

        pointer-events: auto;

        animation:
            connectaNotificationIn
            .25s ease-out;
    `;


    notification.innerHTML = `

        <div
            style="
                width:43px;
                height:43px;
                min-width:43px;

                border-radius:50%;

                display:flex;
                align-items:center;
                justify-content:center;

                background:#e8f8ed;
                color:#16a34a;

                font-size:19px;
                font-weight:800;
            "
        >
            💬
        </div>


        <div
            style="
                min-width:0;
                flex:1;
            "
        >

            <div
                style="
                    display:flex;
                    align-items:center;
                    gap:6px;
                    margin-bottom:3px;
                "
            >

                <strong
                    style="
                        font-size:13px;
                        white-space:nowrap;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    "
                >
                    ${escapeHtml(
                        senderName
                    )}
                </strong>

                <span
                    style="
                        font-size:10px;
                        color:#22c55e;
                        font-weight:800;
                    "
                >
                    NEW
                </span>

            </div>


            <div
                style="
                    font-size:12px;
                    line-height:1.4;
                    color:#66736b;

                    white-space:nowrap;
                    overflow:hidden;
                    text-overflow:ellipsis;
                "
            >
                ${escapeHtml(
                    preview
                )}
            </div>

        </div>


        <span
            style="
                font-size:20px;
                color:#9aa59f;
                flex-shrink:0;
            "
        >
            ›
        </span>

    `;


    /*
     * Open the appropriate private chat.
     */

    notification.addEventListener(
        "click",
        () => {

            if (
                message.senderId &&
                currentUser
            ) {

                location.href =
                    `chat.html?uid=${encodeURIComponent(
                        message.senderId
                    )}`;

            }


            notification.remove();

        }
    );


    container.prepend(
        notification
    );


    /*
     * Maximum of 3 simultaneous popups.
     */

    while (
        container.children.length >
        3
    ) {

        container.lastElementChild?.remove();

    }


    setTimeout(
        () => {

            if (
                notification.isConnected
            ) {

                notification.style.animation =
                    "connectaNotificationOut .2s ease-in forwards";


                setTimeout(
                    () => {

                        notification.remove();

                    },
                    220
                );

            }

        },
        NOTIFICATION_CONFIG.popupDuration
    );

}


/* =========================================================
   BROWSER NOTIFICATION
========================================================= */

function showBrowserNotification(
    message
) {

    /*
     * Browser notifications only work when:
     *
     * - Notification API exists
     * - permission has been granted
     * - page is not currently the active page
     */

    if (
        !("Notification" in window)
    ) {

        return;

    }


    if (
        Notification.permission !==
        "granted"
    ) {

        return;

    }


    /*
     * Don't create an OS notification while the
     * user is actively looking at CONNECTA.
     *
     * The in-app popup is enough in that situation.
     */

    if (
        document.visibilityState ===
        "visible"
    ) {

        return;

    }


    const senderName =
        getSenderName(
            message
        );


    const preview =
        getMessagePreview(
            message
        );


    try {

        const notification =
            new Notification(
                `CONNECTA • ${senderName}`,
                {

                    body:
                        preview,

                    tag:
                        `connecta-message-${message.id}`,

                    icon:
                        "/connecta-icon-192.png",

                    badge:
                        "/connecta-icon-192.png",

                    data: {

                        uid:
                            message.senderId

                    }

                }
            );


        notification.onclick =
            () => {

                window.focus();


                if (
                    message.senderId
                ) {

                    location.href =
                        `chat.html?uid=${encodeURIComponent(
                            message.senderId
                        )}`;

                }


                notification.close();

            };

    } catch (error) {

        console.warn(
            "CONNECTA browser notification failed:",
            error
        );

    }

}


/* =========================================================
   REQUEST NOTIFICATION PERMISSION
========================================================= */

async function requestNotificationPermission() {

    if (
        notificationPermissionRequested
    ) {

        return;

    }


    notificationPermissionRequested =
        true;


    if (
        !("Notification" in window)
    ) {

        return;

    }


    if (
        Notification.permission !==
        "default"
    ) {

        return;

    }


    /*
     * We intentionally do not force the permission
     * request immediately on page load.
     *
     * Call this from a user interaction later.
     */

}


/* =========================================================
   PROCESS NEW MESSAGE
========================================================= */

function processIncomingMessage(
    message
) {

    if (
        !message ||
        !message.id ||
        !currentUser
    ) {

        return;

    }


    /*
     * Never notify the sender about their own message.
     */

    if (
        message.senderId ===
        currentUser.uid
    ) {

        return;

    }


    /*
     * Already processed.
     */

    if (
        processedMessages.has(
            message.id
        )
    ) {

        return;

    }


    /*
     * Only notify messages addressed to
     * the current user.
     */

    if (
        message.receiverId &&
        message.receiverId !==
        currentUser.uid
    ) {

        return;

    }


    markMessageProcessed(
        message.id
    );


    showInAppNotification(
        message
    );


    showBrowserNotification(
        message
    );

}


/* =========================================================
   LISTEN TO PRIVATE MESSAGES
========================================================= */

function listenToPrivateMessages() {

    if (
        !currentUser
    ) {

        return;

    }


    if (
        stopPrivateMessages
    ) {

        stopPrivateMessages();

        stopPrivateMessages =
            null;

    }


    /*
     * Listen only to chats where the current user
     * participates.
     *
     * This does NOT read every chat on CONNECTA.
     */

    const chatsQuery =
        query(

            collection(
                db,
                "chats"
            ),

            where(
                "participants",
                "array-contains",
                currentUser.uid
            )

        );


    stopPrivateMessages =
        onSnapshot(

            chatsQuery,

            snapshot => {

                snapshot.docChanges()
                    .forEach(
                        change => {

                            /*
                             * Only process newly-created
                             * chat documents here.
                             *
                             * Actual message notifications
                             * are handled below through
                             * each conversation listener.
                             */

                            if (
                                change.type ===
                                "added"
                            ) {

                                listenToConversation(
                                    change.doc.id
                                );

                            }

                        }
                    );

            },

            error => {

                console.warn(
                    "CONNECTA notification chat listener failed:",
                    error
                );

            }

        );

}


/* =========================================================
   CONVERSATION MESSAGE LISTENERS
========================================================= */

const conversationListeners =
    new Map();


function listenToConversation(
    chatId
) {

    if (
        !chatId ||
        conversationListeners.has(
            chatId
        )
    ) {

        return;

    }


    const messagesRef =
        collection(
            db,
            "chats",
            chatId,
            "messages"
        );


    const messagesQuery =
        query(
            messagesRef
        );


    const unsubscribe =
        onSnapshot(

            messagesQuery,

            snapshot => {

                snapshot.docChanges()
                    .forEach(
                        change => {

                            if (
                                change.type !==
                                "added"
                            ) {

                                return;

                            }


                            processIncomingMessage(
                                {
                                    id:
                                        change.doc.id,

                                    chatId,

                                    ...change.doc.data()

                                }
                            );

                        }
                    );

            },

            error => {

                console.warn(
                    "CONNECTA conversation notification listener failed:",
                    error
                );

            }

        );


    conversationListeners.set(
        chatId,
        unsubscribe
    );

}


/* =========================================================
   START NOTIFICATIONS
========================================================= */

async function startConnectaNotifications() {

    if (
        notificationStarted
    ) {

        return;

    }


    if (
        !auth.currentUser
    ) {

        return;

    }


    notificationStarted =
        true;


    currentUser =
        auth.currentUser;


    loadProcessedNotifications();


    /*
     * Add notification animations once.
     */

    if (
        !document.getElementById(
            "connectaNotificationStyles"
        )
    ) {

        const style =
            document.createElement(
                "style"
            );


        style.id =
            "connectaNotificationStyles";


        style.textContent = `

            @keyframes connectaNotificationIn {

                from {
                    opacity:0;
                    transform:
                        translateY(-12px)
                        scale(.98);
                }

                to {
                    opacity:1;
                    transform:
                        translateY(0)
                        scale(1);
                }

            }


            @keyframes connectaNotificationOut {

                from {
                    opacity:1;
                    transform:
                        translateY(0);
                    }
                
                to {
                    opacity:0;
                    transform:
                        translateY(-8px);
                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    /*
     * Start listening for chats belonging
     * to the current user.
     */

    listenToPrivateMessages();

}


/* =========================================================
   AUTH START
========================================================= */

const unsubscribeAuth =
    auth.onAuthStateChanged(
        user => {

            if (!user) {

                notificationStarted =
                    false;

                currentUser =
                    null;

                if (
                    stopPrivateMessages
                ) {

                    stopPrivateMessages();

                    stopPrivateMessages =
                        null;

                }


                conversationListeners
                    .forEach(
                        unsubscribe => {

                            try {

                                unsubscribe();

                            } catch {

                                // Ignore cleanup errors.

                            }

                        }
                    );


                conversationListeners.clear();


                return;

            }


            currentUser =
                user;


            startConnectaNotifications();

        }
    );


/* =========================================================
   OPTIONAL PUBLIC API
========================================================= */

window.CONNECTA_NOTIFICATIONS = {

    start:
        startConnectaNotifications,

    requestPermission:
        requestNotificationPermission

};
