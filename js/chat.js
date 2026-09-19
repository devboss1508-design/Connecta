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
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =====================================================
   CONNECTA CHAT
===================================================== */

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let otherUser = null;

let chatId = null;

let stopMessages = null;
let stopOtherUser = null;

let latestMessages = [];


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
   GET OTHER USER UID
===================================================== */

function getOtherUid() {

    const params =
        new URLSearchParams(location.search);

    return params.get("uid");

}


/* =====================================================
   CREATE DETERMINISTIC CHAT ID
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

    return timestamp.toDate().toLocaleTimeString(
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
            year: date.getFullYear() !== today.getFullYear()
                ? "numeric"
                : undefined
        }
    );

}


/* =====================================================
   RENDER HEADER
===================================================== */

function renderChatHeader(user) {

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


    /* AVATAR */

    if (photo) {

        avatarElement.innerHTML = `
            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
                style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                    border-radius:50%;
                    display:block;
                "
                onerror="
                    this.style.display='none';
                    this.parentElement.textContent='${escapeHtml(
                        initials(name)
                    )}';
                "
            >
        `;

    } else {

        avatarElement.textContent =
            initials(name);

    }


    updateUserStatus(user);

}


/* =====================================================
   UPDATE USER STATUS
===================================================== */

function updateUserStatus(user) {

    const online =
        user?.isOnline === true;


    const statusText =
        $("chatStatusText");

    const statusDot =
        $("chatStatusDot");


    if (!statusText) {
        return;
    }


    if (online) {

        statusText.textContent =
            "Online";

        if (statusDot) {
            statusDot.style.display =
                "flex";
        }

    } else {

        statusText.textContent =
            getLastSeenText(user);

        if (statusDot) {
            statusDot.style.display =
                "none";
        }

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


    return `Last seen ${date.toLocaleTimeString(
        [],
        {
            hour: "numeric",
            minute: "2-digit"
        }
    )}`;

}


/* =====================================================
   LOAD OTHER USER
===================================================== */

async function loadOtherUser(uid) {

    const userRef =
        doc(db, "users", uid);

    const snap =
        await getDoc(userRef);


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
   LISTEN TO OTHER USER
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


                renderChatHeader(
                    otherUser
                );


                /*
                Re-render messages because the
                recipient's online state can affect
                the delivery tick.
                */

                if (latestMessages.length) {

                    renderMessages(
                        latestMessages,
                        false
                    );

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
        doc(db, "chats", chatId);


    const chatSnap =
        await getDoc(chatRef);


    if (!chatSnap.exists()) {

        await setDoc(
            chatRef,
            {
                id: chatId,

                participants: [
                    currentUser.uid,
                    otherUser.uid
                ],

                lastMessage: "",

                lastSenderId: "",

                updatedAt:
                    serverTimestamp(),

                createdAt:
                    serverTimestamp()
            }
        );

    }

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
                If this user is the recipient,
                mark incoming messages as delivered/read.
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
   MESSAGE TICK STATE
===================================================== */

function getMessageTickState(message) {

    /*
    Only outgoing messages have ticks.
    */


    if (
        message.senderId !==
        currentUser.uid
    ) {
        return "";
    }


    /*
    READ
    */

    if (message.read === true) {

        return `
            <span
                class="message-checks read"
                aria-label="Read"
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
        message.delivered === true ||
        otherUser?.isOnline === true
    ) {

        return `
            <span
                class="message-checks"
                aria-label="Delivered"
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
            aria-label="Sent"
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
                            getFullName(otherUser)
                        )}
                    </p>

                </div>

            </div>

        `;

        return;

    }


    let html = "";

    let previousDate = "";


    messages.forEach(message => {

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

                <div class="date-separator">

                    <span>
                        ${escapeHtml(dateLabel)}
                    </span>

                </div>

            `;

            previousDate =
                dateLabel;

        }


        /*
        MESSAGE
        */

        html += `

            <div
                class="
                    message-row
                    ${mine ? "outgoing" : "incoming"}
                "
                data-message-id="${escapeHtml(message.id)}"
            >

                <div class="message-bubble">

                    <div class="message-text">
                        ${escapeHtml(message.text)}
                    </div>


                    <div class="message-meta">

                        <span>
                            ${formatTime(message.createdAt)}
                        </span>

                        ${
                            mine
                                ? getMessageTickState(message)
                                : ""
                        }

                    </div>

                </div>

            </div>

        `;

    });


    box.innerHTML =
        html;


    if (scrollToBottom) {

        requestAnimationFrame(() => {

            box.scrollTop =
                box.scrollHeight;

        });

    }

}


/* =====================================================
   MARK INCOMING MESSAGES
===================================================== */

async function markIncomingMessages(messages) {

    if (!currentUser || !chatId) {
        return;
    }


    const incoming =
        messages.filter(message =>
            message.receiverId === currentUser.uid &&
            message.senderId !== currentUser.uid
        );


    if (!incoming.length) {
        return;
    }


    const batch =
        writeBatch(db);

    let changes = 0;


    incoming.forEach(message => {

        /*
        Because the conversation is currently open,
        the message is both delivered and viewed.
        */

        if (
            message.delivered !== true ||
            message.read !== true
        ) {

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


            changes++;

        }

    });


    if (changes === 0) {
        return;
    }


    try {

        await batch.commit();

    } catch (error) {

        console.warn(
            "Unable to update message receipts:",
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

    const text =
        input.value.trim();


    if (!text) {
        return;
    }


    if (!currentUser || !otherUser) {
        return;
    }


    if (!chatId) {
        return;
    }


    const sendButton =
        $("sendButton");


    sendButton.disabled =
        true;


    try {

        const messagesRef =
            collection(
                db,
                "chats",
                chatId,
                "messages"
            );


        await addDoc(
            messagesRef,
            {
                senderId:
                    currentUser.uid,

                receiverId:
                    otherUser.uid,

                text,

                createdAt:
                    serverTimestamp(),

                /*
                Initial state:
                one gray tick.

                The UI changes to double gray
                when recipient is online/delivered,
                and blue when read.
                */

                delivered: false,

                deliveredAt: null,

                read: false,

                readAt: null
            }
        );


        await setDoc(
            doc(
                db,
                "chats",
                chatId
            ),
            {
                participants: [
                    currentUser.uid,
                    otherUser.uid
                ],

                lastMessage:
                    text,

                lastSenderId:
                    currentUser.uid,

                updatedAt:
                    serverTimestamp()

            },
            {
                merge: true
            }
        );


        input.value = "";

        resizeTextarea();


    } catch (error) {

        console.error(
            "Send message error:",
            error
        );


        showChatError(
            "Message could not be sent."
        );

    } finally {

        sendButton.disabled =
            false;

        input.focus();

    }

}


/* =====================================================
   TEXTAREA AUTO RESIZE
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
            100
        ) + "px";

}


/* =====================================================
   CHAT ERROR
===================================================== */

function showChatError(message) {

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
   ATTACHMENT BUTTON
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
            after the core chat system is complete.
            */

            showChatError(
                "Attachments will be available soon."
            );

            setTimeout(() => {

                if (latestMessages.length) {

                    renderMessages(
                        latestMessages,
                        false
                    );

                }

            }, 1200);

        }
    );

}


/* =====================================================
   SETUP UI
===================================================== */

function setupUI() {


    /* ================================================
       BACK
    ================================================ */

    const back =
        $("backBtn");


    if (back) {

        back.addEventListener(
            "click",
            () => {

                if (history.length > 1) {

                    history.back();

                } else {

                    location.href =
                        "dashboard.html";

                }

            }
        );

    }


    /* ================================================
       PROFILE
    ================================================ */

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


    /* ================================================
       USER HEADER
    ================================================ */

    const userArea =
        $("chatUserArea");


    if (userArea) {

        userArea.addEventListener(
            "click",
            event => {

                /*
                Don't interfere with buttons.
                */

                if (
                    event.target.closest("button")
                ) {
                    return;
                }


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


    /* ================================================
       SEND FORM
    ================================================ */

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


    /* ================================================
       ENTER TO SEND
    ================================================ */

    const input =
        $("messageInput");


    if (input) {

        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    $("messageForm")
                        .requestSubmit();

                }

            }
        );


        input.addEventListener(
            "input",
            resizeTextarea
        );

    }


    setupAttachmentButton();

}


/* =====================================================
   AUTHENTICATION
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
        ==============================================
        GET OTHER USER
        ==============================================
        */

        const otherUid =
            getOtherUid();


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
        ==============================================
        PREVENT SELF CHAT
        ==============================================
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


        try {

            /*
            ==========================================
            LOAD USER PROFILE
            ==========================================
            */

            await loadOtherUser(
                otherUid
            );


            /*
            ==========================================
            CREATE / VERIFY CHAT
            ==========================================
            */

            await ensureChat();


            /*
            ==========================================
            LISTEN TO MESSAGES
            ==========================================
            */

            listenToMessages();


            /*
            ==========================================
            LIVE ONLINE / OFFLINE STATUS
            ==========================================
            */

            listenToOtherUser(
                otherUid
            );


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

        if (stopMessages) {
            stopMessages();
        }

        if (stopOtherUser) {
            stopOtherUser();
        }

    }
);


/* =====================================================
   START UI
===================================================== */

setupUI();
