/* =========================================================
   CONNECTA — GROUP CHAT
   frontend/js/group-chat.js

   Handles:
   - Group loading
   - Membership verification
   - Private-group verification checks
   - Approved-group checks
   - Realtime messages
   - Sending messages
   - Typing indicator
   - Group information
   - Message caching
   - Realtime group updates
   - Safe rendering
========================================================= */

import {
    auth,
    db
} from "./firebase.js";

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
    arrayUnion,
    increment
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIG
========================================================= */

const GROUPS_COLLECTION = "groups";

const GROUP_MESSAGES_COLLECTION = "groupMessages";

const PROFILE_CACHE_KEY =
    "connectaProfileCache";

const PUBLIC_PROFILE_CACHE_KEY =
    "connectaPublicProfileCache_v2";

const GROUP_CACHE_PREFIX =
    "connectaGroupCache_v1_";

const MESSAGE_CACHE_PREFIX =
    "connectaGroupMessages_v1_";

const MAX_MESSAGES = 100;


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentProfile = null;

let currentGroup = null;

let currentGroupId = null;

let currentMembership = false;

let messagesUnsubscribe = null;

let groupUnsubscribe = null;

let typingUnsubscribe = null;

let typingTimeout = null;

let isSending = false;

let lastRenderedMessageIds = [];


/* =========================================================
   DOM
========================================================= */

const groupChatPage =
    document.getElementById("groupChatPage");

const accessBlock =
    document.getElementById("accessBlock");

const accessTitle =
    document.getElementById("accessTitle");

const accessMessage =
    document.getElementById("accessMessage");

const backBtn =
    document.getElementById("backBtn");

const backToGroupsBtn =
    document.getElementById("backToGroupsBtn");

const groupHeaderAvatar =
    document.getElementById("groupHeaderAvatar");

const groupName =
    document.getElementById("groupName");

const groupStatus =
    document.getElementById("groupStatus");

const messagesArea =
    document.getElementById("messagesArea");

const messagesInner =
    document.getElementById("messagesInner");

const chatLoading =
    document.getElementById("chatLoading");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const emojiBtn =
    document.getElementById("emojiBtn");

const typingArea =
    document.getElementById("typingArea");

const groupInfoBtn =
    document.getElementById("groupInfoBtn");

const groupInfoOverlay =
    document.getElementById("groupInfoOverlay");

const closeInfoBtn =
    document.getElementById("closeInfoBtn");

const infoGroupAvatar =
    document.getElementById("infoGroupAvatar");

const infoGroupName =
    document.getElementById("infoGroupName");

const infoGroupMeta =
    document.getElementById("infoGroupMeta");

const infoGroupDescription =
    document.getElementById("infoGroupDescription");

const infoGroupType =
    document.getElementById("infoGroupType");

const infoGroupMembers =
    document.getElementById("infoGroupMembers");

const infoGroupSubscription =
    document.getElementById("infoGroupSubscription");

const infoGroupOwner =
    document.getElementById("infoGroupOwner");

const toast =
    document.getElementById("toast");


/* =========================================================
   HELPERS
========================================================= */

function showToast(message) {

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {

        toast.classList.remove("show");

    }, 2600);
}


function escapeHtml(value = "") {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getInitials(user = {}) {

    const first =
        String(user.firstName || "")
            .trim()
            .charAt(0);

    const last =
        String(user.lastName || "")
            .trim()
            .charAt(0);

    if (first || last) {

        return `${first}${last}`
            .toUpperCase()
            .slice(0, 2);
    }

    const name =
        String(
            user.displayName ||
            user.username ||
            "U"
        ).trim();

    return name
        .charAt(0)
        .toUpperCase();
}


function getFullName(user = {}) {

    const first =
        String(user.firstName || "")
            .trim();

    const last =
        String(user.lastName || "")
            .trim();

    const combined =
        `${first} ${last}`.trim();

    if (combined) {
        return combined;
    }

    const displayName =
        String(user.displayName || "")
            .trim();

    if (
        displayName &&
        displayName.toLowerCase() !==
            "connecta user"
    ) {
        return displayName;
    }

    const username =
        String(user.username || "")
            .trim();

    if (username) {
        return username;
    }

    return "CONNECTA User";
}


function verifiedBadge(user = {}) {

    if (user.isVerified !== true) {
        return "";
    }

    return `
        <span
            class="verified-badge"
            aria-label="Verified account"
            title="Verified account"
        >✓</span>
    `;
}


function formatMemberCount(count = 0) {

    const number =
        Number(count) || 0;

    if (number === 1) {
        return "1 member";
    }

    return `${number} members`;
}


function formatTime(timestamp) {

    if (!timestamp) {
        return "";
    }

    let date = null;

    if (
        typeof timestamp.toDate ===
        "function"
    ) {
        date = timestamp.toDate();
    } else if (
        timestamp instanceof Date
    ) {
        date = timestamp;
    } else if (
        typeof timestamp === "number"
    ) {
        date = new Date(timestamp);
    } else if (
        typeof timestamp === "string"
    ) {
        date = new Date(timestamp);
    }

    if (!date || Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            hour: "numeric",
            minute: "2-digit"
        }
    ).format(date);
}


function formatDate(timestamp) {

    if (!timestamp) {
        return "";
    }

    let date = null;

    if (
        typeof timestamp.toDate ===
        "function"
    ) {
        date = timestamp.toDate();
    } else if (
        timestamp instanceof Date
    ) {
        date = timestamp;
    } else if (
        typeof timestamp === "number"
    ) {
        date = new Date(timestamp);
    } else if (
        typeof timestamp === "string"
    ) {
        date = new Date(timestamp);
    }

    if (!date || Number.isNaN(date.getTime())) {
        return "";
    }

    const now = new Date();

    const sameDay =
        date.toDateString() ===
        now.toDateString();

    if (sameDay) {
        return "Today";
    }

    const yesterday =
        new Date(now);

    yesterday.setDate(
        yesterday.getDate() - 1
    );

    if (
        date.toDateString() ===
        yesterday.toDateString()
    ) {
        return "Yesterday";
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            day: "numeric",
            month: "short",
            year:
                date.getFullYear() !==
                now.getFullYear()
                    ? "numeric"
                    : undefined
        }
    ).format(date);
}


function getTimestampValue(timestamp) {

    if (!timestamp) {
        return 0;
    }

    if (
        typeof timestamp.toMillis ===
        "function"
    ) {
        return timestamp.toMillis();
    }

    if (
        typeof timestamp.toDate ===
        "function"
    ) {
        return timestamp.toDate().getTime();
    }

    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }

    if (typeof timestamp === "number") {
        return timestamp;
    }

    const parsed =
        new Date(timestamp).getTime();

    return Number.isNaN(parsed)
        ? 0
        : parsed;
}


/* =========================================================
   URL / GROUP ID
========================================================= */

function getGroupIdFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const fromQuery =
        params.get("groupId");

    if (fromQuery) {
        return fromQuery.trim();
    }

    const fromHash =
        window.location.hash
            .replace("#", "")
            .trim();

    if (fromHash) {
        return fromHash;
    }

    return "";
}


/* =========================================================
   CACHE
========================================================= */

function saveGroupCache(group) {

    if (!group || !group.groupId) {
        return;
    }

    try {

        localStorage.setItem(
            `${GROUP_CACHE_PREFIX}${group.groupId}`,
            JSON.stringify(group)
        );

    } catch (error) {

        console.warn(
            "Could not cache group:",
            error
        );
    }
}


function loadGroupCache(groupId) {

    if (!groupId) {
        return null;
    }

    try {

        const raw =
            localStorage.getItem(
                `${GROUP_CACHE_PREFIX}${groupId}`
            );

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);

    } catch (error) {

        return null;
    }
}


function saveMessageCache(
    groupId,
    messages
) {

    if (!groupId) {
        return;
    }

    try {

        localStorage.setItem(
            `${MESSAGE_CACHE_PREFIX}${groupId}`,
            JSON.stringify(messages.slice(-MAX_MESSAGES))
        );

    } catch (error) {

        console.warn(
            "Could not cache group messages:",
            error
        );
    }
}


function loadMessageCache(groupId) {

    if (!groupId) {
        return [];
    }

    try {

        const raw =
            localStorage.getItem(
                `${MESSAGE_CACHE_PREFIX}${groupId}`
            );

        if (!raw) {
            return [];
        }

        const parsed =
            JSON.parse(raw);

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (error) {

        return [];
    }
}


/* =========================================================
   PROFILE CACHE
========================================================= */

function getCachedCurrentProfile() {

    const keys = [
        PROFILE_CACHE_KEY,
        PUBLIC_PROFILE_CACHE_KEY
    ];

    for (const key of keys) {

        try {

            const raw =
                localStorage.getItem(key);

            if (!raw) {
                continue;
            }

            const parsed =
                JSON.parse(raw);

            if (parsed && typeof parsed === "object") {
                return parsed;
            }

        } catch (error) {
            // Continue to next cache.
        }
    }

    return null;
}


/* =========================================================
   ACCESS UI
========================================================= */

function showGroupPage() {

    if (groupChatPage) {
        groupChatPage.style.display = "flex";
    }

    if (accessBlock) {
        accessBlock.classList.remove("show");
    }
}


function showAccessBlock(
    title,
    message
) {

    if (groupChatPage) {
        groupChatPage.style.display = "none";
    }

    if (accessTitle) {
        accessTitle.textContent =
            title;
    }

    if (accessMessage) {
        accessMessage.textContent =
            message;
    }

    if (accessBlock) {
        accessBlock.classList.add("show");
    }
}


/* =========================================================
   GROUP ACCESS
========================================================= */

function userIsMember(group) {

    if (!group || !currentUser) {
        return false;
    }

    const uid =
        currentUser.uid;

    if (
        Array.isArray(group.members) &&
        group.members.includes(uid)
    ) {
        return true;
    }

    if (
        Array.isArray(group.memberIds) &&
        group.memberIds.includes(uid)
    ) {
        return true;
    }

    return false;
}


function userCanAccessGroup(group) {

    if (!group || !currentUser) {
        return false;
    }

    if (group.status !== "approved") {
        return false;
    }

    /*
       The creator is automatically a member
       when a group is created.
    */
    if (
        group.ownerId ===
        currentUser.uid
    ) {
        return true;
    }

    /*
       Membership is required before
       opening the group chat.
    */
    if (!userIsMember(group)) {
        return false;
    }

    /*
       Private groups require verification.
    */
    if (group.type === "private") {

        if (
            currentProfile?.isVerified !== true
        ) {
            return false;
        }
    }

    /*
       Paid groups must already have
       a successful membership/payment
       recorded.

       We do NOT trust the frontend to
       mark a paid user as paid.
    */
    if (
        group.subscriptionEnabled === true &&
        Number(group.subscriptionFee) > 0
    ) {

        /*
           The actual paid-membership
           verification will be moved
           to the secure backend.

           For now, require a membership
           flag if one exists.
        */

        if (
            group.paidMembers &&
            Array.isArray(group.paidMembers)
        ) {

            if (
                !group.paidMembers.includes(
                    currentUser.uid
                )
            ) {
                return false;
            }
        }
    }

    return true;
}


/* =========================================================
   GROUP AVATAR
========================================================= */

function renderGroupAvatar(
    element,
    group
) {

    if (!element || !group) {
        return;
    }

    const photo =
        String(group.photoURL || "")
            .trim();

    if (photo) {

        element.innerHTML = `
            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(group.name || "Group")}"
            >
        `;

        return;
    }

    const initials =
        String(group.name || "G")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(word =>
                word.charAt(0)
            )
            .join("")
            .toUpperCase();

    element.textContent =
        initials || "G";
}


/* =========================================================
   RENDER GROUP HEADER
========================================================= */

function renderGroupHeader(group) {

    if (!group) {
        return;
    }

    if (groupName) {

        groupName.textContent =
            group.name ||
            "CONNECTA Group";
    }

    renderGroupAvatar(
        groupHeaderAvatar,
        group
    );

    const type =
        group.type === "private"
            ? "Private"
            : "Public";

    const members =
        formatMemberCount(
            group.memberCount
        );

    if (groupStatus) {

        groupStatus.textContent =
            `${type} • ${members}`;
    }
}


/* =========================================================
   GROUP INFO
========================================================= */

function renderGroupInfo(group) {

    if (!group) {
        return;
    }

    renderGroupAvatar(
        infoGroupAvatar,
        group
    );

    if (infoGroupName) {

        infoGroupName.textContent =
            group.name ||
            "CONNECTA Group";
    }

    if (infoGroupMeta) {

        const type =
            group.type === "private"
                ? "Private group"
                : "Public group";

        infoGroupMeta.textContent =
            `${type} • ${formatMemberCount(
                group.memberCount
            )}`;
    }

    if (infoGroupDescription) {

        infoGroupDescription.textContent =
            group.description ||
            "No group description available.";
    }

    if (infoGroupType) {

        infoGroupType.textContent =
            group.type === "private"
                ? "Private"
                : "Public";
    }

    if (infoGroupMembers) {

        infoGroupMembers.textContent =
            String(
                Number(group.memberCount) || 0
            );
    }

    if (infoGroupSubscription) {

        if (
            group.subscriptionEnabled === true &&
            Number(group.subscriptionFee) > 0
        ) {

            infoGroupSubscription.textContent =
                `KSh ${Number(
                    group.subscriptionFee
                ).toLocaleString()}`;

        } else {

            infoGroupSubscription.textContent =
                "Free";
        }
    }

    if (infoGroupOwner) {

        infoGroupOwner.textContent =
            group.ownerName ||
            "CONNECTA";
    }
}


/* =========================================================
   GROUP INFO SHEET
========================================================= */

function openGroupInfo() {

    if (!currentGroup) {
        return;
    }

    renderGroupInfo(
        currentGroup
    );

    groupInfoOverlay?.classList.add(
        "open"
    );

    groupInfoOverlay?.setAttribute(
        "aria-hidden",
        "false"
    );
}


function closeGroupInfo() {

    groupInfoOverlay?.classList.remove(
        "open"
    );

    groupInfoOverlay?.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* =========================================================
   DATE SEPARATOR
========================================================= */

function getDateKey(timestamp) {

    if (!timestamp) {
        return "";
    }

    let date = null;

    if (
        typeof timestamp.toDate ===
        "function"
    ) {
        date = timestamp.toDate();
    } else if (
        timestamp instanceof Date
    ) {
        date = timestamp;
    } else {

        const parsed =
            new Date(timestamp);

        if (!Number.isNaN(parsed.getTime())) {
            date = parsed;
        }
    }

    if (!date) {
        return "";
    }

    return [
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    ].join("-");
}


/* =========================================================
   MESSAGE RENDERING
========================================================= */

function renderMessages(
    messages = [],
    scrollToBottom = false
) {

    if (!messagesInner) {
        return;
    }

    if (!messages.length) {

        messagesInner.innerHTML = `
            <div class="empty-chat">

                <div class="empty-chat-icon">
                    💬
                </div>

                <h3>
                    Start the conversation
                </h3>

                <p>
                    Be the first person to send
                    a message in this group.
                </p>

            </div>
        `;

        lastRenderedMessageIds = [];

        return;
    }

    const sorted =
        [...messages]
            .sort(
                (a, b) =>
                    getTimestampValue(
                        a.createdAt
                    ) -
                    getTimestampValue(
                        b.createdAt
                    )
            );

    let html = "";

    let previousDateKey = "";

    for (const message of sorted) {

        if (!message || !message.messageId) {
            continue;
        }

        const dateKey =
            getDateKey(
                message.createdAt
            );

        if (
            dateKey &&
            dateKey !== previousDateKey
        ) {

            html += `
                <div class="date-separator">
                    <span>
                        ${escapeHtml(
                            formatDate(
                                message.createdAt
                            )
                        )}
                    </span>
                </div>
            `;

            previousDateKey =
                dateKey;
        }

        const senderId =
            message.senderId ||
            message.userId ||
            "";

        const mine =
            senderId ===
            currentUser?.uid;

        const senderName =
            message.senderName ||
            message.displayName ||
            message.username ||
            "CONNECTA User";

        const senderUsername =
            message.senderUsername
                ? `@${message.senderUsername}`
                : "";

        const photoURL =
            String(
                message.senderPhotoURL ||
                message.photoURL ||
                ""
            ).trim();

        const initials =
            getInitials({
                firstName:
                    message.senderFirstName,
                lastName:
                    message.senderLastName,
                displayName:
                    senderName,
                username:
                    message.senderUsername
            });

        const verified =
            message.senderVerified === true;

        const messageText =
            message.text ??
            message.message ??
            "";

        let avatarHTML = "";

        if (photoURL) {

            avatarHTML = `
                <img
                    src="${escapeHtml(photoURL)}"
                    alt="${escapeHtml(senderName)}"
                >
            `;

        } else {

            avatarHTML =
                escapeHtml(initials);
        }

        const senderHTML =
            mine
                ? ""
                : `
                    <div class="message-sender">
                        ${escapeHtml(senderName)}
                        ${verified
                            ? `
                                <span
                                    class="verified-badge"
                                    aria-label="Verified"
                                >✓</span>
                              `
                            : ""}
                    </div>
                  `;

        const time =
            formatTime(
                message.createdAt
            );

        let statusHTML = "";

        if (mine) {

            let status = "";

            if (
                message.readBy &&
                Array.isArray(
                    message.readBy
                ) &&
                message.readBy.length > 1
            ) {

                status = "✓✓";

            } else if (
                message.deliveredTo &&
                Array.isArray(
                    message.deliveredTo
                ) &&
                message.deliveredTo.length > 1
            ) {

                status = "✓✓";

            } else {

                status = "✓";
            }

            statusHTML = `
                <span class="message-status">
                    ${status}
                </span>
            `;
        }

        html += `
            <div
                class="message-row ${
                    mine
                        ? "mine"
                        : "other"
                }"
                data-message-id="${escapeHtml(
                    message.messageId
                )}"
            >

                ${
                    mine
                        ? ""
                        : `
                            <div class="message-avatar">
                                ${avatarHTML}
                            </div>
                          `
                }

                <div class="message-content">

                    ${senderHTML}

                    <div class="message-bubble">

                        <p class="message-text">
                            ${escapeHtml(
                                messageText
                            )}
                        </p>

                        <div class="message-meta">

                            <span>
                                ${escapeHtml(time)}
                            </span>

                            ${statusHTML}

                        </div>

                    </div>

                </div>

            </div>
        `;
    }

    messagesInner.innerHTML =
        html ||
        `
            <div class="empty-chat">
                <div class="empty-chat-icon">
                    💬
                </div>

                <h3>
                    Start the conversation
                </h3>

                <p>
                    Be the first person to send
                    a message in this group.
                </p>
            </div>
        `;

    lastRenderedMessageIds =
        sorted.map(
            message =>
                message.messageId
        );

    if (scrollToBottom) {
        requestAnimationFrame(
            scrollMessagesToBottom
        );
    }
}


/* =========================================================
   SCROLL
========================================================= */

function scrollMessagesToBottom() {

    if (!messagesArea) {
        return;
    }

    messagesArea.scrollTop =
        messagesArea.scrollHeight;
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

    if (!currentGroupId) {
        showAccessBlock(
            "Group not found",
            "This group link is missing a valid group ID."
        );
        return false;
    }

    /*
       Cache-first rendering.
    */
    const cachedGroup =
        loadGroupCache(
            currentGroupId
        );

    if (cachedGroup) {

        currentGroup =
            cachedGroup;

        if (
            currentUser &&
            userCanAccessGroup(
                cachedGroup
            )
        ) {

            showGroupPage();

            renderGroupHeader(
                cachedGroup
            );
        }
    }

    try {

        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                currentGroupId
            );

        const snapshot =
            await getDoc(groupRef);

        if (!snapshot.exists()) {

            showAccessBlock(
                "Group not found",
                "This group may have been deleted or the link may be incorrect."
            );

            return false;
        }

        const group = {
            id: snapshot.id,
            ...snapshot.data()
        };

        currentGroup =
            group;

        saveGroupCache(group);

        if (!userCanAccessGroup(group)) {

            if (
                group.status !==
                "approved"
            ) {

                showAccessBlock(
                    "Group unavailable",
                    "This group has not been approved for access yet."
                );

            } else if (
                group.type ===
                    "private" &&
                currentProfile?.isVerified !== true
            ) {

                showAccessBlock(
                    "Verification required",
                    "Only verified CONNECTA accounts can join and access private groups."
                );

            } else if (
                !userIsMember(group)
            ) {

                showAccessBlock(
                    "Membership required",
                    "You need to join this group before you can open its chat."
                );

            } else {

                showAccessBlock(
                    "Payment required",
                    "A successful group subscription is required before accessing this chat."
                );
            }

            return false;
        }

        showGroupPage();

        renderGroupHeader(group);
        renderGroupInfo(group);

        return true;

    } catch (error) {

        console.error(
            "Failed to load group:",
            error
        );

        if (cachedGroup) {

            if (
                userCanAccessGroup(
                    cachedGroup
                )
            ) {

                showGroupPage();

                renderGroupHeader(
                    cachedGroup
                );

                return true;
            }
        }

        showAccessBlock(
            "Unable to load group",
            "Please check your connection and try again."
        );

        return false;
    }
}


/* =========================================================
   REALTIME GROUP LISTENER
========================================================= */

function listenToGroup() {

    if (!currentGroupId) {
        return;
    }

    if (groupUnsubscribe) {
        groupUnsubscribe();
        groupUnsubscribe = null;
    }

    const groupRef =
        doc(
            db,
            GROUPS_COLLECTION,
            currentGroupId
        );

    groupUnsubscribe =
        onSnapshot(
            groupRef,
            snapshot => {

                if (!snapshot.exists()) {

                    showAccessBlock(
                        "Group removed",
                        "This group is no longer available."
                    );

                    return;
                }

                const group = {
                    id: snapshot.id,
                    ...snapshot.data()
                };

                currentGroup =
                    group;

                saveGroupCache(group);

                if (
                    userCanAccessGroup(
                        group
                    )
                ) {

                    showGroupPage();

                    renderGroupHeader(
                        group
                    );

                    renderGroupInfo(
                        group
                    );

                } else {

                    /*
                       If access was revoked
                       while the user is inside
                       the chat, remove access.
                    */

                    if (
                        group.status !==
                        "approved"
                    ) {

                        showAccessBlock(
                            "Group unavailable",
                            "This group is no longer available."
                        );

                    } else if (
                        group.type ===
                            "private" &&
                        currentProfile?.isVerified !== true
                    ) {

                        showAccessBlock(
                            "Verification required",
                            "Your account must be verified to access this private group."
                        );

                    } else if (
                        !userIsMember(group)
                    ) {

                        showAccessBlock(
                            "Membership required",
                            "You are no longer a member of this group."
                        );

                    } else {

                        showAccessBlock(
                            "Payment required",
                            "Your group subscription must be confirmed before accessing this chat."
                        );
                    }

                    stopMessageListener();
                }

            },
            error => {

                console.error(
                    "Group listener error:",
                    error
                );
            }
        );
}


/* =========================================================
   MESSAGE CACHE LOAD
========================================================= */

function loadCachedMessages() {

    const cached =
        loadMessageCache(
            currentGroupId
        );

    if (!cached.length) {
        return;
    }

    renderMessages(
        cached,
        false
    );
}


/* =========================================================
   MESSAGE LISTENER
========================================================= */

function listenToMessages() {

    if (
        !currentGroupId ||
        !currentUser ||
        !currentGroup
    ) {
        return;
    }

    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }

    loadCachedMessages();

    const messagesRef =
        collection(
            db,
            GROUPS_COLLECTION,
            currentGroupId,
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

    messagesUnsubscribe =
        onSnapshot(
            messagesQuery,
            snapshot => {

                const messages =
                    snapshot.docs
                        .map(
                            messageDoc => ({
                                messageId:
                                    messageDoc.id,
                                ...messageDoc.data()
                            })
                        )
                        .reverse();

                saveMessageCache(
                    currentGroupId,
                    messages
                );

                if (chatLoading) {
                    chatLoading.style.display =
                        "none";
                }

                renderMessages(
                    messages,
                    true
                );

                markMessagesRead(
                    messages
                );

            },
            error => {

                console.error(
                    "Group messages listener error:",
                    error
                );

                if (chatLoading) {
                    chatLoading.style.display =
                        "none";
                }

                /*
                   If realtime query fails,
                   retain cached messages.
                */

                const cached =
                    loadMessageCache(
                        currentGroupId
                    );

                if (cached.length) {

                    renderMessages(
                        cached,
                        false
                    );
                } else {

                    showToast(
                        "Unable to load group messages."
                    );
                }
            }
        );
}


/* =========================================================
   STOP MESSAGE LISTENER
========================================================= */

function stopMessageListener() {

    if (messagesUnsubscribe) {

        messagesUnsubscribe();

        messagesUnsubscribe = null;
    }

    if (typingUnsubscribe) {

        typingUnsubscribe();

        typingUnsubscribe = null;
    }
}


/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage() {

    if (isSending) {
        return;
    }

    if (!currentUser) {
        showToast(
            "Please log in first."
        );
        return;
    }

    if (!currentGroup) {
        showToast(
            "Group is not ready."
        );
        return;
    }

    if (
        !userCanAccessGroup(
            currentGroup
        )
    ) {

        showToast(
            "You don't have access to this group."
        );

        return;
    }

    const text =
        String(
            messageInput?.value || ""
        ).trim();

    if (!text) {
        return;
    }

    if (text.length > 2000) {

        showToast(
            "Message is too long."
        );

        return;
    }

    isSending = true;

    if (sendBtn) {
        sendBtn.disabled = true;
    }

    try {

        /*
           Re-check the group immediately
           before sending.

           This protects against a group
           being suspended while the page
           remains open.
        */

        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                currentGroupId
            );

        const groupSnapshot =
            await getDoc(groupRef);

        if (!groupSnapshot.exists()) {

            throw new Error(
                "GROUP_NOT_FOUND"
            );
        }

        const latestGroup = {
            id: groupSnapshot.id,
            ...groupSnapshot.data()
        };

        currentGroup =
            latestGroup;

        if (
            !userCanAccessGroup(
                latestGroup
            )
        ) {

            throw new Error(
                "GROUP_ACCESS_DENIED"
            );
        }

        /*
           Create a message document.
        */

        const messageRef =
            doc(
                collection(
                    db,
                    GROUPS_COLLECTION,
                    currentGroupId,
                    GROUP_MESSAGES_COLLECTION
                )
            );

        const messageData = {

            messageId:
                messageRef.id,

            groupId:
                currentGroupId,

            senderId:
                currentUser.uid,

            senderName:
                getFullName(
                    currentProfile ||
                    {}
                ),

            senderUsername:
                currentProfile?.username ||
                "",

            senderFirstName:
                currentProfile?.firstName ||
                "",

            senderLastName:
                currentProfile?.lastName ||
                "",

            senderPhotoURL:
                currentProfile?.photoURL ||
                "",

            senderVerified:
                currentProfile?.isVerified === true,

            text,

            type:
                "text",

            createdAt:
                serverTimestamp(),

            readBy: [
                currentUser.uid
            ],

            deliveredTo: [
                currentUser.uid
            ]
        };

        await setDoc(
            messageRef,
            messageData
        );

        /*
           Update group preview.
        */

        await updateDoc(
            groupRef,
            {
                lastMessage:
                    text.slice(0, 200),

                lastMessageSenderId:
                    currentUser.uid,

                lastMessageSenderName:
                    getFullName(
                        currentProfile ||
                        {}
                    ),

                lastMessageAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()
            }
        );

        messageInput.value = "";

        autoResizeInput();

        updateSendButton();

        stopTyping();

        requestAnimationFrame(
            scrollMessagesToBottom
        );

    } catch (error) {

        console.error(
            "Failed to send group message:",
            error
        );

        if (
            error?.message ===
            "GROUP_ACCESS_DENIED"
        ) {

            showToast(
                "You no longer have access to this group."
            );

        } else if (
            error?.message ===
            "GROUP_NOT_FOUND"
        ) {

            showToast(
                "This group no longer exists."
            );

        } else {

            showToast(
                "Message could not be sent. Please try again."
            );
        }

    } finally {

        isSending = false;

        updateSendButton();
    }
}


/* =========================================================
   MARK MESSAGES READ
========================================================= */

async function markMessagesRead(
    messages = []
) {

    if (
        !currentUser ||
        !messages.length
    ) {
        return;
    }

    /*
       We intentionally avoid performing
       one Firestore write per message here.

       The scalable backend can later handle
       group read receipts in batches.
    */

    const latestMessages =
        messages.slice(-20);

    for (const message of latestMessages) {

        if (
            !message.messageId ||
            message.senderId ===
                currentUser.uid
        ) {
            continue;
        }

        const readBy =
            Array.isArray(
                message.readBy
            )
                ? message.readBy
                : [];

        if (
            readBy.includes(
                currentUser.uid
            )
        ) {
            continue;
        }

        try {

            const messageRef =
                doc(
                    db,
                    GROUPS_COLLECTION,
                    currentGroupId,
                    GROUP_MESSAGES_COLLECTION,
                    message.messageId
                );

            await updateDoc(
                messageRef,
                {
                    readBy:
                        arrayUnion(
                            currentUser.uid
                        )
                }
            );

        } catch (error) {

            /*
               Don't interrupt the chat
               if a read receipt fails.
            */

            console.warn(
                "Could not mark message read:",
                error
            );
        }
    }
}


/* =========================================================
   TYPING
========================================================= */

function getTypingRef() {

    if (
        !currentGroupId ||
        !currentUser
    ) {
        return null;
    }

    return doc(
        db,
        GROUPS_COLLECTION,
        currentGroupId,
        "typing",
        currentUser.uid
    );
}


async function startTyping() {

    const typingRef =
        getTypingRef();

    if (!typingRef) {
        return;
    }

    try {

        await setDoc(
            typingRef,
            {
                uid:
                    currentUser.uid,

                name:
                    getFullName(
                        currentProfile ||
                        {}
                    ),

                updatedAt:
                    serverTimestamp()
            }
        );

    } catch (error) {

        console.warn(
            "Typing update failed:",
            error
        );
    }

    clearTimeout(
        typingTimeout
    );

    typingTimeout =
        setTimeout(
            stopTyping,
            2500
        );
}


async function stopTyping() {

    clearTimeout(
        typingTimeout
    );

    const typingRef =
        getTypingRef();

    if (!typingRef) {
        return;
    }

    try {

        await setDoc(
            typingRef,
            {
                uid:
                    currentUser.uid,

                name:
                    getFullName(
                        currentProfile ||
                        {}
                    ),

                updatedAt:
                    serverTimestamp(),

                active: false
            }
        );

    } catch (error) {

        console.warn(
            "Typing stop failed:",
            error
        );
    }
}


/* =========================================================
   TYPING LISTENER
========================================================= */

function listenToTyping() {

    if (
        !currentGroupId ||
        !currentUser
    ) {
        return;
    }

    if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
    }

    /*
       The typing collection is intentionally
       listened to directly.

       The backend/rules will later restrict
       this to group members.
    */

    const typingRef =
        collection(
            db,
            GROUPS_COLLECTION,
            currentGroupId,
            "typing"
        );

    typingUnsubscribe =
        onSnapshot(
            typingRef,
            snapshot => {

                const names = [];

                const now =
                    Date.now();

                snapshot.forEach(
                    typingDoc => {

                        const data =
                            typingDoc.data();

                        if (
                            typingDoc.id ===
                            currentUser.uid
                        ) {
                            return;
                        }

                        if (
                            data.active === false
                        ) {
                            return;
                        }

                        const updated =
                            getTimestampValue(
                                data.updatedAt
                            );

                        /*
                           Ignore stale typing
                           records.
                        */

                        if (
                            updated &&
                            now - updated >
                                5000
                        ) {
                            return;
                        }

                        if (data.name) {
                            names.push(
                                data.name
                            );
                        }
                    }
                );

                renderTyping(
                    names
                );
            },
            error => {

                console.warn(
                    "Typing listener error:",
                    error
                );
            }
        );
}


/* =========================================================
   TYPING UI
========================================================= */

function renderTyping(names = []) {

    if (!typingArea) {
        return;
    }

    if (!names.length) {

        typingArea.textContent = "";

        return;
    }

    if (names.length === 1) {

        typingArea.textContent =
            `${names[0]} is typing...`;

        return;
    }

    if (names.length === 2) {

        typingArea.textContent =
            `${names[0]} and ${names[1]} are typing...`;

        return;
    }

    typingArea.textContent =
        `${names.length} people are typing...`;
}


/* =========================================================
   INPUT
========================================================= */

function autoResizeInput() {

    if (!messageInput) {
        return;
    }

    messageInput.style.height =
        "auto";

    const maxHeight = 110;

    messageInput.style.height =
        `${Math.min(
            messageInput.scrollHeight,
            maxHeight
        )}px`;
}


function updateSendButton() {

    if (!sendBtn) {
        return;
    }

    const text =
        String(
            messageInput?.value || ""
        ).trim();

    sendBtn.disabled =
        !text ||
        isSending ||
        !currentUser;
}


/* =========================================================
   EMOJI
========================================================= */

function addEmoji() {

    if (!messageInput) {
        return;
    }

    const emoji =
        "😊";

    const start =
        messageInput.selectionStart ??
        messageInput.value.length;

    const end =
        messageInput.selectionEnd ??
        messageInput.value.length;

    const current =
        messageInput.value;

    messageInput.value =
        current.slice(0, start) +
        emoji +
        current.slice(end);

    messageInput.focus();

    const position =
        start + emoji.length;

    messageInput.setSelectionRange(
        position,
        position
    );

    autoResizeInput();

    updateSendButton();
}


/* =========================================================
   NAVIGATION
========================================================= */

function goBackToGroups() {

    window.location.href =
        "groups.html";
}


function goToLogin() {

    window.location.href =
        "login.html";
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

backBtn?.addEventListener(
    "click",
    goBackToGroups
);

backToGroupsBtn?.addEventListener(
    "click",
    goBackToGroups
);

groupInfoBtn?.addEventListener(
    "click",
    openGroupInfo
);

closeInfoBtn?.addEventListener(
    "click",
    closeGroupInfo
);

groupInfoOverlay?.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            groupInfoOverlay
        ) {
            closeGroupInfo();
        }
    }
);

emojiBtn?.addEventListener(
    "click",
    addEmoji
);


messageInput?.addEventListener(
    "input",
    () => {

        autoResizeInput();

        updateSendButton();

        if (
            messageInput.value.trim()
        ) {
            startTyping();
        } else {
            stopTyping();
        }
    }
);


messageInput?.addEventListener(
    "keydown",
    event => {

        /*
           Enter sends.
           Shift + Enter creates
           a new line.
        */

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            if (
                messageInput.value.trim()
            ) {
                sendMessage();
            }
        }
    }
);


messageForm?.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        sendMessage();
    }
);


/* =========================================================
   ESCAPE CLOSES INFO SHEET
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {
            closeGroupInfo();
        }
    }
);


/* =========================================================
   AUTH STARTUP
========================================================= */

async function startGroupChat(user) {

    currentUser =
        user;

    if (!currentUser) {
        goToLogin();
        return;
    }

    currentGroupId =
        getGroupIdFromUrl();

    if (!currentGroupId) {

        showAccessBlock(
            "Group not found",
            "No group was selected."
        );

        return;
    }

    /*
       Use cached profile immediately
       when available.
    */

    currentProfile =
        getCachedCurrentProfile();

    /*
       Load the user's actual profile
       before checking private-group
       access.
    */

    try {

        const profileRef =
            doc(
                db,
                "users",
                currentUser.uid
            );

        const profileSnapshot =
            await getDoc(profileRef);

        if (profileSnapshot.exists()) {

            currentProfile =
                profileSnapshot.data();

            /*
               Keep the cache compatible
               with the existing CONNECTA
               profile system.
            */

            try {

                localStorage.setItem(
                    PROFILE_CACHE_KEY,
                    JSON.stringify(
                        currentProfile
                    )
                );

            } catch (error) {
                // Ignore cache errors.
            }
        }

    } catch (error) {

        console.warn(
            "Could not load current profile:",
            error
        );
    }

    const allowed =
        await loadGroup();

    if (!allowed) {
        return;
    }

    /*
       Start realtime group listener
       after the initial access check.
    */

    listenToGroup();

    /*
       Start message realtime listener.
    */

    listenToMessages();

    /*
       Start typing listener.
    */

    listenToTyping();

    /*
       Give the browser a moment to
       calculate the message area before
       scrolling.
    */

    setTimeout(
        scrollMessagesToBottom,
        150
    );
}


/* =========================================================
   AUTH STATE
========================================================= */

const unsubscribeAuth =
    onAuthStateChanged(
        auth,
        user => {

            if (!user) {

                cleanup();

                goToLogin();

                return;
            }

            startGroupChat(
                user
            );
        }
    );


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

    if (groupUnsubscribe) {

        groupUnsubscribe();

        groupUnsubscribe = null;
    }

    if (messagesUnsubscribe) {

        messagesUnsubscribe();

        messagesUnsubscribe = null;
    }

    if (typingUnsubscribe) {

        typingUnsubscribe();

        typingUnsubscribe = null;
    }

    clearTimeout(
        typingTimeout
    );

    currentUser = null;
    currentProfile = null;
    currentGroup = null;
    currentGroupId = null;
    currentMembership = false;
}


/* =========================================================
   PAGE EXIT
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        cleanup();
    }
);
