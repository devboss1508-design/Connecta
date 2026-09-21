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
   - GROUP OWNER CONTROLS
     • Edit group name
     • Edit description
     • Change group photo
     • Delete messages for everyone
     • Delete group
   - Group read state / unread support
   - Global CONNECTA authentication
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

const GROUPS_COLLECTION =
    "groups";

const GROUP_MESSAGES_COLLECTION =
    "groupMessages";

const GROUP_READS_COLLECTION =
    "reads";

const GROUP_TYPING_COLLECTION =
    "typing";

const MAX_MESSAGES =
    100;

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

let messages = [];

let isSending = false;
let isUploadingPhoto = false;
let isSavingGroup = false;
let isDeletingMessage = false;
let isDeletingGroup = false;

let typingTimer = null;

let selectedMessageId = "";

let ownerPhotoFile = null;

let photoInputMode =
    "message";

let accountControl = {

    loaded: false,

    blocked: true,

    messagingRestricted: true,

    groupParticipationRestricted: true,

    reason:
        "checking"
};

let groupControl = {

    loaded: false,

    chatLocked: true,

    approved: false,

    member: false,

    allowed: false
};


/* =========================================================
   DOM
========================================================= */

const backBtn =
    document.getElementById(
        "backBtn"
    );

const groupAvatar =
    document.getElementById(
        "groupAvatar"
    );

const groupName =
    document.getElementById(
        "groupName"
    );

const groupStatus =
    document.getElementById(
        "groupStatus"
    );

const messagesArea =
    document.getElementById(
        "messagesArea"
    );

const messagesInner =
    document.getElementById(
        "messagesContainer"
    );

const chatLoading =
    document.getElementById(
        "chatLoading"
    );

const messageInput =
    document.getElementById(
        "messageInput"
    );

const sendBtn =
    document.getElementById(
        "sendBtn"
    );

const emojiBtn =
    document.getElementById(
        "emojiBtn"
    );

const infoBtn =
    document.getElementById(
        "infoBtn"
    );

const accessBlock =
    document.getElementById(
        "accessBlock"
    );

const accessTitle =
    document.getElementById(
        "accessTitle"
    );

const accessMessage =
    document.getElementById(
        "accessMessage"
    );

const backToGroupsBtn =
    document.getElementById(
        "backToGroupsBtn"
    );

const groupInfoOverlay =
    document.getElementById(
        "groupInfoSheet"
    );

const closeInfoBtn =
    document.getElementById(
        "closeGroupInfo"
    );

const toast =
    document.getElementById(
        "toast"
    );


/* =========================================================
   OWNER DOM
========================================================= */

const ownerMenu =
    document.getElementById(
        "ownerMenu"
    );

const editGroupBtn =
    document.getElementById(
        "editGroupBtn"
    );

const changeGroupPhotoBtn =
    document.getElementById(
        "changeGroupPhotoBtn"
    );

const deleteMessagesBtn =
    document.getElementById(
        "deleteMessagesBtn"
    );

const deleteGroupBtn =
    document.getElementById(
        "deleteGroupBtn"
    );

const editGroupModal =
    document.getElementById(
        "editGroupModal"
    );

const editGroupName =
    document.getElementById(
        "editGroupName"
    );

const editGroupDescription =
    document.getElementById(
        "editGroupDescription"
    );

const groupPhotoPreview =
    document.getElementById(
        "groupPhotoPreview"
    );

const modalPhotoBtn =
    document.getElementById(
        "modalPhotoBtn"
    );

const cancelEditGroup =
    document.getElementById(
        "cancelEditGroup"
    );

const saveGroupChanges =
    document.getElementById(
        "saveGroupChanges"
    );

const deleteGroupModal =
    document.getElementById(
        "deleteGroupModal"
    );

const cancelDeleteGroup =
    document.getElementById(
        "cancelDeleteGroup"
    );

const confirmDeleteGroup =
    document.getElementById(
        "confirmDeleteGroup"
    );

const deleteMessageModal =
    document.getElementById(
        "deleteMessageModal"
    );

const cancelDeleteMessage =
    document.getElementById(
        "cancelDeleteMessage"
    );

const confirmDeleteMessage =
    document.getElementById(
        "confirmDeleteMessage"
    );

const deleteModeBar =
    document.getElementById(
        "deleteModeBar"
    );

const deleteModeText =
    document.getElementById(
        "deleteModeText"
    );

const cancelDeleteMode =
    document.getElementById(
        "cancelDeleteMode"
    );


/* =========================================================
   PHOTO DOM
========================================================= */

const photoBtn =
    document.getElementById(
        "photoBtn"
    );

const photoInput =
    document.getElementById(
        "photoInput"
    );


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

function groupCacheKey(
    id
) {

    return `${GROUP_CACHE_PREFIX}${id}`;
}


function messagesCacheKey(
    id
) {

    return `${GROUP_MESSAGES_CACHE_PREFIX}${id}`;
}


function saveGroupCache(
    group
) {

    if (
        !group?.groupId
    ) {
        return;
    }

    try {

        localStorage.setItem(
            groupCacheKey(
                group.groupId
            ),
            JSON.stringify(
                group
            )
        );

    } catch (error) {

        console.warn(
            "Could not save group cache:",
            error
        );
    }
}


function loadGroupCache(
    id
) {

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


function loadMessagesCache(
    id
) {

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


function clearGroupCache(
    id
) {

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

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


function getInitials(
    name
) {

    const parts =
        String(
            name || "User"
        )
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
        parts[
            parts.length - 1
        ][0]
    ).toUpperCase();
}


function formatTime(
    value
) {

    if (!value) {
        return "";
    }

    let date = null;

    if (
        typeof value.toDate ===
        "function"
    ) {

        date =
            value.toDate();

    } else if (
        typeof value.seconds ===
        "number"
    ) {

        date =
            new Date(
                value.seconds * 1000
            );

    } else if (
        typeof value._seconds ===
        "number"
    ) {

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


function showToast(
    message
) {

    if (!toast) {

        console.log(
            message
        );

        return;
    }

    toast.textContent =
        String(
            message || ""
        );

    toast.classList.add(
        "show"
    );

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


function getMessageId(
    message
) {

    return String(
        message?.id ||
        message?.messageId ||
        ""
    );
}


/* =========================================================
   LOADING
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

function getAccountControl(
    profile
) {

    if (!profile) {

        return {

            loaded: true,

            blocked: true,

            messagingRestricted: true,

            groupParticipationRestricted:
                true,

            reason:
                "profile_missing"
        };
    }

    const status =
        String(
            profile.status ||
            "active"
        )
            .trim()
            .toLowerCase();

    const messagingRestricted =
        profile.groupMessagingRestricted ===
        true;

    const groupParticipationRestricted =
        profile.groupParticipationRestricted ===
        true;


    if (
        status === "banned"
    ) {

        return {

            loaded: true,

            blocked: true,

            messagingRestricted: true,

            groupParticipationRestricted:
                true,

            reason:
                "banned"
        };
    }


    if (
        status === "suspended"
    ) {

        return {

            loaded: true,

            blocked: true,

            messagingRestricted: true,

            groupParticipationRestricted:
                true,

            reason:
                "suspended"
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
            currentGroup.ownerId ||
            ""
        ) ===
        String(
            currentUser.uid
        )
    );
}


/* =========================================================
   MEMBERSHIP
========================================================= */

function isUserGroupMember(
    group
) {

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
            group.ownerId ||
            ""
        ) ===
        String(uid)
    ) {

        return true;
    }


    const members =
        Array.isArray(
            group.members
        )
            ? group.members
            : [];


    const memberIds =
        Array.isArray(
            group.memberIds
        )
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

function getGroupControl(
    group
) {

    if (!group) {

        return {

            loaded: true,

            chatLocked: true,

            approved: false,

            member: false,

            allowed: false
        };
    }


    const status =
        String(
            group.status ||
            ""
        )
            .trim()
            .toLowerCase();


    const member =
        isUserGroupMember(
            group
        );


    return {

        loaded: true,

        chatLocked:
            group.chatLocked === true,

        approved:
            status === "approved",

        member,

        allowed:
            status === "approved" &&
            member
    };
}


/* =========================================================
   ACCESS UI
========================================================= */

function updateAccessUI() {

    if (!accessBlock) {
        return;
    }


    let show =
        false;

    let title =
        "";

    let message =
        "";


    if (
        !accountControl.loaded
    ) {

        show = true;

        title =
            "Checking permissions";

        message =
            "Checking your CONNECTA account permissions...";

    } else if (
        accountControl.blocked
    ) {

        show = true;

        if (
            accountControl.reason ===
            "banned"
        ) {

            title =
                "Account Banned";

        } else {

            title =
                "Account Suspended";
        }

        message =
            "Your account cannot participate in group conversations.";

    } else if (
        accountControl.groupParticipationRestricted
    ) {

        show = true;

        title =
            "Participation Restricted";

        message =
            "Your account is currently restricted from participating in groups.";

    } else if (
        !groupControl.loaded
    ) {

        show = true;

        title =
            "Checking group";

        message =
            "Checking group access...";

    } else if (
        !groupControl.approved
    ) {

        show = true;

        title =
            "Group Unavailable";

        message =
            "This group is not currently available for conversation.";

    } else if (
        !groupControl.member
    ) {

        show = true;

        title =
            "Group Membership Required";

        message =
            "Join this group to participate in the conversation.";

    } else if (
        groupControl.chatLocked
    ) {

        show = true;

        title =
            "Chat Locked";

        message =
            "An administrator has temporarily locked this group chat.";
    }


    if (accessTitle) {

        accessTitle.textContent =
            title;
    }


    if (accessMessage) {

        accessMessage.textContent =
            message;
    }


    accessBlock.style.display =
        show
            ? ""
            : "none";
}


/* =========================================================
   CAN SEND
========================================================= */

function canSendMessages() {

    if (
        !accountControl.loaded
    ) {

        return false;
    }


    if (
        !groupControl.loaded
    ) {

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
                !accountControl.loaded
            ) {

                messageInput.placeholder =
                    "Checking permissions...";

            } else if (
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
                !groupControl.approved
            ) {

                messageInput.placeholder =
                    "This group is unavailable";

            } else if (
                !groupControl.member
            ) {

                messageInput.placeholder =
                    "Join this group to participate";

            } else if (
                groupControl.chatLocked
            ) {

                messageInput.placeholder =
                    "Group chat is locked by an admin";

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


    if (emojiBtn) {

        emojiBtn.disabled =
            blocked;
    }
}


/* =========================================================
   PROFILE LISTENER
========================================================= */

function listenToOwnProfile() {

    if (!currentUser) {
        return;
    }


    if (
        stopOwnProfile
    ) {

        stopOwnProfile();

        stopOwnProfile =
            null;
    }


    accountControl = {

        loaded: false,

        blocked: true,

        messagingRestricted: true,

        groupParticipationRestricted:
            true,

        reason:
            "checking"
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
                    updateAccessUI();

                    stopTyping();

                    return;
                }


                currentProfile = {

                    uid:
                        currentUser.uid,

                    ...snapshot.data()
                };


                accountControl =
                    getAccountControl(
                        currentProfile
                    );


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

        updateOwnerControls();

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

        updateOwnerControls();

        updateAccessUI();


        setupGroupListener();

        setupMessageListener();


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
   GROUP LISTENER
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

            snapshot => {

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


                    updateOwnerControls();

                    updateComposerState();

                    updateAccessUI();


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

                updateOwnerControls();

                updateComposerState();

                updateAccessUI();
            },

            error => {

                console.error(
                    "Group listener error:",
                    error
                );


                /*
                 * Fail closed if group control
                 * cannot be verified.
                 */

                groupControl = {

                    loaded: true,

                    chatLocked: true,

                    approved: false,

                    member: false,

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

        groupName.textContent =
            name;
    }


    if (groupStatus) {

        if (
            currentGroup.chatLocked ===
            true
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

            groupAvatar.textContent =
                getInitials(
                    name
                );
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

            infoAvatar.textContent =
                getInitials(
                    name
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

        const memberCount =
            Number(
                currentGroup.memberCount ||
                (
                    Array.isArray(
                        currentGroup.members
                    )
                        ? currentGroup.members.length
                        : 0
                )
            );


        infoMembers.textContent =
            String(
                memberCount
            );
    }


    if (infoSubscription) {

        if (
            currentGroup.subscriptionEnabled ===
            true
        ) {

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
   CACHED MESSAGES
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

            snapshot => {

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


                /*
                 * Mark the currently loaded
                 * conversation as read.
                 */
                markGroupRead();
            },

            error => {

                console.error(
                    "Message listener error:",
                    error
                );


                loadCachedMessages();

                hideLoading();


                if (
                    !messages.length
                ) {

                    showAccessError(
                        "Messages unavailable",
                        "The group loaded, but its messages could not be retrieved."
                    );
                }
            }
        );
}


/* =========================================================
   MARK GROUP READ
========================================================= */

async function markGroupRead() {

    if (
        !currentUser ||
        !groupId
    ) {
        return;
    }


    /*
     * Only mark read if the current user is
     * actually a member.
     */

    if (
        !groupControl.member
    ) {
        return;
    }


    const latestMessage =
        messages.length
            ? messages[
                messages.length - 1
              ]
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

function renderMessage(
    message
) {

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
        message.senderVerified ===
        true

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


    if (
        messageType === "image" ||
        messageType === "photo"
    ) {

        const imageURL =
            message.imageURL ||
            message.photoURL ||
            "";


        body = imageURL

            ? `
                <div class="message-image-wrap">

                    <img
                        src="${escapeHTML(imageURL)}"
                        alt="Group photo"
                        class="message-image"
                        loading="lazy"
                    >

                </div>
            `

            : `
                <p class="message-text">
                    Photo unavailable
                </p>
            `;

    } else {

        body = `
            <p class="message-text">
                ${escapeHTML(
                    message.text || ""
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
            data-message-id="${escapeHTML(
                getMessageId(
                    message
                )
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

    if (
        !canSendMessages()
    ) {

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


    isSending =
        true;


    try {

        /*
         * Re-check the current Firestore
         * documents immediately before writing.
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

            throw new Error(
                "This group no longer exists."
            );
        }


        if (
            !profileSnapshot.exists()
        ) {

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

            messageId,

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
   SEND PHOTO
========================================================= */

async function sendPhotoMessage(
    file
) {

    if (
        !canSendMessages()
    ) {

        showBlockedMessage();

        return;
    }


    if (
        isUploadingPhoto
    ) {
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


    if (
        file.size >
        MAX_PHOTO_SIZE
    ) {

        showToast(
            "Photo must be 5MB or smaller."
        );

        return;
    }


    isUploadingPhoto =
        true;


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


        if (
            !groupSnapshot.exists()
        ) {

            throw new Error(
                "This group no longer exists."
            );
        }


        if (
            !profileSnapshot.exists()
        ) {

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

                text:
                    "",

                type:
                    "image",

                imageURL,

                storagePath,

                fileName:
                    file.name ||
                    "",

                mimeType:
                    file.type ||
                    "",

                fileSize:
                    file.size ||
                    0,

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

        isUploadingPhoto =
            false;

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
        !accountControl.loaded
    ) {

        showToast(
            "Checking your CONNECTA permissions..."
        );

    } else if (
        accountControl.blocked
    ) {

        if (
            accountControl.reason ===
            "banned"
        ) {

            showToast(
                "Your account is banned and cannot participate in group conversations."
            );

        } else {

            showToast(
                "Your account is suspended and cannot participate in group conversations."
            );
        }

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

            if (
                canSendMessages()
            ) {

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
                event.key ===
                "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendTextMessage();
            }
        }
    );


    const form =
        document.getElementById(
            "messageForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            event => {

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

            if (
                !canSendMessages()
            ) {

                showBlockedMessage();

                return;
            }


            if (
                isUploadingPhoto
            ) {
                return;
            }


            photoInputMode =
                "message";


            photoInput.value =
                "";


            photoInput.click();
        }
    );


    photoInput.addEventListener(
        "change",
        async () => {

            const file =
                photoInput.files?.[0];


            photoInput.value =
                "";


            if (!file) {
                return;
            }


            if (
                photoInputMode ===
                "group"
            ) {

                handleOwnerPhotoFile(
                    file
                );


                photoInputMode =
                    "message";


                return;
            }


            await sendPhotoMessage(
                file
            );
        }
    );
}


/* =========================================================
   OWNER PHOTO FILE
========================================================= */

function handleOwnerPhotoFile(
    file
) {

    if (
        !isGroupOwner()
    ) {

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


    if (
        file.size >
        MAX_PHOTO_SIZE
    ) {

        showToast(
            "Group photo must be 5MB or smaller."
        );

        return;
    }


    ownerPhotoFile =
        file;


    renderOwnerPhotoPreview();
}


/* =========================================================
   GROUP INFO
========================================================= */

function openGroupInfo() {

    if (
        !groupInfoOverlay
    ) {
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

    if (
        !groupInfoOverlay
    ) {
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


                if (
                    isGroupOwner()
                ) {

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

        ownerMenu.style.display =
            owner
                ? "none"
                : "none";

        ownerMenu.classList.remove(
            "open"
        );
    }


    /*
     * Owner controls are only available to
     * the actual current group owner.
     */

    if (editGroupBtn) {

        editGroupBtn.disabled =
            !owner;
    }


    if (changeGroupPhotoBtn) {

        changeGroupPhotoBtn.disabled =
            !owner;
    }


    if (deleteMessagesBtn) {

        deleteMessagesBtn.disabled =
            !owner;
    }


    if (deleteGroupBtn) {

        deleteGroupBtn.disabled =
            !owner;
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

    if (
        !isGroupOwner()
    ) {

        showToast(
            "Only the group owner can edit this group."
        );

        return;
    }


    if (!currentGroup) {
        return;
    }


    closeOwnerMenu();


    ownerPhotoFile =
        null;


    if (editGroupName) {

        editGroupName.value =
            currentGroup.name ||
            "";
    }


    if (editGroupDescription) {

        editGroupDescription.value =
            currentGroup.description ||
            "";
    }


    renderOwnerPhotoPreview();


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


    ownerPhotoFile =
        null;
}


/* =========================================================
   OWNER PHOTO PREVIEW
========================================================= */

function renderOwnerPhotoPreview() {

    if (
        !groupPhotoPreview
    ) {
        return;
    }


    if (
        ownerPhotoFile
    ) {

        const previewURL =
            URL.createObjectURL(
                ownerPhotoFile
            );


        groupPhotoPreview.innerHTML = `

            <img
                src="${escapeHTML(
                    previewURL
                )}"
                alt="New group photo"
            >

        `;


        return;
    }


    const photo =
        currentGroup?.photoURL ||
        "";


    if (photo) {

        groupPhotoPreview.innerHTML = `

            <img
                src="${escapeHTML(
                    photo
                )}"
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

            if (
                !isGroupOwner()
            ) {

                showToast(
                    "Only the group owner can change the photo."
                );

                return;
            }


            photoInputMode =
                "group";


            if (photoInput) {

                photoInput.value =
                    "";

                photoInput.click();
            }
        }
    );
}


/* =========================================================
   SAVE GROUP CHANGES
========================================================= */

async function saveGroupOwnerChanges() {

    if (
        !isGroupOwner()
    ) {

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
            editGroupName?.value ||
            ""
        ).trim();


    const description =
        String(
            editGroupDescription?.value ||
            ""
        ).trim();


    if (
        name.length < 3
    ) {

        showToast(
            "Group name must be at least 3 characters."
        );

        return;
    }


    if (
        name.length > 80
    ) {

        showToast(
            "Group name is too long."
        );

        return;
    }


    if (
        description.length > 500
    ) {

        showToast(
            "Group description is too long."
        );

        return;
    }


    isSavingGroup =
        true;


    if (saveGroupChanges) {

        saveGroupChanges.disabled =
            true;

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


        /*
         * Re-check ownership.
         */

        const snapshot =
            await getDoc(
                groupRef
            );


        if (
            !snapshot.exists()
        ) {

            throw new Error(
                "This group no longer exists."
            );
        }


        const latestGroup =
            snapshot.data();


        if (
            String(
                latestGroup.ownerId ||
                ""
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
            latestGroup.photoURL ||
            "";


        let photoStoragePath =
            latestGroup.photoStoragePath ||
            "";


        if (
            ownerPhotoFile
        ) {

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

        isSavingGroup =
            false;


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

    if (
        !isGroupOwner()
    ) {

        showToast(
            "Only the group owner can delete group messages."
        );

        return;
    }


    closeOwnerMenu();


    selectedMessageId =
        "";


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

    selectedMessageId =
        "";


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

    if (
        !isGroupOwner()
    ) {
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


        if (
            snapshot.empty
        ) {

            await updateDoc(

                groupRef,

                {

                    lastMessageId:
                        "",

                    lastMessage:
                        "",

                    lastMessageSenderId:
                        "",

                    lastMessageSenderName:
                        "",

                    lastMessageAt:
                        null,

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
                    data.text ||
                    ""
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
                    data.senderId ||
                    "",

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

    if (
        !isGroupOwner()
    ) {

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


    isDeletingMessage =
        true;


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
            await getDoc(
                groupRef
            );


        if (
            !groupSnapshot.exists()
        ) {

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
            await getDoc(
                messageRef
            );


        if (
            !snapshot.exists()
        ) {

            throw new Error(
                "Message no longer exists."
            );
        }


        const message =
            snapshot.data();


        await deleteDoc(
            messageRef
        );


        if (
            message.storagePath
        ) {

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
                    getMessageId(
                        item
                    ) !==
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

        isDeletingMessage =
            false;


        if (
            confirmDeleteMessage
        ) {

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

    if (
        deleteMessageModal
    ) {

        deleteMessageModal.classList.remove(
            "open"
        );
    }


    selectedMessageId =
        "";


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

    if (
        !isGroupOwner()
    ) {

        showToast(
            "Only the group owner can delete this group."
        );

        return;
    }


    closeOwnerMenu();


    if (
        deleteGroupModal
    ) {

        deleteGroupModal.classList.add(
            "open"
        );
    }
}


function closeDeleteGroupModal() {

    if (
        deleteGroupModal
    ) {

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


        if (
            snapshot.empty
        ) {

            break;
        }


        const batch =
            writeBatch(
                db
            );


        snapshot.docs.forEach(
            item => {

                batch.delete(
                    item.ref
                );
            }
        );


        await batch.commit();


        if (
            snapshot.size < 450
        ) {

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


        if (
            snapshot.empty
        ) {

            break;
        }


        const batch =
            writeBatch(
                db
            );


        const storagePaths =
            [];


        snapshot.docs.forEach(
            messageDoc => {

                const data =
                    messageDoc.data();


                if (
                    data.storagePath
                ) {

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
            const path
            of storagePaths
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


        if (
            snapshot.size < 450
        ) {

            break;
        }
    }
}


/* =========================================================
   DELETE GROUP
========================================================= */

async function deleteGroup() {

    if (
        !isGroupOwner()
    ) {

        showToast(
            "Only the group owner can delete this group."
        );

        return;
    }


    if (
        isDeletingGroup
    ) {
        return;
    }


    isDeletingGroup =
        true;


    if (
        confirmDeleteGroup
    ) {

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
            await getDoc(
                groupRef
            );


        if (
            !snapshot.exists()
        ) {

            throw new Error(
                "This group no longer exists."
            );
        }


        const groupData =
            snapshot.data();


        if (
            String(
                groupData.ownerId ||
                ""
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
         * Delete group messages.
         */
        await deleteAllGroupMessages();


        /*
         * Delete typing documents.
         */
        await deleteSubcollection(
            GROUP_TYPING_COLLECTION
        );


        /*
         * Delete read-state documents.
         */
        await deleteSubcollection(
            GROUP_READS_COLLECTION
        );


        /*
         * Delete group profile photo.
         */
        if (
            groupData.photoStoragePath
        ) {

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


        /*
         * Delete the group itself.
         */
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

        isDeletingGroup =
            false;


        if (
            confirmDeleteGroup
        ) {

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

    editGroupBtn?.addEventListener(
        "click",
        openEditGroupModal
    );


    changeGroupPhotoBtn?.addEventListener(
        "click",
        () => {

            if (
                !isGroupOwner()
            ) {

                showToast(
                    "Only the group owner can change the group photo."
                );

                return;
            }


            closeOwnerMenu();


            photoInputMode =
                "group";


            if (photoInput) {

                photoInput.value =
                    "";

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
   INITIALIZATION
========================================================= */

async function initializeGroupChat() {

    /*
     * Centralized authentication.
     *
     * allowBlocked:true is intentional:
     * the page must stay alive so admin restrictions
     * can be applied/reversed in realtime.
     */

    const session =
        await getCurrentConnectaUser({

            redirect:
                true,

            allowBlocked:
                true
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


    /*
     * Initial account-control state.
     */

    accountControl =
        getAccountControl(
            currentProfile
        );


    /*
     * Fail-closed until the group has been
     * loaded and verified.
     */

    groupControl = {

        loaded: false,

        chatLocked: true,

        approved: false,

        member: false,

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
     * Live admin account controls.
     */
    listenToOwnProfile();


    /*
     * Load the group and messages.
     */
    await loadGroup();


    /*
     * UI/event setup.
     */
    setupComposer();

    setupEmoji();

    setupPhotoUpload();

    setupGroupInfo();

    setupOwnerPhotoPicker();

    setupOwnerControls();

    setupBackButtons();


    updateOwnerControls();

    updateComposerState();

    updateAccessUI();
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

    clearTimeout(
        typingTimer
    );


    if (
        stopGroup
    ) {

        stopGroup();

        stopGroup =
            null;
    }


    if (
        stopMessages
    ) {

        stopMessages();

        stopMessages =
            null;
    }


    if (
        stopOwnProfile
    ) {

        stopOwnProfile();

        stopOwnProfile =
            null;
    }


    ownerPhotoFile =
        null;
}


window.addEventListener(
    "beforeunload",
    cleanup
);


/* =========================================================
   START
========================================================= */

initializeGroupChat();
