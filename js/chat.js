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
    addDoc,
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
   INITIALS
===================================================== */

function initials(name = "U") {

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(x => x[0])
        .join("")
        .toUpperCase() || "U";

}


/* =====================================================
   FULL NAME
===================================================== */

function getFullName(user = {}) {

    const displayName =
        String(user.displayName || "").trim();


    if (displayName) {
        return displayName;
    }


    const firstName =
        String(user.firstName || "").trim();


    const lastName =
        String(user.lastName || "").trim();


    const fullName =
        `${firstName} ${lastName}`.trim();


    if (fullName) {
        return fullName;
    }


    const username =
        String(user.username || "").trim();


    if (username) {
        return username.replace(/^@/, "");
    }


    return "CONNECTA User";

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[c]));

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

function createChatId(uid1, uid2) {

    return [uid1, uid2]
        .sort()
        .join("_");

}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(timestamp) {

    if (!timestamp?.toDate) {
        return "";
    }


    return timestamp
        .toDate()
        .toLocaleTimeString(
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

function formatDate(timestamp) {

    if (!timestamp?.toDate) {
        return "Today";
    }


    const date =
        timestamp.toDate();


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

function renderChatHeader(user) {

    if (!user) {
        return;
    }


    const name =
        getFullName(user);


    const photo =
        user.photoURL ||
        user.photoUrl ||
        "";


    const nameElement =
        $("chatUserName");


    const avatarElement =
        $("chatAvatar");


    if (!nameElement || !avatarElement) {
        return;
    }


    /* NAME */

    nameElement.innerHTML = `

        ${escapeHtml(name)}

        ${
            user.isVerified === true
                ? `
                    <span
                        class="verified-badge"
                        title="Verified account"
                    >✓</span>
                `
                : ""
        }

    `;


    /* PHOTO */

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


    /*
    TYPING TAKES PRIORITY
    */

    if (isOtherUserTyping) {

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
    ONLINE
    */

    if (otherUser.isOnline === true) {

        statusText.textContent =
            "Online";


        if (statusDot) {

            statusDot.style.display =
                "flex";

        }

        return;

    }


    /*
    OFFLINE
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

function getLastSeenText(user) {

    if (!user?.lastSeen?.toDate) {
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

async function loadOtherUser(uid) {

    const snap =
        await getDoc(
            doc(db, "users", uid)
        );


    if (!snap.exists()) {

        throw new Error(
            "User profile not found."
        );

    }


    otherUser = {

        uid,

        ...snap.data()

    };


    renderChatHeader(
        otherUser
    );

}


/* =====================================================
   LISTEN TO USER
===================================================== */

function listenToOtherUser(uid) {

    if (stopOtherUser) {

        stopOtherUser();

    }


    stopOtherUser =
        onSnapshot(
            doc(db, "users", uid),

            snapshot => {

                if (!snapshot.exists()) {
                    return;
                }


                otherUser = {

                    uid,

                    ...snapshot.data()

                };


                updateStatusDisplay();


                /*
                If recipient becomes online,
                mark our sent messages as delivered.
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
        await getDoc(chatRef);


    /*
    =====================================================
    CREATE NEW CHAT
    =====================================================
    */

    if (!snap.exists()) {

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

                /*
                IMPORTANT:
                Each user gets their own
                unread counter.
                */

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
    =====================================================
    MAKE SURE PARTICIPANTS EXIST
    =====================================================
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
    =====================================================
    REPAIR UNREAD COUNTERS
    =====================================================
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

        /*
        Current user's counter missing?
        */

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


        /*
        Other user's counter missing?
        */

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
    =====================================================
    REPAIR TYPING
    =====================================================
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
    =====================================================
    APPLY REPAIRS
    =====================================================
    */

    if (
        Object.keys(updates).length > 0
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

    }


    stopChat =
        onSnapshot(
            doc(
                db,
                "chats",
                chatId
            ),

            snapshot => {

                if (!snapshot.exists()) {
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

                            id: message.id,

                            ...message.data()

                        })
                    );


                latestMessages =
                    messages;


                renderMessages(
                    messages
                );


                /*
                Messages received while this
                conversation is open become
                delivered + read.
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


                showChatError(
                    "Could not load messages. Please check your Firestore rules."
                );

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


    /* =================================================
       EMPTY CHAT
    ================================================= */

    if (!messages.length) {

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


    /* =================================================
       RENDER EACH MESSAGE
    ================================================= */

    messages.forEach(
        message => {

            const mine =
                message.senderId ===
                currentUser.uid;


            const dateLabel =
                formatDate(
                    message.createdAt
                );


            /* =========================================
               DATE SEPARATOR
            ========================================= */

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


            /* =========================================
               MESSAGE TICK
            ========================================= */

            const tick =
                mine
                    ? getMessageTickState(
                        message
                    )
                    : "";


            /* =========================================
               MESSAGE
               
               IMPORTANT:
               TEXT + TIME + CHECKS ARE NOW
               IN ONE INLINE FLOW.
            ========================================= */

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


    /* =================================================
       INSERT
    ================================================= */

    box.innerHTML =
        html;


    /* =================================================
       SCROLL TO BOTTOM
    ================================================= */

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


    if (!incoming.length) {
        return;
    }


    isMarkingMessages =
        true;


    try {

        const batch =
            writeBatch(db);


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

                        delivered: true,

                        deliveredAt:
                            serverTimestamp(),

                        read: true,

                        readAt:
                            serverTimestamp()

                    }
                );

            }
        );


        /*
        RESET UNREAD COUNT
        */

        const chatRef =
            doc(
                db,
                "chats",
                chatId
            );


        batch.update(
            chatRef,
            {
                [`unreadCount.${currentUser.uid}`]: 0
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


    if (!messages.length) {
        return;
    }


    try {

        const batch =
            writeBatch(db);


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

                        delivered: true,

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

        /*
        =================================================
        STOP TYPING
        =================================================
        */

        clearTimeout(
            typingTimer
        );


        await setTyping(
            false
        );


        /*
        =================================================
        CHAT DOCUMENT
        =================================================
        */

        const chatRef =
            doc(
                db,
                "chats",
                chatId
            );


        /*
        =================================================
        MESSAGE COLLECTION
        =================================================
        */

        const messagesRef =
            collection(
                db,
                "chats",
                chatId,
                "messages"
            );


        /*
        =================================================
        NEW MESSAGE DOCUMENT
        =================================================
        */

        const messageRef =
            doc(messagesRef);


        /*
        =================================================
        ATOMIC BATCH
        =================================================
        */

        const batch =
            writeBatch(db);


        /*
        =================================================
        1. CREATE MESSAGE
        =================================================
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
        =================================================
        2. UPDATE LAST MESSAGE
        =================================================
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
        =================================================
        3. INCREASE RECEIVER UNREAD COUNT
        =================================================

        VERY IMPORTANT:

        We increase the OTHER USER'S counter,
        NOT our own counter.
        */

        batch.update(
            chatRef,
            {

                [`unreadCount.${otherUser.uid}`]:
                    increment(1)

            }
        );


        /*
        =================================================
        COMMIT
        =================================================
        */

        await batch.commit();


        console.log(
            "Message sent successfully."
        );


        console.log(
            "Unread count increased for UID:",
            otherUser.uid
        );


        /*
        =================================================
        CLEAR INPUT
        =================================================
        */

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


    /*
    Empty input = stop typing.
    */

    if (!text) {

        clearTimeout(
            typingTimer
        );

        setTyping(false);

        return;

    }


    /*
    Don't hammer Firestore with writes.
    */

    const now =
        Date.now();


    if (
        now - lastTypingWrite >
        1000
    ) {

        lastTypingWrite =
            now;

        setTyping(true);

    }


    /*
    Automatically stop typing after
    1.8 seconds without input.
    */

    clearTimeout(
        typingTimer
    );


    typingTimer =
        setTimeout(
            () => {

                setTyping(false);

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

            ${escapeHtml(message)}

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

            /*
            Attachments will be implemented
            after the core chat system.
            */

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


    /* =================================================
       BACK
    ================================================= */

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


    /* =================================================
       PROFILE
    ================================================= */

    const profile =
        $("profileBtn");


    if (profile) {

        profile.addEventListener(
            "click",
            () => {

                if (!otherUser?.uid) {
                    return;
                }


                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        otherUser.uid
                    )}`;

            }
        );

    }


    /* =================================================
       USER HEADER
    ================================================= */

    const userArea =
        $("chatUserArea");


    if (userArea) {

        userArea.addEventListener(
            "click",
            () => {

                if (!otherUser?.uid) {
                    return;
                }


                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        otherUser.uid
                    )}`;

            }
        );

    }


    /* =================================================
       SEND
    ================================================= */

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


    /* =================================================
       INPUT
    ================================================= */

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
        NO USER
        */

        if (!otherUid) {

            showChatError(
                "No user was selected for this conversation."
            );


            $("messageForm").style.display =
                "none";

            return;

        }


        /*
        SELF CHAT
        */

        if (
            otherUid ===
            currentUser.uid
        ) {

            showChatError(
                "You cannot start a private chat with yourself."
            );


            $("messageForm").style.display =
                "none";

            return;

        }


        try {

            /*
            ==========================================
            LOAD RECIPIENT
            ==========================================
            */

            await loadOtherUser(
                otherUid
            );


            /*
            ==========================================
            CREATE / LOAD CHAT
            ==========================================
            */

            await ensureChat();


            /*
            ==========================================
            LISTEN TO CHAT METADATA
            ==========================================
            */

            listenToChat();


            /*
            ==========================================
            LISTEN TO MESSAGES
            ==========================================
            */

            listenToMessages();


            /*
            ==========================================
            LIVE ONLINE / OFFLINE
            ==========================================
            */

            listenToOtherUser(
                otherUid
            );


            /*
            ==========================================
            OPENING CHAT = READ
            ==========================================
            */

            /*
            Messages listener will immediately
            mark incoming messages as read.
            */


        } catch (error) {

            console.error(
                "Chat initialization error:",
                error
            );


            showChatError(
                "Could not open this conversation. Please try again."
            );

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
        Best effort to clear typing state.
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


        if (stopMessages) {
            stopMessages();
        }


        if (stopOtherUser) {
            stopOtherUser();
        }


        if (stopChat) {
            stopChat();
        }

    }
);


/* =====================================================
   START
===================================================== */

setupUI();
