/* =========================================================
   CONNECTA — GROUP CHAT
   File: frontend/js/group-chat.js

   FEATURES
   - Text messages
   - Photo messages
   - JPG / JPEG / PNG / WebP only
   - No videos
   - Compact message bubbles
   - Gallery/file picker
   - Realtime group messages
   - Realtime group controls
   - Realtime account controls
   - Admin chat lock
   - Admin messaging restriction
   - Admin participation restriction
   - Owner controls
   - Announcement-only groups
   - Public/private group rules
   - Private groups: verified users only
   - Group membership protection
   - Cached group/messages fallback
   - Group read state
   - Typing state
   - Deleted-group protection
========================================================= */

import {
    db,
    storage
} from "./firebase.js";

import {
    getCurrentConnectaUser
} from "./globalAuth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    orderBy,
    limit,
    serverTimestamp,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


/* =========================================================
   CONSTANTS
========================================================= */

const GROUPS_COLLECTION = "groups";
const GROUP_MESSAGES_COLLECTION = "groupMessages";
const GROUP_READS_COLLECTION = "reads";
const GROUP_TYPING_COLLECTION = "typing";

const MAX_MESSAGES = 100;

const MAX_PHOTO_SIZE =
    5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const GROUP_CACHE_PREFIX =
    "connectaGroupCache_v3_";

const GROUP_MESSAGES_CACHE_PREFIX =
    "connectaGroupMessagesCache_v3_";


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
let stopTypingUsers = null;

let messages = [];
let typingUsers = [];

let isSending = false;
let isUploadingPhoto = false;
let isSavingGroup = false;
let isDeletingMessage = false;
let isDeletingGroup = false;

let isUpdatingMessagingMode = false;
let isLoadingMembers = false;

let typingTimer = null;

let selectedMessageId = "";

let ownerPhotoFile = null;
let photoInputMode = "message";
let ownerPreviewURL = "";

let accountControl = {
    loaded: false,
    blocked: true,
    messagingRestricted: true,
    groupParticipationRestricted: true,
    reason: "checking"
};

let groupControl = {
    loaded: false,
    chatLocked: true,
    messagingLocked: true,
    announcementOnly: false,
    approved: false,
    deleted: false,
    member: false,
    verifiedRequired: false,
    verified: false,
    allowed: false
};


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

const messagesArea =
    document.getElementById("messagesArea");

const messagesInner =
    document.getElementById("messagesContainer");

const chatLoading =
    document.getElementById("chatLoading");

const typingArea =
    document.getElementById("typingArea");

const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const infoBtn =
    document.getElementById("infoBtn");

const accessBlock =
    document.getElementById("accessBlock");

const accessIcon =
    document.getElementById("accessIcon");

const accessTitle =
    document.getElementById("accessTitle");

const accessMessage =
    document.getElementById("accessMessage");

const backToGroupsBtn =
    document.getElementById("backToGroupsBtn");

const groupInfoOverlay =
    document.getElementById("groupInfoSheet");

const closeInfoBtn =
    document.getElementById("closeGroupInfo");

const toast =
    document.getElementById("toast");


/* =========================================================
   MODE / COMPOSER DOM
========================================================= */

const groupModeBanner =
    document.getElementById("groupModeBanner");

const groupModeIcon =
    document.getElementById("groupModeIcon");

const groupModeText =
    document.getElementById("groupModeText");

const composerWrap =
    document.getElementById("composerWrap");

const composerLockMessage =
    document.getElementById("composerLockMessage");

const composerLockIcon =
    document.getElementById("composerLockIcon");

const composerLockText =
    document.getElementById("composerLockText");

const messageForm =
    document.getElementById("messageForm");


/* =========================================================
   OWNER DOM
========================================================= */

const ownerMenu =
    document.getElementById("ownerMenu");

const editGroupBtn =
    document.getElementById("editGroupBtn");

const changeGroupPhotoBtn =
    document.getElementById("changeGroupPhotoBtn");

const deleteMessagesBtn =
    document.getElementById("deleteMessagesBtn");

const deleteGroupBtn =
    document.getElementById("deleteGroupBtn");

const editGroupModal =
    document.getElementById("editGroupModal");

const editGroupName =
    document.getElementById("editGroupName");

const editGroupDescription =
    document.getElementById("editGroupDescription");

const groupPhotoPreview =
    document.getElementById("groupPhotoPreview");

const modalPhotoBtn =
    document.getElementById("modalPhotoBtn");

const cancelEditGroup =
    document.getElementById("cancelEditGroup");

const saveGroupChanges =
    document.getElementById("saveGroupChanges");

const deleteGroupModal =
    document.getElementById("deleteGroupModal");

const cancelDeleteGroup =
    document.getElementById("cancelDeleteGroup");

const confirmDeleteGroup =
    document.getElementById("confirmDeleteGroup");

const deleteMessageModal =
    document.getElementById("deleteMessageModal");

const cancelDeleteMessage =
    document.getElementById("cancelDeleteMessage");

const confirmDeleteMessage =
    document.getElementById("confirmDeleteMessage");

const deleteModeBar =
    document.getElementById("deleteModeBar");

/* =========================================================
   OWNER EXTRA CONTROLS
========================================================= */

let membersModal = null;
let messagingModal = null;

const deleteModeText =
    document.getElementById("deleteModeText");

const cancelDeleteMode =
    document.getElementById("cancelDeleteMode");


/* =========================================================
   PHOTO DOM
========================================================= */

const photoBtn =
    document.getElementById("photoBtn");

const photoInput =
    document.getElementById("photoInput");


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


function clearGroupCache(id) {

    try {

        localStorage.removeItem(
            groupCacheKey(id)
        );

        localStorage.removeItem(
            messagesCacheKey(id)
        );

    } catch {
        /* Ignore */
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


function escapeAttribute(value) {
    return escapeHTML(value);
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

    const millis =
        getTimestampMillis(value);

    if (!millis) {
        return "";
    }

    const date =
        new Date(millis);

    if (
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


function getTimestampMillis(value) {

    if (!value) {
        return 0;
    }

    if (
        typeof value.toMillis === "function"
    ) {

        return value.toMillis();
    }

    if (
        typeof value.toDate === "function"
    ) {

        return value.toDate().getTime();
    }

    if (
        typeof value.seconds === "number"
    ) {

        return value.seconds * 1000;
    }

    if (
        typeof value._seconds === "number"
    ) {

        return value._seconds * 1000;
    }

    const parsed =
        new Date(value).getTime();

    return Number.isNaN(parsed)
        ? 0
        : parsed;
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


function getMessageId(message) {

    return String(
        message?.messageId ||
        message?.id ||
        ""
    );
}


function getGroupType(group) {

    return String(
        group?.type || "public"
    )
        .trim()
        .toLowerCase();
}


function isPrivateGroup(group) {

    return getGroupType(group) === "private";
}


function isGroupDeleted(group) {

    if (!group) {
        return true;
    }

    return (
        group.deleted === true ||
        String(
            group.status || ""
        )
            .trim()
            .toLowerCase() === "deleted"
    );
}


/* =========================================================
   LOADING
========================================================= */

function showLoading() {

    if (chatLoading) {
        chatLoading.style.display = "flex";
    }
}


function hideLoading() {

    if (chatLoading) {
        chatLoading.style.display = "none";
    }
}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(profile) {

    if (!profile) {

        return {

            loaded: true,
            blocked: true,
            messagingRestricted: true,
            groupParticipationRestricted: true,
            reason: "profile_missing"
        };
    }

    const status =
        String(
            profile.status || "active"
        )
            .trim()
            .toLowerCase();

    const messagingRestricted =
        profile.groupMessagingRestricted === true;

    const groupParticipationRestricted =
        profile.groupParticipationRestricted === true;


    if (status === "banned") {

        return {

            loaded: true,
            blocked: true,
            messagingRestricted: true,
            groupParticipationRestricted: true,
            reason: "banned"
        };
    }


    if (status === "suspended") {

        return {

            loaded: true,
            blocked: true,
            messagingRestricted: true,
            groupParticipationRestricted: true,
            reason: "suspended"
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
   VERIFIED USER
========================================================= */

function isVerifiedUser() {

    return (
        currentProfile?.isVerified === true
    );
}


/* =========================================================
   OWNER CHECK
========================================================= */

function isGroupOwner() {

    if (
        !currentUser ||
        !currentGroup
    ) {
        return false;
    }

    return (
        String(
            currentGroup.ownerId || ""
        ) ===
        String(
            currentUser.uid
        )
    );
}


/* =========================================================
   MEMBERSHIP
========================================================= */

function isUserGroupMember(group) {

    if (
        !currentUser ||
        !group
    ) {
        return false;
    }

    const uid =
        currentUser.uid;


    if (
        String(
            group.ownerId || ""
        ) === String(uid)
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

    if (!group) {

        return {

            loaded: true,
            chatLocked: true,
            messagingLocked: true,
            announcementOnly: false,
            approved: false,
            deleted: true,
            member: false,
            verifiedRequired: false,
            verified: false,
            allowed: false
        };
    }


    const status =
        String(
            group.status || ""
        )
            .trim()
            .toLowerCase();


    const privateGroup =
        isPrivateGroup(group);


    const member =
        isUserGroupMember(group);


    const verified =
        isVerifiedUser();


    /*
     * Private groups are verified-user groups.
     * Membership is still required.
     */
    const verifiedRequired =
        privateGroup;


    const chatLocked =
        group.chatLocked === true;


    const messagingLocked =
        group.messagingLocked === true ||
        chatLocked;


    const announcementOnly =
        group.announcementOnly === true;


    const deleted =
        isGroupDeleted(group);


    const verifiedAllowed =
        !verifiedRequired ||
        verified ||
        isGroupOwner();


    return {

        loaded: true,

        chatLocked,

        messagingLocked,

        announcementOnly,

        approved:
            status === "approved" &&
            !deleted,

        deleted,

        member,

        verifiedRequired,

        verified,

        allowed:
            status === "approved" &&
            !deleted &&
            member &&
            verifiedAllowed
    };
}


/* =========================================================
   ACCESS UI
========================================================= */

function updateAccessUI() {

    if (!accessBlock) {
        return;
    }


    let show = false;

    let title = "";

    let message = "";

    let icon = "🔒";


    if (!accountControl.loaded) {

        show = true;

        title = "Checking permissions";

        message =
            "Checking your CONNECTA account permissions...";

        icon = "⏳";

    } else if (
        accountControl.blocked
    ) {

        show = true;

        title =
            accountControl.reason === "banned"
                ? "Account Banned"
                : "Account Suspended";

        message =
            "Your account cannot participate in group conversations.";

        icon =
            accountControl.reason === "banned"
                ? "🚫"
                : "⛔";

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        show = true;

        title =
            "Participation Restricted";

        message =
            "Your account is currently restricted from participating in groups.";

        icon = "🚫";

    } else if (
        !groupControl.loaded
    ) {

        show = true;

        title =
            "Checking group";

        message =
            "Checking group access...";

        icon = "⏳";

    } else if (
        groupControl.deleted
    ) {

        show = true;

        title =
            "Group Removed";

        message =
            "This group is no longer available.";

        icon = "🗑️";

    } else if (
        !groupControl.approved
    ) {

        show = true;

        title =
            "Group Unavailable";

        message =
            "This group is not currently available for conversation.";

        icon = "⚠️";

    } else if (
        !groupControl.member
    ) {

        show = true;

        title =
            "Group Membership Required";

        message =
            groupControl.verifiedRequired
                ? "You must be a verified member of this private group to participate."
                : "Join this group to participate in the conversation.";

        icon = "👥";

    } else if (
        groupControl.verifiedRequired &&
        !groupControl.verified &&
        !isGroupOwner()
    ) {

        show = true;

        title =
            "Verification Required";

        message =
            "This private group is available only to verified CONNECTA users.";

        icon = "✓";
    }


    if (accessIcon) {
        accessIcon.textContent = icon;
    }

    if (accessTitle) {
        accessTitle.textContent = title;
    }

    if (accessMessage) {
        accessMessage.textContent = message;
    }


    accessBlock.style.display =
        show ? "" : "none";
}


/* =========================================================
   CAN ACCESS GROUP
========================================================= */

function canAccessGroup() {

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
        accountControl.groupParticipationRestricted
    ) {
        return false;
    }

    if (
        groupControl.deleted ||
        !groupControl.approved
    ) {
        return false;
    }

    if (!groupControl.member) {
        return false;
    }

    if (
        groupControl.verifiedRequired &&
        !groupControl.verified &&
        !isGroupOwner()
    ) {
        return false;
    }

    return true;
}


/* =========================================================
   CAN SEND
========================================================= */

function canSendMessages() {

    if (!canAccessGroup()) {
        return false;
    }


    if (
        accountControl.messagingRestricted
    ) {
        return false;
    }


    if (
        groupControl.messagingLocked
    ) {
        return false;
    }


    if (
        groupControl.announcementOnly &&
        !isGroupOwner()
    ) {
        return false;
    }


    return true;
}


/* =========================================================
   COMPOSER LOCK STATE
========================================================= */

function getComposerLockState() {

    if (!accountControl.loaded) {

        return {
            locked: true,
            icon: "⏳",
            text:
                "Checking your CONNECTA permissions..."
        };
    }


    if (accountControl.blocked) {

        return {
            locked: true,
            icon: "🚫",
            text:
                accountControl.reason === "banned"
                    ? "Your account is banned."
                    : "Your account is suspended."
        };
    }


    if (
        accountControl.groupParticipationRestricted
    ) {

        return {
            locked: true,
            icon: "🚫",
            text:
                "Group participation is restricted for your account."
        };
    }


    if (!groupControl.loaded) {

        return {
            locked: true,
            icon: "⏳",
            text:
                "Checking group access..."
        };
    }


    if (groupControl.deleted) {

        return {
            locked: true,
            icon: "🗑️",
            text:
                "This group has been removed."
        };
    }


    if (!groupControl.approved) {

        return {
            locked: true,
            icon: "⚠️",
            text:
                "This group is currently unavailable."
        };
    }


    if (!groupControl.member) {

        return {
            locked: true,
            icon: "👥",
            text:
                "Join the group to participate."
        };
    }


    if (
        groupControl.verifiedRequired &&
        !groupControl.verified &&
        !isGroupOwner()
    ) {

        return {
            locked: true,
            icon: "✓",
            text:
                "Verified CONNECTA users only."
        };
    }


    if (
        accountControl.messagingRestricted
    ) {

        return {
            locked: true,
            icon: "🚫",
            text:
                "Your group messaging access is restricted."
        };
    }


    if (
        groupControl.messagingLocked
    ) {

        return {
            locked: true,
            icon: "🔒",
            text:
                "Messaging has been locked in this group."
        };
    }


    if (
        groupControl.announcementOnly &&
        !isGroupOwner()
    ) {

        return {
            locked: true,
            icon: "📢",
            text:
                "This group is in announcement-only mode. Only the owner can send messages."
        };
    }


    return {
        locked: false,
        icon: "",
        text: ""
    };
}


/* =========================================================
   GROUP MODE BANNER
========================================================= */

function updateGroupModeBanner() {

    if (!groupModeBanner) {
        return;
    }


    if (!currentGroup) {

        groupModeBanner.classList.remove("open");
        groupModeBanner.style.display = "none";

        return;
    }


    let show = false;
    let icon = "";
    let text = "";


    if (groupControl.deleted) {

        show = true;
        icon = "🗑️";
        text = "This group has been removed.";

    } else if (
        groupControl.messagingLocked
    ) {

        show = true;
        icon = "🔒";

        text =
            currentGroup.messagingLocked === true &&
            currentGroup.chatLocked !== true
                ? "Messaging is locked for this group."
                : "Group chat is locked.";

    } else if (
        groupControl.announcementOnly
    ) {

        show = true;
        icon = "📢";

        text =
            isGroupOwner()
                ? "Announcement-only mode is active. You can still send messages."
                : "Announcement-only mode is active. Only the group owner can send messages.";
    }


    if (show) {

        if (groupModeIcon) {
            groupModeIcon.textContent = icon;
        }

        if (groupModeText) {
            groupModeText.textContent = text;
        }

        groupModeBanner.style.display = "";
        groupModeBanner.classList.add("open");

    } else {

        groupModeBanner.classList.remove("open");
        groupModeBanner.style.display = "none";
    }
}


/* =========================================================
   COMPOSER STATE
========================================================= */

function updateComposerState() {

    const canSend =
        canSendMessages();

    const lock =
        getComposerLockState();


    if (messageInput) {

        messageInput.disabled =
            !canSend;

        messageInput.placeholder =
            canSend
                ? "Type a message..."
                : lock.text;
    }


    if (sendBtn) {
        sendBtn.disabled = !canSend;
    }


    if (photoBtn) {
        photoBtn.disabled = !canSend;
    }


    if (composerLockMessage) {

        composerLockMessage.style.display =
            canSend ? "none" : "";

        if (composerLockIcon) {
            composerLockIcon.textContent =
                lock.icon;
        }

        if (composerLockText) {
            composerLockText.textContent =
                lock.text;
        }
    }


    if (messageForm) {

        messageForm.style.display =
            canSend ? "" : "none";
    }


    if (composerWrap) {

        composerWrap.classList.toggle(
            "locked",
            !canSend
        );
    }


    updateGroupModeBanner();
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


    accountControl = {

        loaded: false,
        blocked: true,
        messagingRestricted: true,
        groupParticipationRestricted: true,
        reason: "checking"
    };


    updateComposerState();
    updateAccessUI();


    const userRef =
        doc(
            db,
            "users",
            currentUser.uid
        );


    stopOwnProfile =
        onSnapshot(

            userRef,

            snapshot => {

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
                    updateAccessUI();

                    stopTyping();

                    return;
                }


                currentProfile = {

                    uid: currentUser.uid,
                    ...snapshot.data()
                };


                accountControl =
                    getAccountControl(
                        currentProfile
                    );


                if (currentGroup) {

                    groupControl =
                        getGroupControl(
                            currentGroup
                        );
                }


                updateComposerState();
                updateAccessUI();


                if (
                    accountControl.blocked ||
                    accountControl.groupParticipationRestricted ||
                    accountControl.messagingRestricted
                ) {

                    stopTyping();
                }
            },

            error => {

                console.error(
                    "Profile listener error:",
                    error
                );


                accountControl = {

                    loaded: true,
                    blocked: true,
                    messagingRestricted: true,
                    groupParticipationRestricted: true,
                    reason: "control_check_failed"
                };


                updateComposerState();
                updateAccessUI();

                stopTyping();
            }
        );
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

    if (!groupId) {

        showAccessError(
            "Group not found",
            "No group ID was provided."
        );

        return false;
    }


    showLoading();


    const cached =
        loadGroupCache(groupId);


    if (cached) {

        currentGroup = cached;

        groupControl =
            getGroupControl(
                currentGroup
            );

        renderGroup();

        updateOwnerControls();
        updateComposerState();
        updateAccessUI();

        loadCachedMessages();
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

            hideLoading();

            showAccessError(
                "Group not found",
                "This group could not be found."
            );

            return false;
        }


        currentGroup = {

            groupId: snapshot.id,
            ...snapshot.data()
        };


        saveGroupCache(currentGroup);


        groupControl =
            getGroupControl(
                currentGroup
            );


        renderGroup();

        updateOwnerControls();
        updateComposerState();
        updateAccessUI();


        setupGroupListener();
        setupMessageListener();
        setupTypingListener();


        hideLoading();

        return true;

    } catch (error) {

        console.error(
            "Failed to load group:",
            error
        );


        if (currentGroup) {

            hideLoading();

            setupGroupListener();
            setupMessageListener();
            setupTypingListener();

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
        chatLoading.style.display = "none";
    }


    if (messagesInner) {

        messagesInner.innerHTML = `

            <div
                class="empty-chat"
                style="
                    text-align:center;
                    padding:60px 20px;
                    color:#718078;
                "
            >

                <div
                    style="
                        font-size:32px;
                        margin-bottom:12px;
                    "
                >
                    ⚠️
                </div>

                <h3
                    style="
                        margin:0 0 8px;
                        color:#17211b;
                    "
                >
                    ${escapeHTML(title)}
                </h3>

                <p
                    style="
                        margin:0;
                        line-height:1.5;
                    "
                >
                    ${escapeHTML(message)}
                </p>

            </div>
        `;
    }
}


/* =========================================================
   GROUP LISTENER
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

            snapshot => {

                if (!snapshot.exists()) {

                    currentGroup = null;

                    groupControl = {

                        loaded: true,
                        chatLocked: true,
                        messagingLocked: true,
                        announcementOnly: false,
                        approved: false,
                        deleted: true,
                        member: false,
                        verifiedRequired: false,
                        verified: false,
                        allowed: false
                    };


                    updateOwnerControls();
                    updateComposerState();
                    updateAccessUI();


                    showAccessError(
                        "Group no longer exists",
                        "This group has been removed."
                    );


                    stopTyping();

                    return;
                }


                currentGroup = {

                    groupId: snapshot.id,
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

                updateOwnerControls();
                updateComposerState();
                updateAccessUI();


                if (!canAccessGroup()) {
                    stopTyping();
                }
            },

            error => {

                console.error(
                    "Group listener error:",
                    error
                );


                groupControl = {

                    loaded: true,
                    chatLocked: true,
                    messagingLocked: true,
                    announcementOnly: false,
                    approved: false,
                    deleted: false,
                    member: false,
                    verifiedRequired: false,
                    verified: false,
                    allowed: false
                };


                updateComposerState();
                updateAccessUI();
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
        groupName.textContent = name;
    }


    if (groupStatus) {

        const memberCount =
            Number(
                currentGroup.memberCount ||
                (
                    Array.isArray(
                        currentGroup.memberIds
                    )
                        ? currentGroup.memberIds.length
                        : Array.isArray(
                            currentGroup.members
                        )
                            ? currentGroup.members.length
                            : 0
                )
            );


        if (groupControl.deleted) {

            groupStatus.textContent =
                "Group removed";

        } else if (
            groupControl.messagingLocked
        ) {

            groupStatus.textContent =
                "Messaging locked";

        } else if (
            groupControl.announcementOnly
        ) {

            groupStatus.textContent =
                "Announcements only";

        } else if (
            isPrivateGroup(currentGroup)
        ) {

            groupStatus.textContent =
                `${memberCount} members • Private`;

        } else {

            groupStatus.textContent =
                `${memberCount} members • Public`;
        }
    }


    if (groupAvatar) {

        if (photo) {

            groupAvatar.innerHTML = `
                <img
                    src="${escapeAttribute(photo)}"
                    alt=""
                >
            `;

        } else {

            groupAvatar.textContent =
                getInitials(name);
        }
    }


    renderGroupInfo();
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

    const infoMessaging =
        document.getElementById(
            "infoGroupMessaging"
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
                    src="${escapeAttribute(photo)}"
                    alt=""
                >
            `;

        } else {

            infoAvatar.textContent =
                getInitials(name);
        }
    }


    if (infoName) {
        infoName.textContent = name;
    }


    if (infoMeta) {

        infoMeta.textContent =
            isPrivateGroup(currentGroup)
                ? "Private group • Verified users"
                : "Public group";
    }


    if (infoDescription) {

        infoDescription.textContent =
            currentGroup.description ||
            "No group description available.";
    }


    if (infoType) {

        infoType.textContent =
            isPrivateGroup(currentGroup)
                ? "Private"
                : "Public";
    }


    if (infoMembers) {

        const memberCount =
            Number(
                currentGroup.memberCount ||
                (
                    Array.isArray(
                        currentGroup.memberIds
                    )
                        ? currentGroup.memberIds.length
                        : Array.isArray(
                            currentGroup.members
                        )
                            ? currentGroup.members.length
                            : 0
                )
            );


        infoMembers.textContent =
            String(memberCount);
    }


    if (infoSubscription) {

        if (
            isPrivateGroup(currentGroup)
        ) {

            const fee =
                Number(
                    currentGroup.subscriptionFee ||
                    0
                );


            if (
                currentGroup.subscriptionEnabled === true &&
                fee > 0
            ) {

                infoSubscription.textContent =
                    `Paid — KSh ${fee}`;

            } else {

                infoSubscription.textContent =
                    "Private / Verified users";
            }

        } else {

            infoSubscription.textContent =
                "Free";
        }
    }


    if (infoMessaging) {

        if (groupControl.deleted) {

            infoMessaging.textContent =
                "Group removed";

        } else if (
            groupControl.messagingLocked
        ) {

            infoMessaging.textContent =
                "Locked";

        } else if (
            groupControl.announcementOnly
        ) {

            infoMessaging.textContent =
                isGroupOwner()
                    ? "Announcements only — Owner can send"
                    : "Announcements only";

        } else {

            infoMessaging.textContent =
                "Enabled";
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
   CACHED MESSAGES
========================================================= */

function loadCachedMessages() {

    const cached =
        loadMessagesCache(groupId);


    if (
        Array.isArray(cached) &&
        cached.length
    ) {

        messages =
            cached
                .sort(
                    (a, b) =>
                        getTimestampMillis(
                            a.createdAt
                        ) -
                        getTimestampMillis(
                            b.createdAt
                        )
                );


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

            snapshot => {

                messages =
                    snapshot.docs
                        .map(
                            item => ({
                                id: item.id,
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

                markGroupRead();
            },

            error => {

                console.error(
                    "Message listener error:",
                    error
                );


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
   TYPING LISTENER
========================================================= */

function setupTypingListener() {

    if (
        !currentUser ||
        !groupId
    ) {
        return;
    }


    if (stopTypingUsers) {

        stopTypingUsers();
        stopTypingUsers = null;
    }


    const typingRef =
        collection(
            db,
            GROUPS_COLLECTION,
            groupId,
            GROUP_TYPING_COLLECTION
        );


    stopTypingUsers =
        onSnapshot(

            typingRef,

            snapshot => {

                const now =
                    Date.now();


                typingUsers =
                    snapshot.docs
                        .map(
                            item => ({
                                id: item.id,
                                ...item.data()
                            })
                        )
                        .filter(
                            user => {

                                if (
                                    user.uid ===
                                    currentUser.uid
                                ) {
                                    return false;
                                }


                                if (
                                    user.isTyping ===
                                    false
                                ) {
                                    return false;
                                }


                                const updated =
                                    getTimestampMillis(
                                        user.updatedAt
                                    );


                                /*
                                 * Prevent stale typing
                                 * indicators from remaining.
                                 */
                                if (
                                    updated &&
                                    now - updated >
                                    8000
                                ) {
                                    return false;
                                }


                                return true;
                            }
                        );


                renderTypingUsers();
            },

            error => {

                console.warn(
                    "Typing listener error:",
                    error
                );

                typingUsers = [];

                renderTypingUsers();
            }
        );
}


/* =========================================================
   RENDER TYPING
========================================================= */

function renderTypingUsers() {

    if (!typingArea) {
        return;
    }


    const names =
        typingUsers
            .map(
                user =>
                    String(
                        user.name ||
                        user.displayName ||
                        "Someone"
                    ).trim()
            )
            .filter(Boolean);


    if (!names.length) {

        typingArea.textContent = "";

        typingArea.style.display =
            "none";

        return;
    }


    let text = "";


    if (names.length === 1) {

        text =
            `${names[0]} is typing...`;

    } else if (names.length === 2) {

        text =
            `${names[0]} and ${names[1]} are typing...`;

    } else {

        text =
            "Several people are typing...";
    }


    typingArea.textContent =
        text;

    typingArea.style.display = "";
}


/* =========================================================
   MARK GROUP READ
========================================================= */

async function markGroupRead() {

    if (
        !currentUser ||
        !groupId ||
        !groupControl.member
    ) {
        return;
    }


    const latestMessage =
        messages.length
            ? messages[messages.length - 1]
            : null;


    try {

        await setDoc(

            doc(
                db,
                GROUPS_COLLECTION,
                groupId,
                GROUP_READS_COLLECTION,
                currentUser.uid
            ),

            {

                userId:
                    currentUser.uid,

                groupId,

                lastReadMessageId:
                    latestMessage
                        ? getMessageId(
                            latestMessage
                        )
                        : "",

                lastReadAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()
            },

            {
                merge: true
            }
        );

    } catch (error) {

        console.warn(
            "Could not mark group as read:",
            error
        );
    }
}


/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages() {

    if (!messagesInner) {
        return;
    }


    hideLoading();


    if (!messages.length) {

        messagesInner.innerHTML = `

            <div
                class="empty-chat"
                style="
                    text-align:center;
                    padding:70px 20px;
                    color:#718078;
                "
            >

                <div
                    style="
                        font-size:30px;
                        margin-bottom:10px;
                    "
                >
                    💬
                </div>

                <h3
                    style="
                        margin:0 0 7px;
                        color:#17211b;
                    "
                >
                    No messages yet
                </h3>

                <p
                    style="
                        margin:0;
                        font-size:13px;
                    "
                >
                    Start the conversation by
                    sending a message.
                </p>

            </div>
        `;

        return;
    }


    messagesInner.innerHTML =
        messages
            .map(renderMessage)
            .join("");


    if (
        deleteModeBar?.classList.contains(
            "open"
        )
    ) {

        bindDeleteModeRows();
    }


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
        String(
            message.senderId || ""
        ) ===
        String(
            currentUser?.uid || ""
        );


    const senderName =
        message.senderName ||
        message.senderUsername ||
        "User";


    const senderPhoto =
        message.senderPhotoURL ||
        "";


    const messageId =
        getMessageId(message);


    const messageType =
        String(
            message.type || "text"
        ).toLowerCase();


    const timestamp =
        formatTime(
            message.createdAt
        );


    const avatar =
        senderPhoto

            ? `
                <div
                    class="message-avatar"
                    aria-hidden="true"
                >
                    <img
                        src="${escapeAttribute(senderPhoto)}"
                        alt=""
                        loading="lazy"
                    >
                </div>
            `

            : `
                <div
                    class="message-avatar"
                    aria-hidden="true"
                >
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
                    aria-label="Verified"
                >
                    ✓
                </span>
            `

            : "";


    if (
        messageType !== "image" &&
        messageType !== "photo"
    ) {

        const text =
            escapeHTML(
                message.text || ""
            );


        return `

            <div
                class="
                    message-row
                    ${isMine ? "mine" : "other"}
                "
                data-message-id="${escapeAttribute(
                    messageId
                )}"
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

                    <div
                        class="
                            message-bubble
                            ${isMine
                                ? "sent-bubble"
                                : "received-bubble"}
                        "
                    >

                        <span
                            class="message-text"
                        >${text}</span>

                        <span
                            class="message-time"
                            aria-label="Message time"
                        >${escapeHTML(
                            timestamp
                        )}</span>

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


    const imageURL =
        message.imageURL ||
        message.photoURL ||
        "";


    const photoBody = imageURL

        ? `
            <div class="message-image-wrap">

                <img
                    src="${escapeAttribute(imageURL)}"
                    alt="Group photo"
                    class="message-image"
                    loading="lazy"
                >

            </div>

            <span
                class="message-time photo-time"
                aria-label="Message time"
            >${escapeHTML(
                timestamp
            )}</span>
        `

        : `
            <span class="message-text">
                Photo unavailable
            </span>

            <span
                class="message-time"
                aria-label="Message time"
            >${escapeHTML(
                timestamp
            )}</span>
        `;


    return `

        <div
            class="
                message-row
                ${isMine ? "mine" : "other"}
            "
            data-message-id="${escapeAttribute(
                messageId
            )}"
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

                <div
                    class="
                        message-bubble
                        photo-bubble
                        ${isMine
                            ? "sent-bubble"
                            : "received-bubble"}
                    "
                >

                    ${photoBody}

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
   SENDER NAME
========================================================= */

function getSenderName() {

    return (

        currentProfile?.displayName ||

        [
            currentProfile?.firstName,
            currentProfile?.lastName
        ]
            .filter(Boolean)
            .join(" ") ||

        currentUser?.displayName ||

        "User"
    );
}


/* =========================================================
   SEND TEXT
========================================================= */

async function sendTextMessage() {

    if (!canSendMessages()) {

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


    if (
        !currentUser ||
        !groupId
    ) {
        return;
    }


    isSending = true;


    try {

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

            throw new Error(
                "This group no longer exists."
            );
        }


        if (!profileSnapshot.exists()) {

            throw new Error(
                "Your CONNECTA profile could not be found."
            );
        }


        currentGroup = {

            groupId:
                groupSnapshot.id,

            ...groupSnapshot.data()
        };


        currentProfile = {

            uid:
                currentUser.uid,

            ...profileSnapshot.data()
        };


        accountControl =
            getAccountControl(
                currentProfile
            );


        groupControl =
            getGroupControl(
                currentGroup
            );


        renderGroup();
        updateOwnerControls();
        updateComposerState();
        updateAccessUI();


        if (!canSendMessages()) {

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
            getSenderName();


        await setDoc(

            messageRef,

            {

                messageId,

                groupId,

                senderId:
                    currentUser.uid,

                senderName,

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
                    currentUser.photoURL ||
                    "",

                senderVerified:
                    currentProfile?.isVerified ===
                    true,

                text,

                type: "text",

                imageURL: "",

                storagePath: "",

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
            messageId,
            text,
            senderName
        );


        if (messageInput) {

            messageInput.value = "";

            messageInput.style.height = "";
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

        isSending = false;

        updateComposerState();
    }
}


/* =========================================================
   SEND PHOTO
========================================================= */

async function sendPhotoMessage(file) {

    if (!canSendMessages()) {

        showBlockedMessage();

        return;
    }


    if (isUploadingPhoto) {
        return;
    }


    if (
        !file ||
        !ALLOWED_IMAGE_TYPES.includes(
            file.type
        )
    ) {

        showToast(
            "Only JPG, PNG and WebP photos are allowed. Videos are not allowed."
        );

        return;
    }


    if (file.size > MAX_PHOTO_SIZE) {

        showToast(
            "Photo must be 5MB or smaller."
        );

        return;
    }


    isUploadingPhoto = true;

    updateComposerState();

    showToast(
        "Uploading photo..."
    );


    try {

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

            throw new Error(
                "This group no longer exists."
            );
        }


        if (!profileSnapshot.exists()) {

            throw new Error(
                "Your CONNECTA profile could not be found."
            );
        }


        currentGroup = {

            groupId:
                groupSnapshot.id,

            ...groupSnapshot.data()
        };


        currentProfile = {

            uid:
                currentUser.uid,

            ...profileSnapshot.data()
        };


        accountControl =
            getAccountControl(
                currentProfile
            );


        groupControl =
            getGroupControl(
                currentGroup
            );


        renderGroup();
        updateComposerState();
        updateAccessUI();


        if (!canSendMessages()) {

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


        let extension = "jpg";


        if (
            file.type === "image/png"
        ) {

            extension = "png";

        } else if (
            file.type === "image/webp"
        ) {

            extension = "webp";
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
            getSenderName();


        await setDoc(

            messageRef,

            {

                messageId,

                groupId,

                senderId:
                    currentUser.uid,

                senderName,

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
                    currentUser.photoURL ||
                    "",

                senderVerified:
                    currentProfile?.isVerified ===
                    true,

                text: "",

                type: "image",

                imageURL,

                storagePath,

                fileName:
                    file.name || "",

                mimeType:
                    file.type || "",

                fileSize:
                    file.size || 0,

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
            messageId,
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

        isUploadingPhoto = false;

        updateComposerState();
    }
}


/* =========================================================
   GROUP PREVIEW
========================================================= */

async function updateGroupPreview(
    messageId,
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

                lastMessageId:
                    messageId,

                lastMessage:
                    String(
                        previewText || ""
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

    const lock =
        getComposerLockState();


    if (!accountControl.loaded) {

        showToast(
            "Checking your CONNECTA permissions..."
        );

    } else if (
        accountControl.blocked
    ) {

        showToast(
            accountControl.reason === "banned"
                ? "Your account is banned and cannot participate in group conversations."
                : "Your account is suspended and cannot participate in group conversations."
        );

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        showToast(
            "Your group participation has been restricted."
        );

    } else if (
        accountControl.messagingRestricted
    ) {

        showToast(
            "Your group messaging access has been restricted."
        );

    } else if (
        groupControl.deleted
    ) {

        showToast(
            "This group has been removed."
        );

    } else if (
        !groupControl.approved
    ) {

        showToast(
            "This group is not currently available."
        );

    } else if (
        !groupControl.member
    ) {

        showToast(
            "You must join this group before participating."
        );

    } else if (
        groupControl.verifiedRequired &&
        !groupControl.verified &&
        !isGroupOwner()
    ) {

        showToast(
            "This private group is available only to verified CONNECTA users."
        );

    } else if (
        groupControl.messagingLocked
    ) {

        showToast(
            "Messaging is locked in this group."
        );

    } else if (
        groupControl.announcementOnly &&
        !isGroupOwner()
    ) {

        showToast(
            "Only the group owner can send messages in announcement-only mode."
        );

    } else {

        showToast(
            lock.text ||
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
                GROUP_TYPING_COLLECTION,
                currentUser.uid
            );


        await setDoc(

            typingRef,

            {

                uid:
                    currentUser.uid,

                name:
                    getSenderName(),

                isTyping:
                    true,

                updatedAt:
                    serverTimestamp()
            },

            {
                merge: true
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

        await deleteDoc(

            doc(
                db,
                GROUPS_COLLECTION,
                groupId,
                GROUP_TYPING_COLLECTION,
                currentUser.uid
            )
        );

    } catch {
        /* Non-critical */
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

            messageInput.style.height =
                "auto";


            messageInput.style.height =
                `${Math.min(
                    messageInput.scrollHeight,
                    105
                )}px`;


            if (canSendMessages()) {

                setTyping();

            } else {

                stopTyping();
            }
        }
    );


    messageInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendTextMessage();
            }
        }
    );


    if (messageForm) {

        messageForm.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                sendTextMessage();
            }
        );
    }
}


/* =========================================================
   PHOTO INPUT
========================================================= */

function setupPhotoUpload() {

    if (
        !photoBtn ||
        !photoInput
    ) {
        return;
    }


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


            photoInputMode =
                "message";

            photoInput.value = "";

            photoInput.click();
        }
    );


    photoInput.addEventListener(
        "change",
        async () => {

            const file =
                photoInput.files?.[0];


            photoInput.value = "";


            if (!file) {
                return;
            }


            if (
                photoInputMode === "group"
            ) {

                handleOwnerPhotoFile(file);

                photoInputMode =
                    "message";

                return;
            }


            await sendPhotoMessage(file);
        }
    );
}


/* =========================================================
   OWNER PHOTO FILE
========================================================= */

function handleOwnerPhotoFile(file) {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can change the group photo."
        );

        return;
    }


    if (
        !ALLOWED_IMAGE_TYPES.includes(
            file.type
        )
    ) {

        showToast(
            "Only JPG, PNG and WebP photos are allowed."
        );

        return;
    }


    if (file.size > MAX_PHOTO_SIZE) {

        showToast(
            "Group photo must be 5MB or smaller."
        );

        return;
    }


    ownerPhotoFile = file;

    renderOwnerPhotoPreview();
}


/* =========================================================
   GROUP INFO
========================================================= */

function openGroupInfo() {

    if (!groupInfoOverlay) {
        return;
    }


    renderGroupInfo();


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
            event => {

                event.stopPropagation();

                /*
                 * GROUP OWNER:
                 * The three-dot button opens the owner menu.
                 *
                 * OTHER USERS:
                 * The same button opens normal group information.
                 */
                if (isGroupOwner()) {

                    toggleOwnerMenu();

                } else {

                    openGroupInfo();
                }
            }
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
            event => {

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
   OWNER CONTROLS
========================================================= */

function updateOwnerControls() {

    const owner =
        isGroupOwner();


    if (ownerMenu) {

        if (!owner) {

            ownerMenu.classList.remove(
                "open"
            );

            ownerMenu.style.display =
                "none";

        } else {

            ensureOwnerExtraControls();
        }
    }


    if (editGroupBtn) {
        editGroupBtn.disabled = !owner;
    }


    if (changeGroupPhotoBtn) {
        changeGroupPhotoBtn.disabled = !owner;
    }


    if (deleteMessagesBtn) {
        deleteMessagesBtn.disabled = !owner;
    }


    if (deleteGroupBtn) {
        deleteGroupBtn.disabled = !owner;
    }
}


/* =========================================================
   OWNER EXTRA CONTROLS UI
========================================================= */

function ensureOwnerExtraControls() {

    if (!isGroupOwner()) {
        return;
    }

    /*
     * Add View Members button.
     */
    if (
        ownerMenu &&
        !document.getElementById(
            "viewGroupMembersBtn"
        )
    ) {

        const button =
            document.createElement("button");

        button.id =
            "viewGroupMembersBtn";

        button.type =
            "button";

        button.className =
            "owner-menu-item";

        button.innerHTML = `
            <span>👥</span>
            <span>View Members</span>
        `;

        button.addEventListener(
            "click",
            openMembersModal
        );

        ownerMenu.appendChild(button);
    }


    /*
     * Add messaging permissions button.
     */
    if (
        ownerMenu &&
        !document.getElementById(
            "groupMessagingSettingsBtn"
        )
    ) {

        const button =
            document.createElement("button");

        button.id =
            "groupMessagingSettingsBtn";

        button.type =
            "button";

        button.className =
            "owner-menu-item";

        button.innerHTML = `
            <span>🔒</span>
            <span>Messaging Permissions</span>
        `;

        button.addEventListener(
            "click",
            openMessagingSettings
        );

        ownerMenu.appendChild(button);
    }
}

/* =========================================================
   GROUP MEMBERS
========================================================= */

async function loadGroupMembers() {

    if (
        !currentGroup ||
        !isGroupOwner()
    ) {
        return [];
    }


    const memberIds = [
        ...new Set([
            ...(Array.isArray(
                currentGroup.memberIds
            )
                ? currentGroup.memberIds
                : []),

            ...(Array.isArray(
                currentGroup.members
            )
                ? currentGroup.members
                : []),

            currentGroup.ownerId
        ].filter(Boolean))
    ];


    if (!memberIds.length) {
        return [];
    }


    const members = [];


    for (
        const uid of memberIds
    ) {

        try {

            const snapshot =
                await getDoc(
                    doc(
                        db,
                        "users",
                        uid
                    )
                );


            if (!snapshot.exists()) {
                continue;
            }


            const data =
                snapshot.data();


            members.push({

                uid,

                displayName:
                    data.displayName ||
                    [
                        data.firstName,
                        data.lastName
                    ]
                        .filter(Boolean)
                        .join(" ") ||
                    "CONNECTA User",

                username:
                    data.username ||
                    "",

                photoURL:
                    data.photoURL ||
                    "",

                isOnline:
                    data.isOnline === true,

                isVerified:
                    data.isVerified === true,

                isOwner:
                    String(uid) ===
                    String(
                        currentGroup.ownerId
                    )
            });

        } catch (error) {

            console.warn(
                "Could not load group member:",
                uid,
                error
            );
        }
    }


    /*
     * Owner first.
     */
    members.sort(
        (a, b) => {

            if (
                a.isOwner &&
                !b.isOwner
            ) {
                return -1;
            }

            if (
                !a.isOwner &&
                b.isOwner
            ) {
                return 1;
            }

            if (
                a.isOnline &&
                !b.isOnline
            ) {
                return -1;
            }

            if (
                !a.isOnline &&
                b.isOnline
            ) {
                return 1;
            }

            return a.displayName.localeCompare(
                b.displayName
            );
        }
    );


   return members;
}
/* =========================================================
   MEMBERS MODAL
========================================================= */

function createMembersModal() {

    if (membersModal) {
        return membersModal;
    }


    membersModal =
        document.createElement("div");

    membersModal.id =
        "connectaMembersModal";

    membersModal.className =
        "connecta-owner-modal";

    membersModal.innerHTML = `

        <div class="connecta-owner-modal-card">

            <div class="connecta-owner-modal-header">

                <div>
                    <h3>Group Members</h3>
                    <p id="membersModalCount">
                        Loading members...
                    </p>
                </div>

                <button
                    type="button"
                    id="closeMembersModal"
                    class="connecta-modal-close"
                >
                    ×
                </button>

            </div>

            <div
                id="membersModalList"
                class="connecta-members-list"
            >
                <div
                    class="connecta-members-loading"
                >
                    Loading members...
                </div>
            </div>

        </div>
    `;


    document.body.appendChild(
        membersModal
    );


    document
        .getElementById(
            "closeMembersModal"
        )
        ?.addEventListener(
            "click",
            closeMembersModal
        );


    membersModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                membersModal
            ) {

                closeMembersModal();
            }
        }
    );


    return membersModal;
}


async function openMembersModal() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can view group members."
        );

        return;
    }


    closeOwnerMenu();


    createMembersModal();


    membersModal.classList.add(
        "open"
    );


    const list =
        document.getElementById(
            "membersModalList"
        );

    const count =
        document.getElementById(
            "membersModalCount"
        );


    if (list) {

        list.innerHTML = `
            <div
                class="connecta-members-loading"
            >
                Loading members...
            </div>
        `;
    }


    isLoadingMembers = true;


    try {

        const members =
            await loadGroupMembers();


        if (count) {

            count.textContent =
                `${members.length} ${
                    members.length === 1
                        ? "member"
                        : "members"
                }`;
        }


        if (!list) {
            return;
        }


        if (!members.length) {

            list.innerHTML = `
                <div
                    class="connecta-members-empty"
                >
                    No members found.
                </div>
            `;

            return;
        }


        list.innerHTML =
            members
                .map(
                    member => `

                        <div
                            class="connecta-member-row"
                        >

                            <div
                                class="connecta-member-avatar"
                            >

                                ${
                                    member.photoURL
                                        ? `
                                            <img
                                                src="${escapeAttribute(
                                                    member.photoURL
                                                )}"
                                                alt=""
                                            >
                                        `
                                        : `
                                            ${escapeHTML(
                                                getInitials(
                                                    member.displayName
                                                )
                                            )}
                                        `
                                }

                                <span
                                    class="
                                        connecta-member-online
                                        ${
                                            member.isOnline
                                                ? "online"
                                                : ""
                                        }
                                    "
                                ></span>

                            </div>


                            <div
                                class="connecta-member-details"
                            >

                                <div
                                    class="connecta-member-name"
                                >

                                    ${escapeHTML(
                                        member.displayName
                                    )}

                                    ${
                                        member.isVerified
                                            ? `
                                                <span
                                                    class="connecta-member-verified"
                                                    title="Verified"
                                                >
                                                    ✓
                                                </span>
                                            `
                                            : ""
                                    }

                                    ${
                                        member.isOwner
                                            ? `
                                                <span
                                                    class="connecta-member-owner"
                                                >
                                                    OWNER
                                                </span>
                                            `
                                            : ""
                                    }

                                </div>


                                ${
                                    member.username
                                        ? `
                                            <div
                                                class="connecta-member-username"
                                            >
                                                @${escapeHTML(
                                                    member.username
                                                )}
                                            </div>
                                        `
                                        : ""
                                }


                                <div
                                    class="connecta-member-status"
                                >
                                    ${
                                        member.isOnline
                                            ? "Online"
                                            : "Offline"
                                    }
                                </div>

                            </div>

                        </div>
                    `
                )
                .join("");

    } catch (error) {

        console.error(
            "Load group members error:",
            error
        );


        if (list) {

            list.innerHTML = `
                <div
                    class="connecta-members-empty"
                >
                    Could not load members.
                </div>
            `;
        }

    } finally {

        isLoadingMembers = false;
    }
}


function closeMembersModal() {

    if (!membersModal) {
        return;
    }


    membersModal.classList.remove(
        "open"
    );
}

/* =========================================================
   MESSAGING PERMISSIONS
========================================================= */

function createMessagingModal() {

    if (messagingModal) {
        return messagingModal;
    }


    messagingModal =
        document.createElement("div");

    messagingModal.id =
        "connectaMessagingModal";

    messagingModal.className =
        "connecta-owner-modal";

    messagingModal.innerHTML = `

        <div
            class="connecta-owner-modal-card"
        >

            <div
                class="connecta-owner-modal-header"
            >

                <div>

                    <h3>
                        Messaging Permissions
                    </h3>

                    <p>
                        Control who can send messages
                    </p>

                </div>

                <button
                    type="button"
                    id="closeMessagingModal"
                    class="connecta-modal-close"
                >
                    ×
                </button>

            </div>


            <div
                class="connecta-messaging-options"
            >

                <label
                    class="connecta-messaging-option"
                >

                    <input
                        type="radio"
                        name="groupMessagingMode"
                        value="everyone"
                        id="messagingEveryone"
                    >

                    <span>
                        <strong>
                            Everyone can message
                        </strong>

                        <small>
                            All group members can send
                            messages and photos.
                        </small>
                    </span>

                </label>


                <label
                    class="connecta-messaging-option"
                >

                    <input
                        type="radio"
                        name="groupMessagingMode"
                        value="admin"
                        id="messagingAdminOnly"
                    >

                    <span>
                        <strong>
                            Only admin can message
                        </strong>

                        <small>
                            Only the group owner can
                            send messages and photos.
                        </small>
                    </span>

                </label>

            </div>


            <button
                type="button"
                id="saveMessagingMode"
                class="connecta-owner-save-btn"
            >
                Save
            </button>

        </div>
    `;


    document.body.appendChild(
        messagingModal
    );


    document
        .getElementById(
            "closeMessagingModal"
        )
        ?.addEventListener(
            "click",
            closeMessagingSettings
        );


    document
        .getElementById(
            "saveMessagingMode"
        )
        ?.addEventListener(
            "click",
            saveMessagingMode
        );


    messagingModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                messagingModal
            ) {

                closeMessagingSettings();
            }
        }
    );


    return messagingModal;
}


function openMessagingSettings() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can change messaging permissions."
        );

        return;
    }


    closeOwnerMenu();


    createMessagingModal();


    const everyone =
        document.getElementById(
            "messagingEveryone"
        );

    const adminOnly =
        document.getElementById(
            "messagingAdminOnly"
        );


    const adminOnlyMode =
        currentGroup?.announcementOnly === true;


    if (everyone) {
        everyone.checked =
            !adminOnlyMode;
    }


    if (adminOnly) {
        adminOnly.checked =
            adminOnlyMode;
    }


    messagingModal.classList.add(
        "open"
    );
}


function closeMessagingSettings() {

    if (!messagingModal) {
        return;
    }


    messagingModal.classList.remove(
        "open"
    );
}


async function saveMessagingMode() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can change messaging permissions."
        );

        return;
    }


    if (
        !currentGroup ||
        isUpdatingMessagingMode
    ) {
        return;
    }


    const selected =
        document.querySelector(
            'input[name="groupMessagingMode"]:checked'
        );


    if (!selected) {

        showToast(
            "Select a messaging option."
        );

        return;
    }


    const adminOnly =
        selected.value === "admin";


    isUpdatingMessagingMode = true;


    const saveButton =
        document.getElementById(
            "saveMessagingMode"
        );


    if (saveButton) {

        saveButton.disabled =
            true;

        saveButton.textContent =
            "Saving...";
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

            throw new Error(
                "This group no longer exists."
            );
        }


        const latestGroup =
            snapshot.data();


        if (
            String(
                latestGroup.ownerId || ""
            ) !==
            String(
                currentUser.uid
            )
        ) {

            throw new Error(
                "Only the group owner can change messaging permissions."
            );
        }


        /*
         * announcementOnly is the owner-controlled
         * "only admin can message" mode.
         *
         * chatLocked remains reserved for a
         * complete group chat lock.
         */
        await updateDoc(

            groupRef,

            {

                announcementOnly:
                    adminOnly,

                updatedAt:
                    serverTimestamp()
            }
        );


               currentGroup = {

                  ...currentGroup,

                   announcementOnly:
                      adminOnly,

                updatedAt:
                    new Date()
             };


        groupControl =
            getGroupControl(
                currentGroup
            );


        saveGroupCache(
            currentGroup
        );


        renderGroup();

        updateComposerState();

        updateAccessUI();


        closeMessagingSettings();


        showToast(
            adminOnly
                ? "Only the admin can now send messages."
                : "All members can now send messages."
        );

    } catch (error) {

        console.error(
            "Save messaging mode error:",
            error
        );


        showToast(
            error?.message ||
            "Could not update messaging permissions."
        );

    } finally {

        isUpdatingMessagingMode = false;


        if (saveButton) {

            saveButton.disabled =
                false;

            saveButton.textContent =
                "Save";
        }
    }
}

/* =========================================================
   OWNER MENU
========================================================= */

function toggleOwnerMenu() {

    if (
        !ownerMenu ||
        !isGroupOwner()
    ) {
        return;
    }


    ownerMenu.classList.toggle(
        "open"
    );


    ownerMenu.style.display =
        ownerMenu.classList.contains(
            "open"
        )
            ? "block"
            : "none";
}


function closeOwnerMenu() {

    if (!ownerMenu) {
        return;
    }


    ownerMenu.classList.remove(
        "open"
    );


    ownerMenu.style.display =
        "none";
}


/* =========================================================
   EDIT GROUP MODAL
========================================================= */

function openEditGroupModal() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can edit this group."
        );

        return;
    }


    if (!currentGroup) {
        return;
    }


    closeOwnerMenu();

    ownerPhotoFile = null;

    renderOwnerPhotoPreview();


    if (editGroupName) {

        editGroupName.value =
            currentGroup.name || "";
    }


    if (editGroupDescription) {

        editGroupDescription.value =
            currentGroup.description || "";
    }


    if (editGroupModal) {

        editGroupModal.classList.add(
            "open"
        );
    }
}


function closeEditGroupModal() {

    if (editGroupModal) {

        editGroupModal.classList.remove(
            "open"
        );
    }


    ownerPhotoFile = null;


    if (ownerPreviewURL) {

        URL.revokeObjectURL(
            ownerPreviewURL
        );

        ownerPreviewURL = "";
    }
}


/* =========================================================
   OWNER PHOTO PREVIEW
========================================================= */

function renderOwnerPhotoPreview() {

    if (!groupPhotoPreview) {
        return;
    }


    if (ownerPreviewURL) {

        URL.revokeObjectURL(
            ownerPreviewURL
        );

        ownerPreviewURL = "";
    }


    if (ownerPhotoFile) {

        ownerPreviewURL =
            URL.createObjectURL(
                ownerPhotoFile
            );


        groupPhotoPreview.innerHTML = `

            <img
                src="${escapeAttribute(
                    ownerPreviewURL
                )}"
                alt="New group photo"
            >

        `;


        return;
    }


    const photo =
        currentGroup?.photoURL || "";


    if (photo) {

        groupPhotoPreview.innerHTML = `

            <img
                src="${escapeAttribute(photo)}"
                alt="Group photo"
            >

        `;

    } else {

        groupPhotoPreview.textContent =
            getInitials(
                currentGroup?.name ||
                "Group"
            );
    }
}


/* =========================================================
   OWNER PHOTO PICKER
========================================================= */

function setupOwnerPhotoPicker() {

    if (!modalPhotoBtn) {
        return;
    }


    modalPhotoBtn.addEventListener(
        "click",
        () => {

            if (!isGroupOwner()) {

                showToast(
                    "Only the group owner can change the photo."
                );

                return;
            }


            photoInputMode =
                "group";


            if (photoInput) {

                photoInput.value = "";

                photoInput.click();
            }
        }
    );
}


/* =========================================================
   SAVE GROUP CHANGES
========================================================= */

async function saveGroupOwnerChanges() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can edit this group."
        );

        return;
    }


    if (
        !currentGroup ||
        isSavingGroup
    ) {
        return;
    }


    const name =
        String(
            editGroupName?.value || ""
        ).trim();


    const description =
        String(
            editGroupDescription?.value || ""
        ).trim();


    if (name.length < 3) {

        showToast(
            "Group name must be at least 3 characters."
        );

        return;
    }


    if (name.length > 80) {

        showToast(
            "Group name is too long."
        );

        return;
    }


    if (description.length > 500) {

        showToast(
            "Group description is too long."
        );

        return;
    }


    isSavingGroup = true;


    if (saveGroupChanges) {

        saveGroupChanges.disabled = true;

        saveGroupChanges.textContent =
            "Saving...";
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

            throw new Error(
                "This group no longer exists."
            );
        }


        const latestGroup =
            snapshot.data();


        if (
            latestGroup.deleted === true
        ) {

            throw new Error(
                "This group has already been removed."
            );
        }


        if (
            String(
                latestGroup.ownerId || ""
            ) !==
            String(
                currentUser.uid
            )
        ) {

            throw new Error(
                "Only the group owner can edit this group."
            );
        }


        let photoURL =
            latestGroup.photoURL || "";


        let photoStoragePath =
            latestGroup.photoStoragePath || "";


        if (ownerPhotoFile) {

            const extension =
                ownerPhotoFile.type ===
                    "image/png"

                    ? "png"

                    : ownerPhotoFile.type ===
                        "image/webp"

                        ? "webp"

                        : "jpg";


            const storagePath =
                `groupProfilePhotos/${groupId}/group-photo.${extension}`;


            const storageRef =
                ref(
                    storage,
                    storagePath
                );


            await uploadBytes(

                storageRef,

                ownerPhotoFile,

                {
                    contentType:
                        ownerPhotoFile.type
                }
            );


            photoURL =
                await getDownloadURL(
                    storageRef
                );


            if (
                photoStoragePath &&
                photoStoragePath !== storagePath
            ) {

                try {

                    await deleteObject(
                        ref(
                            storage,
                            photoStoragePath
                        )
                    );

                } catch (error) {

                    console.warn(
                        "Could not delete previous group photo:",
                        error
                    );
                }
            }


            photoStoragePath =
                storagePath;
        }


        await updateDoc(

            groupRef,

            {

                name,

                description,

                photoURL,

                photoStoragePath,

                updatedAt:
                    serverTimestamp()
            }
        );


        currentGroup = {

            ...currentGroup,

            name,
            description,
            photoURL,
            photoStoragePath
        };


        saveGroupCache(
            currentGroup
        );


        renderGroup();

        updateOwnerControls();

        closeEditGroupModal();


        showToast(
            "Group updated successfully."
        );

    } catch (error) {

        console.error(
            "Save group changes error:",
            error
        );


        showToast(
            error?.message ||
            "Could not update group."
        );

    } finally {

        isSavingGroup = false;


        if (saveGroupChanges) {

            saveGroupChanges.disabled =
                false;

            saveGroupChanges.textContent =
                "Save Changes";
        }
    }
}


/* =========================================================
   DELETE MESSAGE MODE
========================================================= */

function enterDeleteMode() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can delete group messages."
        );

        return;
    }


    closeOwnerMenu();

    selectedMessageId = "";


    if (deleteModeBar) {

        deleteModeBar.classList.add(
            "open"
        );
    }


    if (deleteModeText) {

        deleteModeText.textContent =
            "Tap a message to delete it for everyone";
    }


    bindDeleteModeRows();
}


function exitDeleteMode() {

    selectedMessageId = "";


    if (deleteModeBar) {

        deleteModeBar.classList.remove(
            "open"
        );
    }


    document
        .querySelectorAll(
            ".message-row.selected"
        )
        .forEach(
            row =>
                row.classList.remove(
                    "selected"
                )
        );
}


function bindDeleteModeRows() {

    if (!isGroupOwner()) {
        return;
    }


    document
        .querySelectorAll(
            ".message-row"
        )
        .forEach(
            row => {

                row.classList.add(
                    "selectable"
                );


                row.onclick =
                    event => {

                        if (
                            event.target?.tagName ===
                            "IMG"
                        ) {
                            return;
                        }


                        const messageId =
                            row.dataset.messageId;


                        if (!messageId) {
                            return;
                        }


                        selectedMessageId =
                            messageId;


                        document
                            .querySelectorAll(
                                ".message-row.selected"
                            )
                            .forEach(
                                item => {

                                    item.classList.remove(
                                        "selected"
                                    );
                                }
                            );


                        row.classList.add(
                            "selected"
                        );


                        if (
                            deleteMessageModal
                        ) {

                            deleteMessageModal.classList.add(
                                "open"
                            );
                        }
                    };
            }
        );
}


/* =========================================================
   REFRESH GROUP PREVIEW
========================================================= */

async function refreshGroupPreview() {

    try {

        const messagesRef =
            collection(
                db,
                GROUPS_COLLECTION,
                groupId,
                GROUP_MESSAGES_COLLECTION
            );


        const latestQuery =
            query(
                messagesRef,
                orderBy(
                    "createdAt",
                    "desc"
                ),
                limit(1)
            );


        const snapshot =
            await getDocs(
                latestQuery
            );


        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            );


        if (snapshot.empty) {

            await updateDoc(

                groupRef,

                {

                    lastMessageId: "",
                    lastMessage: "",
                    lastMessageSenderId: "",
                    lastMessageSenderName: "",
                    lastMessageAt: null,
                    updatedAt:
                        serverTimestamp()
                }
            );


            return;
        }


        const latest =
            snapshot.docs[0];


        const data =
            latest.data();


        const preview =
            data.type === "image"
                ? "📷 Photo"
                : String(
                    data.text || ""
                ).substring(
                    0,
                    200
                );


        await updateDoc(

            groupRef,

            {

                lastMessageId:
                    latest.id,

                lastMessage:
                    preview,

                lastMessageSenderId:
                    data.senderId || "",

                lastMessageSenderName:
                    data.senderName ||
                    "User",

                lastMessageAt:
                    data.createdAt ||
                    null,

                updatedAt:
                    serverTimestamp()
            }
        );

    } catch (error) {

        console.warn(
            "Could not refresh group preview:",
            error
        );
    }
}


/* =========================================================
   DELETE MESSAGE
========================================================= */

async function deleteGroupMessage() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can delete messages."
        );

        return;
    }


    if (
        !selectedMessageId ||
        isDeletingMessage
    ) {
        return;
    }


    isDeletingMessage = true;


    if (confirmDeleteMessage) {

        confirmDeleteMessage.disabled =
            true;

        confirmDeleteMessage.textContent =
            "Deleting...";
    }


    try {

        const groupRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId
            );


        const groupSnapshot =
            await getDoc(groupRef);


        if (!groupSnapshot.exists()) {

            throw new Error(
                "Group no longer exists."
            );
        }


        if (
            String(
                groupSnapshot.data().ownerId ||
                ""
            ) !==
            String(
                currentUser.uid
            )
        ) {

            throw new Error(
                "Only the group owner can delete messages."
            );
        }


        const messageRef =
            doc(
                db,
                GROUPS_COLLECTION,
                groupId,
                GROUP_MESSAGES_COLLECTION,
                selectedMessageId
            );


        const snapshot =
            await getDoc(messageRef);


        if (!snapshot.exists()) {

            throw new Error(
                "Message no longer exists."
            );
        }


        const message =
            snapshot.data();


        await deleteDoc(
            messageRef
        );


        if (message.storagePath) {

            try {

                await deleteObject(
                    ref(
                        storage,
                        message.storagePath
                    )
                );

            } catch (storageError) {

                console.warn(
                    "Could not delete message photo:",
                    storageError
                );
            }
        }


        await refreshGroupPreview();


        messages =
            messages.filter(
                item =>
                    getMessageId(item) !==
                    selectedMessageId
            );


        saveMessagesCache(
            groupId,
            messages
        );


        renderMessages();

        closeDeleteMessageModal();


        showToast(
            "Message deleted for everyone."
        );

    } catch (error) {

        console.error(
            "Delete group message error:",
            error
        );


        showToast(
            error?.message ||
            "Could not delete message."
        );

    } finally {

        isDeletingMessage = false;


        if (confirmDeleteMessage) {

            confirmDeleteMessage.disabled =
                false;

            confirmDeleteMessage.textContent =
                "Delete";
        }
    }
}


/* =========================================================
   DELETE MESSAGE MODAL
========================================================= */

function closeDeleteMessageModal() {

    if (deleteMessageModal) {

        deleteMessageModal.classList.remove(
            "open"
        );
    }


    selectedMessageId = "";


    document
        .querySelectorAll(
            ".message-row.selected"
        )
        .forEach(
            row =>
                row.classList.remove(
                    "selected"
                )
        );
}


/* =========================================================
   DELETE GROUP MODAL
========================================================= */

function openDeleteGroupModal() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can delete this group."
        );

        return;
    }


    closeOwnerMenu();


    if (deleteGroupModal) {

        deleteGroupModal.classList.add(
            "open"
        );
    }
}


function closeDeleteGroupModal() {

    if (deleteGroupModal) {

        deleteGroupModal.classList.remove(
            "open"
        );
    }
}


/* =========================================================
   DELETE SUBCOLLECTION
========================================================= */

async function deleteSubcollection(
    collectionName
) {

    const collectionRef =
        collection(
            db,
            GROUPS_COLLECTION,
            groupId,
            collectionName
        );


    while (true) {

        const snapshot =
            await getDocs(
                query(
                    collectionRef,
                    limit(450)
                )
            );


        if (snapshot.empty) {
            break;
        }


        const batch =
            writeBatch(db);


        snapshot.docs.forEach(
            item => {

                batch.delete(
                    item.ref
                );
            }
        );


        await batch.commit();


        if (snapshot.size < 450) {
            break;
        }
    }
}


/* =========================================================
   DELETE ALL GROUP MESSAGES
========================================================= */

async function deleteAllGroupMessages() {

    const messagesRef =
        collection(
            db,
            GROUPS_COLLECTION,
            groupId,
            GROUP_MESSAGES_COLLECTION
        );


    while (true) {

        const snapshot =
            await getDocs(
                query(
                    messagesRef,
                    limit(450)
                )
            );


        if (snapshot.empty) {
            break;
        }


        const batch =
            writeBatch(db);


        const storagePaths = [];


        snapshot.docs.forEach(
            messageDoc => {

                const data =
                    messageDoc.data();


                if (data.storagePath) {

                    storagePaths.push(
                        data.storagePath
                    );
                }


                batch.delete(
                    messageDoc.ref
                );
            }
        );


        await batch.commit();


        for (
            const path of storagePaths
        ) {

            try {

                await deleteObject(
                    ref(
                        storage,
                        path
                    )
                );

            } catch (error) {

                console.warn(
                    "Could not delete message photo:",
                    error
                );
            }
        }


        if (snapshot.size < 450) {
            break;
        }
    }
}


/* =========================================================
   DELETE GROUP
========================================================= */

async function deleteGroup() {

    if (!isGroupOwner()) {

        showToast(
            "Only the group owner can delete this group."
        );

        return;
    }


    if (isDeletingGroup) {
        return;
    }


    isDeletingGroup = true;


    if (confirmDeleteGroup) {

        confirmDeleteGroup.disabled =
            true;

        confirmDeleteGroup.textContent =
            "Deleting...";
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

            throw new Error(
                "This group no longer exists."
            );
        }


        const groupData =
            snapshot.data();


        if (
            String(
                groupData.ownerId || ""
            ) !==
            String(
                currentUser.uid
            )
        ) {

            throw new Error(
                "Only the group owner can delete this group."
            );
        }


        /*
         * Remove messages and supporting
         * subcollections first.
         */
        await deleteAllGroupMessages();


        await deleteSubcollection(
            GROUP_TYPING_COLLECTION
        );


        await deleteSubcollection(
            GROUP_READS_COLLECTION
        );


        if (groupData.photoStoragePath) {

            try {

                await deleteObject(
                    ref(
                        storage,
                        groupData.photoStoragePath
                    )
                );

            } catch (error) {

                console.warn(
                    "Could not delete group photo:",
                    error
                );
            }
        }


        await deleteDoc(
            groupRef
        );


        clearGroupCache(
            groupId
        );


        closeDeleteGroupModal();


        showToast(
            "Group deleted successfully."
        );


        setTimeout(
            () => {

                location.replace(
                    "groups.html"
                );

            },
            600
        );

    } catch (error) {

        console.error(
            "Delete group error:",
            error
        );


        showToast(
            error?.message ||
            "Could not delete group."
        );

    } finally {

        isDeletingGroup = false;


        if (confirmDeleteGroup) {

            confirmDeleteGroup.disabled =
                false;

            confirmDeleteGroup.textContent =
                "Delete Group";
        }
    }
}


/* =========================================================
   OWNER EVENTS
========================================================= */

function setupOwnerControls() {

   const ownerMenuBtn =
    document.getElementById(
        "ownerMenuBtn"
    );

ownerMenuBtn?.addEventListener(
    "click",
    event => {

        event.stopPropagation();

        toggleOwnerMenu();
    }
);

    editGroupBtn?.addEventListener(
        "click",
        openEditGroupModal
    );


    changeGroupPhotoBtn?.addEventListener(
        "click",
        () => {

            if (!isGroupOwner()) {

                showToast(
                    "Only the group owner can change the group photo."
                );

                return;
            }


            closeOwnerMenu();


            photoInputMode =
                "group";


            if (photoInput) {

                photoInput.value = "";

                photoInput.click();
            }
        }
    );


    deleteMessagesBtn?.addEventListener(
        "click",
        enterDeleteMode
    );


    deleteGroupBtn?.addEventListener(
        "click",
        openDeleteGroupModal
    );


    cancelEditGroup?.addEventListener(
        "click",
        closeEditGroupModal
    );


    saveGroupChanges?.addEventListener(
        "click",
        saveGroupOwnerChanges
    );


    cancelDeleteGroup?.addEventListener(
        "click",
        closeDeleteGroupModal
    );


    confirmDeleteGroup?.addEventListener(
        "click",
        deleteGroup
    );


    cancelDeleteMessage?.addEventListener(
        "click",
        closeDeleteMessageModal
    );


    confirmDeleteMessage?.addEventListener(
        "click",
        deleteGroupMessage
    );


    cancelDeleteMode?.addEventListener(
        "click",
        exitDeleteMode
    );


    editGroupModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                editGroupModal
            ) {

                closeEditGroupModal();
            }
        }
    );


    deleteGroupModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                deleteGroupModal
            ) {

                closeDeleteGroupModal();
            }
        }
    );


    deleteMessageModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                deleteMessageModal
            ) {

                closeDeleteMessageModal();
            }
        }
    );
}


/* =========================================================
   OUTSIDE MENU CLICK
========================================================= */

function setupOutsideMenu() {

    document.addEventListener(
        "click",
        event => {

            if (!ownerMenu) {
                return;
            }


            if (
                !ownerMenu.classList.contains(
                    "open"
                )
            ) {
                return;
            }


            const clickedInsideMenu =
                ownerMenu.contains(
                    event.target
                );


            if (!clickedInsideMenu) {

                closeOwnerMenu();
            }
        }
    );
}


/* =========================================================
   BACK BUTTONS
========================================================= */

function setupBackButtons() {

    backBtn?.addEventListener(
        "click",
        () => {

            location.href =
                "groups.html";
        }
    );


    backToGroupsBtn?.addEventListener(
        "click",
        () => {

            location.href =
                "groups.html";
        }
    );
}


/* =========================================================
   ESCAPE KEY
========================================================= */

function setupEscapeKey() {

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !== "Escape"
            ) {
                return;
            }


            closeOwnerMenu();
            closeGroupInfo();
            closeEditGroupModal();
            closeDeleteGroupModal();
            closeDeleteMessageModal();
            exitDeleteMode();
        }
    );
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeGroupChat() {

    try {

        const session =
            await getCurrentConnectaUser({

                redirect: true,

                allowBlocked: true
            });


        if (!session) {
            return;
        }


        currentUser =
            session.authUser;


        currentProfile =
            session.profile || {

                uid:
                    currentUser.uid,

                status:
                    "active"
            };


        accountControl =
            getAccountControl(
                currentProfile
            );


        groupControl = {

            loaded: false,

            chatLocked: true,

            messagingLocked: true,

            announcementOnly: false,

            approved: false,

            deleted: false,

            member: false,

            verifiedRequired: false,

            verified:
                currentProfile?.isVerified ===
                true,

            allowed: false
        };


        updateComposerState();
        updateAccessUI();


        groupId =
            getGroupId();


        if (!groupId) {

            showAccessError(
                "Group not found",
                "No group ID was provided."
            );

            return;
        }


        /*
         * Keep account restrictions realtime.
         */
        listenToOwnProfile();


        /*
         * Load group and realtime listeners.
         */
        await loadGroup();


        /*
         * Interface events.
         */
        setupComposer();

        setupPhotoUpload();

        setupGroupInfo();

        setupOwnerPhotoPicker();

        setupOwnerControls();

        setupBackButtons();

        setupOutsideMenu();

        setupEscapeKey();


        updateOwnerControls();
        updateComposerState();
        updateAccessUI();

    } catch (error) {

        console.error(
            "CONNECTA group chat initialization error:",
            error
        );


        showAccessError(
            "Unable to open group chat",
            error?.message ||
            "Please refresh the page and try again."
        );
    }
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

    clearTimeout(
        typingTimer
    );


    if (
        currentUser &&
        groupId
    ) {

        stopTyping();
    }


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


    if (stopTypingUsers) {

        stopTypingUsers();
        stopTypingUsers = null;
    }


    if (ownerPreviewURL) {

        URL.revokeObjectURL(
            ownerPreviewURL
        );

        ownerPreviewURL = "";
    }


        /*
     * Remove dynamically created owner modals.
     */
    if (membersModal) {

        membersModal.remove();

        membersModal = null;
    }


    if (messagingModal) {

        messagingModal.remove();

        messagingModal = null;
    }


    ownerPhotoFile = null;
}


window.addEventListener(
    "beforeunload",
    cleanup
);


/* =========================================================
   START
========================================================= */

initializeGroupChat();
