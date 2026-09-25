/* =========================================================
   CONNECTA NOTIFICATION ENGINE
   Version: 2.0

   Supports:
   - Private chat messages
   - Joined group messages
   - In-app popup notifications
   - Browser / Android notifications
   - Cache-safe duplicate prevention
   - Initial-message protection
   - Private chat navigation
   - Group chat navigation

   DOES NOT MODIFY:
   - chat.js
   - group-chat.js
   - dashboard.js
   - Firestore message structure
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
    auth,
    db
} from "./firebase.js";


/* =========================================================
   FIRESTORE
========================================================= */

import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    where,
    limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const NOTIFICATION_CONFIG = {

    /*
     * How long an in-app popup stays visible.
     */
    popupDuration: 4500,

    /*
     * Maximum number of processed message IDs
     * stored locally.
     */
    processedLimit: 300,

    /*
     * Maximum number of active conversation listeners.
     */
    maxPrivateConversations: 100,

    /*
     * Maximum number of joined groups.
     */
    maxGroups: 100,

    /*
     * Local storage key.
     */
    storageKey:
        "connectaProcessedNotifications_v2"

};


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let notificationStarted = false;

let processedMessages =
    new Set();


/*
 * Private conversation listeners.
 *
 * chatId -> unsubscribe
 */
const privateConversationListeners =
    new Map();


/*
 * Group message listeners.
 *
 * groupId -> unsubscribe
 */
const groupMessageListeners =
    new Map();


/*
 * Prevent duplicate initialization.
 */
let stopPrivateChatsListener = null;

let stopGroupsListener = null;


/*
 * Prevent the same conversation from being
 * initialized multiple times at the same time.
 */
const initializingPrivateChats =
    new Set();

const initializingGroups =
    new Set();


/*
 * Used to detect the first snapshot.
 *
 * Existing messages in the first snapshot
 * must NOT create notifications.
 */
const initializedPrivateConversations =
    new Set();

const initializedGroups =
    new Set();


/*
 * Permission request guard.
 */
let notificationPermissionRequested =
    false;


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

                "&":
                    "&amp;",

                "<":
                    "&lt;",

                ">":
                    "&gt;",

                '"':
                    "&quot;",

                "'":
                    "&#039;"

            }[character])
        );

}


/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function timestampToMillis(value) {

    if (!value) {

        return 0;

    }


    if (
        typeof value?.toMillis ===
        "function"
    ) {

        return value.toMillis();

    }


    if (
        typeof value?.toDate ===
        "function"
    ) {

        const date =
            value.toDate();

        return date instanceof Date
            ? date.getTime()
            : 0;

    }


    if (
        typeof value?.seconds ===
        "number"
    ) {

        return (
            value.seconds * 1000 +
            Math.floor(
                Number(
                    value.nanoseconds || 0
                ) / 1000000
            )
        );

    }


    if (
        typeof value?._seconds ===
        "number"
    ) {

        return (
            value._seconds * 1000 +
            Math.floor(
                Number(
                    value._nanoseconds || 0
                ) / 1000000
            )
        );

    }


    if (
        typeof value ===
        "number"
    ) {

        return value;

    }


    if (
        typeof value ===
        "string"
    ) {

        const parsed =
            new Date(value)
                .getTime();


        return Number.isNaN(parsed)
            ? 0
            : parsed;

    }


    return 0;

}


/* =========================================================
   LOAD PROCESSED MESSAGE IDS
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
                    .filter(Boolean)
                    .slice(
                        -NOTIFICATION_CONFIG.processedLimit
                    )
            );

    } catch (error) {

        console.warn(
            "[CONNECTA NOTIFICATIONS] Could not load history:",
            error
        );

    }

}


/* =========================================================
   SAVE PROCESSED MESSAGE IDS
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
            "[CONNECTA NOTIFICATIONS] Could not save history:",
            error
        );

    }

}


/* =========================================================
   MARK MESSAGE PROCESSED
========================================================= */

function markMessageProcessed(
    messageKey
) {

    if (!messageKey) {

        return;

    }


    processedMessages.add(
        messageKey
    );


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
   MESSAGE KEY
========================================================= */

function getMessageKey(
    type,
    parentId,
    messageId
) {

    return `${type}:${parentId}:${messageId}`;

}


/* =========================================================
   SENDER NAME
========================================================= */

function getSenderName(
    message
) {

    return (

        message.senderName ||

        message.senderDisplayName ||

        message.displayName ||

        message.senderFirstName ||

        "CONNECTA User"

    );

}


/* =========================================================
   MESSAGE PREVIEW
========================================================= */

function getMessagePreview(
    message
) {

    const type =
        String(
            message.type || ""
        )
            .toLowerCase();


    if (
        type === "image" ||

        message.imageURL ||

        message.imageUrl ||

        message.photoURL ||

        message.photoUrl
    ) {

        return "📷 Photo";

    }


    const text =
        String(
            message.text ||
            message.message ||
            ""
        )
            .trim();


    if (!text) {

        return "New message";

    }


    return text.length > 100

        ? `${text.slice(0, 97)}...`

        : text;

}


/* =========================================================
   GROUP NAME
========================================================= */

function getGroupName(
    group,
    message
) {

    return (

        group?.name ||

        message.groupName ||

        message.groupTitle ||

        "CONNECTA Group"

    );

}


/* =========================================================
   ENSURE POPUP CONTAINER
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
        "false"
    );


    container.style.cssText = `

        position:fixed;

        top:
            calc(
                14px +
                env(
                    safe-area-inset-top,
                    0px
                )
            );

        left:12px;

        right:12px;

        z-index:999999;

        display:flex;

        flex-direction:column;

        gap:8px;

        pointer-events:none;

    `;


    document.body.appendChild(
        container
    );


    return container;

}


/* =========================================================
   NOTIFICATION STYLES
========================================================= */

function installNotificationStyles() {

    if (
        $("connectaNotificationStyles")
    ) {

        return;

    }


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
                    translateY(-14px)
                    scale(.97);

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
                    translateY(-10px);

            }

        }


        .connecta-message-notification {

            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Roboto,
                Arial,
                sans-serif;

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   SHOW IN-APP NOTIFICATION
========================================================= */

function showInAppNotification(
    message
) {

    const container =
        ensureNotificationContainer();


    const isGroup =
        message.notificationType ===
        "group";


    const senderName =
        getSenderName(
            message
        );


    const preview =
        getMessagePreview(
            message
        );


    const title =
        isGroup

            ? getGroupName(
                message.group,
                message
            )

            : senderName;


    const subtitle =
        isGroup
            ? senderName
            : "New message";


    const notification =
        document.createElement(
            "button"
        );


    notification.type =
        "button";


    notification.className =
        "connecta-message-notification";


    notification.style.cssText = `

        width:100%;

        max-width:430px;

        margin:0 auto;

        display:flex;

        align-items:center;

        gap:11px;

        padding:12px 14px;

        border:0;

        border-radius:17px;

        background:#ffffff;

        color:#17211b;

        box-shadow:
            0 10px 35px
            rgba(0,0,0,.18);

        text-align:left;

        cursor:pointer;

        pointer-events:auto;

        animation:
            connectaNotificationIn
            .25s
            ease-out;

    `;


    const icon =
        isGroup
            ? "👥"
            : "💬";


    const iconBackground =
        isGroup
            ? "#ecfdf3"
            : "#e8f8ed";


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
                background:${iconBackground};
                color:#16a34a;
                font-size:19px;
                font-weight:800;
            "
        >
            ${icon}
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
                        title
                    )}
                </strong>


                <span
                    style="
                        font-size:10px;
                        color:#22c55e;
                        font-weight:800;
                        flex-shrink:0;
                    "
                >
                    NEW
                </span>

            </div>


            ${
                isGroup

                    ? `

                        <div
                            style="
                                font-size:10px;
                                color:#16a34a;
                                font-weight:700;
                                margin-bottom:2px;
                            "
                        >
                            ${escapeHtml(
                                subtitle
                            )}
                        </div>

                      `

                    : ""
            }


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


    notification.addEventListener(
        "click",
        () => {

            if (
                isGroup
            ) {

                if (
                    message.groupId
                ) {

                    location.href =
                        `group-chat.html?groupId=${encodeURIComponent(
                            message.groupId
                        )}`;

                }

            } else {

                if (
                    message.senderId
                ) {

                    location.href =
                        `chat.html?uid=${encodeURIComponent(
                            message.senderId
                        )}`;

                }

            }


            notification.remove();

        }
    );


    container.prepend(
        notification
    );


    /*
     * Maximum three simultaneous
     * notifications.
     */

    while (
        container.children.length >
        3
    ) {

        container.lastElementChild
            ?.remove();

    }


    setTimeout(
        () => {

            if (
                !notification.isConnected
            ) {

                return;

            }


            notification.style.animation =
                "connectaNotificationOut .2s ease-in forwards";


            setTimeout(
                () => {

                    notification.remove();

                },
                220
            );

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
     * If CONNECTA is currently visible,
     * the in-app popup is enough.
     */

    if (
        document.visibilityState ===
        "visible"
    ) {

        return;

    }


    const isGroup =
        message.notificationType ===
        "group";


    const senderName =
        getSenderName(
            message
        );


    const groupName =
        getGroupName(
            message.group,
            message
        );


    const title =
        isGroup

            ? `CONNECTA • ${groupName}`

            : `CONNECTA • ${senderName}`;


    const preview =
        isGroup

            ? `${senderName}: ${getMessagePreview(
                message
            )}`

            : getMessagePreview(
                message
            );


    try {

        const notification =
            new Notification(
                title,
                {

                    body:
                        preview,

                    tag:
                        `connecta-${message.notificationType}-${message.parentId}-${message.id}`,

                    icon:
                        "/connecta-icon-192.png",

                    badge:
                        "/connecta-icon-192.png",

                    data: {

                        type:
                            message.notificationType,

                        uid:
                            message.senderId || "",

                        groupId:
                            message.groupId || ""

                    }

                }
            );


        notification.onclick =
            () => {

                window.focus();


                if (
                    message.notificationType ===
                    "group"
                ) {

                    if (
                        message.groupId
                    ) {

                        location.href =
                            `group-chat.html?groupId=${encodeURIComponent(
                                message.groupId
                            )}`;

                    }

                } else {

                    if (
                        message.senderId
                    ) {

                        location.href =
                            `chat.html?uid=${encodeURIComponent(
                                message.senderId
                            )}`;

                    }

                }


                notification.close();

            };

    } catch (error) {

        console.warn(
            "[CONNECTA NOTIFICATIONS] Browser notification failed:",
            error
        );

    }

}


/* =========================================================
   PROCESS INCOMING MESSAGE
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
     * Never notify yourself.
     */

    if (
        String(
            message.senderId || ""
        ) ===
        String(
            currentUser.uid
        )
    ) {

        return;

    }


    /*
     * Build a unique notification key.
     */

    const messageKey =
        getMessageKey(

            message.notificationType ||
                "private",

            message.parentId ||
                message.chatId ||
                message.groupId ||
                "",

            message.id

        );


    /*
     * Already handled.
     */

    if (
        processedMessages.has(
            messageKey
        )
    ) {

        return;

    }


    /*
     * Mark BEFORE showing the notification.
     *
     * This prevents duplicate notifications if
     * multiple realtime events arrive quickly.
     */

    markMessageProcessed(
        messageKey
    );


    showInAppNotification(
        message
    );


    showBrowserNotification(
        message
    );

}


/* =========================================================
   PRIVATE CHAT MESSAGE LISTENER
========================================================= */

function listenToPrivateConversation(
    chatId
) {

    if (
        !chatId ||
        privateConversationListeners.has(
            chatId
        ) ||
        initializingPrivateChats.has(
            chatId
        )
    ) {

        return;

    }


    initializingPrivateChats.add(
        chatId
    );


    const messagesRef =
        collection(
            db,
            "chats",
            chatId,
            "messages"
        );


    const messagesQuery =
        query(
            messagesRef,
            limit(100)
        );


    let firstSnapshot =
        true;


    const unsubscribe =
        onSnapshot(

            messagesQuery,

            snapshot => {

                /*
                 * FIRST SNAPSHOT
                 *
                 * These messages already existed
                 * before the notification listener
                 * started.
                 *
                 * Mark them processed without
                 * notifying.
                 */

                if (firstSnapshot) {

                    snapshot.docs.forEach(
                        messageDoc => {

                            const data =
                                messageDoc.data();


                            const messageKey =
                                getMessageKey(

                                    "private",

                                    chatId,

                                    messageDoc.id

                                );


                            processedMessages.add(
                                messageKey
                            );

                        }
                    );


                    firstSnapshot =
                        false;


                    initializedPrivateConversations
                        .add(chatId);


                    /*
                     * Keep local storage updated.
                     */

                    saveProcessedNotifications();

                    return;

                }


                snapshot.docChanges()
                    .forEach(
                        change => {

                            if (
                                change.type !==
                                "added"
                            ) {

                                return;

                            }


                            const data =
                                change.doc.data();


                            processIncomingMessage({

                                notificationType:
                                    "private",

                                parentId:
                                    chatId,

                                chatId,

                                id:
                                    change.doc.id,

                                ...data

                            });

                        }
                    );

            },

            error => {

                console.warn(
                    "[CONNECTA NOTIFICATIONS] Private conversation listener failed:",
                    chatId,
                    error
                );


                initializingPrivateChats
                    .delete(chatId);

            }

        );


    privateConversationListeners.set(
        chatId,
        unsubscribe
    );


    initializingPrivateChats
        .delete(chatId);

}


/* =========================================================
   PRIVATE CHAT LISTENER
========================================================= */

function listenToPrivateChats() {

    if (
        !currentUser
    ) {

        return;

    }


    if (
        stopPrivateChatsListener
    ) {

        stopPrivateChatsListener();

        stopPrivateChatsListener =
            null;

    }


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
            ),

            limit(
                NOTIFICATION_CONFIG
                    .maxPrivateConversations
            )

        );


    stopPrivateChatsListener =
        onSnapshot(

            chatsQuery,

            snapshot => {

                snapshot.docs.forEach(
                    chatDoc => {

                        listenToPrivateConversation(
                            chatDoc.id
                        );

                    }
                );

            },

            error => {

                console.warn(
                    "[CONNECTA NOTIFICATIONS] Private chats listener failed:",
                    error
                );

            }

        );

}


/* =========================================================
   GROUP MESSAGE LISTENER
========================================================= */

function listenToGroupMessages(
    groupId,
    groupData = {}
) {

    if (
        !groupId ||
        groupMessageListeners.has(
            groupId
        ) ||
        initializingGroups.has(
            groupId
        )
    ) {

        return;

    }


    /*
     * Make sure the current user is actually
     * a member of this group.
     */

    const memberIds =
        Array.isArray(
            groupData.memberIds
        )
            ? groupData.memberIds
            : [];


    const members =
        Array.isArray(
            groupData.members
        )
            ? groupData.members
            : [];


    const isOwner =
        String(
            groupData.ownerId || ""
        ) ===
        String(
            currentUser?.uid || ""
        );


    const isMember =
        memberIds.includes(
            currentUser.uid
        ) ||

        members.includes(
            currentUser.uid
        ) ||

        isOwner;


    if (!isMember) {

        return;

    }


    initializingGroups.add(
        groupId
    );


    const messagesRef =
        collection(
            db,
            "groups",
            groupId,
            "groupMessages"
        );


    const messagesQuery =
        query(
            messagesRef,
            limit(100)
        );


    let firstSnapshot =
        true;


    const unsubscribe =
        onSnapshot(

            messagesQuery,

            snapshot => {

                /*
                 * FIRST SNAPSHOT:
                 *
                 * Mark existing messages as
                 * already seen.
                 */

                if (firstSnapshot) {

                    snapshot.docs.forEach(
                        messageDoc => {

                            const messageKey =
                                getMessageKey(

                                    "group",

                                    groupId,

                                    messageDoc.id

                                );


                            processedMessages.add(
                                messageKey
                            );

                        }
                    );


                    firstSnapshot =
                        false;


                    initializedGroups
                        .add(groupId);


                    saveProcessedNotifications();

                    return;

                }


                snapshot.docChanges()
                    .forEach(
                        change => {

                            if (
                                change.type !==
                                "added"
                            ) {

                                return;

                            }


                            const data =
                                change.doc.data();


                            processIncomingMessage({

                                notificationType:
                                    "group",

                                parentId:
                                    groupId,

                                groupId,

                                group:
                                    groupData,

                                id:
                                    change.doc.id,

                                ...data

                            });

                        }
                    );

            },

            error => {

                console.warn(
                    "[CONNECTA NOTIFICATIONS] Group listener failed:",
                    groupId,
                    error
                );


                initializingGroups
                    .delete(groupId);

            }

        );


    groupMessageListeners.set(
        groupId,
        unsubscribe
    );


    initializingGroups
        .delete(groupId);

}


/* =========================================================
   LOAD JOINED GROUPS
========================================================= */

async function loadJoinedGroups() {

    if (
        !currentUser
    ) {

        return;

    }


    try {

        const groupsRef =
            collection(
                db,
                "groups"
            );


        /*
         * Groups using memberIds.
         */

        const memberIdsQuery =
            query(

                groupsRef,

                where(
                    "memberIds",
                    "array-contains",
                    currentUser.uid
                ),

                limit(
                    NOTIFICATION_CONFIG
                        .maxGroups
                )

            );


        /*
         * Older groups may use members.
         */

        const membersQuery =
            query(

                groupsRef,

                where(
                    "members",
                    "array-contains",
                    currentUser.uid
                ),

                limit(
                    NOTIFICATION_CONFIG
                        .maxGroups
                )

            );


        const [
            memberIdsSnapshot,
            membersSnapshot
        ] =
            await Promise.allSettled([

                getDocs(
                    memberIdsQuery
                ),

                getDocs(
                    membersQuery
                )

            ]);


        const groups =
            new Map();


        if (
            memberIdsSnapshot.status ===
            "fulfilled"
        ) {

            memberIdsSnapshot.value.docs
                .forEach(
                    groupDoc => {

                        groups.set(
                            groupDoc.id,
                            {

                                groupId:
                                    groupDoc.id,

                                ...groupDoc.data()

                            }
                        );

                    }
                );

        }


        if (
            membersSnapshot.status ===
            "fulfilled"
        ) {

            membersSnapshot.value.docs
                .forEach(
                    groupDoc => {

                        groups.set(
                            groupDoc.id,
                            {

                                groupId:
                                    groupDoc.id,

                                ...groupDoc.data()

                            }
                        );

                    }
                );

        }


        /*
         * Listen to every joined group.
         */

        groups.forEach(
            group => {

                listenToGroupMessages(

                    group.groupId,

                    group

                );

            }
        );

    } catch (error) {

        console.warn(
            "[CONNECTA NOTIFICATIONS] Could not load joined groups:",
            error
        );

    }

}


/* =========================================================
   LIVE GROUP MEMBERSHIP LISTENER
========================================================= */

function listenToGroups() {

    if (
        !currentUser
    ) {

        return;

    }


    if (
        stopGroupsListener
    ) {

        stopGroupsListener();

        stopGroupsListener =
            null;

    }


    const groupsRef =
        collection(
            db,
            "groups"
        );


    const memberIdsQuery =
        query(

            groupsRef,

            where(
                "memberIds",
                "array-contains",
                currentUser.uid
            ),

            limit(
                NOTIFICATION_CONFIG
                    .maxGroups
            )

        );


    const membersQuery =
        query(

            groupsRef,

            where(
                "members",
                "array-contains",
                currentUser.uid
            ),

            limit(
                NOTIFICATION_CONFIG
                    .maxGroups
            )

        );


    let currentGroupIds =
        new Set();


    const handleGroupsSnapshot =
        snapshot => {

            snapshot.docs.forEach(
                groupDoc => {

                    const group = {

                        groupId:
                            groupDoc.id,

                        ...groupDoc.data()

                    };


                    currentGroupIds.add(
                        group.groupId
                    );


                    listenToGroupMessages(
                        group.groupId,
                        group
                    );

                }
            );

        };


    const unsubscribeMemberIds =
        onSnapshot(

            memberIdsQuery,

            handleGroupsSnapshot,

            error => {

                console.warn(
                    "[CONNECTA NOTIFICATIONS] memberIds group listener failed:",
                    error
                );

            }

        );


    const unsubscribeMembers =
        onSnapshot(

            membersQuery,

            handleGroupsSnapshot,

            error => {

                console.warn(
                    "[CONNECTA NOTIFICATIONS] members group listener failed:",
                    error
                );

            }

        );


    /*
     * We keep both listeners under one cleanup
     * function.
     */

    stopGroupsListener =
        () => {

            try {

                unsubscribeMemberIds();

            } catch {

                // Ignore cleanup errors.

            }


            try {

                unsubscribeMembers();

            } catch {

                // Ignore cleanup errors.

            }

        };

}


/* =========================================================
   REQUEST BROWSER NOTIFICATION PERMISSION
========================================================= */

async function requestNotificationPermission() {

    if (
        notificationPermissionRequested
    ) {

        return Notification.permission;

    }


    notificationPermissionRequested =
        true;


    if (
        !("Notification" in window)
    ) {

        return "unsupported";

    }


    if (
        Notification.permission ===
        "default"
    ) {

        try {

            const permission =
                await Notification.requestPermission();


            return permission;

        } catch (error) {

            console.warn(
                "[CONNECTA NOTIFICATIONS] Permission request failed:",
                error
            );


            return Notification.permission;

        }

    }


    return Notification.permission;

}


/* =========================================================
   START ENGINE
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


    installNotificationStyles();


    /*
     * Start private chat monitoring.
     */

    listenToPrivateChats();


    /*
     * Start joined group monitoring.
     */

    listenToGroups();


    /*
     * Also load groups once immediately.
     *
     * This helps when a group listener has not
     * delivered its first snapshot yet.
     */

    loadJoinedGroups();


    console.log(
        "[CONNECTA NOTIFICATIONS] Started for:",
        currentUser.uid
    );

}


/* =========================================================
   STOP ENGINE
========================================================= */

function stopConnectaNotifications() {

    /*
     * Private chats.
     */

    if (
        stopPrivateChatsListener
    ) {

        try {

            stopPrivateChatsListener();

        } catch {

            // Ignore cleanup errors.

        }


        stopPrivateChatsListener =
            null;

    }


    privateConversationListeners
        .forEach(
            unsubscribe => {

                try {

                    unsubscribe();

                } catch {

                    // Ignore cleanup errors.

                }

            }
        );


    privateConversationListeners.clear();


    /*
     * Groups.
     */

    if (
        stopGroupsListener
    ) {

        try {

            stopGroupsListener();

        } catch {

            // Ignore cleanup errors.

        }


        stopGroupsListener =
            null;

    }


    groupMessageListeners
        .forEach(
            unsubscribe => {

                try {

                    unsubscribe();

                } catch {

                    // Ignore cleanup errors.

                }

            }
        );


    groupMessageListeners.clear();


    initializingPrivateChats.clear();
    initializingGroups.clear();

    initializedPrivateConversations.clear();
    initializedGroups.clear();


    notificationStarted =
        false;

}


/* =========================================================
   AUTH
========================================================= */

auth.onAuthStateChanged(
    user => {

        /*
         * Logged out.
         */

        if (!user) {

            stopConnectaNotifications();

            currentUser =
                null;

            return;

        }


        /*
         * Logged in.
         */

        currentUser =
            user;


        startConnectaNotifications();

    }
);


/* =========================================================
   PUBLIC API
========================================================= */

window.CONNECTA_NOTIFICATIONS = {

    start:
        startConnectaNotifications,

    stop:
        stopConnectaNotifications,

    requestPermission:
        requestNotificationPermission

};
