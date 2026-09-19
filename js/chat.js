import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    writeBatch,
    increment
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =====================================================
   CONNECTA CHAT ENGINE
===================================================== */

const $ = id =>
    document.getElementById(id);


let currentUser = null;

let otherUser = null;

let chatId = null;

let stopMessages = null;

let stopOtherUser = null;

let stopChat = null;

let latestMessages = [];

let isOtherUserTyping = false;

let typingTimer = null;

let lastTypingWrite = 0;

let isMarkingMessages = false;


/* =====================================================
   PROFILE CACHE
=====================================================

   Supports both the older dashboard cache and the
   newer profile caches.

===================================================== */

const PROFILE_CACHE_KEY =
    "connectaProfileCache";

const OWN_PROFILE_CACHE_KEY =
    "connectaOwnProfileCache_v2";

const PUBLIC_PROFILE_CACHE_KEY =
    "connectaPublicProfileCache_v2";


/* =====================================================
   GET OLD PROFILE CACHE
===================================================== */

function getProfileCache() {

    try {

        return JSON.parse(
            localStorage.getItem(
                PROFILE_CACHE_KEY
            ) || "{}"
        );

    } catch {

        return {};

    }

}


/* =====================================================
   GET NEW PUBLIC PROFILE CACHE
===================================================== */

function getNewPublicProfileCache(uid) {

    if (!uid) {
        return null;
    }


    try {

        const raw =
            localStorage.getItem(
                `${PUBLIC_PROFILE_CACHE_KEY}_${uid}`
            );


        if (!raw) {
            return null;
        }


        return JSON.parse(raw);

    } catch {

        return null;

    }

}


/* =====================================================
   GET OWN PROFILE CACHE
===================================================== */

function getOwnProfileCache() {

    if (!currentUser) {
        return null;
    }


    try {

        const raw =
            localStorage.getItem(
                OWN_PROFILE_CACHE_KEY
            );


        if (!raw) {
            return null;
        }


        const cache =
            JSON.parse(raw);


        if (
            !cache ||
            cache.uid !== currentUser.uid
        ) {

            return null;

        }


        return cache;

    } catch {

        return null;

    }

}


/* =====================================================
   GET CACHED PROFILE
===================================================== */

function getCachedProfile(uid) {

    if (!uid) {
        return null;
    }


    /*
    =================================================
    NEW PUBLIC PROFILE CACHE
    =================================================
    */

    const publicCache =
        getNewPublicProfileCache(
            uid
        );


    if (publicCache) {

        return publicCache;

    }


    /*
    =================================================
    OWN PROFILE CACHE
    =================================================
    */

    if (
        currentUser &&
        uid === currentUser.uid
    ) {

        const ownCache =
            getOwnProfileCache();


        if (ownCache) {

            return ownCache;

        }

    }


    /*
    =================================================
    OLD DASHBOARD CACHE
    =================================================
    */

    try {

        const oldCache =
            getProfileCache();


        if (
            oldCache &&
            oldCache[uid]
        ) {

            return oldCache[uid];

        }

    } catch {

        // Ignore old cache errors.

    }


    return null;

}


/* =====================================================
   SAVE CHAT PROFILE CACHE
===================================================== */

function saveChatProfile(
    uid,
    profile
) {

    if (
        !uid ||
        !profile
    ) {

        return;

    }


    try {

        /*
        IMPORTANT:

        Only public profile information is saved
        for another user.

        We deliberately do NOT cache:

        email
        phone
        balance
        referralCode
        referral information
        KYC/payment information
        */

        const publicProfile = {

            uid,

            firstName:
                profile.firstName || "",

            lastName:
                profile.lastName || "",

            displayName:
                profile.displayName || "",

            username:
                profile.username || "",

            photoURL:
                profile.photoURL || "",

            photoUrl:
                profile.photoUrl || "",

            bio:
                profile.bio || "",

            isOnline:
                profile.isOnline === true,

            isVerified:
                profile.isVerified === true,

            followersCount:
                Number(
                    profile.followersCount || 0
                ),

            followingCount:
                Number(
                    profile.followingCount || 0
                ),

            lastSeen:
                profile.lastSeen || null,

            cachedAt:
                Date.now()

        };


        /*
        New public profile cache.
        */

        localStorage.setItem(

            `${PUBLIC_PROFILE_CACHE_KEY}_${uid}`,

            JSON.stringify(
                publicProfile
            )

        );


        /*
        Keep old dashboard cache updated too,
        because dashboard.js may still use it.
        */

        const oldCache =
            getProfileCache();


        oldCache[uid] = {

            ...oldCache[uid],

            ...publicProfile

        };


        localStorage.setItem(
            PROFILE_CACHE_KEY,
            JSON.stringify(
                oldCache
            )
        );


    } catch (error) {

        console.warn(
            "Chat profile cache failed:",
            error
        );

    }

}


/* =====================================================
   INITIALS
===================================================== */

function initials(
    name = "U"
) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (!parts.length) {
        return "U";
    }


    if (
        parts.length === 1
    ) {

        return parts[0]
            .slice(0, 2)
            .toUpperCase();

    }


    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();

}


/* =====================================================
   FULL NAME
===================================================== */

function getFullName(
    user = {}
) {

    /*
    =================================================
    DISPLAY NAME
    =================================================
    */

    const displayName =
        String(
            user.displayName || ""
        ).trim();


    /*
    Do NOT accept the placeholder as a real name.
    */

    if (
        displayName &&
        displayName !== "CONNECTA User"
    ) {

        return displayName;

    }


    /*
    =================================================
    FIRST + LAST NAME
    =================================================
    */

    const firstName =
        String(
            user.firstName || ""
        ).trim();


    const lastName =
        String(
            user.lastName || ""
        ).trim();


    const fullName =
        `${firstName} ${lastName}`.trim();


    if (fullName) {

        return fullName;

    }


    /*
    =================================================
    USERNAME
    =================================================
    */

    const username =
        String(
            user.username || ""
        ).trim();


    if (username) {

        return username.replace(
            /^@/,
            ""
        );

    }


    return "CONNECTA User";

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )

        .replace(
            /[&<>"']/g,
            c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[c])
        );

}


/* =====================================================
   GET OTHER UID
===================================================== */

function getOtherUid() {

    const params =
        new URLSearchParams(
            location.search
        );


    return params.get("uid");

}


/* =====================================================
   CREATE CHAT ID
===================================================== */

function createChatId(
    uid1,
    uid2
) {

    return [
        uid1,
        uid2
    ]
        .sort()
        .join("_");

}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(
    timestamp
) {

    let date = null;


    if (
        timestamp?.toDate
    ) {

        date =
            timestamp.toDate();

    } else if (
        typeof timestamp === "number"
    ) {

        date =
            new Date(timestamp);

    }


    if (
        !date ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleTimeString(
        [],
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );

}


/* =====================================================
   FORMAT DATE
===================================================== */

function formatDate(
    timestamp
) {

    let date = null;


    if (
        timestamp?.toDate
    ) {

        date =
            timestamp.toDate();

    } else if (
        typeof timestamp === "number"
    ) {

        date =
            new Date(timestamp);

    }


    if (
        !date ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Today";

    }


    const today =
        new Date();


    const yesterday =
        new Date();


    yesterday.setDate(
        yesterday.getDate() - 1
    );


    if (
        date.toDateString() ===
        today.toDateString()
    ) {

        return "Today";

    }


    if (
        date.toDateString() ===
        yesterday.toDateString()
    ) {

        return "Yesterday";

    }


    return date.toLocaleDateString(
        [],
        {
            day: "numeric",
            month: "short",
            year:
                date.getFullYear() !==
                today.getFullYear()
                    ? "numeric"
                    : undefined
        }
    );

}


/* =====================================================
   RENDER CHAT HEADER
===================================================== */

function renderChatHeader(
    user
) {

    if (!user) {
        return;
    }


    const name =
        getFullName(
            user
        );


    const photo =
        user.photoURL ||
        user.photoUrl ||
        "";


    const nameElement =
        $("chatUserName");


    const avatarElement =
        $("chatAvatar");


    if (
        !nameElement ||
        !avatarElement
    ) {

        return;

    }


    /*
    =================================================
    VERIFIED BADGE
    =================================================
    */

    const verifiedBadge =
        user.isVerified === true

            ? `
                <span
                    class="verified-badge"
                    title="Verified account"
                    aria-label="Verified account"
                >
                    ✓
                </span>
              `

            : "";


    /*
    =================================================
    NAME
    =================================================
    */

    nameElement.innerHTML = `

        <span class="chat-user-name-text">
            ${escapeHtml(name)}
        </span>

        ${verifiedBadge}

    `;


    /*
    =================================================
    PHOTO
    =================================================
    */

    if (photo) {

        avatarElement.innerHTML = `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
            >

        `;

    } else {

        avatarElement.textContent =
            initials(name);

    }


    /*
    =================================================
    STATUS
    =================================================
    */

    updateStatusDisplay();

}


/* =====================================================
   STATUS DISPLAY
===================================================== */

function updateStatusDisplay() {

    if (!otherUser) {
        return;
    }


    const statusText =
        $("chatStatusText");


    const statusDot =
        $("chatStatusDot");


    if (!statusText) {
        return;
    }


    /*
    =================================================
    TYPING
    =================================================
    */

    if (
        isOtherUserTyping
    ) {

        statusText.innerHTML = `

            <span class="typing-status">

                <span class="typing-label">
                    typing
                </span>

                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>

            </span>

        `;


        if (statusDot) {

            statusDot.style.display =
                "none";

        }


        return;

    }


    /*
    =================================================
    ONLINE
    =================================================
    */

    if (
        otherUser.isOnline === true
    ) {

        statusText.textContent =
            "Online";


        if (statusDot) {

            statusDot.style.display =
                "flex";

        }


        return;

    }


    /*
    =================================================
    OFFLINE
    =================================================
    */

    statusText.textContent =
        getLastSeenText(
            otherUser
        );


    if (statusDot) {

        statusDot.style.display =
            "none";

    }

}


/* =====================================================
   LAST SEEN
===================================================== */

function getLastSeenText(
    user
) {

    if (
        !user?.lastSeen?.toDate
    ) {

        return "Offline";

    }


    const date =
        user.lastSeen.toDate();


    const today =
        new Date();


    if (
        date.toDateString() ===
        today.toDateString()
    ) {

        return `Last seen ${date.toLocaleTimeString(
            [],
            {
                hour: "numeric",
                minute: "2-digit"
            }
        )}`;

    }


    return `Last seen ${date.toLocaleDateString(
        [],
        {
            day: "numeric",
            month: "short"
        }
    )}`;

}


/* =====================================================
   LOAD OTHER USER
   CACHE FIRST → FIRESTORE SECOND
===================================================== */

async function loadOtherUser(
    uid
) {

    /*
    =====================================================
    CACHE FIRST
    =====================================================
    */

    const cached =
        getCachedProfile(
            uid
        );


    if (cached) {

        otherUser = {

            uid,

            ...cached

        };


        renderChatHeader(
            otherUser
        );

    }


    /*
    =====================================================
    FIRESTORE REFRESH
    =====================================================
    */

    try {

        const snap =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snap.exists()
        ) {

            if (cached) {
                return;
            }


            throw new Error(
                "User profile not found."
            );

        }


        otherUser = {

            uid,

            ...snap.data()

        };


        /*
        =================================================
        CACHE PUBLIC PROFILE
        =================================================
        */

        saveChatProfile(
            uid,
            otherUser
        );


        /*
        =================================================
        RENDER FRESH PROFILE
        =================================================
        */

        renderChatHeader(
            otherUser
        );


    } catch (error) {

        if (cached) {

            console.warn(
                "Using cached chat profile:",
                error
            );


            return;

        }


        throw error;

    }

}


/* =====================================================
   MESSAGE CACHE
===================================================== */

const MESSAGE_CACHE_PREFIX =
    "connectaMessages_v1_";


function getMessageCache(
    chatId
) {

    if (!chatId) {
        return [];
    }


    try {

        const raw =
            localStorage.getItem(
                `${MESSAGE_CACHE_PREFIX}${chatId}`
            );


        if (!raw) {
            return [];
        }


        const cached =
            JSON.parse(
                raw
            );


        if (
            !Array.isArray(
                cached
            )
        ) {

            return [];

        }


        return cached.map(
            message => {

                const restored = {
                    ...message
                };


                if (
                    typeof restored.createdAt ===
                    "number"
                ) {

                    const timestamp =
                        restored.createdAt;


                    restored.createdAt = {

                        toDate: () =>
                            new Date(
                                timestamp
                            )

                    };

                }


                return restored;

            }
        );


    } catch (error) {

        console.warn(
            "Message cache read failed:",
            error
        );


        return [];

    }

}


/* =====================================================
   SAVE MESSAGE CACHE
===================================================== */

function saveMessageCache(
    chatId,
    messages
) {

    if (
        !chatId ||
        !Array.isArray(
            messages
        )
    ) {

        return;

    }


    try {

        const latest =
            messages.slice(
                -100
            );


        const serializable =
            latest.map(
                message => {

                    let createdAt =
                        null;


                    if (
                        message.createdAt?.toDate
                    ) {

                        createdAt =
                            message.createdAt
                                .toDate()
                                .getTime();

                    } else if (
                        typeof message.createdAt ===
                        "number"
                    ) {

                        createdAt =
                            message.createdAt;

                    }


                    return {

                        ...message,

                        createdAt

                    };

                }
            );


        localStorage.setItem(

            `${MESSAGE_CACHE_PREFIX}${chatId}`,

            JSON.stringify(
                serializable
            )

        );


    } catch (error) {

        console.warn(
            "Message cache save failed:",
            error
        );

    }

}


/* =====================================================
   LISTEN TO OTHER USER
===================================================== */

function listenToOtherUser(
    uid
) {

    if (
        stopOtherUser
    ) {

        stopOtherUser();

        stopOtherUser =
            null;

    }


    stopOtherUser =
        onSnapshot(

            doc(
                db,
                "users",
                uid
            ),

            snapshot => {

                if (
                    !snapshot.exists()
                ) {

                    return;

                }


                /*
                =================================================
                ALWAYS REPLACE THE PROFILE WITH FRESH DATA
                =================================================
                */

                otherUser = {

                    uid,

                    ...snapshot.data()

                };


                /*
                =================================================
                SAVE PUBLIC CACHE
                =================================================
                */

                saveChatProfile(
                    uid,
                    otherUser
                );


                /*
                =================================================
                CRITICAL:
                RENDER HEADER AGAIN
                =================================================

                This makes these changes appear immediately:

                - real name
                - profile photo
                - verified badge
                - online status
                =================================================
                */

                renderChatHeader(
                    otherUser
                );


                /*
                =================================================
                IF RECIPIENT BECOMES ONLINE
                =================================================
                */

                if (
                    otherUser.isOnline === true
                ) {

                    markMessagesDelivered();

                }

            },

            error => {

                console.warn(
                    "User status listener:",
                    error
                );

            }

        );

}


/* =====================================================
   ENSURE CHAT
===================================================== */

async function ensureChat() {

    if (
        !currentUser ||
        !otherUser
    ) {

        throw new Error(
            "Chat participants are not available."
        );

    }


    chatId =
        createChatId(
            currentUser.uid,
            otherUser.uid
        );


    const chatRef =
        doc(
            db,
            "chats",
            chatId
        );


    const snap =
        await getDoc(
            chatRef
        );


    /*
    =====================================================
    CREATE NEW CHAT
    =====================================================
    */

    if (
        !snap.exists()
    ) {

        await setDoc(
            chatRef,
            {

                id:
                    chatId,

                participants: [

                    currentUser.uid,

                    otherUser.uid

                ],

                lastMessage:
                    "",

                lastSenderId:
                    "",

                unreadCount: {

                    [currentUser.uid]:
                        0,

                    [otherUser.uid]:
                        0

                },

                typing: {

                    [currentUser.uid]:
                        false,

                    [otherUser.uid]:
                        false

                },

                updatedAt:
                    serverTimestamp(),

                createdAt:
                    serverTimestamp()

            }
        );


        return;

    }


    /*
    =====================================================
    EXISTING CHAT
    =====================================================
    */

    const data =
        snap.data();


    const updates = {};


    /*
    PARTICIPANTS
    */

    if (
        !Array.isArray(
            data.participants
        ) ||
        !data.participants.includes(
            currentUser.uid
        ) ||
        !data.participants.includes(
            otherUser.uid
        )
    ) {

        updates.participants = [

            currentUser.uid,

            otherUser.uid

        ];

    }


    /*
    UNREAD COUNTERS
    */

    if (
        !data.unreadCount ||
        typeof data.unreadCount !== "object"
    ) {

        updates.unreadCount = {

            [currentUser.uid]:
                0,

            [otherUser.uid]:
                0

        };

    } else {

        if (
            typeof
            data.unreadCount[
                currentUser.uid
            ] !== "number"
        ) {

            updates[
                `unreadCount.${currentUser.uid}`
            ] = 0;

        }


        if (
            typeof
            data.unreadCount[
                otherUser.uid
            ] !== "number"
        ) {

            updates[
                `unreadCount.${otherUser.uid}`
            ] = 0;

        }

    }


    /*
    TYPING
    */

    if (
        !data.typing ||
        typeof data.typing !== "object"
    ) {

        updates.typing = {

            [currentUser.uid]:
                false,

            [otherUser.uid]:
                false

        };

    } else {

        if (
            typeof
            data.typing[
                currentUser.uid
            ] !== "boolean"
        ) {

            updates[
                `typing.${currentUser.uid}`
            ] = false;

        }


        if (
            typeof
            data.typing[
                otherUser.uid
            ] !== "boolean"
        ) {

            updates[
                `typing.${otherUser.uid}`
            ] = false;

        }

    }


    /*
    APPLY REPAIRS
    */

    if (
        Object.keys(
            updates
        ).length > 0
    ) {

        await updateDoc(
            chatRef,
            updates
        );

    }

}


/* =====================================================
   LISTEN TO CHAT DOCUMENT
===================================================== */

function listenToChat() {

    if (!chatId) {
        return;
    }


    if (stopChat) {

        stopChat();

        stopChat =
            null;

    }


    stopChat =
        onSnapshot(

            doc(
                db,
                "chats",
                chatId
            ),

            snapshot => {

                if (
                    !snapshot.exists()
                ) {

                    return;

                }


                const data =
                    snapshot.data();


                const typing =
                    data.typing || {};


                isOtherUserTyping =
                    typing[
                        otherUser.uid
                    ] === true;


                updateStatusDisplay();

            },

            error => {

                console.warn(
                    "Chat listener:",
                    error
                );

            }

        );

}


/* =====================================================
   LISTEN TO MESSAGES
===================================================== */

function listenToMessages() {

    if (!chatId) {
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
            messagesRef,
            orderBy(
                "createdAt",
                "asc"
            )
        );


    stopMessages =
        onSnapshot(

            messagesQuery,

            async snapshot => {

                const messages =
                    snapshot.docs.map(
                        message => ({

                            id:
                                message.id,

                            ...message.data()

                        })
                    );


                latestMessages =
                    messages;


                /*
                SAVE FOR NEXT OPEN
                */

                saveMessageCache(
                    chatId,
                    messages
                );


                /*
                RENDER
                */

                renderMessages(
                    messages
                );


                /*
                MARK INCOMING READ
                */

                await markIncomingMessages(
                    messages
                );

            },

            error => {

                console.error(
                    "Messages listener:",
                    error
                );


                /*
                Don't destroy cached messages
                if they are already visible.
                */

                if (
                    !latestMessages.length
                ) {

                    showChatError(
                        "Could not load messages. Please check your Firestore rules."
                    );

                }

            }

        );

}


/* =====================================================
   MESSAGE TICK
===================================================== */

function getMessageTickState(
    message
) {

    if (
        message.senderId !==
        currentUser.uid
    ) {

        return "";

    }


    /*
    READ
    */

    if (
        message.read === true
    ) {

        return `

            <span
                class="message-checks read"
                title="Read"
            >
                ✓✓
            </span>

        `;

    }


    /*
    DELIVERED
    */

    if (
        message.delivered === true
    ) {

        return `

            <span
                class="message-checks"
                title="Delivered"
            >
                ✓✓
            </span>

        `;

    }


    /*
    SENT
    */

    return `

        <span
            class="message-checks"
            title="Sent"
        >
            ✓
        </span>

    `;

}


/* =====================================================
   RENDER MESSAGES
===================================================== */

function renderMessages(
    messages,
    scrollToBottom = true
) {

    const box =
        $("messagesContainer");


    if (!box) {
        return;
    }


    /*
    EMPTY CHAT
    */

    if (
        !messages.length
    ) {

        box.innerHTML = `

            <div class="empty-chat">

                <div class="empty-chat-card">

                    <div class="empty-chat-icon">
                        💬
                    </div>

                    <h3>
                        Start the conversation
                    </h3>

                    <p>
                        Say hello to
                        ${escapeHtml(
                            getFullName(
                                otherUser
                            )
                        )}
                    </p>

                </div>

            </div>

        `;

        return;

    }


    let html = "";

    let previousDate = "";


    messages.forEach(
        message => {

            const mine =
                message.senderId ===
                currentUser.uid;


            const dateLabel =
                formatDate(
                    message.createdAt
                );


            /*
            DATE SEPARATOR
            */

            if (
                dateLabel !==
                previousDate
            ) {

                html += `

                    <div
                        class="date-separator"
                    >

                        <span>
                            ${escapeHtml(
                                dateLabel
                            )}
                        </span>

                    </div>

                `;


                previousDate =
                    dateLabel;

            }


            /*
            TICK
            */

            const tick =
                mine
                    ? getMessageTickState(
                        message
                    )
                    : "";


            html += `

                <div
                    class="
                        message-row
                        ${mine
                            ? "outgoing"
                            : "incoming"}
                    "
                    data-message-id="${escapeHtml(
                        message.id
                    )}"
                >

                    <div
                        class="message-bubble"
                    >

                        <span
                            class="message-text"
                        >${escapeHtml(
                            message.text
                        )}</span>

                        <span
                            class="message-meta"
                        >

                            <span
                                class="message-time"
                            >
                                ${formatTime(
                                    message.createdAt
                                )}
                            </span>

                            ${tick}

                        </span>

                    </div>

                </div>

            `;

        }
    );


    box.innerHTML =
        html;


    if (scrollToBottom) {

        requestAnimationFrame(
            () => {

                box.scrollTop =
                    box.scrollHeight;

            }
        );

    }

}


/* =====================================================
   MARK INCOMING AS READ
===================================================== */

async function markIncomingMessages(
    messages
) {

    if (
        !currentUser ||
        !chatId ||
        isMarkingMessages
    ) {

        return;

    }


    const incoming =
        messages.filter(
            message =>

                message.receiverId ===
                currentUser.uid &&

                message.senderId !==
                currentUser.uid &&

                message.read !== true
        );


    if (
        !incoming.length
    ) {

        return;

    }


    isMarkingMessages =
        true;


    try {

        const batch =
            writeBatch(
                db
            );


        incoming.forEach(
            message => {

                const messageRef =
                    doc(
                        db,
                        "chats",
                        chatId,
                        "messages",
                        message.id
                    );


                batch.update(
                    messageRef,
                    {

                        delivered:
                            true,

                        deliveredAt:
                            serverTimestamp(),

                        read:
                            true,

                        readAt:
                            serverTimestamp()

                    }
                );

            }
        );


        const chatRef =
            doc(
                db,
                "chats",
                chatId
            );


        batch.update(
            chatRef,
            {

                [`unreadCount.${currentUser.uid}`]:
                    0

            }
        );


        await batch.commit();

    } catch (error) {

        console.warn(
            "Read receipt update failed:",
            error
        );

    } finally {

        isMarkingMessages =
            false;

    }

}


/* =====================================================
   MARK SENT MESSAGES AS DELIVERED
===================================================== */

async function markMessagesDelivered() {

    if (
        !currentUser ||
        !otherUser ||
        !chatId ||
        otherUser.isOnline !== true
    ) {

        return;

    }


    const messages =
        latestMessages.filter(
            message =>

                message.senderId ===
                currentUser.uid &&

                message.delivered !== true
        );


    if (
        !messages.length
    ) {

        return;

    }


    try {

        const batch =
            writeBatch(
                db
            );


        messages.forEach(
            message => {

                const messageRef =
                    doc(
                        db,
                        "chats",
                        chatId,
                        "messages",
                        message.id
                    );


                batch.update(
                    messageRef,
                    {

                        delivered:
                            true,

                        deliveredAt:
                            serverTimestamp()

                    }
                );

            }
        );


        await batch.commit();

    } catch (error) {

        console.warn(
            "Delivery receipt update failed:",
            error
        );

    }

}


/* =====================================================
   SEND MESSAGE
===================================================== */

async function sendMessage() {

    const input =
        $("messageInput");


    if (!input) {
        return;
    }


    const text =
        input.value.trim();


    if (!text) {
        return;
    }


    if (
        !currentUser ||
        !otherUser ||
        !chatId
    ) {

        return;

    }


    const sendButton =
        $("sendButton");


    if (sendButton) {

        sendButton.disabled =
            true;

    }


    try {

        clearTimeout(
            typingTimer
        );


        await setTyping(
            false
        );


        const chatRef =
            doc(
                db,
                "chats",
                chatId
            );


        const messagesRef =
            collection(
                db,
                "chats",
                chatId,
                "messages"
            );


        const messageRef =
            doc(
                messagesRef
            );


        const batch =
            writeBatch(
                db
            );


        /*
        CREATE MESSAGE
        */

        batch.set(
            messageRef,
            {

                senderId:
                    currentUser.uid,

                receiverId:
                    otherUser.uid,

                text:
                    text,

                createdAt:
                    serverTimestamp(),

                delivered:
                    false,

                deliveredAt:
                    null,

                read:
                    false,

                readAt:
                    null

            }
        );


        /*
        UPDATE LAST MESSAGE
        */

        batch.update(
            chatRef,
            {

                lastMessage:
                    text,

                lastSenderId:
                    currentUser.uid,

                updatedAt:
                    serverTimestamp()

            }
        );


        /*
        INCREASE RECEIVER UNREAD COUNT
        */

        batch.update(
            chatRef,
            {

                [`unreadCount.${otherUser.uid}`]:
                    increment(1)

            }
        );


        await batch.commit();


        input.value = "";

        resizeTextarea();


    } catch (error) {

        console.error(
            "SEND MESSAGE ERROR:",
            error
        );


        console.error(
            "Error code:",
            error?.code
        );


        console.error(
            "Error message:",
            error?.message
        );


        showChatError(
            "Message could not be sent."
        );


    } finally {

        if (sendButton) {

            sendButton.disabled =
                false;

        }


        input.focus();

    }

}


/* =====================================================
   TYPING
===================================================== */

async function setTyping(
    typing
) {

    if (
        !currentUser ||
        !chatId
    ) {

        return;

    }


    try {

        await updateDoc(
            doc(
                db,
                "chats",
                chatId
            ),
            {

                [`typing.${currentUser.uid}`]:
                    typing

            }
        );

    } catch (error) {

        console.warn(
            "Typing status update failed:",
            error
        );

    }

}


/* =====================================================
   HANDLE TYPING
===================================================== */

function handleTyping() {

    const input =
        $("messageInput");


    if (!input) {
        return;
    }


    const text =
        input.value.trim();


    if (!text) {

        clearTimeout(
            typingTimer
        );


        setTyping(
            false
        );


        return;

    }


    const now =
        Date.now();


    if (
        now - lastTypingWrite >
        1000
    ) {

        lastTypingWrite =
            now;

        setTyping(
            true
        );

    }


    clearTimeout(
        typingTimer
    );


    typingTimer =
        setTimeout(
            () => {

                setTyping(
                    false
                );

            },
            1800
        );

}


/* =====================================================
   TEXTAREA RESIZE
===================================================== */

function resizeTextarea() {

    const input =
        $("messageInput");


    if (!input) {
        return;
    }


    input.style.height =
        "auto";


    input.style.height =
        Math.min(
            input.scrollHeight,
            110
        ) + "px";

}


/* =====================================================
   CHAT ERROR
===================================================== */

function showChatError(
    message
) {

    const box =
        $("messagesContainer");


    if (!box) {
        return;
    }


    box.innerHTML = `

        <div
            style="
                padding:28px 18px;
                text-align:center;
                color:#6b756e;
                font-size:14px;
            "
        >

            ${escapeHtml(
                message
            )}

        </div>

    `;

}


/* =====================================================
   ATTACHMENT
===================================================== */

function setupAttachmentButton() {

    const button =
        $("attachButton");


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        () => {

            alert(
                "Photo and file sharing will be added soon."
            );

        }
    );

}


/* =====================================================
   SETUP UI
===================================================== */

function setupUI() {

    /*
    =================================================
    BACK
    =================================================
    */

    const back =
        $("backBtn");


    if (back) {

        back.addEventListener(
            "click",
            () => {

                if (
                    history.length > 1
                ) {

                    history.back();

                } else {

                    location.href =
                        "dashboard.html";

                }

            }
        );

    }


    /*
    =================================================
    PROFILE
    =================================================
    */

    const profile =
        $("profileBtn");


    if (profile) {

        profile.addEventListener(
            "click",
            () => {

                if (
                    !otherUser?.uid
                ) {

                    return;

                }


                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        otherUser.uid
                    )}`;

            }
        );

    }


    /*
    =================================================
    USER HEADER
    =================================================
    */

    const userArea =
        $("chatUserArea");


    if (userArea) {

        userArea.addEventListener(
            "click",
            () => {

                if (
                    !otherUser?.uid
                ) {

                    return;

                }


                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        otherUser.uid
                    )}`;

            }
        );

    }


    /*
    =================================================
    SEND
    =================================================
    */

    const form =
        $("messageForm");


    if (form) {

        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                await sendMessage();

            }
        );

    }


    /*
    =================================================
    INPUT
    =================================================
    */

    const input =
        $("messageInput");


    if (input) {

        input.addEventListener(
            "input",
            () => {

                resizeTextarea();

                handleTyping();

            }
        );


        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    form.requestSubmit();

                }

            }
        );

    }


    setupAttachmentButton();

}


/* =====================================================
   AUTH
===================================================== */

onAuthStateChanged(
    auth,

    async user => {

        if (!user) {

            location.replace(
                "login.html"
            );

            return;

        }


        currentUser =
            user;


        const otherUid =
            getOtherUid();


        /*
        =================================================
        NO USER SELECTED
        =================================================
        */

        if (!otherUid) {

            showChatError(
                "No user was selected for this conversation."
            );


            const form =
                $("messageForm");


            if (form) {

                form.style.display =
                    "none";

            }


            return;

        }


        /*
        =================================================
        SELF CHAT
        =================================================
        */

        if (
            otherUid ===
            currentUser.uid
        ) {

            showChatError(
                "You cannot start a private chat with yourself."
            );


            const form =
                $("messageForm");


            if (form) {

                form.style.display =
                    "none";

            }


            return;

        }


        /*
        =================================================
        CHAT INITIALIZATION
        =================================================
        */

        try {

            /*
            =================================================
            1. CREATE CHAT ID IMMEDIATELY
            =================================================
            */

            chatId =
                createChatId(
                    currentUser.uid,
                    otherUid
                );


            /*
            =================================================
            2. LOAD CACHED PROFILE IMMEDIATELY
            =================================================
            */

            const cachedProfile =
                getCachedProfile(
                    otherUid
                );


            if (cachedProfile) {

                otherUser = {

                    uid:
                        otherUid,

                    ...cachedProfile

                };


                renderChatHeader(
                    otherUser
                );

            }


            /*
            =================================================
            3. LOAD CACHED MESSAGES IMMEDIATELY
            =================================================
            */

            const cachedMessages =
                getMessageCache(
                    chatId
                );


            if (
                cachedMessages.length
            ) {

                latestMessages =
                    cachedMessages;


                renderMessages(
                    cachedMessages
                );

            }


            /*
            =================================================
            4. START REALTIME PROFILE LISTENER
            =================================================

            This is started immediately so a change to
            isVerified, displayName, photoURL or isOnline
            can appear without refreshing.

            Firestore onSnapshot provides the initial
            snapshot and subsequent changes.
            */

            listenToOtherUser(
                otherUid
            );


            /*
            =================================================
            5. MESSAGE LISTENER
            =================================================
            */

            listenToMessages();


            /*
            =================================================
            6. CHAT METADATA LISTENER
            =================================================
            */

            listenToChat();


            /*
            =================================================
            7. REFRESH PROFILE FROM FIRESTORE
            =================================================
            */

            await loadOtherUser(
                otherUid
            );


            /*
            =================================================
            8. CREATE / REPAIR CHAT
            =================================================
            */

            await ensureChat();


        } catch (error) {

            console.error(
                "Chat initialization error:",
                error
            );


            /*
            Keep cached conversation visible.
            */

            if (
                !latestMessages.length
            ) {

                showChatError(
                    "Could not open this conversation. Please try again."
                );

            }

        }

    }
);


/* =====================================================
   CLEANUP
===================================================== */

window.addEventListener(
    "beforeunload",
    () => {

        clearTimeout(
            typingTimer
        );


        /*
        BEST-EFFORT TYPING CLEANUP
        */

        if (
            currentUser &&
            chatId
        ) {

            updateDoc(
                doc(
                    db,
                    "chats",
                    chatId
                ),
                {

                    [`typing.${currentUser.uid}`]:
                        false

                }
            ).catch(
                () => {}
            );

        }


        /*
        STOP MESSAGE LISTENER
        */

        if (
            stopMessages
        ) {

            stopMessages();

            stopMessages =
                null;

        }


        /*
        STOP USER LISTENER
        */

        if (
            stopOtherUser
        ) {

            stopOtherUser();

            stopOtherUser =
                null;

        }


        /*
        STOP CHAT LISTENER
        */

        if (
            stopChat
        ) {

            stopChat();

            stopChat =
                null;

        }

    }
);


/* =====================================================
   START UI
===================================================== */

setupUI();
