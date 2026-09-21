/* =========================================================
   CONNECTA — GROUP CHAT
   File: frontend/js/group-chat.js

   ADMIN CONTROLS SUPPORTED:
   - groups/{groupId}.chatLocked
   - users/{uid}.groupMessagingRestricted
   - users/{uid}.status = suspended / banned
========================================================= */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    serverTimestamp,
    setDoc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONSTANTS
========================================================= */

const GROUPS_COLLECTION = "groups";
const GROUP_MESSAGES_COLLECTION = "groupMessages";

const MAX_MESSAGES = 100;

const GROUP_CACHE_PREFIX = "connectaGroupCache_v1_";
const GROUP_MESSAGES_CACHE_PREFIX = "connectaGroupMessagesCache_v1_";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let groupId = null;
let currentGroup = null;

let stopGroup = null;
let stopMessages = null;
let stopOwnProfile = null;

let isGroupListenerReady = false;
let isProfileListenerReady = false;

let accountControl = {
    loaded: false,
    blocked: false,
    messagingRestricted: false,
    groupParticipationRestricted: false,
    reason: ""
};

let groupControl = {
    loaded: false,
    chatLocked: false,
    approved: false
};

let messages = [];

let isSending = false;
let typingTimer = null;


/* =========================================================
   DOM
========================================================= */

const backBtn =
    document.getElementById("backBtn");

const groupAvatar =
    document.getElementById("groupAvatar");

const groupName =
    document.getElementById("groupName");

const groupStatus =
    document.getElementById("groupStatus");

const messagesContainer =
    document.getElementById("messagesContainer");

const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const emojiBtn =
    document.getElementById("emojiBtn");

const infoBtn =
    document.getElementById("infoBtn");

const accessBlock =
    document.getElementById("accessBlock");

const groupInfoSheet =
    document.getElementById("groupInfoSheet");

const toast =
    document.getElementById("toast");


/* =========================================================
   GROUP ID
========================================================= */

function getGroupId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("groupId") ||
        params.get("id") ||
        ""
    ).trim();
}


/* =========================================================
   CACHE
========================================================= */

function groupCacheKey(id) {
    return `${GROUP_CACHE_PREFIX}${id}`;
}

function messagesCacheKey(id) {
    return `${GROUP_MESSAGES_CACHE_PREFIX}${id}`;
}


function saveGroupCache(group) {

    if (!group?.groupId) {
        return;
    }

    try {
        localStorage.setItem(
            groupCacheKey(group.groupId),
            JSON.stringify(group)
        );
    } catch (error) {
        console.warn(
            "Could not save group cache:",
            error
        );
    }
}


function loadGroupCache(id) {

    try {

        const raw =
            localStorage.getItem(
                groupCacheKey(id)
            );

        return raw
            ? JSON.parse(raw)
            : null;

    } catch {
        return null;
    }
}


function saveMessagesCache(id, list) {

    try {

        localStorage.setItem(
            messagesCacheKey(id),
            JSON.stringify(list)
        );

    } catch (error) {

        console.warn(
            "Could not save message cache:",
            error
        );
    }
}


function loadMessagesCache(id) {

    try {

        const raw =
            localStorage.getItem(
                messagesCacheKey(id)
            );

        return raw
            ? JSON.parse(raw)
            : [];

    } catch {
        return [];
    }
}


/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getInitials(name) {

    const parts =
        String(name || "User")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

    if (!parts.length) {
        return "U";
    }

    if (parts.length === 1) {
        return parts[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();
}


function formatTime(value) {

    if (!value) {
        return "";
    }

    let date = null;

    if (value?.toDate) {
        date = value.toDate();
    } else if (value?.seconds) {
        date =
            new Date(
                value.seconds * 1000
            );
    } else if (value?._seconds) {
        date =
            new Date(
                value._seconds * 1000
            );
    } else {
        date = new Date(value);
    }

    if (
        !date ||
        Number.isNaN(date.getTime())
    ) {
        return "";
    }

    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function showToast(message) {

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(() => {
            toast.classList.remove(
                "show"
            );
        }, 2800);
}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(profile) {

    const status =
        String(
            profile?.status || "active"
        ).toLowerCase();

    const groupMessagingRestricted =
        profile?.groupMessagingRestricted === true;

    const groupParticipationRestricted =
        profile?.groupParticipationRestricted === true;

    if (
        status === "banned" ||
        status === "suspended"
    ) {

        return {
            loaded: true,
            blocked: true,
            messagingRestricted: true,
            groupParticipationRestricted: true,
            reason: status
        };
    }

    return {
        loaded: true,
        blocked: false,
        messagingRestricted:
            groupMessagingRestricted,
        groupParticipationRestricted,
        reason:
            groupMessagingRestricted
                ? "group_messaging_restricted"
                : groupParticipationRestricted
                    ? "group_participation_restricted"
                    : ""
    };
}


/* =========================================================
   GROUP CONTROL
========================================================= */

function getGroupControl(group) {

    const status =
        String(
            group?.status || ""
        ).toLowerCase();

    return {
        loaded: true,

        chatLocked:
            group?.chatLocked === true,

        approved:
            status === "approved"
    };
}


/* =========================================================
   CAN SEND
========================================================= */

function canSendMessages() {

    /*
     * Fail closed until the user's control
     * document has loaded.
     */
    if (!accountControl.loaded) {
        return false;
    }

    if (!groupControl.loaded) {
        return false;
    }

    if (accountControl.blocked) {
        return false;
    }

    if (
        accountControl.messagingRestricted
    ) {
        return false;
    }

    if (
        accountControl.groupParticipationRestricted
    ) {
        return false;
    }

    if (groupControl.chatLocked) {
        return false;
    }

    if (!groupControl.approved) {
        return false;
    }

    return true;
}


/* =========================================================
   SEND CONTROL UI
========================================================= */

function updateComposerState() {

    if (!messageInput || !sendBtn) {
        return;
    }

    const blocked =
        !canSendMessages();

    messageInput.disabled =
        blocked;

    sendBtn.disabled =
        blocked;

    if (blocked) {

        if (
            accountControl.blocked
        ) {

            messageInput.placeholder =
                "Your account cannot send messages";

        } else if (
            accountControl.messagingRestricted
        ) {

            messageInput.placeholder =
                "Group messaging has been restricted";

        } else if (
            accountControl.groupParticipationRestricted
        ) {

            messageInput.placeholder =
                "Group participation is restricted";

        } else if (
            groupControl.chatLocked
        ) {

            messageInput.placeholder =
                "Group chat is locked by an admin";

        } else if (
            !groupControl.approved
        ) {

            messageInput.placeholder =
                "This group is not available for messaging";

        } else {

            messageInput.placeholder =
                "Messaging unavailable";
        }

    } else {

        messageInput.placeholder =
            "Type a message...";
    }

    updateAccessNotice();
}


/* =========================================================
   ACCESS NOTICE
========================================================= */

function updateAccessNotice() {

    if (!accessBlock) {
        return;
    }

    let message = "";

    if (accountControl.blocked) {

        if (
            accountControl.reason === "banned"
        ) {
            message =
                "Your account has been banned.";
        } else {
            message =
                "Your account has been suspended.";
        }

    } else if (
        accountControl.messagingRestricted
    ) {

        message =
            "Your group messaging access has been restricted by an admin.";

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        message =
            "Your group participation has been restricted by an admin.";

    } else if (
        groupControl.chatLocked
    ) {

        message =
            "This group chat has been locked by an admin. You can still read existing messages.";

    } else if (
        !groupControl.approved
    ) {

        message =
            "This group is not currently available for messaging.";
    }

    if (message) {

        accessBlock.textContent =
            message;

        accessBlock.style.display =
            "block";

    } else {

        accessBlock.textContent =
            "";

        accessBlock.style.display =
            "none";
    }
}


/* =========================================================
   PROFILE LISTENER
========================================================= */

function listenToOwnProfile() {

    if (!currentUser) {
        return;
    }

    if (stopOwnProfile) {
        stopOwnProfile();
        stopOwnProfile = null;
    }

    const userRef =
        doc(
            db,
            "users",
            currentUser.uid
        );

    /*
     * Start in fail-closed state.
     */
    accountControl = {
        loaded: false,
        blocked: false,
        messagingRestricted: false,
        groupParticipationRestricted: false,
        reason: ""
    };

    updateComposerState();

    stopOwnProfile =
        onSnapshot(
            userRef,
            (snapshot) => {

                if (!snapshot.exists()) {

                    currentProfile = null;

                    accountControl = {
                        loaded: true,
                        blocked: true,
                        messagingRestricted: true,
                        groupParticipationRestricted: true,
                        reason: "profile_missing"
                    };

                    updateComposerState();

                    return;
                }

                currentProfile =
                    snapshot.data();

                accountControl =
                    getAccountControl(
                        currentProfile
                    );

                updateComposerState();

                /*
                 * If admin suspended/banned the user
                 * while inside the group, keep the page
                 * readable but prevent all interaction.
                 */
                if (
                    accountControl.blocked
                ) {

                    stopTyping();
                }
            },
            (error) => {

                console.error(
                    "Own profile listener error:",
                    error
                );

                /*
                 * Security-first:
                 * if we cannot verify the account
                 * controls, do not allow sending.
                 */
                accountControl = {
                    loaded: true,
                    blocked: true,
                    messagingRestricted: true,
                    groupParticipationRestricted: true,
                    reason: "control_check_failed"
                };

                updateComposerState();
            }
        );

    isProfileListenerReady = true;
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

    if (!groupId) {
        return;
    }

    const cached =
        loadGroupCache(groupId);

    if (cached) {

        currentGroup =
            cached;

        groupControl =
            getGroupControl(
                currentGroup
            );

        renderGroup();

        updateComposerState();
    }

    try {

        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            );

        const snapshot =
            await getDoc(groupRef);

        if (!snapshot.exists()) {

            showToast(
                "Group not found."
            );

            return;
        }

        currentGroup = {
            groupId:
                snapshot.id,
            ...snapshot.data()
        };

        saveGroupCache(
            currentGroup
        );

        groupControl =
            getGroupControl(
                currentGroup
            );

        renderGroup();

        updateComposerState();

        setupGroupListener();

    } catch (error) {

        console.error(
            "Failed to load group:",
            error
        );

        /*
         * If we already have cached data,
         * keep using it.
         */
        if (!currentGroup) {

            showToast(
                "Unable to load this group."
            );
        }
    }
}


/* =========================================================
   LIVE GROUP LISTENER
========================================================= */

function setupGroupListener() {

    if (!groupId) {
        return;
    }

    if (stopGroup) {
        stopGroup();
        stopGroup = null;
    }

    const groupRef =
        doc(
            db,
            GROUPS_COLLECTION,
            groupId
        );

    stopGroup =
        onSnapshot(
            groupRef,
            (snapshot) => {

                if (!snapshot.exists()) {

                    showToast(
                        "This group no longer exists."
                    );

                    groupControl = {
                        loaded: true,
                        chatLocked: true,
                        approved: false
                    };

                    updateComposerState();

                    return;
                }

                currentGroup = {
                    groupId:
                        snapshot.id,
                    ...snapshot.data()
                };

                saveGroupCache(
                    currentGroup
                );

                groupControl =
                    getGroupControl(
                        currentGroup
                    );

                renderGroup();

                updateComposerState();
            },
            (error) => {

                console.error(
                    "Group listener error:",
                    error
                );

                /*
                 * Fail closed when admin control
                 * state cannot be verified.
                 */
                groupControl = {
                    loaded: true,
                    chatLocked: true,
                    approved: false
                };

                updateComposerState();
            }
        );

    isGroupListenerReady = true;
}


/* =========================================================
   RENDER GROUP
========================================================= */

function renderGroup() {

    if (!currentGroup) {
        return;
    }

    const name =
        currentGroup.name ||
        "Group";

    const photo =
        currentGroup.photoURL ||
        "";

    if (groupName) {
        groupName.textContent =
            name;
    }

    if (groupStatus) {

        if (
            currentGroup.chatLocked
        ) {

            groupStatus.textContent =
                "Chat locked";

        } else {

            groupStatus.textContent =
                currentGroup.type === "private"
                    ? "Private group"
                    : "Public group";
        }
    }

    if (groupAvatar) {

        if (photo) {

            groupAvatar.src =
                photo;

            groupAvatar.style.display =
                "block";

        } else {

            groupAvatar.removeAttribute(
                "src"
            );

            groupAvatar.style.display =
                "flex";

            groupAvatar.textContent =
                getInitials(name);
        }
    }

    updateComposerState();
}


/* =========================================================
   LOAD CACHED MESSAGES
========================================================= */

function loadCachedMessages() {

    const cached =
        loadMessagesCache(
            groupId
        );

    if (
        Array.isArray(cached) &&
        cached.length
    ) {

        messages =
            cached;

        renderMessages();
    }
}


/* =========================================================
   MESSAGE LISTENER
========================================================= */

function setupMessageListener() {

    if (!groupId) {
        return;
    }

    if (stopMessages) {
        stopMessages();
        stopMessages = null;
    }

    const messagesRef =
        collection(
            db,
            GROUPS_COLLECTION,
            groupId,
            GROUP_MESSAGES_COLLECTION
        );

    const messagesQuery =
        query(
            messagesRef,
            orderBy(
                "createdAt",
                "desc"
            ),
            limit(MAX_MESSAGES)
        );

    stopMessages =
        onSnapshot(
            messagesQuery,
            (snapshot) => {

                messages =
                    snapshot.docs
                        .map((item) => ({
                            id: item.id,
                            ...item.data()
                        }))
                        .reverse();

                saveMessagesCache(
                    groupId,
                    messages
                );

                renderMessages();
            },
            (error) => {

                console.error(
                    "Message listener error:",
                    error
                );

                /*
                 * Cached messages remain visible.
                 */
                loadCachedMessages();
            }
        );
}


/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages() {

    if (!messagesContainer) {
        return;
    }

    if (!messages.length) {

        messagesContainer.innerHTML = `
            <div class="empty-messages">
                No messages yet.
            </div>
        `;

        return;
    }

    messagesContainer.innerHTML =
        messages
            .map(renderMessage)
            .join("");

    messagesContainer.scrollTop =
        messagesContainer.scrollHeight;
}


function renderMessage(message) {

    const isMine =
        message.senderId ===
        currentUser?.uid;

    const senderName =
        message.senderName ||
        message.senderUsername ||
        "User";

    const photo =
        message.senderPhotoURL ||
        "";

    const avatar =
        photo
            ? `
                <img
                    src="${escapeHTML(photo)}"
                    alt=""
                    class="message-avatar"
                >
            `
            : `
                <div class="message-avatar fallback">
                    ${escapeHTML(
                        getInitials(senderName)
                    )}
                </div>
            `;

    const verified =
        message.senderVerified === true
            ? `
                <span
                    class="verified-badge"
                    title="Verified"
                >
                    ✓
                </span>
            `
            : "";

    const text =
        message.text || "";

    return `
        <div
            class="message-row ${
                isMine ? "mine" : "other"
            }"
        >

            ${!isMine ? avatar : ""}

            <div class="message-content">

                ${
                    !isMine
                        ? `
                            <div class="message-sender">
                                ${escapeHTML(senderName)}
                                ${verified}
                            </div>
                        `
                        : ""
                }

                <div class="message-bubble">
                    ${escapeHTML(text)}
                </div>

                <div class="message-time">
                    ${escapeHTML(
                        formatTime(
                            message.createdAt
                        )
                    )}
                </div>

            </div>

            ${
                isMine
                    ? avatar
                    : ""
            }

        </div>
    `;
}


/* =========================================================
   SEND TEXT MESSAGE
========================================================= */

async function sendTextMessage() {

    /*
     * First local control check.
     */
    if (!canSendMessages()) {

        updateComposerState();

        showBlockedMessage();

        return;
    }

    if (isSending) {
        return;
    }

    const text =
        String(
            messageInput?.value || ""
        ).trim();

    if (!text) {
        return;
    }

    if (!currentUser || !groupId) {
        return;
    }

    /*
     * Re-read group + user profile immediately
     * before the financial/security-sensitive write.
     *
     * This prevents a stale listener state from
     * being used after an admin has locked the chat.
     */
    try {

        isSending = true;

        const [
            groupSnapshot,
            profileSnapshot
        ] = await Promise.all([
            getDoc(
                doc(
                    db,
                    GROUPS_COLLECTION,
                    groupId
                )
            ),
            getDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                )
            )
        ]);

        if (!groupSnapshot.exists()) {

            showToast(
                "This group no longer exists."
            );

            return;
        }

        const latestGroup = {
            groupId:
                groupSnapshot.id,
            ...groupSnapshot.data()
        };

        const latestProfile =
            profileSnapshot.exists()
                ? profileSnapshot.data()
                : null;

        const latestAccountControl =
            getAccountControl(
                latestProfile
            );

        const latestGroupControl =
            getGroupControl(
                latestGroup
            );

        /*
         * Update local state with the freshest
         * admin controls.
         */
        currentGroup =
            latestGroup;

        currentProfile =
            latestProfile;

        accountControl =
            latestAccountControl;

        groupControl =
            latestGroupControl;

        renderGroup();
        updateComposerState();

        if (
            !latestAccountControl.loaded ||
            latestAccountControl.blocked ||
            latestAccountControl.messagingRestricted ||
            latestAccountControl.groupParticipationRestricted ||
            latestGroupControl.chatLocked ||
            !latestGroupControl.approved
        ) {

            showBlockedMessage();

            return;
        }

        const messageRef =
            doc(
                collection(
                    db,
                    GROUPS_COLLECTION,
                    groupId,
                    GROUP_MESSAGES_COLLECTION
                )
            );

        const messageId =
            messageRef.id;

        const senderName =
            latestProfile?.displayName ||
            [
                latestProfile?.firstName,
                latestProfile?.lastName
            ]
                .filter(Boolean)
                .join(" ") ||
            currentUser.displayName ||
            "User";

        const senderUsername =
            latestProfile?.username ||
            "";

        const senderFirstName =
            latestProfile?.firstName ||
            "";

        const senderLastName =
            latestProfile?.lastName ||
            "";

        const senderPhotoURL =
            latestProfile?.photoURL ||
            currentUser.photoURL ||
            "";

        const senderVerified =
            latestProfile?.isVerified === true;

        await setDoc(
            messageRef,
            {
                messageId,
                groupId,

                senderId:
                    currentUser.uid,

                senderName,
                senderUsername,
                senderFirstName,
                senderLastName,

                senderPhotoURL,
                senderVerified,

                text,
                type: "text",

                createdAt:
                    serverTimestamp(),

                readBy: [
                    currentUser.uid
                ],

                deliveredTo: [
                    currentUser.uid
                ]
            }
        );

        /*
         * Update the group's latest-message preview.
         */
        await updateDoc(
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            ),
            {
                lastMessage:
                    text.substring(
                        0,
                        200
                    ),

                lastMessageSenderId:
                    currentUser.uid,

                lastMessageSenderName:
                    senderName,

                lastMessageAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()
            }
        );

        if (messageInput) {
            messageInput.value = "";
        }

        stopTyping();

    } catch (error) {

        console.error(
            "Send group message error:",
            error
        );

        showToast(
            error.message ||
            "Failed to send message."
        );

    } finally {

        isSending = false;

        updateComposerState();
    }
}


/* =========================================================
   BLOCKED MESSAGE
========================================================= */

function showBlockedMessage() {

    if (
        accountControl.blocked
    ) {

        showToast(
            "Your account cannot send messages."
        );

    } else if (
        accountControl.messagingRestricted
    ) {

        showToast(
            "Your group messaging access has been restricted."
        );

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        showToast(
            "Your group participation has been restricted."
        );

    } else if (
        groupControl.chatLocked
    ) {

        showToast(
            "This group chat is locked by an admin."
        );

    } else {

        showToast(
            "You cannot send messages here."
        );
    }
}


/* =========================================================
   TYPING
========================================================= */

async function setTyping() {

    if (!canSendMessages()) {
        return;
    }

    if (!currentUser || !groupId) {
        return;
    }

    try {

        const typingRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId,
                "typing",
                currentUser.uid
            );

        await setDoc(
            typingRef,
            {
                uid:
                    currentUser.uid,

                name:
                    currentProfile?.displayName ||
                    currentUser.displayName ||
                    "User",

                updatedAt:
                    serverTimestamp()
            }
        );

        clearTimeout(
            typingTimer
        );

        typingTimer =
            setTimeout(
                stopTyping,
                2500
            );

    } catch (error) {

        console.warn(
            "Typing update failed:",
            error
        );
    }
}


async function stopTyping() {

    clearTimeout(
        typingTimer
    );

    if (!currentUser || !groupId) {
        return;
    }

    try {

        /*
         * We intentionally use delete through
         * the Firestore reference if available.
         *
         * If your existing rules prevent deletion,
         * the typing document simply expires from
         * the UI logic.
         */
        const typingRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId,
                "typing",
                currentUser.uid
            );

        /*
         * Do not perform unnecessary writes when
         * the user was never allowed to type.
         */
        if (
            !accountControl.loaded ||
            accountControl.blocked
        ) {
            return;
        }

        /*
         * The existing implementation can leave
         * stale typing documents. The listener/UI
         * should use updatedAt expiry as protection.
         */
        await updateDoc(
            typingRef,
            {
                updatedAt:
                    serverTimestamp()
            }
        ).catch(() => {});

    } catch {
        // Typing state is non-critical.
    }
}


/* =========================================================
   INPUT EVENTS
========================================================= */

function setupComposer() {

    if (messageInput) {

        messageInput.addEventListener(
            "input",
            () => {

                if (!canSendMessages()) {
                    return;
                }

                setTyping();
            }
        );

        messageInput.addEventListener(
            "keydown",
            (event) => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendTextMessage();
                }
            }
        );
    }

    if (sendBtn) {

        sendBtn.addEventListener(
            "click",
            sendTextMessage
        );
    }
}


/* =========================================================
   EMOJI
========================================================= */

function setupEmoji() {

    if (!emojiBtn || !messageInput) {
        return;
    }

    emojiBtn.addEventListener(
        "click",
        () => {

            if (!canSendMessages()) {
                return;
            }

            const emoji =
                "😊";

            messageInput.value +=
                emoji;

            messageInput.focus();
        }
    );
}


/* =========================================================
   GROUP INFO
========================================================= */

function openGroupInfo() {

    if (!groupInfoSheet) {
        return;
    }

    groupInfoSheet.classList.add(
        "active"
    );
}


function closeGroupInfo() {

    if (!groupInfoSheet) {
        return;
    }

    groupInfoSheet.classList.remove(
        "active"
    );
}


function setupGroupInfo() {

    if (infoBtn) {

        infoBtn.addEventListener(
            "click",
            openGroupInfo
        );
    }

    const closeInfoBtn =
        document.getElementById(
            "closeGroupInfo"
        );

    if (closeInfoBtn) {

        closeInfoBtn.addEventListener(
            "click",
            closeGroupInfo
        );
    }
}


/* =========================================================
   BACK BUTTON
========================================================= */

function setupBackButton() {

    if (!backBtn) {
        return;
    }

    backBtn.addEventListener(
        "click",
        () => {

            if (
                window.history.length > 1
            ) {

                window.history.back();

            } else {

                window.location.href =
                    "groups.html";
            }
        }
    );
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

    if (stopGroup) {
        stopGroup();
        stopGroup = null;
    }

    if (stopMessages) {
        stopMessages();
        stopMessages = null;
    }

    if (stopOwnProfile) {
        stopOwnProfile();
        stopOwnProfile = null;
    }

    clearTimeout(
        typingTimer
    );
}


window.addEventListener(
    "beforeunload",
    cleanup
);


/* =========================================================
   AUTH
========================================================= */

function startAuth() {

    return new Promise((resolve) => {

        const unsubscribe =
            onAuthStateChanged(
                auth,
                (user) => {

                    if (!user) {

                        window.location.href =
                            "login.html";

                        return;
                    }

                    currentUser = user;

                    unsubscribe();

                    /*
                     * IMPORTANT:
                     * Load admin account controls
                     * before enabling the composer.
                     */
                    listenToOwnProfile();

                    resolve(user);
                }
            );
    });
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {

    groupId =
        getGroupId();

    if (!groupId) {

        window.location.href =
            "groups.html";

        return;
    }

    try {

        await startAuth();

        loadCachedMessages();

        await loadGroup();

        setupMessageListener();

        setupComposer();

        setupEmoji();

        setupGroupInfo();

        setupBackButton();

        updateComposerState();

    } catch (error) {

        console.error(
            "Group chat initialization error:",
            error
        );

        showToast(
            "Unable to open group chat."
        );
    }
}


init();
