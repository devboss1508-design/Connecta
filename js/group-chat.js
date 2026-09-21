/* =========================================================
   CONNECTA — GROUP CHAT
   File: frontend/js/group-chat.js

   FEATURES
   - Text messages
   - Photo messages
   - JPG / JPEG / PNG / WebP only
   - No videos
   - Admin group chat lock
   - Admin group messaging restriction
   - Admin group participation restriction
   - Suspended / banned account protection
   - Group membership protection
   - Live group controls
   - Live user controls
   - Cached group/messages fallback
========================================================= */

import {
    auth,
    db,
    storage
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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


/* =========================================================
   CONSTANTS
========================================================= */

const GROUPS_COLLECTION = "groups";
const GROUP_MESSAGES_COLLECTION = "groupMessages";

const MAX_MESSAGES = 100;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const GROUP_CACHE_PREFIX =
    "connectaGroupCache_v2_";

const GROUP_MESSAGES_CACHE_PREFIX =
    "connectaGroupMessagesCache_v2_";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let groupId = "";
let currentGroup = null;

let stopGroup = null;
let stopMessages = null;
let stopOwnProfile = null;

let messages = [];

let isSending = false;
let isUploadingPhoto = false;

let typingTimer = null;

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
    approved: false,
    member: false,
    allowed: false
};


/* =========================================================
   DOM
========================================================= */

const backBtn =
    document.getElementById("backBtn");

const groupAvatar =
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

const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const emojiBtn =
    document.getElementById("emojiBtn");

const infoBtn =
    document.getElementById("groupInfoBtn");

const accessBlock =
    document.getElementById("accessBlock");

const accessTitle =
    document.getElementById("accessTitle");

const accessMessage =
    document.getElementById("accessMessage");

const backToGroupsBtn =
    document.getElementById("backToGroupsBtn");

const groupInfoOverlay =
    document.getElementById("groupInfoOverlay");

const closeInfoBtn =
    document.getElementById("closeInfoBtn");

const toast =
    document.getElementById("toast");

const typingArea =
    document.getElementById("typingArea");


/* =========================================================
   PHOTO BUTTON
========================================================= */

let photoBtn = null;
let photoInput = null;

function setupPhotoUpload() {

    if (!messageInput) {
        return;
    }

    /*
     * Create the photo button without requiring
     * another HTML change.
     */
    photoBtn =
        document.createElement("button");

    photoBtn.type = "button";
    photoBtn.className = "composer-action";
    photoBtn.id = "photoBtn";
    photoBtn.setAttribute(
        "aria-label",
        "Send photo"
    );
    photoBtn.title = "Send photo";
    photoBtn.textContent = "📷";

    /*
     * Put the photo button before the emoji button.
     */
    const composer =
        document.getElementById(
            "messageForm"
        );

    if (composer) {

        if (emojiBtn) {
            composer.insertBefore(
                photoBtn,
                emojiBtn
            );
        } else {
            composer.prepend(
                photoBtn
            );
        }
    }

    /*
     * Hidden image picker.
     */
    photoInput =
        document.createElement("input");

    photoInput.type = "file";

    photoInput.accept =
        "image/jpeg,image/png,image/webp";

    photoInput.multiple = false;

    photoInput.style.display =
        "none";

    photoInput.id =
        "groupPhotoInput";

    document.body.appendChild(
        photoInput
    );

    photoBtn.addEventListener(
        "click",
        () => {

            if (!canSendMessages()) {

                showBlockedMessage();

                return;
            }

            if (isUploadingPhoto) {
                return;
            }

            photoInput.click();
        }
    );

    photoInput.addEventListener(
        "change",
        async () => {

            const file =
                photoInput.files?.[0];

            /*
             * Reset immediately so the same
             * file can be selected again.
             */
            photoInput.value = "";

            if (!file) {
                return;
            }

            await sendPhotoMessage(file);
        }
    );
}


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
            groupCacheKey(
                group.groupId
            ),
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


function saveMessagesCache(
    id,
    list
) {

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

        date =
            new Date(value);
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
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function formatDate(value) {

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

        date =
            new Date(value);
    }

    if (
        !date ||
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    return date.toLocaleDateString(
        [],
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}


function showToast(message) {

    if (!toast) {

        console.log(message);

        return;
    }

    toast.textContent =
        String(message || "");

    toast.classList.add("show");

    clearTimeout(
        showToast.timer
    );

    showToast.timer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2800
        );
}


/* =========================================================
   LOADING STATE
========================================================= */

function showLoading() {

    if (chatLoading) {

        chatLoading.style.display =
            "flex";
    }
}


function hideLoading() {

    if (chatLoading) {

        chatLoading.style.display =
            "none";
    }
}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(profile) {

    const status =
        String(
            profile?.status ||
            "active"
        ).toLowerCase();

    const messagingRestricted =
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

            groupParticipationRestricted:
                true,

            reason: status
        };
    }

    return {

        loaded: true,

        blocked: false,

        messagingRestricted,

        groupParticipationRestricted,

        reason:
            messagingRestricted
                ? "group_messaging_restricted"
                : groupParticipationRestricted
                    ? "group_participation_restricted"
                    : ""
    };
}


/* =========================================================
   GROUP MEMBERSHIP
========================================================= */

function isUserGroupMember(group) {

    if (!currentUser || !group) {
        return false;
    }

    const uid =
        currentUser.uid;

    if (
        group.ownerId === uid
    ) {
        return true;
    }

    const members =
        Array.isArray(group.members)
            ? group.members
            : [];

    const memberIds =
        Array.isArray(group.memberIds)
            ? group.memberIds
            : [];

    return (
        members.includes(uid) ||
        memberIds.includes(uid)
    );
}


/* =========================================================
   GROUP CONTROL
========================================================= */

function getGroupControl(group) {

    const status =
        String(
            group?.status || ""
        ).toLowerCase();

    const member =
        isUserGroupMember(
            group
        );

    /*
     * Public groups can be viewed.
     * Participation still depends on membership.
     *
     * Owner is automatically considered a member.
     */
    return {

        loaded: true,

        chatLocked:
            group?.chatLocked === true,

        approved:
            status === "approved",

        member,

        allowed:
            status === "approved" &&
            member
    };
}


/* =========================================================
   CAN VIEW
========================================================= */

function canViewGroup() {

    if (!groupControl.loaded) {
        return false;
    }

    if (
        accountControl.blocked
    ) {
        return false;
    }

    if (
        !groupControl.approved
    ) {
        return false;
    }

    return groupControl.member;
}


/* =========================================================
   CAN SEND
========================================================= */

function canSendMessages() {

    /*
     * Fail closed until both control documents
     * have been loaded.
     */
    if (!accountControl.loaded) {
        return false;
    }

    if (!groupControl.loaded) {
        return false;
    }

    if (
        accountControl.blocked
    ) {
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

    if (
        groupControl.chatLocked
    ) {
        return false;
    }

    if (
        !groupControl.approved
    ) {
        return false;
    }

    if (
        !groupControl.member
    ) {
        return false;
    }

    return true;
}


/* =========================================================
   COMPOSER STATE
========================================================= */

function updateComposerState() {

    const blocked =
        !canSendMessages();

    if (messageInput) {

        messageInput.disabled =
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
                    "Group messaging is restricted";

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
                !groupControl.member
            ) {

                messageInput.placeholder =
                    "Join this group to participate";

            } else if (
                !groupControl.approved
            ) {

                messageInput.placeholder =
                    "This group is not available";

            } else {

                messageInput.placeholder =
                    "Messaging unavailable";
            }

        } else {

            messageInput.placeholder =
                "Type a message...";
        }
    }

    if (sendBtn) {

        sendBtn.disabled =
            blocked;
    }

    if (photoBtn) {

        photoBtn.disabled =
            blocked;
    }

    updateAccessNotice();
}


/* =========================================================
   ACCESS BLOCK / NOTICE
========================================================= */

function updateAccessNotice() {

    if (!accessBlock) {
        return;
    }

    /*
     * We use the existing HTML card rather
     * than replacing it with text.
     */

    let title =
        "Group access required";

    let message =
        "You don't currently have access to this group.";

    let shouldShow =
        false;

    if (
        accountControl.blocked
    ) {

        shouldShow = true;

        if (
            accountControl.reason ===
            "banned"
        ) {

            title =
                "Account banned";

            message =
                "Your account has been banned and cannot participate in groups.";

        } else {

            title =
                "Account suspended";

            message =
                "Your account has been suspended and cannot participate in groups.";
        }

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        shouldShow = true;

        title =
            "Group participation restricted";

        message =
            "An admin has restricted your ability to participate in groups.";

    } else if (
        !groupControl.approved
    ) {

        shouldShow = true;

        title =
            "Group unavailable";

        message =
            "This group is not currently approved for participation.";

    } else if (
        !groupControl.member
    ) {

        shouldShow = true;

        title =
            "Membership required";

        message =
            "You need to join this group before you can participate.";

    }

    if (
        shouldShow &&
        accessTitle &&
        accessMessage
    ) {

        accessTitle.textContent =
            title;

        accessMessage.textContent =
            message;

        accessBlock.classList.add(
            "show"
        );

    } else {

        accessBlock.classList.remove(
            "show"
        );
    }

    /*
     * A locked chat does NOT remove access.
     * Users should still be able to read messages.
     */
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

        stopOwnProfile =
            null;
    }

    accountControl = {

        loaded: false,

        blocked: false,

        messagingRestricted: false,

        groupParticipationRestricted:
            false,

        reason: ""
    };

    updateComposerState();

    const userRef =
        doc(
            db,
            "users",
            currentUser.uid
        );

    stopOwnProfile =
        onSnapshot(
            userRef,

            (snapshot) => {

                if (
                    !snapshot.exists()
                ) {

                    currentProfile =
                        null;

                    accountControl = {

                        loaded: true,

                        blocked: true,

                        messagingRestricted:
                            true,

                        groupParticipationRestricted:
                            true,

                        reason:
                            "profile_missing"
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

                /*
                 * Group membership can depend on
                 * current user data in some setups.
                 */
                if (currentGroup) {

                    groupControl =
                        getGroupControl(
                            currentGroup
                        );
                }

                updateComposerState();

                if (
                    accountControl.blocked
                ) {

                    stopTyping();
                }
            },

            (error) => {

                console.error(
                    "Profile listener error:",
                    error
                );

                /*
                 * Fail closed.
                 */
                accountControl = {

                    loaded: true,

                    blocked: true,

                    messagingRestricted:
                        true,

                    groupParticipationRestricted:
                        true,

                    reason:
                        "control_check_failed"
                };

                updateComposerState();
            }
        );
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

    if (!groupId) {
        return false;
    }

    showLoading();

    /*
     * Display cached group immediately.
     */
    const cached =
        loadGroupCache(
            groupId
        );

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

        console.log(
            "[CONNECTA] Loading group:",
            groupId
        );

        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            );

        const snapshot =
            await getDoc(
                groupRef
            );

        if (
            !snapshot.exists()
        ) {

            hideLoading();

            showAccessError(
                "Group not found",
                "This group could not be found."
            );

            return false;
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

        /*
         * Start realtime group control listener.
         */
        setupGroupListener();

        /*
         * Hide the actual HTML loading element.
         */
        hideLoading();

        return true;

    } catch (error) {

        console.error(
            "[CONNECTA] Failed to load group:",
            error
        );

        /*
         * If cached data exists, continue.
         */
        if (currentGroup) {

            hideLoading();

            setupGroupListener();

            return true;
        }

        hideLoading();

        showAccessError(
            "Unable to load group",
            error?.message ||
            "Please check your connection and try again."
        );

        return false;
    }
}


/* =========================================================
   GROUP ERROR
========================================================= */

function showAccessError(
    title,
    message
) {

    if (chatLoading) {

        chatLoading.style.display =
            "none";
    }

    if (messagesInner) {

        messagesInner.innerHTML = `
            <div class="empty-chat">

                <div class="empty-chat-icon">
                    ⚠️
                </div>

                <h3>
                    ${escapeHTML(title)}
                </h3>

                <p>
                    ${escapeHTML(message)}
                </p>

            </div>
        `;
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

        stopGroup =
            null;
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

                if (
                    !snapshot.exists()
                ) {

                    currentGroup =
                        null;

                    groupControl = {

                        loaded: true,

                        chatLocked: true,

                        approved: false,

                        member: false,

                        allowed: false
                    };

                    updateComposerState();

                    showAccessError(
                        "Group no longer exists",
                        "This group has been removed."
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
            },

            (error) => {

                console.error(
                    "Group listener error:",
                    error
                );

                /*
                 * Fail closed on control failure.
                 */
                groupControl = {

                    loaded: true,

                    chatLocked: true,

                    approved: false,

                    member: false,

                    allowed: false
                };

                updateComposerState();
            }
        );
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
                currentGroup.type ===
                "private"

                    ? "Private group"

                    : "Public group";
        }
    }

    if (groupAvatar) {

        if (photo) {

            groupAvatar.innerHTML = `
                <img
                    src="${escapeHTML(photo)}"
                    alt=""
                >
            `;

        } else {

            groupAvatar.innerHTML =
                escapeHTML(
                    getInitials(name)
                );
        }
    }

    /*
     * Fill the information sheet.
     */
    renderGroupInfo();

    updateComposerState();
}


/* =========================================================
   GROUP INFO
========================================================= */

function renderGroupInfo() {

    if (!currentGroup) {
        return;
    }

    const infoAvatar =
        document.getElementById(
            "infoGroupAvatar"
        );

    const infoName =
        document.getElementById(
            "infoGroupName"
        );

    const infoMeta =
        document.getElementById(
            "infoGroupMeta"
        );

    const infoDescription =
        document.getElementById(
            "infoGroupDescription"
        );

    const infoType =
        document.getElementById(
            "infoGroupType"
        );

    const infoMembers =
        document.getElementById(
            "infoGroupMembers"
        );

    const infoSubscription =
        document.getElementById(
            "infoGroupSubscription"
        );

    const infoOwner =
        document.getElementById(
            "infoGroupOwner"
        );

    const name =
        currentGroup.name ||
        "Group";

    const photo =
        currentGroup.photoURL ||
        "";

    if (infoAvatar) {

        if (photo) {

            infoAvatar.innerHTML = `
                <img
                    src="${escapeHTML(photo)}"
                    alt=""
                >
            `;

        } else {

            infoAvatar.innerHTML =
                escapeHTML(
                    getInitials(name)
                );
        }
    }

    if (infoName) {

        infoName.textContent =
            name;
    }

    if (infoMeta) {

        infoMeta.textContent =
            currentGroup.type ===
            "private"

                ? "Private group"

                : "Public group";
    }

    if (infoDescription) {

        infoDescription.textContent =
            currentGroup.description ||
            "No group description available.";
    }

    if (infoType) {

        infoType.textContent =
            currentGroup.type ===
            "private"

                ? "Private"

                : "Public";
    }

    if (infoMembers) {

        const count =
            Number(
                currentGroup.memberCount ||
                0
            );

        infoMembers.textContent =
            String(count);
    }

    if (infoSubscription) {

        const enabled =
            currentGroup.subscriptionEnabled === true;

        if (enabled) {

            const fee =
                Number(
                    currentGroup.subscriptionFee ||
                    0
                );

            infoSubscription.textContent =
                `Paid — KSh ${fee}`;

        } else {

            infoSubscription.textContent =
                "Free";
        }
    }

    if (infoOwner) {

        infoOwner.textContent =
            currentGroup.ownerName ||
            currentGroup.ownerDisplayName ||
            "CONNECTA";
    }
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

        stopMessages =
            null;
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
            limit(
                MAX_MESSAGES
            )
        );

    stopMessages =
        onSnapshot(
            messagesQuery,

            (snapshot) => {

                messages =
                    snapshot.docs
                        .map(
                            item => ({
                                id:
                                    item.id,

                                ...item.data()
                            })
                        )
                        .reverse();

                saveMessagesCache(
                    groupId,
                    messages
                );

                renderMessages();

                hideLoading();
            },

            (error) => {

                console.error(
                    "[CONNECTA] Message listener error:",
                    error
                );

                /*
                 * Keep cached messages visible.
                 */
                loadCachedMessages();

                hideLoading();

                if (!messages.length) {

                    showAccessError(
                        "Messages unavailable",
                        "The group loaded, but its messages could not be retrieved."
                    );
                }
            }
        );
}


/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages() {

    if (!messagesInner) {
        return;
    }

    /*
     * Always remove the loading indicator
     * when rendering actual content.
     */
    hideLoading();

    if (!messages.length) {

        messagesInner.innerHTML = `
            <div class="empty-chat">

                <div class="empty-chat-icon">
                    💬
                </div>

                <h3>
                    No messages yet
                </h3>

                <p>
                    Start the conversation by
                    sending a message.
                </p>

            </div>
        `;

        return;
    }

    messagesInner.innerHTML =
        messages
            .map(
                renderMessage
            )
            .join("");

    requestAnimationFrame(
        () => {

            if (messagesArea) {

                messagesArea.scrollTop =
                    messagesArea.scrollHeight;
            }
        }
    );
}


/* =========================================================
   RENDER MESSAGE
========================================================= */

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
                <div class="message-avatar">

                    <img
                        src="${escapeHTML(photo)}"
                        alt=""
                    >

                </div>
            `

            : `
                <div class="message-avatar">

                    ${escapeHTML(
                        getInitials(
                            senderName
                        )
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

    const messageType =
        String(
            message.type ||
            "text"
        ).toLowerCase();

    let body = "";

    /*
     * PHOTO MESSAGE
     */
    if (
        messageType === "image" ||
        messageType === "photo"
    ) {

        const imageURL =
            message.imageURL ||
            message.photoURL ||
            "";

        if (imageURL) {

            body = `
                <div class="message-photo-wrap">

                    <img
                        src="${escapeHTML(imageURL)}"
                        alt="Group photo"
                        class="message-photo"
                        loading="lazy"
                        style="
                            display:block;
                            width:min(280px,100%);
                            max-height:360px;
                            object-fit:cover;
                            border-radius:14px;
                            cursor:pointer;
                        "
                        onclick="window.open(
                            '${escapeHTML(imageURL)}',
                            '_blank',
                            'noopener,noreferrer'
                        )"
                    >

                </div>
            `;

        } else {

            body = `
                <p class="message-text">
                    Photo unavailable
                </p>
            `;
        }

    } else {

        body = `
            <p class="message-text">
                ${escapeHTML(
                    message.text ||
                    ""
                )}
            </p>
        `;
    }

    return `
        <div
            class="message-row ${
                isMine
                    ? "mine"
                    : "other"
            }"
        >

            ${
                !isMine
                    ? avatar
                    : ""
            }

            <div class="message-content">

                ${
                    !isMine
                        ? `
                            <div class="message-sender">

                                ${escapeHTML(
                                    senderName
                                )}

                                ${verified}

                            </div>
                        `
                        : ""
                }

                <div class="message-bubble">

                    ${body}

                    <div class="message-meta">

                        ${escapeHTML(
                            formatTime(
                                message.createdAt
                            )
                        )}

                    </div>

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

    if (
        !canSendMessages()
    ) {

        updateComposerState();

        showBlockedMessage();

        return;
    }

    if (isSending) {
        return;
    }

    const text =
        String(
            messageInput?.value ||
            ""
        ).trim();

    if (!text) {
        return;
    }

    if (
        !currentUser ||
        !groupId
    ) {
        return;
    }

    isSending = true;

    try {

        /*
         * Re-check the current admin controls
         * immediately before writing.
         */
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

        if (
            !groupSnapshot.exists()
        ) {

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

        currentGroup =
            latestGroup;

        currentProfile =
            latestProfile;

        accountControl =
            getAccountControl(
                latestProfile
            );

        groupControl =
            getGroupControl(
                latestGroup
            );

        renderGroup();

        updateComposerState();

        if (
            !canSendMessages()
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
            }
        );

        await updateGroupPreview(
            text,
            senderName
        );

        if (messageInput) {

            messageInput.value =
                "";
        }

        stopTyping();

    } catch (error) {

        console.error(
            "Send group message error:",
            error
        );

        showToast(
            error?.message ||
            "Failed to send message."
        );

    } finally {

        isSending =
            false;

        updateComposerState();
    }
}


/* =========================================================
   SEND PHOTO MESSAGE
========================================================= */

async function sendPhotoMessage(file) {

    if (
        !canSendMessages()
    ) {

        showBlockedMessage();

        return;
    }

    if (isUploadingPhoto) {
        return;
    }

    if (
        !file ||
        !file.type
    ) {
        return;
    }

    /*
     * ONLY these image types are accepted.
     */
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (
        !allowedTypes.includes(
            file.type
        )
    ) {

        showToast(
            "Only JPG, PNG and WebP photos are allowed. Videos are not allowed."
        );

        return;
    }

    if (
        file.size >
        MAX_PHOTO_SIZE
    ) {

        showToast(
            "Photo must be 5MB or smaller."
        );

        return;
    }

    if (
        !currentUser ||
        !groupId
    ) {
        return;
    }

    isUploadingPhoto =
        true;

    updateComposerState();

    showToast(
        "Uploading photo..."
    );

    try {

        /*
         * Re-check admin controls before upload.
         */
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

        if (
            !groupSnapshot.exists()
        ) {

            showToast(
                "This group no longer exists."
            );

            return;
        }

        currentGroup = {

            groupId:
                groupSnapshot.id,

            ...groupSnapshot.data()
        };

        currentProfile =
            profileSnapshot.exists()
                ? profileSnapshot.data()
                : null;

        accountControl =
            getAccountControl(
                currentProfile
            );

        groupControl =
            getGroupControl(
                currentGroup
            );

        renderGroup();

        if (
            !canSendMessages()
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

        /*
         * Safe extension.
         */
        let extension =
            "jpg";

        if (
            file.type ===
            "image/png"
        ) {

            extension =
                "png";

        } else if (
            file.type ===
            "image/webp"
        ) {

            extension =
                "webp";
        }

        const storagePath =
            `groupPhotos/${groupId}/${currentUser.uid}/${messageId}.${extension}`;

        const storageRef =
            ref(
                storage,
                storagePath
            );

        await uploadBytes(
            storageRef,
            file,
            {
                contentType:
                    file.type
            }
        );

        const imageURL =
            await getDownloadURL(
                storageRef
            );

        const senderName =
            currentProfile?.displayName ||

            [
                currentProfile?.firstName,
                currentProfile?.lastName
            ]
                .filter(Boolean)
                .join(" ") ||

            currentUser.displayName ||

            "User";

        const senderUsername =
            currentProfile?.username ||
            "";

        const senderFirstName =
            currentProfile?.firstName ||
            "";

        const senderLastName =
            currentProfile?.lastName ||
            "";

        const senderPhotoURL =
            currentProfile?.photoURL ||
            currentUser.photoURL ||
            "";

        const senderVerified =
            currentProfile?.isVerified === true;

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

                text:
                    "",

                type:
                    "image",

                imageURL,

                storagePath,

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

        await updateGroupPreview(
            "📷 Photo",
            senderName
        );

        showToast(
            "Photo sent."
        );

    } catch (error) {

        console.error(
            "Send group photo error:",
            error
        );

        showToast(
            error?.message ||
            "Failed to send photo."
        );

    } finally {

        isUploadingPhoto =
            false;

        updateComposerState();
    }
}


/* =========================================================
   GROUP PREVIEW
========================================================= */

async function updateGroupPreview(
    previewText,
    senderName
) {

    try {

        await updateDoc(
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            ),
            {

                lastMessage:
                    String(
                        previewText ||
                        ""
                    ).substring(
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

    } catch (error) {

        /*
         * Message itself has already been
         * written. Do not tell the user that
         * sending failed only because the
         * preview update failed.
         */
        console.warn(
            "Could not update group preview:",
            error
        );
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

    } else if (
        !groupControl.member
    ) {

        showToast(
            "You must join this group before participating."
        );

    } else if (
        !groupControl.approved
    ) {

        showToast(
            "This group is not currently available."
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

    if (
        !canSendMessages()
    ) {
        return;
    }

    if (
        !currentUser ||
        !groupId
    ) {
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

    if (
        !currentUser ||
        !groupId
    ) {
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

        await deleteDoc(
            typingRef
        );

    } catch {
        /*
         * Typing is non-critical.
         */
    }
}


/* =========================================================
   COMPOSER
========================================================= */

function setupComposer() {

    if (!messageInput) {
        return;
    }

    messageInput.addEventListener(
        "input",
        () => {

            if (
                !canSendMessages()
            ) {
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

    /*
     * The HTML already has a submit form.
     */
    const form =
        document.getElementById(
            "messageForm"
        );

    if (form) {

        form.addEventListener(
            "submit",
            (event) => {

                event.preventDefault();

                sendTextMessage();
            }
        );
    }
}


/* =========================================================
   EMOJI
========================================================= */

function setupEmoji() {

    if (
        !emojiBtn ||
        !messageInput
    ) {
        return;
    }

    emojiBtn.addEventListener(
        "click",
        () => {

            if (
                !canSendMessages()
            ) {

                showBlockedMessage();

                return;
            }

            messageInput.value +=
                "😊";

            messageInput.focus();
        }
    );
}


/* =========================================================
   GROUP INFO SHEET
========================================================= */

function openGroupInfo() {

    if (!groupInfoOverlay) {
        return;
    }

    groupInfoOverlay.classList.add(
        "open"
    );

    groupInfoOverlay.setAttribute(
        "aria-hidden",
        "false"
    );
}


function closeGroupInfo() {

    if (!groupInfoOverlay) {
        return;
    }

    groupInfoOverlay.classList.remove(
        "open"
    );

    groupInfoOverlay.setAttribute(
        "aria-hidden",
        "true"
    );
}


function setupGroupInfo() {

    if (infoBtn) {

        infoBtn.addEventListener(
            "click",
            openGroupInfo
        );
    }

    if (closeInfoBtn) {

        closeInfoBtn.addEventListener(
            "click",
            closeGroupInfo
        );
    }

    if (groupInfoOverlay) {

        groupInfoOverlay.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    groupInfoOverlay
                ) {

                    closeGroupInfo();
                }
            }
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

    if (backToGroupsBtn) {

        backToGroupsBtn.addEventListener(
            "click",
            () => {

                window.location.href =
                    "groups.html";
            }
        );
    }
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

    if (stopGroup) {

        stopGroup();

        stopGroup =
            null;
    }

    if (stopMessages) {

        stopMessages();

        stopMessages =
            null;
    }

    if (stopOwnProfile) {

        stopOwnProfile();

        stopOwnProfile =
            null;
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

    return new Promise(
        (resolve) => {

            let finished = false;

            const unsubscribe =
                onAuthStateChanged(
                    auth,
                    (user) => {

                        if (!user) {

                            window.location.href =
                                "login.html";

                            return;
                        }

                        if (finished) {
                            return;
                        }

                        finished = true;

                        currentUser =
                            user;

                        unsubscribe();

                        /*
                         * Start the user's live
                         * admin-control listener.
                         */
                        listenToOwnProfile();

                        resolve(user);
                    }
                );
        }
    );
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

    showLoading();

    try {

        await startAuth();

        /*
         * Cached messages can render immediately.
         */
        loadCachedMessages();

        /*
         * Load the actual group.
         */
        const loaded =
            await loadGroup();

        if (!loaded) {
            return;
        }

        /*
         * Start live messages.
         */
        setupMessageListener();

        /*
         * UI setup.
         */
        setupComposer();

        setupEmoji();

        setupPhotoUpload();

        setupGroupInfo();

        setupBackButton();

        updateComposerState();

    } catch (error) {

        console.error(
            "Group chat initialization error:",
            error
        );

        hideLoading();

        showAccessError(
            "Unable to open group",
            error?.message ||
            "Please try again."
        );
    }
}


/* =========================================================
   START
========================================================= */

init();
