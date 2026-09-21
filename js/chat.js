import {
    auth,
    db,
    storage
} from "./firebase.js";


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


import {
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


/* =====================================================
   CONNECTA CHAT ENGINE
===================================================== */

const $ = id =>
    document.getElementById(id);


let currentUser = null;

let currentProfile = null;

let otherUser = null;

let chatId = null;

let stopOwnProfile = null;

let stopMessages = null;

let stopOtherUser = null;

let stopChat = null;

let latestMessages = [];

let isOtherUserTyping = false;

let typingTimer = null;

let lastTypingWrite = 0;

let isMarkingMessages = false;


/* =====================================================
   PHOTO CONFIGURATION
===================================================== */

const MAX_PHOTO_SIZE =
    5 * 1024 * 1024;


const ALLOWED_PHOTO_TYPES = [

    "image/jpeg",

    "image/png",

    "image/webp"

];


/* =====================================================
   PHOTO STATE
===================================================== */

let selectedPhoto = null;

let selectedPhotoPreviewUrl = null;

let isSendingPhoto = false;


/* =====================================================
   PROFILE CACHE
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


    const publicCache =
        getNewPublicProfileCache(
            uid
        );


    if (publicCache) {

        return publicCache;

    }


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
        Only public information is cached.
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


        localStorage.setItem(

            `${PUBLIC_PROFILE_CACHE_KEY}_${uid}`,

            JSON.stringify(
                publicProfile
            )

        );


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

    const displayName =
        String(
            user.displayName || ""
        ).trim();


    if (
        displayName &&
        displayName !== "CONNECTA User"
    ) {

        return displayName;

    }


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


    nameElement.innerHTML = `

        <span class="chat-user-name-text">
            ${escapeHtml(name)}
        </span>

        ${verifiedBadge}

    `;


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
===================================================== */

async function loadOtherUser(
    uid
) {

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


        saveChatProfile(
            uid,
            otherUser
        );


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


                otherUser = {

                    uid,

                    ...snapshot.data()

                };


                saveChatProfile(
                    uid,
                    otherUser
                );


                renderChatHeader(
                    otherUser
                );


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

                lastMessageType:
                    "text",

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


    const data =
        snap.data();


    const updates = {};


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


                saveMessageCache(
                    chatId,
                    messages
                );


                renderMessages(
                    messages
                );


                await markIncomingMessages(
                    messages
                );

            },

            error => {

                console.error(
                    "Messages listener:",
                    error
                );


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
   RENDER IMAGE MESSAGE
===================================================== */

function renderImageMessage(
    message,
    tick
) {

    const imageUrl =
        message.imageUrl ||
        message.photoURL ||
        message.photoUrl ||
        "";


    if (!imageUrl) {

        return `

            <span class="message-text">
                Photo unavailable
            </span>

            <span class="message-meta">

                <span class="message-time">
                    ${formatTime(
                        message.createdAt
                    )}
                </span>

                ${tick}

            </span>

        `;

    }


    return `

        <a
            class="image-message-content"
            href="${escapeHtml(imageUrl)}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open photo"
        >

            <img
                class="message-image"
                src="${escapeHtml(imageUrl)}"
                alt="Photo message"
                loading="lazy"
            >

        </a>


        <span class="message-meta">

            <span class="message-time">
                ${formatTime(
                    message.createdAt
                )}
            </span>

            ${tick}

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


            const tick =
                mine
                    ? getMessageTickState(
                        message
                    )
                    : "";


            /*
            =================================================
            IMAGE MESSAGE
            =================================================
            */

            const isImage =
                message.type === "image" ||
                !!message.imageUrl ||
                !!message.photoURL;


            let messageContent = "";


            if (isImage) {

                messageContent =
                    renderImageMessage(
                        message,
                        tick
                    );

            } else {

                messageContent = `

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

                `;

            }


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
                        class="message-bubble
                            ${isImage
                                ? "photo-message"
                                : ""}"
                    >

                        ${messageContent}

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
   SEND TEXT MESSAGE
===================================================== */

async function sendTextMessage(
    text
) {
        const control =
        getChatAccountControl(
            currentProfile
        );


    if (
        control.blocked ||
        control.messagingRestricted
    ) {

        showChatRestrictionNotice(
            control.message ||
            "Private messaging has been restricted by CONNECTA.",
            control.blocked
                ? "account"
                : "messaging"
        );


        return;

    }

    if (
        !text ||
        !currentUser ||
        !otherUser ||
        !chatId
    ) {

        return;

    }


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


    batch.set(
        messageRef,
        {

            senderId:
                currentUser.uid,

            receiverId:
                otherUser.uid,

            type:
                "text",

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


    batch.update(
        chatRef,
        {

            lastMessage:
                text,

            lastMessageType:
                "text",

            lastSenderId:
                currentUser.uid,

            updatedAt:
                serverTimestamp()

        }
    );


    batch.update(
        chatRef,
        {

            [`unreadCount.${otherUser.uid}`]:
                increment(1)

        }
    );


    await batch.commit();

}


/* =====================================================
   VALIDATE PHOTO
===================================================== */

function validatePhoto(
    file
) {

    if (!file) {

        return {
            valid: false,
            message: "Please select a photo."
        };

    }


    /*
    =================================================
    TYPE
    =================================================
    */

    if (
        !ALLOWED_PHOTO_TYPES.includes(
            file.type
        )
    ) {

        return {
            valid: false,
            message:
                "Only JPG, PNG and WebP photos are allowed. Videos are not supported."
        };

    }


    /*
    =================================================
    SIZE
    =================================================
    */

    if (
        file.size >
        MAX_PHOTO_SIZE
    ) {

        return {
            valid: false,
            message:
                "Photo must be 5MB or smaller."
        };

    }


    return {
        valid: true
    };

}


/* =====================================================
   PHOTO STATUS
===================================================== */

function setPhotoStatus(
    message,
    show = true
) {

    const element =
        $("photoUploadStatus");


    if (!element) {
        return;
    }


    element.textContent =
        message;


    element.classList.toggle(
        "show",
        show
    );

}


/* =====================================================
   CLEAR PHOTO SELECTION
===================================================== */

function clearSelectedPhoto() {

    selectedPhoto =
        null;


    if (
        selectedPhotoPreviewUrl
    ) {

        URL.revokeObjectURL(
            selectedPhotoPreviewUrl
        );


        selectedPhotoPreviewUrl =
            null;

    }


    const input =
        $("photoInput");


    if (input) {

        input.value =
            "";

    }


    const preview =
        $("photoPreview");


    if (preview) {

        preview.classList.remove(
            "show"
        );

    }


    const previewImage =
        $("photoPreviewImage");


    if (previewImage) {

        previewImage.removeAttribute(
            "src"
        );

    }


    setPhotoStatus(
        "",
        false
    );

}


/* =====================================================
   SHOW PHOTO PREVIEW
===================================================== */

function showPhotoPreview(
    file
) {

    const validation =
        validatePhoto(
            file
        );


    if (
        !validation.valid
    ) {

        clearSelectedPhoto();


        setPhotoStatus(
            validation.message,
            true
        );


        setTimeout(
            () => {

                setPhotoStatus(
                    "",
                    false
                );

            },
            3500
        );


        return false;

    }


    clearSelectedPhoto();


    selectedPhoto =
        file;


    selectedPhotoPreviewUrl =
        URL.createObjectURL(
            file
        );


    const preview =
        $("photoPreview");


    const previewImage =
        $("photoPreviewImage");


    const previewTitle =
        $("photoPreviewTitle");


    const previewSize =
        $("photoPreviewSize");


    if (
        preview &&
        previewImage
    ) {

        previewImage.src =
            selectedPhotoPreviewUrl;


        if (previewTitle) {

            previewTitle.textContent =
                file.name || "Photo";

        }


        if (previewSize) {

            previewSize.textContent =
                `${formatFileSize(
                    file.size
                )} • Ready to send`;

        }


        preview.classList.add(
            "show"
        );

    }


    setPhotoStatus(
        "",
        false
    );


    return true;

}


/* =====================================================
   FILE SIZE
===================================================== */

function formatFileSize(
    bytes
) {

    if (
        !bytes
    ) {

        return "0 KB";

    }


    if (
        bytes < 1024 * 1024
    ) {

        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;

    }


    return `${(
        bytes /
        (1024 * 1024)
    ).toFixed(2)} MB`;

}


/* =====================================================
   UPLOAD PHOTO
===================================================== */

async function uploadPhoto(
    file
) {
        const control =
        getChatAccountControl(
            currentProfile
        );


    if (
        control.blocked ||
        control.messagingRestricted
    ) {

        throw new Error(
            control.message ||
            "Private messaging has been restricted by CONNECTA."
        );

    }

    if (
        !currentUser ||
        !otherUser ||
        !chatId
    ) {

        throw new Error(
            "Chat is not ready."
        );

    }


    const messagesRef =
        collection(
            db,
            "chats",
            chatId,
            "messages"
        );


    /*
    Create the message ID before uploading
    so the Storage path and Firestore message
    use the same ID.
    */

    const messageRef =
        doc(
            messagesRef
        );


    const extension =
        getFileExtension(
            file
        );


    const storagePath =
        `chatPhotos/${chatId}/${currentUser.uid}/${messageRef.id}.${extension}`;


    const photoRef =
        ref(
            storage,
            storagePath
        );


    setPhotoStatus(
        "Uploading photo... 0%",
        true
    );


    const uploadTask =
        uploadBytesResumable(
            photoRef,
            file,
            {

                contentType:
                    file.type,

                cacheControl:
                    "public,max-age=31536000"

            }
        );


    const snapshot =
        await new Promise(
            (
                resolve,
                reject
            ) => {

                uploadTask.on(

                    "state_changed",

                    uploadSnapshot => {

                        const progress =
                            Math.round(
                                (
                                    uploadSnapshot.bytesTransferred /
                                    uploadSnapshot.totalBytes
                                ) * 100
                            );


                        setPhotoStatus(
                            `Uploading photo... ${progress}%`,
                            true
                        );

                    },

                    error => {

                        reject(
                            error
                        );

                    },

                    () => {

                        resolve(
                            uploadTask.snapshot
                        );

                    }

                );

            }
        );


    setPhotoStatus(
        "Finalizing photo...",
        true
    );


    const imageUrl =
        await getDownloadURL(
            snapshot.ref
        );


    /*
    =================================================
    CREATE FIRESTORE PHOTO MESSAGE
    =================================================
    */

    const batch =
        writeBatch(
            db
        );


    batch.set(
        messageRef,
        {

            senderId:
                currentUser.uid,

            receiverId:
                otherUser.uid,

            type:
                "image",

            text:
                "",

            imageUrl:
                imageUrl,

            imagePath:
                storagePath,

            fileName:
                file.name || "photo",

            mimeType:
                file.type,

            fileSize:
                file.size,

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


    const chatRef =
        doc(
            db,
            "chats",
            chatId
        );


    batch.update(
        chatRef,
        {

            lastMessage:
                "📷 Photo",

            lastMessageType:
                "image",

            lastSenderId:
                currentUser.uid,

            updatedAt:
                serverTimestamp()

        }
    );


    batch.update(
        chatRef,
        {

            [`unreadCount.${otherUser.uid}`]:
                increment(1)

        }
    );


    await batch.commit();


    setPhotoStatus(
        "Photo sent successfully.",
        true
    );


    setTimeout(
        () => {

            setPhotoStatus(
                "",
                false
            );

        },
        1500
    );

}


/* =====================================================
   GET FILE EXTENSION
===================================================== */

function getFileExtension(
    file
) {

    const typeMap = {

        "image/jpeg":
            "jpg",

        "image/png":
            "png",

        "image/webp":
            "webp"

    };


    if (
        typeMap[file.type]
    ) {

        return typeMap[
            file.type
        ];

    }


    const extension =
        file.name
            ?.split(".")
            .pop()
            ?.toLowerCase();


    if (
        extension === "jpeg"
    ) {

        return "jpg";

    }


    return extension || "jpg";

}


/* =====================================================
   SEND MESSAGE
===================================================== */

async function sendMessage() {

        const control =
        getChatAccountControl(
            currentProfile
        );


    if (
        control.blocked ||
        control.messagingRestricted
    ) {

        showChatRestrictionNotice(
            control.message ||
            "Private messaging has been restricted by CONNECTA.",
            control.blocked
                ? "account"
                : "messaging"
        );


        return;

    }

    const input =
        $("messageInput");


    if (!input) {
        return;
    }


    const text =
        input.value.trim();


    const hasText =
        Boolean(
            text
        );


    const hasPhoto =
        Boolean(
            selectedPhoto
        );


    if (
        !hasText &&
        !hasPhoto
    ) {

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


        /*
        =================================================
        SEND TEXT FIRST
        =================================================
        */

        if (hasText) {

            await sendTextMessage(
                text
            );


            input.value =
                "";

            resizeTextarea();

        }


        /*
        =================================================
        SEND PHOTO
        =================================================
        */

        if (
            hasPhoto
        ) {

            isSendingPhoto =
                true;


            const photo =
                selectedPhoto;


            await uploadPhoto(
                photo
            );


            clearSelectedPhoto();


            isSendingPhoto =
                false;

        }


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


        isSendingPhoto =
            false;


        let message =
            "Message could not be sent.";


        if (
            error?.code ===
            "storage/unauthorized"
        ) {

            message =
                "Photo upload was blocked by Firebase Storage Rules.";

        }


        if (
            error?.code ===
            "storage/canceled"
        ) {

            message =
                "Photo upload was cancelled.";

        }


        showChatError(
            message
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

        const control =
        getChatAccountControl(
            currentProfile
        );


    if (
        control.blocked ||
        control.messagingRestricted
    ) {

        return;

    }

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

        const control =
        getChatAccountControl(
            currentProfile
        );


    if (
        control.blocked ||
        control.messagingRestricted
    ) {

        return;

    }

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
   ADMIN ACCOUNT / CHAT CONTROLS

   Controlled by the CONNECTA Admin Panel:

   status:
   - active
   - suspended
   - banned

   messagingRestricted:
   - false → user can send messages
   - true  → user can read chats but cannot send

   IMPORTANT:
   These frontend checks are UX protection.
   Firestore/backend security rules must also
   enforce the restriction so it cannot be bypassed.
===================================================== */

function getChatAccountControl(
    profile = {}
) {

    const status =
        String(
            profile.status || "active"
        )
        .trim()
        .toLowerCase();


    const messagingRestricted =
        profile.messagingRestricted === true;


    if (status === "banned") {

        return {

            blocked: true,

            status: "banned",

            messagingRestricted: true,

            message:
                "Your CONNECTA account has been banned."

        };

    }


    if (status === "suspended") {

        return {

            blocked: true,

            status: "suspended",

            messagingRestricted: true,

            message:
                "Your CONNECTA account is currently suspended."

        };

    }


    return {

        blocked: false,

        status: "active",

        messagingRestricted,

        message:
            messagingRestricted
                ? "Private messaging has been restricted by CONNECTA."
                : ""

    };

}


/* =====================================================
   CHAT COMPOSER CONTROL
===================================================== */

function applyChatMessagingControl(
    profile = currentProfile
) {

    const control =
        getChatAccountControl(
            profile
        );


    const form =
        $("messageForm");


    const input =
        $("messageInput");


    const sendButton =
        $("sendButton");


    const attachButton =
        $("attachButton");


    const photoInput =
        $("photoInput");


    /*
     * Account suspended/banned.
     *
     * The entire composer is disabled.
     */

    if (control.blocked) {

        if (input) {

            input.disabled =
                true;

            input.placeholder =
                "Messaging unavailable";

        }


        if (sendButton) {

            sendButton.disabled =
                true;

        }


        if (attachButton) {

            attachButton.disabled =
                true;

        }


        if (photoInput) {

            photoInput.disabled =
                true;

        }


        if (form) {

            form.style.opacity =
                "0.55";

        }


        showChatRestrictionNotice(
            control.message,
            "account"
        );


        return control;

    }


    /*
     * Messaging restriction.
     *
     * User can still read the conversation.
     */

    if (
        control.messagingRestricted
    ) {

        if (input) {

            input.disabled =
                true;

            input.placeholder =
                "Private messaging is restricted";

        }


        if (sendButton) {

            sendButton.disabled =
                true;

        }


        if (attachButton) {

            attachButton.disabled =
                true;

        }


        if (photoInput) {

            photoInput.disabled =
                true;

        }


        if (form) {

            form.style.opacity =
                "0.65";

        }


        showChatRestrictionNotice(
            control.message,
            "messaging"
        );


        return control;

    }


    /*
     * Normal active account.
     */

    if (input) {

        input.disabled =
            false;

        input.placeholder =
            input.dataset.originalPlaceholder ||
            "Type a message...";

    }


    if (sendButton) {

        sendButton.disabled =
            false;

    }


    if (attachButton) {

        attachButton.disabled =
            false;

    }


    if (photoInput) {

        photoInput.disabled =
            false;

    }


    if (form) {

        form.style.opacity =
            "";

    }


    removeChatRestrictionNotice();


    return control;

}


/* =====================================================
   RESTRICTION NOTICE
===================================================== */

function showChatRestrictionNotice(
    message,
    type = "messaging"
) {

    let notice =
        $("chatRestrictionNotice");


    if (!notice) {

        notice =
            document.createElement(
                "div"
            );


        notice.id =
            "chatRestrictionNotice";


        notice.style.cssText = `
            margin:8px 12px;
            padding:10px 12px;
            border-radius:12px;
            background:#fff7ed;
            border:1px solid #fed7aa;
            color:#9a3412;
            font-size:12px;
            font-weight:700;
            line-height:1.45;
            text-align:center;
        `;


        const form =
            $("messageForm");


        if (form?.parentNode) {

            form.parentNode.insertBefore(
                notice,
                form
            );

        }

    }


    notice.textContent =
        message ||
        (
            type === "account"
                ? "Messaging is unavailable for this account."
                : "Private messaging has been restricted by CONNECTA."
        );


    notice.style.display =
        "block";

}


/* =====================================================
   REMOVE RESTRICTION NOTICE
===================================================== */

function removeChatRestrictionNotice() {

    const notice =
        $("chatRestrictionNotice");


    if (notice) {

        notice.remove();

    }

}


/* =====================================================
   CURRENT USER ADMIN CONTROL LISTENER
===================================================== */

function listenToOwnProfile(
    uid
) {

    if (
        stopOwnProfile
    ) {

        stopOwnProfile();

        stopOwnProfile =
            null;

    }


    stopOwnProfile =
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


                currentProfile = {

                    uid,

                    ...snapshot.data()

                };


                const control =
                    applyChatMessagingControl(
                        currentProfile
                    );


                /*
                 * If an administrator suspends or
                 * bans the account while this chat
                 * is open, stop the chat session.
                 */

                if (
                    control.blocked
                ) {

                    if (stopMessages) {

                        stopMessages();

                        stopMessages =
                            null;

                    }


                    if (stopChat) {

                        stopChat();

                        stopChat =
                            null;

                    }


                    if (stopOtherUser) {

                        stopOtherUser();

                        stopOtherUser =
                            null;

                    }


                    showChatError(
                        control.message
                    );


                    const form =
                        $("messageForm");


                    if (form) {

                        form.style.display =
                            "none";

                    }

                } else {

                    const form =
                        $("messageForm");


                    if (form) {

                        form.style.display =
                            "";

                    }

                }

            },

            error => {

                console.warn(
                    "Own account control listener failed:",
                    error
                );


                /*
                 * Fail closed for sending.
                 * We don't allow messaging when
                 * the current account's control
                 * state cannot be verified.
                 */

                applyChatMessagingControl({

                    status:
                        "active",

                    messagingRestricted:
                        true

                });

            }

        );

    }

/* =====================================================
   PHOTO ATTACHMENT
===================================================== */

function setupAttachmentButton() {

    const button =
        $("attachButton");


    const input =
        $("photoInput");


    if (
        !button ||
        !input
    ) {

        console.warn(
            "CONNECTA: Photo input elements were not found."
        );


        return;

    }


    /*
    =================================================
    OPEN PHOTO PICKER
    =================================================
    */

    button.addEventListener(
        "click",
        () => {

            if (
                isSendingPhoto
            ) {

                return;

            }


            input.click();

        }
    );


    /*
    =================================================
    PHOTO SELECTED
    =================================================
    */

    input.addEventListener(
        "change",
        event => {

            const file =
                event.target.files?.[0];


            if (!file) {
                return;
            }


            showPhotoPreview(
                file
            );

        }
    );


    /*
    =================================================
    CANCEL PHOTO
    =================================================
    */

    const cancelButton =
        $("photoPreviewCancel");


    if (cancelButton) {

        cancelButton.addEventListener(
            "click",
            () => {

                clearSelectedPhoto();

            }
        );

    }

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
    SEND FORM
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
    MESSAGE INPUT
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

        /*
=================================================
LOAD CURRENT USER ADMIN CONTROLS
=================================================
*/

listenToOwnProfile(
    user.uid
);


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
            1. CHAT ID
            */

            chatId =
                createChatId(
                    currentUser.uid,
                    otherUid
                );


            /*
            2. CACHED PROFILE
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
            3. CACHED MESSAGES
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
            4. REALTIME PROFILE
            */

            listenToOtherUser(
                otherUid
            );


            /*
            5. REALTIME MESSAGES
            */

            listenToMessages();


            /*
            6. CHAT METADATA
            */

            listenToChat();


            /*
            7. FIRESTORE PROFILE
            */

            await loadOtherUser(
                otherUid
            );


            /*
            8. CREATE / REPAIR CHAT
            */

            await ensureChat();


        } catch (error) {

            console.error(
                "Chat initialization error:",
                error
            );


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


        if (
            selectedPhotoPreviewUrl
        ) {

            URL.revokeObjectURL(
                selectedPhotoPreviewUrl
            );

        }


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


        if (
            stopMessages
        ) {

            stopMessages();

            stopMessages =
                null;

        }


        if (
            stopOtherUser
        ) {

            stopOtherUser();

            stopOtherUser =
                null;

        }

        if (
    stopOwnProfile
) {

    stopOwnProfile();

    stopOwnProfile =
        null;

        }


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
