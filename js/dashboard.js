/* =========================================================
   CONNECTA DASHBOARD ENGINE
   File: frontend/js/dashboard.js

   Compatible with:
   - dashboard.html
   - dashboard.css
   - chat.js
   - group-chat.js
   - globalAuth.js
   - firebase.js

   FEATURES
   - Instant cache-first dashboard
   - Skeleton/shimmer instead of Loading text
   - Live users
   - Online/offline status
   - Live private chats
   - Live groups
   - Group membership via memberIds OR members
   - Group unread counts
   - Unified Recent Chats
   - Private-chat unread counts
   - Verified badges
   - Follow system
   - Profile cache
   - Dashboard cache
   - Presence heartbeat
   - Account restriction protection
   - Correct HTML/CSS IDs and classes
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
    db
} from "./firebase.js";


/* =========================================================
   GLOBAL AUTH
========================================================= */

import {
    getCurrentConnectaUser,
    logout
} from "./globalAuth.js";


/* =========================================================
   FIRESTORE
========================================================= */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    orderBy,
    limit,
    where,
    runTransaction,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


/* =========================================================
   DOM HELPER
========================================================= */

const $ = id =>
    document.getElementById(id);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentProfile = null;

let onlineUsers = [];

let recentChats = [];

let recentGroups = [];


/*
 * Group listener state.
 */

let groupListeners = {

    memberIds: [],
    members: [],
    owned: [],
    unsubscribers: []

};


let stopUsers = null;

let stopChats = null;

let presenceInterval = null;

let groupProcessTimer = null;

let groupProcessVersion = 0;


/* =========================================================
   CACHE
========================================================= */

const DASHBOARD_CACHE_PREFIX =
    "connectaDashboardCache_v2_";

const PROFILE_CACHE_KEY =
    "connectaProfileCache";


/* =========================================================
   INSTANT DASHBOARD STYLES
========================================================= */

function installInstantDashboardStyles() {

    if (
        $("connectaDashboardInstantStyles")
    ) {

        return;

    }


    const style =
        document.createElement("style");


    style.id =
        "connectaDashboardInstantStyles";


    style.textContent = `

        @keyframes connectaShimmer {

            0% {
                background-position:
                    -500px 0;
            }

            100% {
                background-position:
                    500px 0;
            }

        }


        .connecta-dashboard-skeleton {

            background:
                linear-gradient(
                    90deg,
                    #e9efeb 25%,
                    #f8faf8 50%,
                    #e9efeb 75%
                );

            background-size:
                1000px 100%;

            animation:
                connectaShimmer
                1.25s infinite linear;

            border-radius:
                14px;

        }


        .connecta-dashboard-skeleton-row {

            display:
                flex;

            gap:
                11px;

            width:
                100%;

            overflow:
                hidden;

        }


        .connecta-dashboard-skeleton-user {

            flex:
                0 0 122px;

            height:
                150px;

            border-radius:
                18px;

        }


        .connecta-dashboard-skeleton-chat {

            width:
                100%;

            height:
                66px;

            margin-bottom:
                9px;

            border-radius:
                15px;

        }


        .connecta-dashboard-empty {

            width:
                100%;

            min-height:
                100px;

            display:
                grid;

            place-items:
                center;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

            padding:
                20px;

        }


        .connecta-dashboard-error {

            width:
                100%;

            padding:
                18px;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

        }


        .connecta-dashboard-unread {

            min-width:
                21px;

            height:
                21px;

            padding:
                0 5px;

            display:
                grid;

            place-items:
                center;

            border-radius:
                999px;

            background:
                #22c55e;

            color:
                #fff;

            font-size:
                9px;

            font-weight:
                800;

        }


        .verified-badge {

            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            width:
                16px;

            height:
                16px;

            margin-left:
                3px;

            border-radius:
                50%;

            background:
                #22c55e;

            color:
                #fff;

            font-size:
                10px;

            font-weight:
                900;

            vertical-align:
                middle;

        }


        .chat-list-item .avatar {

            position:
                relative;

        }


        .chat-list-item.group-chat .avatar {

            background:
                #dcfce7;

            color:
                #15803d;

        }


        .chat-list-item {

            cursor:
                pointer;

        }


        .chat-list-item.unread {

            background:
                #f7fff8;

        }


        .chat-list-preview {

            min-width:
                0;

        }


        .chat-list-preview
        .verified-badge {

            width:
                14px;

            height:
                14px;

            font-size:
                8px;

        }


        .user-card {

            cursor:
                pointer;

        }


        .user-card button {

            position:
                relative;

            z-index:
                2;

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   DASHBOARD SKELETON
========================================================= */

function showDashboardSkeleton() {

    const onlineBox =
        $("onlineUsers");


    const chatBox =
        $("chatList");


    /*
     * Online users.
     *
     * Replace the HTML "Loading online users..."
     * placeholder immediately.
     */

    if (onlineBox) {

        const loadingPlaceholder =
            onlineBox.querySelector(
                ".empty-state"
            );


        if (
            loadingPlaceholder
        ) {

            loadingPlaceholder.remove();

        }


        if (
            !onlineBox.children.length
        ) {

            onlineBox.innerHTML = `

                <div
                    class="
                        connecta-dashboard-skeleton-row
                    "
                    aria-hidden="true"
                >

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                </div>

            `;

        }


        onlineBox.setAttribute(
            "aria-busy",
            "true"
        );

    }


    /*
     * Chats.
     */

    if (chatBox) {

        const loadingPlaceholder =
            chatBox.querySelector(
                ".empty-state"
            );


        if (
            loadingPlaceholder
        ) {

            loadingPlaceholder.remove();

        }


        if (
            !chatBox.children.length
        ) {

            chatBox.innerHTML = `

                <div aria-hidden="true">

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                </div>

            `;

        }


        chatBox.setAttribute(
            "aria-busy",
            "true"
        );

    }

}


/* =========================================================
   HIDE SKELETON
========================================================= */

function hideOnlineSkeleton() {

    const box =
        $("onlineUsers");


    box?.setAttribute(
        "aria-busy",
        "false"
    );

}


function hideChatSkeleton() {

    const box =
        $("chatList");


    box?.setAttribute(
        "aria-busy",
        "false"
    );

}


/* =========================================================
   SAFE PUBLIC PROFILE
========================================================= */

function publicProfileData(
    user = {}
) {

    return {

        uid:
            user.uid || "",

        firstName:
            user.firstName || "",

        lastName:
            user.lastName || "",

        displayName:
            user.displayName || "",

        username:
            user.username || "",

        photoURL:
            user.photoURL ||
            user.photoUrl ||
            "",

        bio:
            user.bio || "",

        isOnline:
            user.isOnline === true,

        isVerified:
            user.isVerified === true,

        followersCount:
            Number(
                user.followersCount || 0
            ),

        followingCount:
            Number(
                user.followingCount || 0
            ),

        lastSeen:
            user.lastSeen || null

    };

}


/* =========================================================
   CACHE KEY
========================================================= */

function getDashboardCacheKey(
    uid
) {

    return (
        `${DASHBOARD_CACHE_PREFIX}${uid}`
    );

}


/* =========================================================
   SAVE DASHBOARD CACHE
========================================================= */

function saveDashboardCache() {

    if (
        !currentUser
    ) {

        return;

    }


    try {

        const safeProfile =
            currentProfile

                ? {

                    ...publicProfileData(
                        currentProfile
                    ),

                    following:
                        Array.isArray(
                            currentProfile.following
                        )
                            ? [
                                ...currentProfile.following
                            ]
                            : [],

                    balance:
                        Number(
                            currentProfile.balance ||
                            0
                        ),

                    status:
                        currentProfile.status ||
                        "active"

                }

                : null;


        const safeGroups =
            recentGroups.map(
                group => {

                    const {
                        readData,
                        ...safeGroup
                    } = group;


                    return safeGroup;

                }
            );


        const payload = {

            profile:
                safeProfile,

            users:
                onlineUsers.map(
                    publicProfileData
                ),

            chats:
                recentChats,

            groups:
                safeGroups,

            cachedAt:
                Date.now()

        };


        localStorage.setItem(

            getDashboardCacheKey(
                currentUser.uid
            ),

            JSON.stringify(
                payload
            )

        );


    } catch (error) {

        console.warn(
            "[CONNECTA] Dashboard cache save failed:",
            error
        );

    }

}


/* =========================================================
   LOAD DASHBOARD CACHE
========================================================= */

function loadDashboardCache() {

    if (
        !currentUser
    ) {

        return false;

    }


    try {

        const raw =
            localStorage.getItem(

                getDashboardCacheKey(
                    currentUser.uid
                )

            );


        if (!raw) {

            return false;

        }


        const cache =
            JSON.parse(raw);


        if (!cache) {

            return false;

        }


        /*
         * PROFILE
         */

        if (
            cache.profile
        ) {

            currentProfile = {

                ...cache.profile,

                ...currentProfile

            };


            renderProfile();

        }


        /*
         * USERS
         */

        if (
            Array.isArray(
                cache.users
            )
        ) {

            onlineUsers =
                cache.users;


            renderOnline();

        }


        /*
         * PRIVATE CHATS
         */

        if (
            Array.isArray(
                cache.chats
            )
        ) {

            recentChats =
                cache.chats;

        }


        /*
         * GROUPS
         */

        if (
            Array.isArray(
                cache.groups
            )
        ) {

            recentGroups =
                cache.groups;

        }


        /*
         * UNIFIED RECENT CHATS
         */

        if (
            recentChats.length ||
            recentGroups.length
        ) {

            mergeRecentChats();

        }


        return true;


    } catch (error) {

        console.warn(
            "[CONNECTA] Dashboard cache load failed:",
            error
        );


        return false;

    }

}


/* =========================================================
   PROFILE CACHE
========================================================= */

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


function saveProfileToCache(
    profile
) {

    if (
        !profile?.uid
    ) {

        return;

    }


    try {

        const cache =
            getProfileCache();


        cache[
            profile.uid
        ] = {

            ...publicProfileData(
                profile
            ),

            cachedAt:
                Date.now()

        };


        localStorage.setItem(

            PROFILE_CACHE_KEY,

            JSON.stringify(
                cache
            )

        );

    } catch {

        /* Ignore cache errors */

    }

}


function getCachedProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    try {

        const cache =
            getProfileCache();


        return (
            cache[uid] ||
            null
        );

    } catch {

        return null;

    }

}


/* =========================================================
   INITIALS
========================================================= */

function initials(
    name = "U"
) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (
        !parts.length
    ) {

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


/* =========================================================
   FULL NAME
========================================================= */

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


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
    value
) {

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
   VERIFIED BADGE
========================================================= */

function verifiedBadge(
    user
) {

    if (
        user?.isVerified !== true
    ) {

        return "";

    }


    return `

        <span
            class="verified-badge"
            title="Verified account"
            aria-label="Verified account"
        >
            ✓
        </span>

    `;

}


/* =========================================================
   TIMESTAMP
========================================================= */

function timestampToDate(
    value
) {

    if (!value) {

        return null;

    }


    if (
        value instanceof Date
    ) {

        return value;

    }


    if (
        typeof value === "number"
    ) {

        const date =
            new Date(value);


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;

    }


    if (
        typeof value?.toDate ===
        "function"
    ) {

        return value.toDate();

    }


    if (
        typeof value?.seconds ===
        "number"
    ) {

        return new Date(
            value.seconds * 1000
        );

    }


    if (
        typeof value?._seconds ===
        "number"
    ) {

        return new Date(
            value._seconds * 1000
        );

    }


    if (
        typeof value === "string"
    ) {

        const date =
            new Date(value);


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;

    }


    return null;

}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTimestamp(
    value
) {

    const date =
        timestampToDate(value);


    if (!date) {

        return "";

    }


    const now =
        new Date();


    if (
        date.toDateString() ===
        now.toDateString()
    ) {

        return date.toLocaleTimeString(
            [],
            {
                hour:
                    "numeric",

                minute:
                    "2-digit"
            }
        );

    }


    const yesterday =
        new Date();


    yesterday.setDate(
        yesterday.getDate() - 1
    );


    if (
        date.toDateString() ===
        yesterday.toDateString()
    ) {

        return "Yesterday";

    }


    return date.toLocaleDateString(
        [],
        {
            day:
                "numeric",

            month:
                "short"
        }
    );

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message
) {

    const toast =
        $("toast");


    if (!toast) {

        return;

    }


    toast.textContent =
        message || "";


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
            2500
        );

}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(
    profile
) {

    if (!profile) {

        return {

            blocked:
                true,

            status:
                "unknown",

            message:
                "Your account could not be verified."

        };

    }


    const status =
        String(
            profile.status ||
            "active"
        )
            .trim()
            .toLowerCase();


    if (
        status === "banned"
    ) {

        return {

            blocked:
                true,

            status:
                "banned",

            message:
                "Your CONNECTA account has been banned."

        };

    }


    if (
        status === "suspended"
    ) {

        return {

            blocked:
                true,

            status:
                "suspended",

            message:
                "Your CONNECTA account is currently suspended."

        };

    }


    return {

        blocked:
            false,

        status:
            "active",

        message:
            ""

    };

}


/* =========================================================
   BLOCKED SCREEN
========================================================= */

function showAccountBlockedScreen(
    control
) {

    stopDashboardListeners();


    document.body.innerHTML = `

        <div
            style="
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:24px;
                background:#f4f8f5;
                font-family:Arial,sans-serif;
            "
        >

            <div
                style="
                    width:min(430px,100%);
                    background:#fff;
                    border-radius:24px;
                    padding:32px 24px;
                    text-align:center;
                    box-shadow:0 15px 45px rgba(0,0,0,.08);
                "
            >

                <div
                    style="
                        width:64px;
                        height:64px;
                        border-radius:50%;
                        margin:0 auto 18px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        background:#fff1f2;
                        font-size:30px;
                    "
                >
                    🔒
                </div>

                <h2
                    style="
                        margin:0 0 10px;
                        color:#17211b;
                    "
                >
                    ${
                        control.status === "banned"
                            ? "Account Banned"
                            : "Account Suspended"
                    }
                </h2>

                <p
                    style="
                        margin:0;
                        line-height:1.6;
                        color:#718078;
                        font-size:14px;
                    "
                >
                    ${escapeHtml(
                        control.message
                    )}
                </p>

                <button
                    id="blockedLogout"
                    style="
                        width:100%;
                        margin-top:22px;
                        border:0;
                        border-radius:14px;
                        padding:13px;
                        background:#16a34a;
                        color:#fff;
                        font-weight:800;
                    "
                >
                    Logout
                </button>

            </div>

        </div>

    `;


    $("blockedLogout")?.addEventListener(
        "click",
        () => logout(true)
    );

}


/* =========================================================
   AVATAR RENDER
========================================================= */

function renderAvatarElement(
    element,
    user
) {

    if (!element) {

        return;

    }


    const name =
        getFullName(user);


    const photo =
        user?.photoURL ||
        user?.photoUrl ||
        "";


    if (photo) {

        element.innerHTML = `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
            >

        `;

    } else {

        element.textContent =
            initials(name);

    }

}


/* =========================================================
   RENDER PROFILE
========================================================= */

function renderProfile() {

    if (!currentProfile) {

        return;

    }


    const name =
        getFullName(
            currentProfile
        );


    const welcomeName =
        $("welcomeName");


    const welcomeAvatar =
        $("welcomeAvatar");


    const profileBtn =
        $("profileBtn");


    const menuAvatar =
        $("menuAvatar");


    const menuName =
        $("menuName");


    const menuUsername =
        $("menuUsername");


    const balanceAmount =
        $("balanceAmount");


    if (welcomeName) {

        welcomeName.textContent =
            name;

    }


    if (balanceAmount) {

        balanceAmount.textContent =
            Number(
                currentProfile.balance ||
                0
            ).toLocaleString(
                "en-KE",
                {
                    minimumFractionDigits:
                        0,

                    maximumFractionDigits:
                        2
                }
            );

    }


    if (menuName) {

        menuName.textContent =
            name;

    }


    if (menuUsername) {

        menuUsername.textContent =
            currentProfile.username

                ? `@${String(
                    currentProfile.username
                ).replace(
                    /^@/,
                    ""
                )}`

                : "";

    }


    renderAvatarElement(
        welcomeAvatar,
        currentProfile
    );


    renderAvatarElement(
        menuAvatar,
        currentProfile
    );


    renderAvatarElement(
        profileBtn,
        currentProfile
    );


    if (profileBtn) {

        profileBtn.setAttribute(
            "aria-label",
            `${name} profile`
        );

    }

}


/* =========================================================
   RENDER ONLINE USERS
========================================================= */

function renderOnline(
    usersToRender = onlineUsers
) {

    const box =
        $("onlineUsers");


    if (!box) {

        return;

    }


    hideOnlineSkeleton();


    /*
     * Online count should show actual online users,
     * not the total users displayed.
     */

    const onlineCount =
        onlineUsers.filter(
            user =>
                user.isOnline === true
        ).length;


    const countElement =
        $("onlineCount");


    if (countElement) {

        countElement.textContent =
            `(${onlineCount})`;

    }


    if (!usersToRender.length) {

        box.innerHTML = `

            <div class="empty-state small">

                No users found.

            </div>

        `;


        return;

    }


    const users =
        [...usersToRender]
            .sort(
                (a, b) => {

                    /*
                     * Current user first.
                     */

                    if (
                        a.uid ===
                        currentUser?.uid
                    ) {

                        return -1;

                    }


                    if (
                        b.uid ===
                        currentUser?.uid
                    ) {

                        return 1;

                    }


                    /*
                     * Online users before offline.
                     */

                    if (
                        a.isOnline !==
                        b.isOnline
                    ) {

                        return a.isOnline
                            ? -1
                            : 1;

                    }


                    return getFullName(a)
                        .localeCompare(
                            getFullName(b)
                        );

                }
            );


    box.innerHTML =
        users
            .map(
                user => {

                    const name =
                        getFullName(user);


                    const isSelf =
                        user.uid ===
                        currentUser?.uid;


                    const following =
                        Array.isArray(
                            currentProfile?.following
                        ) &&
                        currentProfile.following.includes(
                            user.uid
                        );


                    const photo =
                        user.photoURL ||
                        user.photoUrl ||
                        "";


                    return `

                        <div
                            class="user-card"
                            data-uid="${escapeHtml(
                                user.uid
                            )}"
                        >

                            <div
                                class="user-card-profile"
                            >

                                <div
                                    class="
                                        avatar
                                        large
                                        ${
                                            user.isOnline
                                                ? "avatar-green"
                                                : ""
                                        }
                                    "
                                >

                                    ${
                                        photo

                                            ? `
                                                <img
                                                    src="${escapeHtml(
                                                        photo
                                                    )}"
                                                    alt="${escapeHtml(
                                                        name
                                                    )}"
                                                    loading="lazy"
                                                >
                                              `

                                            : escapeHtml(
                                                initials(name)
                                            )
                                    }

                                </div>


                                <strong>

                                    ${escapeHtml(
                                        name
                                    )}

                                    ${verifiedBadge(
                                        user
                                    )}

                                </strong>


                                <small
                                    class="
                                        online-text
                                        ${
                                            user.isOnline
                                                ? "online"
                                                : "offline"
                                        }
                                    "
                                >

                                    <span
                                        class="
                                            status-dot
                                            ${
                                                user.isOnline
                                                    ? "online"
                                                    : "offline"
                                            }
                                        "
                                    ></span>

                                    ${
                                        user.isOnline
                                            ? "Online"
                                            : "Offline"
                                    }

                                </small>


                                ${
                                    !isSelf

                                        ? `

                                            <button
                                                class="
                                                    follow-btn
                                                    ${
                                                        following
                                                            ? "following"
                                                            : ""
                                                    }
                                                "
                                                data-follow-uid="${escapeHtml(
                                                    user.uid
                                                )}"
                                            >

                                                ${
                                                    following
                                                        ? "Following"
                                                        : "Follow"
                                                }

                                            </button>

                                          `

                                        : ""
                                }

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    /*
     * Profile navigation.
     */

    box
        .querySelectorAll(
            ".user-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target.closest(
                                ".follow-btn"
                            )
                        ) {

                            return;

                        }


                        const uid =
                            card.dataset.uid;


                        if (!uid) {

                            return;

                        }


                        location.href =
                            `profile.html?uid=${encodeURIComponent(
                                uid
                            )}`;

                    }
                );

            }
        );


    /*
     * Follow buttons.
     */

    box
        .querySelectorAll(
            "[data-follow-uid]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async event => {

                        event.stopPropagation();


                        await toggleFollow(
                            button.dataset.followUid
                        );

                    }
                );

            }
        );

}


/* =========================================================
   FOLLOW
========================================================= */

async function toggleFollow(
    targetUid
) {

    if (
        !currentUser ||
        !targetUid ||
        targetUid === currentUser.uid
    ) {

        return;

    }


    try {

        const currentRef =
            doc(
                db,
                "users",
                currentUser.uid
            );


        const targetRef =
            doc(
                db,
                "users",
                targetUid
            );


        await runTransaction(
            db,
            async transaction => {

                const currentSnap =
                    await transaction.get(
                        currentRef
                    );


                const targetSnap =
                    await transaction.get(
                        targetRef
                    );


                if (
                    !currentSnap.exists() ||
                    !targetSnap.exists()
                ) {

                    throw new Error(
                        "User profile not found."
                    );

                }


                const currentData =
                    currentSnap.data();


                const targetData =
                    targetSnap.data();


                const following =
                    Array.isArray(
                        currentData.following
                    )
                        ? [
                            ...currentData.following
                        ]
                        : [];


                const targetFollowers =
                    Array.isArray(
                        targetData.followers
                    )
                        ? [
                            ...targetData.followers
                        ]
                        : [];


                const alreadyFollowing =
                    following.includes(
                        targetUid
                    );


                if (
                    alreadyFollowing
                ) {

                    const nextFollowing =
                        following.filter(
                            uid =>
                                uid !==
                                targetUid
                        );


                    const nextFollowers =
                        targetFollowers.filter(
                            uid =>
                                uid !==
                                currentUser.uid
                        );


                    transaction.update(
                        currentRef,
                        {

                            following:
                                nextFollowing,

                            followingCount:
                                Math.max(
                                    0,
                                    Number(
                                        currentData.followingCount ||
                                        0
                                    ) - 1
                                )

                        }
                    );


                    transaction.update(
                        targetRef,
                        {

                            followers:
                                nextFollowers,

                            followersCount:
                                Math.max(
                                    0,
                                    Number(
                                        targetData.followersCount ||
                                        0
                                    ) - 1
                                )

                        }
                    );

                } else {

                    following.push(
                        targetUid
                    );


                    if (
                        !targetFollowers.includes(
                            currentUser.uid
                        )
                    ) {

                        targetFollowers.push(
                            currentUser.uid
                        );

                    }


                    transaction.update(
                        currentRef,
                        {

                            following,

                            followingCount:
                                Number(
                                    currentData.followingCount ||
                                    0
                                ) + 1

                        }
                    );


                    transaction.update(
                        targetRef,
                        {

                            followers:
                                targetFollowers,

                            followersCount:
                                Number(
                                    targetData.followersCount ||
                                    0
                                ) + 1

                        }
                    );

                }

            }
        );


        /*
         * Refresh own profile.
         */

        const profileSnap =
            await getDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                )
            );


        if (
            profileSnap.exists()
        ) {

            currentProfile = {

                uid:
                    currentUser.uid,

                ...profileSnap.data()

            };


            saveProfileToCache(
                currentProfile
            );


            renderProfile();

        }


        renderOnline();

        saveDashboardCache();


    } catch (error) {

        console.error(
            "[CONNECTA] Follow error:",
            error
        );


        showToast(
            error?.message ||
            "Could not update follow status."
        );

    }

}


/* =========================================================
   GET USER PROFILE
========================================================= */

async function getUserProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    /*
     * Live users are the fastest source.
     */

    const live =
        onlineUsers.find(
            user =>
                user.uid === uid
        );


    if (live) {

        return live;

    }


    /*
     * Cached profile.
     */

    const cached =
        getCachedProfile(uid);


    if (cached) {

        return {

            uid,

            ...cached

        };

    }


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snapshot.exists()
        ) {

            return null;

        }


        const profile = {

            uid,

            ...snapshot.data()

        };


        saveProfileToCache(
            profile
        );


        return profile;

    } catch {

        return null;

    }

}


/* =========================================================
   REFRESH USER PROFILE
========================================================= */

async function refreshUserProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snapshot.exists()
        ) {

            return null;

        }


        const profile = {

            uid,

            ...snapshot.data()

        };


        saveProfileToCache(
            profile
        );


        recentChats =
            recentChats.map(
                chat => {

                    if (
                        chat.otherUid !== uid
                    ) {

                        return chat;

                    }


                    return {

                        ...chat,

                        otherUserName:
                            getFullName(
                                profile
                            ),

                        otherUserPhoto:
                            profile.photoURL ||
                            profile.photoUrl ||
                            "",

                        otherUserVerified:
                            profile.isVerified === true

                    };

                }
            );


        recentGroups =
            recentGroups.map(
                group => {

                    if (
                        group.lastMessageSenderId !==
                        uid
                    ) {

                        return group;

                    }


                    return {

                        ...group,

                        lastMessageSenderName:
                            getFullName(
                                profile
                            ),

                        lastMessageSenderVerified:
                            profile.isVerified === true

                    };

                }
            );


        mergeRecentChats();


        return profile;

    } catch {

        return null;

    }

}


/* =========================================================
   PRIVATE CHAT LISTENER
========================================================= */

function listenToChats(
    uid
) {

    if (stopChats) {

        stopChats();

        stopChats = null;

    }


    const chatsQuery =
        query(

            collection(
                db,
                "chats"
            ),

            orderBy(
                "updatedAt",
                "desc"
            ),

            limit(50)

        );


    stopChats =
        onSnapshot(

            chatsQuery,

            async snapshot => {

                const result = [];


                for (
                    const chatDoc
                    of snapshot.docs
                ) {

                    const data =
                        chatDoc.data();


                    if (
                        !Array.isArray(
                            data.participants
                        ) ||
                        !data.participants.includes(
                            uid
                        )
                    ) {

                        continue;

                    }


                    const otherUid =
                        data.participants.find(
                            participant =>
                                participant !== uid
                        );


                    if (!otherUid) {

                        continue;

                    }


                    let profile =
                        onlineUsers.find(
                            user =>
                                user.uid ===
                                otherUid
                        );


                    if (!profile) {

                        profile =
                            getCachedProfile(
                                otherUid
                            );

                    }


                    const name =
                        profile
                            ? getFullName(profile)
                            : (
                                data.otherUserName ||
                                "CONNECTA User"
                            );


                    const photo =
                        profile?.photoURL ||
                        profile?.photoUrl ||
                        data.otherUserPhoto ||
                        "";


                    const verified =
                        profile?.isVerified === true ||
                        data.otherUserVerified === true;


                    const unread =
                        Number(
                            data.unreadCount?.[uid] ||
                            data.unread?.[uid] ||
                            0
                        );


                    const lastSenderId =
                        data.lastSenderId ||
                        data.lastMessageSenderId ||
                        "";


                    const lastMessageType =
                        data.lastMessageType ||
                        "text";


                    let preview =
                        data.lastMessage ||
                        "";


                    if (
                        lastMessageType ===
                        "image"
                    ) {

                        preview =
                            "📷 Photo";

                    }


                    if (
                        !preview
                    ) {

                        preview =
                            lastSenderId === uid
                                ? "You started a conversation"
                                : "Start a conversation";

                    }


                    result.push({

                        type:
                            "private",

                        chatId:
                            chatDoc.id,

                        otherUid,

                        otherUserName:
                            name,

                        otherUserPhoto:
                            photo,

                        otherUserVerified:
                            verified,

                        lastMessage:
                            preview,

                        lastMessageType,

                        lastSenderId,

                        unread,

                        lastMessageAt:
                            data.updatedAt ||
                            data.lastMessageAt ||
                            null,

                        updatedAt:
                            data.updatedAt ||
                            null

                    });

                }


                recentChats =
                    result;


                /*
                 * IMPORTANT:
                 * Use unified rendering.
                 */

                mergeRecentChats();


                /*
                 * Refresh profiles in background.
                 */

                result.forEach(
                    chat => {

                        refreshUserProfile(
                            chat.otherUid
                        );

                    }
                );

            },

            error => {

                console.error(
                    "[CONNECTA] Private chat listener:",
                    error
                );


                /*
                 * Keep groups visible even if
                 * private chats fail.
                 */

                mergeRecentChats();

            }

        );

}


/* =========================================================
   GROUP UNREAD COUNT
========================================================= */

async function getGroupUnreadCount(
    groupId,
    readData
) {

    if (
        !groupId ||
        !currentUser
    ) {

        return 0;

    }


    try {

        const messagesRef =
            collection(
                db,
                "groups",
                groupId,
                "groupMessages"
            );


        /*
         * Read the latest messages.
         *
         * This avoids requiring a Firestore composite
         * index for createdAt > date + orderBy.
         */

        const messagesQuery =
            query(

                messagesRef,

                orderBy(
                    "createdAt",
                    "desc"
                ),

                limit(100)

            );


        const snapshot =
            await getDocs(
                messagesQuery
            );


        const readDate =
            timestampToDate(
                readData?.lastReadAt
            );


        return snapshot.docs.filter(
            messageDoc => {

                const data =
                    messageDoc.data();


                /*
                 * Don't count own messages.
                 */

                if (
                    data.senderId ===
                    currentUser.uid
                ) {

                    return false;

                }


                /*
                 * Never opened.
                 */

                if (!readDate) {

                    return true;

                }


                const messageDate =
                    timestampToDate(
                        data.createdAt
                    );


                if (!messageDate) {

                    return false;

                }


                return (
                    messageDate.getTime() >
                    readDate.getTime()
                );

            }
        ).length;


    } catch (error) {

        console.warn(
            `[CONNECTA] Group unread count failed for ${groupId}:`,
            error
        );


        return 0;

    }

}


/* =========================================================
   PROCESS GROUPS
========================================================= */

async function processGroups() {

    const version =
        ++groupProcessVersion;


    if (!currentUser) {

        return;

    }


    const allGroups =
        new Map();


    [
        ...groupListeners.memberIds,
        ...groupListeners.members,
        ...groupListeners.owned
    ]
        .forEach(
            groupDoc => {

                if (
                    !groupDoc?.id
                ) {

                    return;

                }


                allGroups.set(

                    groupDoc.id,

                    {

                        groupId:
                            groupDoc.id,

                        ...groupDoc.data()

                    }

                );

            }
        );


    const groups =
        Array.from(
            allGroups.values()
        );


    const enriched = [];


    for (
        const group
        of groups
    ) {

        const isMember =

            (
                Array.isArray(
                    group.memberIds
                ) &&
                group.memberIds.includes(
                    currentUser.uid
                )
            )

            ||

            (
                Array.isArray(
                    group.members
                ) &&
                group.members.includes(
                    currentUser.uid
                )
            )

            ||

            group.ownerId ===
            currentUser.uid;


        if (!isMember) {

            continue;

        }


        let readData = null;


        try {

            const readSnapshot =
                await getDoc(
                    doc(
                        db,
                        "groups",
                        group.groupId,
                        "reads",
                        currentUser.uid
                    )
                );


            if (
                readSnapshot.exists()
            ) {

                readData =
                    readSnapshot.data();

            }

        } catch {

            readData = null;

        }


        const unread =
            await getGroupUnreadCount(
                group.groupId,
                readData
            );


        let senderProfile =
            null;


        if (
            group.lastMessageSenderId
        ) {

            senderProfile =
                onlineUsers.find(
                    user =>
                        user.uid ===
                        group.lastMessageSenderId
                ) ||

                getCachedProfile(
                    group.lastMessageSenderId
                );

        }


        const senderName =
            group.lastMessageSenderName ||

            (
                senderProfile
                    ? getFullName(
                        senderProfile
                    )
                    : "User"
            );


        const senderVerified =
            group.lastMessageSenderVerified ===
                true ||

            senderProfile?.isVerified ===
                true;


        enriched.push({

            type:
                "group",

            groupId:
                group.groupId,

            groupName:
                group.name ||
                "Group",

            photoURL:
                group.photoURL ||
                "",

            lastMessage:
                group.lastMessage ||
                "",

            lastMessageType:
                group.lastMessageType ||
                "",

            lastMessageSenderId:
                group.lastMessageSenderId ||
                "",

            lastMessageSenderName:
                senderName,

            lastMessageSenderVerified:
                senderVerified,

            lastMessageAt:
                group.lastMessageAt ||
                group.updatedAt ||
                null,

            updatedAt:
                group.updatedAt ||
                null,

            unread,

            readData,

            status:
                group.status ||
                "",

            chatLocked:
                group.chatLocked === true

        });

    }


    /*
     * Ignore old async processing.
     */

    if (
        version !==
        groupProcessVersion
    ) {

        return;

    }


    recentGroups =
        enriched;


    /*
     * Group badge.
     */

    const groupUnread =
        recentGroups.reduce(
            (
                total,
                group
            ) =>
                total +
                Number(
                    group.unread || 0
                ),
            0
        );


    const groupBadge =
        $("groupBadge");


    if (groupBadge) {

        if (groupUnread > 0) {

            groupBadge.hidden =
                false;

            groupBadge.textContent =
                groupUnread > 99
                    ? "99+"
                    : String(groupUnread);

        } else {

            groupBadge.hidden =
                true;

        }

    }


    mergeRecentChats();

}


/* =========================================================
   QUEUE GROUP PROCESSING
========================================================= */

function queueGroupProcessing() {

    clearTimeout(
        groupProcessTimer
    );


    groupProcessTimer =
        setTimeout(
            () => {

                processGroups()
                    .catch(
                        error => {

                            console.error(
                                "[CONNECTA] Group processing:",
                                error
                            );

                        }
                    );

            },
            80
        );

}


/* =========================================================
   GROUP LISTENER
========================================================= */

function listenToGroups(
    uid
) {

    /*
     * Remove previous listeners.
     */

    groupListeners.unsubscribers
        .forEach(
            unsubscribe => {

                if (
                    typeof unsubscribe ===
                    "function"
                ) {

                    unsubscribe();

                }

            }
        );


    groupListeners = {

        memberIds: [],
        members: [],
        owned: [],
        unsubscribers: []

    };


    /*
     * MEMBER IDS
     */

    const memberIdsQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "memberIds",
                "array-contains",
                uid
            ),

            limit(30)

        );


    /*
     * MEMBERS
     */

    const membersQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "members",
                "array-contains",
                uid
            ),

            limit(30)

        );


    /*
     * OWNER
     */

    const ownerQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "ownerId",
                "==",
                uid
            ),

            limit(30)

        );


    /*
     * Initial fetch.
     */

    Promise.allSettled([

        getDocs(
            memberIdsQuery
        ),

        getDocs(
            membersQuery
        ),

        getDocs(
            ownerQuery
        )

    ])
        .then(
            results => {

                const [
                    memberIdsResult,
                    membersResult,
                    ownerResult
                ] = results;


                if (
                    memberIdsResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.memberIds =
                        memberIdsResult.value.docs;

                }


                if (
                    membersResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.members =
                        membersResult.value.docs;

                }


                if (
                    ownerResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.owned =
                        ownerResult.value.docs;

                }


                queueGroupProcessing();

            }
        );


    /*
     * LIVE memberIds.
     */

    const stopMemberIds =
        onSnapshot(

            memberIdsQuery,

            snapshot => {

                groupListeners.memberIds =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] memberIds group listener:",
                    error
                );

            }

        );


    /*
     * LIVE members.
     */

    const stopMembers =
        onSnapshot(

            membersQuery,

            snapshot => {

                groupListeners.members =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] members group listener:",
                    error
                );

            }

        );


    /*
     * LIVE owner groups.
     */

    const stopOwned =
        onSnapshot(

            ownerQuery,

            snapshot => {

                groupListeners.owned =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] owner group listener:",
                    error
                );

            }

        );


    groupListeners.unsubscribers = [

        stopMemberIds,
        stopMembers,
        stopOwned

    ];

}


/* =========================================================
   MERGE PRIVATE CHATS + GROUPS
========================================================= */

function mergeRecentChats() {

    const combined = [

        ...recentChats,

        ...recentGroups

    ];


    /*
     * Remove duplicate private chats/groups.
     */

    const unique =
        new Map();


    combined.forEach(
        item => {

            const key =
                item.type === "group"

                    ? `group:${item.groupId}`

                    : `private:${item.chatId}`;


            unique.set(
                key,
                item
            );

        }
    );


    const sorted =
        Array.from(
            unique.values()
        );


    sorted.sort(
        (
            first,
            second
        ) => {

            const firstDate =
                timestampToDate(
                    first.lastMessageAt ||
                    first.updatedAt
                );


            const secondDate =
                timestampToDate(
                    second.lastMessageAt ||
                    second.updatedAt
                );


            const firstTime =
                firstDate
                    ? firstDate.getTime()
                    : 0;


            const secondTime =
                secondDate
                    ? secondDate.getTime()
                    : 0;


            return (
                secondTime -
                firstTime
            );

        }
    );


    renderChats(
        sorted
    );


    saveDashboardCache();

}


/* =========================================================
   CHAT AVATAR
========================================================= */

function chatAvatar(
    name,
    photo,
    isGroup = false
) {

    if (photo) {

        return `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
                loading="lazy"
            >

        `;

    }


    return escapeHtml(
        initials(name)
    );

}


/* =========================================================
   RENDER RECENT CHATS
========================================================= */

function renderChats(
    chats
) {

    const box =
        $("chatList");


    if (!box) {

        return;

    }


    hideChatSkeleton();


    if (!chats.length) {

        box.innerHTML = `

            <div class="empty-state">

                No conversations yet.

            </div>

        `;


        return;

    }


    box.innerHTML =
        chats
            .map(
                chat => {

                    const isGroup =
                        chat.type === "group";


                    const name =
                        isGroup

                            ? (
                                chat.groupName ||
                                "Group"
                            )

                            : (
                                chat.otherUserName ||
                                "CONNECTA User"
                            );


                    const photo =
                        isGroup

                            ? (
                                chat.photoURL ||
                                ""
                            )

                            : (
                                chat.otherUserPhoto ||
                                ""
                            );


                    const unread =
                        Number(
                            chat.unread || 0
                        );


                    const time =
                        formatTimestamp(
                            chat.lastMessageAt ||
                            chat.updatedAt
                        );


                    let preview =
                        chat.lastMessage ||
                        "";


                    if (
                        chat.lastMessageType ===
                        "image"
                    ) {

                        preview =
                            "📷 Photo";

                    }


                    if (
                        !preview
                    ) {

                        preview =
                            isGroup
                                ? "No messages yet"
                                : "Start a conversation";

                    }


                    /*
                     * Group sender prefix.
                     */

                    let previewMarkup;


                    if (
                        isGroup &&
                        chat.lastMessageSenderName
                    ) {

                        const senderBadge =
                            chat.lastMessageSenderVerified

                                ? verifiedBadge({
                                    isVerified: true
                                })

                                : "";


                        previewMarkup = `

                            <span>

                                ${escapeHtml(
                                    chat.lastMessageSenderName
                                )}

                                ${senderBadge}

                            </span>

                            <span>
                                :
                                ${escapeHtml(
                                    preview
                                )}
                            </span>

                        `;

                    } else {

                        previewMarkup =
                            escapeHtml(
                                preview
                            );

                    }


                    /*
                     * Private chat verified badge.
                     */

                    const nameBadge =
                        !isGroup

                            ? verifiedBadge({

                                isVerified:
                                    chat.otherUserVerified

                            })

                            : "";


                    return `

                        <div
                            class="
                                chat-item
                                chat-list-item
                                ${isGroup ? "group-chat" : ""}
                                ${
                                    unread > 0
                                        ? "unread"
                                        : ""
                                }
                            "
                            data-chat-type="${
                                isGroup
                                    ? "group"
                                    : "private"
                            }"
                            data-chat-id="${escapeHtml(
                                isGroup
                                    ? chat.groupId
                                    : chat.chatId
                            )}"
                            data-user-id="${escapeHtml(
                                isGroup
                                    ? ""
                                    : chat.otherUid
                            )}"
                        >

                            <div
                                class="
                                    avatar
                                    ${
                                        isGroup
                                            ? "avatar-green"
                                            : ""
                                    }
                                "
                            >

                                ${chatAvatar(
                                    name,
                                    photo,
                                    isGroup
                                )}

                            </div>


                            <div
                                class="chat-copy"
                            >

                                <strong>

                                    ${escapeHtml(
                                        name
                                    )}

                                    ${nameBadge}

                                </strong>


                                <p>

                                    ${previewMarkup}

                                </p>

                            </div>


                            <div
                                class="chat-meta"
                            >

                                <time>

                                    ${escapeHtml(
                                        time
                                    )}

                                </time>


                                ${
                                    unread > 0

                                        ? `

                                            <span
                                                class="
                                                    unread
                                                    connecta-dashboard-unread
                                                "
                                            >
                                                ${
                                                    unread > 99
                                                        ? "99+"
                                                        : unread
                                                }
                                            </span>

                                          `

                                        : ""
                                }

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    /*
     * Navigation.
     */

    box
        .querySelectorAll(
            ".chat-item"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        const type =
                            item.dataset.chatType;


                        const chatId =
                            item.dataset.chatId;


                        const userId =
                            item.dataset.userId;


                        if (
                            type === "group"
                        ) {

                            if (!chatId) {

                                return;

                            }


                            location.href =
                                `group-chat.html?groupId=${encodeURIComponent(
                                    chatId
                                )}`;


                            return;

                        }


                        if (userId) {

                            location.href =
                                `chat.html?uid=${encodeURIComponent(
                                    userId
                                )}`;

                        }

                    }
                );

            }
        );

}


/* =========================================================
   SEARCH CHATS
========================================================= */

function searchChats(
    term
) {

    const value =
        String(
            term || ""
        )
            .trim()
            .toLowerCase();


    if (!value) {

        mergeRecentChats();

        return;

    }


    const combined = [

        ...recentChats,

        ...recentGroups

    ];


    const filtered =
        combined.filter(
            chat => {

                const text = [

                    chat.groupName,

                    chat.otherUserName,

                    chat.lastMessage,

                    chat.lastMessageSenderName,

                    chat.otherUid

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                return text.includes(
                    value
                );

            }
        );


    renderChats(
        filtered
    );

}


/* =========================================================
   PRESENCE
========================================================= */

async function setPresence(
    online
) {

    if (!currentUser) {

        return;

    }


    try {

        await setDoc(

            doc(
                db,
                "users",
                currentUser.uid
            ),

            {

                isOnline:
                    online === true,

                lastSeen:
                    serverTimestamp()

            },

            {
                merge:
                    true
            }

        );

    } catch (error) {

        console.warn(
            "[CONNECTA] Presence update failed:",
            error
        );

    }

}


/* =========================================================
   VISIBILITY PRESENCE
========================================================= */

function handleVisibilityPresence() {

    if (
        document.visibilityState ===
        "visible"
    ) {

        setPresence(true);

    } else {

        setPresence(false);

    }

}


/* =========================================================
   START PRESENCE
========================================================= */

function startPresence() {

    if (!currentUser) {

        return;

    }


    setPresence(true);


    clearInterval(
        presenceInterval
    );


    presenceInterval =
        setInterval(
            () => {

                setPresence(true);

            },
            60000
        );


    document.removeEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );


    document.addEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   STOP DASHBOARD LISTENERS
========================================================= */

function stopDashboardListeners() {

    if (stopUsers) {

        stopUsers();

        stopUsers = null;

    }


    if (stopChats) {

        stopChats();

        stopChats = null;

    }


    groupListeners.unsubscribers
        .forEach(
            unsubscribe => {

                if (
                    typeof unsubscribe ===
                    "function"
                ) {

                    unsubscribe();

                }

            }
        );


    groupListeners = {

        memberIds: [],
        members: [],
        owned: [],
        unsubscribers: []

    };


    clearTimeout(
        groupProcessTimer
    );


    clearInterval(
        presenceInterval
    );


    presenceInterval =
        null;


    document.removeEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   DASHBOARD UI
========================================================= */

function setupUI() {

    /*
     * =====================================================
     * MENU
     * =====================================================
     *
     * IMPORTANT:
     * dashboard.html uses:
     *
     * menuBtn
     * sideMenu
     * menuOverlay
     *
     * not menuButton/sidebar/sidebarOverlay.
     */

    const menuButton =
        $("menuBtn");


    const sidebar =
        $("sideMenu");


    const sidebarOverlay =
        $("menuOverlay");


    function openMenu() {

        sidebar?.classList.add(
            "open"
        );


        sidebarOverlay?.classList.add(
            "open"
        );


        sidebar?.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    function closeMenu() {

        sidebar?.classList.remove(
            "open"
        );


        sidebarOverlay?.classList.remove(
            "open"
        );


        sidebar?.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    menuButton?.addEventListener(
        "click",
        openMenu
    );


    sidebarOverlay?.addEventListener(
        "click",
        closeMenu
    );


    sidebar
        ?.querySelectorAll(
            "a"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        closeMenu();

                    }
                );

            }
        );


    /*
     * =====================================================
     * PROFILE
     * =====================================================
     */

    $("profileBtn")?.addEventListener(
        "click",
        () => {

            if (
                currentUser?.uid
            ) {

                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        currentUser.uid
                    )}`;

            }

        }
    );


    /*
     * =====================================================
     * CONNECTION
     * =====================================================
     */

    $("connectionBtn")?.addEventListener(
        "click",
        () => {

            showToast(
                "Connection feature coming soon."
            );

        }
    );


    /*
     * =====================================================
     * ONLINE SEARCH BUTTON
     * =====================================================
     */

    $("onlineSearchBtn")?.addEventListener(
        "click",
        () => {

            const wrap =
                $("onlineSearchWrap");


            wrap?.classList.toggle(
                "open"
            );


            if (
                wrap?.classList.contains(
                    "open"
                )
            ) {

                $("onlineSearch")?.focus();

            }

        }
    );


    /*
     * =====================================================
     * CHAT SEARCH BUTTON
     * =====================================================
     */

    $("chatSearchBtn")?.addEventListener(
        "click",
        () => {

            const wrap =
                $("chatSearchWrap");


            wrap?.classList.toggle(
                "open"
            );


            if (
                wrap?.classList.contains(
                    "open"
                )
            ) {

                $("chatSearch")?.focus();

            }

        }
    );


    /*
     * =====================================================
     * ONLINE SEARCH
     * =====================================================
     */

    $("onlineSearch")?.addEventListener(
        "input",
        event => {

            const term =
                event.target.value
                    .trim()
                    .toLowerCase();


            if (!term) {

                renderOnline(
                    onlineUsers
                );

                return;

            }


            const filtered =
                onlineUsers.filter(
                    user => {

                        const text = [

                            getFullName(
                                user
                            ),

                            user.username,

                            user.bio

                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        return text.includes(
                            term
                        );

                    }
                );


            renderOnline(
                filtered
            );

        }
    );


    /*
     * =====================================================
     * CHAT SEARCH
     * =====================================================
     */

    $("chatSearch")?.addEventListener(
        "input",
        event => {

            searchChats(
                event.target.value
            );

        }
    );


    /*
     * =====================================================
     * LOGOUT
     * =====================================================
     */

    $("logoutBtn")?.addEventListener(
        "click",
        async () => {

            await setPresence(
                false
            );


            stopDashboardListeners();


            await logout(
                true
            );

        }
    );


    /*
     * =====================================================
     * COMING SOON LINKS
     * =====================================================
     */

    document
        .querySelectorAll(
            "[data-coming]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    event => {

                        /*
                         * Allow real links to work.
                         */

                        if (
                            element.getAttribute(
                                "href"
                            ) !== "#"
                        ) {

                            return;

                        }


                        event.preventDefault();


                        showToast(
                            `${element.dataset.coming} feature coming soon.`
                        );

                    }
                );

            }
        );

}


/* =========================================================
   USERS LISTENER
========================================================= */

function listenToUsers() {

    if (stopUsers) {

        stopUsers();

        stopUsers = null;

    }


    const usersQuery =
        query(

            collection(
                db,
                "users"
            ),

            limit(100)

        );


    stopUsers =
        onSnapshot(

            usersQuery,

            snapshot => {

                const users =
                    snapshot.docs.map(
                        userDoc => {

                            return {

                                uid:
                                    userDoc.id,

                                ...publicProfileData(
                                    userDoc.data()
                                )

                            };

                        }
                    );


                onlineUsers =
                    users;


                /*
                 * Own profile.
                 */

                const own =
                    users.find(
                        user =>
                            user.uid ===
                            currentUser?.uid
                    );


                if (own) {

                    currentProfile = {

                        ...currentProfile,

                        ...own

                    };


                    saveProfileToCache(
                        currentProfile
                    );


                    renderProfile();

                }


                /*
                 * Render users.
                 */

                const searchTerm =
                    $("onlineSearch")
                        ?.value
                        ?.trim()
                        ?.toLowerCase() ||
                    "";


                if (searchTerm) {

                    const filtered =
                        users.filter(
                            user => {

                                const text = [

                                    getFullName(
                                        user
                                    ),

                                    user.username,

                                    user.bio

                                ]
                                    .filter(Boolean)
                                    .join(" ")
                                    .toLowerCase();


                                return text.includes(
                                    searchTerm
                                );

                            }
                        );


                    renderOnline(
                        filtered
                    );

                } else {

                    renderOnline(
                        users
                    );

                }


                /*
                 * Update private chat names.
                 */

                recentChats =
                    recentChats.map(
                        chat => {

                            const profile =
                                users.find(
                                    user =>
                                        user.uid ===
                                        chat.otherUid
                                );


                            if (!profile) {

                                return chat;

                            }


                            return {

                                ...chat,

                                otherUserName:
                                    getFullName(
                                        profile
                                    ),

                                otherUserPhoto:
                                    profile.photoURL ||
                                    "",

                                otherUserVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


                /*
                 * Update group sender names.
                 */

                recentGroups =
                    recentGroups.map(
                        group => {

                            const profile =
                                users.find(
                                    user =>
                                        user.uid ===
                                        group.lastMessageSenderId
                                );


                            if (!profile) {

                                return group;

                            }


                            return {

                                ...group,

                                lastMessageSenderName:
                                    getFullName(
                                        profile
                                    ),

                                lastMessageSenderVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


                mergeRecentChats();

            },

            error => {

                console.error(
                    "[CONNECTA] Users listener:",
                    error
                );


                const box =
                    $("onlineUsers");


                hideOnlineSkeleton();


                if (box) {

                    box.innerHTML = `

                        <div
                            class="connecta-dashboard-error"
                        >
                            Users could not be loaded.
                        </div>

                    `;

                }

            }

        );

}


/* =========================================================
   INITIALIZE DASHBOARD
========================================================= */

async function initializeDashboard() {

    try {

        /*
         * Authenticate.
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

                displayName:
                    currentUser.displayName ||
                    "",

                photoURL:
                    currentUser.photoURL ||
                    "",

                status:
                    "active",

                balance:
                    0,

                following:
                    []

            };


        /*
         * =================================================
         * CACHE FIRST
         * =================================================
         */

        loadDashboardCache();


        renderProfile();


        /*
         * =================================================
         * ACCOUNT CONTROL
         * =================================================
         */

        const control =
            getAccountControl(
                currentProfile
            );


        if (
            control.blocked
        ) {

            showAccountBlockedScreen(
                control
            );


            return;

        }


        /*
         * =================================================
         * PRESENCE
         * =================================================
         */

        startPresence();


        /*
         * =================================================
         * LIVE USERS
         * =================================================
         */

        listenToUsers();


        /*
         * =================================================
         * LIVE PRIVATE CHATS
         * =================================================
         */

        listenToChats(
            currentUser.uid
        );


        /*
         * =================================================
         * LIVE GROUPS
         * =================================================
         */

        listenToGroups(
            currentUser.uid
        );


    } catch (error) {

        console.error(
            "[CONNECTA] Dashboard initialization failed:",
            error
        );


        showToast(
            "Could not initialize CONNECTA dashboard."
        );

    }

}


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        clearTimeout(
            groupProcessTimer
        );


        clearInterval(
            presenceInterval
        );


        if (
            currentUser
        ) {

            setPresence(
                false
            );

        }


        stopDashboardListeners();

    }
);


/* =========================================================
   START
========================================================= */

installInstantDashboardStyles();

showDashboardSkeleton();

setupUI();

initializeDashboard();/* =========================================================
   CONNECTA DASHBOARD ENGINE
   File: frontend/js/dashboard.js

   Compatible with:
   - dashboard.html
   - dashboard.css
   - chat.js
   - group-chat.js
   - globalAuth.js
   - firebase.js

   FEATURES
   - Instant cache-first dashboard
   - Skeleton/shimmer instead of Loading text
   - Live users
   - Online/offline status
   - Live private chats
   - Live groups
   - Group membership via memberIds OR members
   - Group unread counts
   - Unified Recent Chats
   - Private-chat unread counts
   - Verified badges
   - Follow system
   - Profile cache
   - Dashboard cache
   - Presence heartbeat
   - Account restriction protection
   - Correct HTML/CSS IDs and classes
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
    db
} from "./firebase.js";


/* =========================================================
   GLOBAL AUTH
========================================================= */

import {
    getCurrentConnectaUser,
    logout
} from "./globalAuth.js";


/* =========================================================
   FIRESTORE
========================================================= */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    orderBy,
    limit,
    where,
    runTransaction,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


/* =========================================================
   DOM HELPER
========================================================= */

const $ = id =>
    document.getElementById(id);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentProfile = null;

let onlineUsers = [];

let recentChats = [];

let recentGroups = [];


/*
 * Group listener state.
 */

let groupListeners = {

    memberIds: [],
    members: [],
    owned: [],
    unsubscribers: []

};


let stopUsers = null;

let stopChats = null;

let presenceInterval = null;

let groupProcessTimer = null;

let groupProcessVersion = 0;


/* =========================================================
   CACHE
========================================================= */

const DASHBOARD_CACHE_PREFIX =
    "connectaDashboardCache_v2_";

const PROFILE_CACHE_KEY =
    "connectaProfileCache";


/* =========================================================
   INSTANT DASHBOARD STYLES
========================================================= */

function installInstantDashboardStyles() {

    if (
        $("connectaDashboardInstantStyles")
    ) {

        return;

    }


    const style =
        document.createElement("style");


    style.id =
        "connectaDashboardInstantStyles";


    style.textContent = `

        @keyframes connectaShimmer {

            0% {
                background-position:
                    -500px 0;
            }

            100% {
                background-position:
                    500px 0;
            }

        }


        .connecta-dashboard-skeleton {

            background:
                linear-gradient(
                    90deg,
                    #e9efeb 25%,
                    #f8faf8 50%,
                    #e9efeb 75%
                );

            background-size:
                1000px 100%;

            animation:
                connectaShimmer
                1.25s infinite linear;

            border-radius:
                14px;

        }


        .connecta-dashboard-skeleton-row {

            display:
                flex;

            gap:
                11px;

            width:
                100%;

            overflow:
                hidden;

        }


        .connecta-dashboard-skeleton-user {

            flex:
                0 0 122px;

            height:
                150px;

            border-radius:
                18px;

        }


        .connecta-dashboard-skeleton-chat {

            width:
                100%;

            height:
                66px;

            margin-bottom:
                9px;

            border-radius:
                15px;

        }


        .connecta-dashboard-empty {

            width:
                100%;

            min-height:
                100px;

            display:
                grid;

            place-items:
                center;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

            padding:
                20px;

        }


        .connecta-dashboard-error {

            width:
                100%;

            padding:
                18px;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

        }


        .connecta-dashboard-unread {

            min-width:
                21px;

            height:
                21px;

            padding:
                0 5px;

            display:
                grid;

            place-items:
                center;

            border-radius:
                999px;

            background:
                #22c55e;

            color:
                #fff;

            font-size:
                9px;

            font-weight:
                800;

        }


        .verified-badge {

            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            width:
                16px;

            height:
                16px;

            margin-left:
                3px;

            border-radius:
                50%;

            background:
                #22c55e;

            color:
                #fff;

            font-size:
                10px;

            font-weight:
                900;

            vertical-align:
                middle;

        }


        .chat-list-item .avatar {

            position:
                relative;

        }


        .chat-list-item.group-chat .avatar {

            background:
                #dcfce7;

            color:
                #15803d;

        }


        .chat-list-item {

            cursor:
                pointer;

        }


        .chat-list-item.unread {

            background:
                #f7fff8;

        }


        .chat-list-preview {

            min-width:
                0;

        }


        .chat-list-preview
        .verified-badge {

            width:
                14px;

            height:
                14px;

            font-size:
                8px;

        }


        .user-card {

            cursor:
                pointer;

        }


        .user-card button {

            position:
                relative;

            z-index:
                2;

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   DASHBOARD SKELETON
========================================================= */

function showDashboardSkeleton() {

    const onlineBox =
        $("onlineUsers");


    const chatBox =
        $("chatList");


    /*
     * Online users.
     *
     * Replace the HTML "Loading online users..."
     * placeholder immediately.
     */

    if (onlineBox) {

        const loadingPlaceholder =
            onlineBox.querySelector(
                ".empty-state"
            );


        if (
            loadingPlaceholder
        ) {

            loadingPlaceholder.remove();

        }


        if (
            !onlineBox.children.length
        ) {

            onlineBox.innerHTML = `

                <div
                    class="
                        connecta-dashboard-skeleton-row
                    "
                    aria-hidden="true"
                >

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-user
                        "
                    ></div>

                </div>

            `;

        }


        onlineBox.setAttribute(
            "aria-busy",
            "true"
        );

    }


    /*
     * Chats.
     */

    if (chatBox) {

        const loadingPlaceholder =
            chatBox.querySelector(
                ".empty-state"
            );


        if (
            loadingPlaceholder
        ) {

            loadingPlaceholder.remove();

        }


        if (
            !chatBox.children.length
        ) {

            chatBox.innerHTML = `

                <div aria-hidden="true">

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                    <div
                        class="
                            connecta-dashboard-skeleton
                            connecta-dashboard-skeleton-chat
                        "
                    ></div>

                </div>

            `;

        }


        chatBox.setAttribute(
            "aria-busy",
            "true"
        );

    }

}


/* =========================================================
   HIDE SKELETON
========================================================= */

function hideOnlineSkeleton() {

    const box =
        $("onlineUsers");


    box?.setAttribute(
        "aria-busy",
        "false"
    );

}


function hideChatSkeleton() {

    const box =
        $("chatList");


    box?.setAttribute(
        "aria-busy",
        "false"
    );

}


/* =========================================================
   SAFE PUBLIC PROFILE
========================================================= */

function publicProfileData(
    user = {}
) {

    return {

        uid:
            user.uid || "",

        firstName:
            user.firstName || "",

        lastName:
            user.lastName || "",

        displayName:
            user.displayName || "",

        username:
            user.username || "",

        photoURL:
            user.photoURL ||
            user.photoUrl ||
            "",

        bio:
            user.bio || "",

        isOnline:
            user.isOnline === true,

        isVerified:
            user.isVerified === true,

        followersCount:
            Number(
                user.followersCount || 0
            ),

        followingCount:
            Number(
                user.followingCount || 0
            ),

        lastSeen:
            user.lastSeen || null

    };

}


/* =========================================================
   CACHE KEY
========================================================= */

function getDashboardCacheKey(
    uid
) {

    return (
        `${DASHBOARD_CACHE_PREFIX}${uid}`
    );

}


/* =========================================================
   SAVE DASHBOARD CACHE
========================================================= */

function saveDashboardCache() {

    if (
        !currentUser
    ) {

        return;

    }


    try {

        const safeProfile =
            currentProfile

                ? {

                    ...publicProfileData(
                        currentProfile
                    ),

                    following:
                        Array.isArray(
                            currentProfile.following
                        )
                            ? [
                                ...currentProfile.following
                            ]
                            : [],

                    balance:
                        Number(
                            currentProfile.balance ||
                            0
                        ),

                    status:
                        currentProfile.status ||
                        "active"

                }

                : null;


        const safeGroups =
            recentGroups.map(
                group => {

                    const {
                        readData,
                        ...safeGroup
                    } = group;


                    return safeGroup;

                }
            );


        const payload = {

            profile:
                safeProfile,

            users:
                onlineUsers.map(
                    publicProfileData
                ),

            chats:
                recentChats,

            groups:
                safeGroups,

            cachedAt:
                Date.now()

        };


        localStorage.setItem(

            getDashboardCacheKey(
                currentUser.uid
            ),

            JSON.stringify(
                payload
            )

        );


    } catch (error) {

        console.warn(
            "[CONNECTA] Dashboard cache save failed:",
            error
        );

    }

}


/* =========================================================
   LOAD DASHBOARD CACHE
========================================================= */

function loadDashboardCache() {

    if (
        !currentUser
    ) {

        return false;

    }


    try {

        const raw =
            localStorage.getItem(

                getDashboardCacheKey(
                    currentUser.uid
                )

            );


        if (!raw) {

            return false;

        }


        const cache =
            JSON.parse(raw);


        if (!cache) {

            return false;

        }


        /*
         * PROFILE
         */

        if (
            cache.profile
        ) {

            currentProfile = {

                ...cache.profile,

                ...currentProfile

            };


            renderProfile();

        }


        /*
         * USERS
         */

        if (
            Array.isArray(
                cache.users
            )
        ) {

            onlineUsers =
                cache.users;


            renderOnline();

        }


        /*
         * PRIVATE CHATS
         */

        if (
            Array.isArray(
                cache.chats
            )
        ) {

            recentChats =
                cache.chats;

        }


        /*
         * GROUPS
         */

        if (
            Array.isArray(
                cache.groups
            )
        ) {

            recentGroups =
                cache.groups;

        }


        /*
         * UNIFIED RECENT CHATS
         */

        if (
            recentChats.length ||
            recentGroups.length
        ) {

            mergeRecentChats();

        }


        return true;


    } catch (error) {

        console.warn(
            "[CONNECTA] Dashboard cache load failed:",
            error
        );


        return false;

    }

}


/* =========================================================
   PROFILE CACHE
========================================================= */

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


function saveProfileToCache(
    profile
) {

    if (
        !profile?.uid
    ) {

        return;

    }


    try {

        const cache =
            getProfileCache();


        cache[
            profile.uid
        ] = {

            ...publicProfileData(
                profile
            ),

            cachedAt:
                Date.now()

        };


        localStorage.setItem(

            PROFILE_CACHE_KEY,

            JSON.stringify(
                cache
            )

        );

    } catch {

        /* Ignore cache errors */

    }

}


function getCachedProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    try {

        const cache =
            getProfileCache();


        return (
            cache[uid] ||
            null
        );

    } catch {

        return null;

    }

}


/* =========================================================
   INITIALS
========================================================= */

function initials(
    name = "U"
) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (
        !parts.length
    ) {

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


/* =========================================================
   FULL NAME
========================================================= */

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


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
    value
) {

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
   VERIFIED BADGE
========================================================= */

function verifiedBadge(
    user
) {

    if (
        user?.isVerified !== true
    ) {

        return "";

    }


    return `

        <span
            class="verified-badge"
            title="Verified account"
            aria-label="Verified account"
        >
            ✓
        </span>

    `;

}


/* =========================================================
   TIMESTAMP
========================================================= */

function timestampToDate(
    value
) {

    if (!value) {

        return null;

    }


    if (
        value instanceof Date
    ) {

        return value;

    }


    if (
        typeof value === "number"
    ) {

        const date =
            new Date(value);


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;

    }


    if (
        typeof value?.toDate ===
        "function"
    ) {

        return value.toDate();

    }


    if (
        typeof value?.seconds ===
        "number"
    ) {

        return new Date(
            value.seconds * 1000
        );

    }


    if (
        typeof value?._seconds ===
        "number"
    ) {

        return new Date(
            value._seconds * 1000
        );

    }


    if (
        typeof value === "string"
    ) {

        const date =
            new Date(value);


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;

    }


    return null;

}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTimestamp(
    value
) {

    const date =
        timestampToDate(value);


    if (!date) {

        return "";

    }


    const now =
        new Date();


    if (
        date.toDateString() ===
        now.toDateString()
    ) {

        return date.toLocaleTimeString(
            [],
            {
                hour:
                    "numeric",

                minute:
                    "2-digit"
            }
        );

    }


    const yesterday =
        new Date();


    yesterday.setDate(
        yesterday.getDate() - 1
    );


    if (
        date.toDateString() ===
        yesterday.toDateString()
    ) {

        return "Yesterday";

    }


    return date.toLocaleDateString(
        [],
        {
            day:
                "numeric",

            month:
                "short"
        }
    );

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message
) {

    const toast =
        $("toast");


    if (!toast) {

        return;

    }


    toast.textContent =
        message || "";


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
            2500
        );

}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(
    profile
) {

    if (!profile) {

        return {

            blocked:
                true,

            status:
                "unknown",

            message:
                "Your account could not be verified."

        };

    }


    const status =
        String(
            profile.status ||
            "active"
        )
            .trim()
            .toLowerCase();


    if (
        status === "banned"
    ) {

        return {

            blocked:
                true,

            status:
                "banned",

            message:
                "Your CONNECTA account has been banned."

        };

    }


    if (
        status === "suspended"
    ) {

        return {

            blocked:
                true,

            status:
                "suspended",

            message:
                "Your CONNECTA account is currently suspended."

        };

    }


    return {

        blocked:
            false,

        status:
            "active",

        message:
            ""

    };

}


/* =========================================================
   BLOCKED SCREEN
========================================================= */

function showAccountBlockedScreen(
    control
) {

    stopDashboardListeners();


    document.body.innerHTML = `

        <div
            style="
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:24px;
                background:#f4f8f5;
                font-family:Arial,sans-serif;
            "
        >

            <div
                style="
                    width:min(430px,100%);
                    background:#fff;
                    border-radius:24px;
                    padding:32px 24px;
                    text-align:center;
                    box-shadow:0 15px 45px rgba(0,0,0,.08);
                "
            >

                <div
                    style="
                        width:64px;
                        height:64px;
                        border-radius:50%;
                        margin:0 auto 18px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        background:#fff1f2;
                        font-size:30px;
                    "
                >
                    🔒
                </div>

                <h2
                    style="
                        margin:0 0 10px;
                        color:#17211b;
                    "
                >
                    ${
                        control.status === "banned"
                            ? "Account Banned"
                            : "Account Suspended"
                    }
                </h2>

                <p
                    style="
                        margin:0;
                        line-height:1.6;
                        color:#718078;
                        font-size:14px;
                    "
                >
                    ${escapeHtml(
                        control.message
                    )}
                </p>

                <button
                    id="blockedLogout"
                    style="
                        width:100%;
                        margin-top:22px;
                        border:0;
                        border-radius:14px;
                        padding:13px;
                        background:#16a34a;
                        color:#fff;
                        font-weight:800;
                    "
                >
                    Logout
                </button>

            </div>

        </div>

    `;


    $("blockedLogout")?.addEventListener(
        "click",
        () => logout(true)
    );

}


/* =========================================================
   AVATAR RENDER
========================================================= */

function renderAvatarElement(
    element,
    user
) {

    if (!element) {

        return;

    }


    const name =
        getFullName(user);


    const photo =
        user?.photoURL ||
        user?.photoUrl ||
        "";


    if (photo) {

        element.innerHTML = `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
            >

        `;

    } else {

        element.textContent =
            initials(name);

    }

}


/* =========================================================
   RENDER PROFILE
========================================================= */

function renderProfile() {

    if (!currentProfile) {

        return;

    }


    const name =
        getFullName(
            currentProfile
        );


    const welcomeName =
        $("welcomeName");


    const welcomeAvatar =
        $("welcomeAvatar");


    const profileBtn =
        $("profileBtn");


    const menuAvatar =
        $("menuAvatar");


    const menuName =
        $("menuName");


    const menuUsername =
        $("menuUsername");


    const balanceAmount =
        $("balanceAmount");


    if (welcomeName) {

        welcomeName.textContent =
            name;

    }


    if (balanceAmount) {

        balanceAmount.textContent =
            Number(
                currentProfile.balance ||
                0
            ).toLocaleString(
                "en-KE",
                {
                    minimumFractionDigits:
                        0,

                    maximumFractionDigits:
                        2
                }
            );

    }


    if (menuName) {

        menuName.textContent =
            name;

    }


    if (menuUsername) {

        menuUsername.textContent =
            currentProfile.username

                ? `@${String(
                    currentProfile.username
                ).replace(
                    /^@/,
                    ""
                )}`

                : "";

    }


    renderAvatarElement(
        welcomeAvatar,
        currentProfile
    );


    renderAvatarElement(
        menuAvatar,
        currentProfile
    );


    renderAvatarElement(
        profileBtn,
        currentProfile
    );


    if (profileBtn) {

        profileBtn.setAttribute(
            "aria-label",
            `${name} profile`
        );

    }

}


/* =========================================================
   RENDER ONLINE USERS
========================================================= */

function renderOnline(
    usersToRender = onlineUsers
) {

    const box =
        $("onlineUsers");


    if (!box) {

        return;

    }


    hideOnlineSkeleton();


    /*
     * Online count should show actual online users,
     * not the total users displayed.
     */

    const onlineCount =
        onlineUsers.filter(
            user =>
                user.isOnline === true
        ).length;


    const countElement =
        $("onlineCount");


    if (countElement) {

        countElement.textContent =
            `(${onlineCount})`;

    }


    if (!usersToRender.length) {

        box.innerHTML = `

            <div class="empty-state small">

                No users found.

            </div>

        `;


        return;

    }


    const users =
        [...usersToRender]
            .sort(
                (a, b) => {

                    /*
                     * Current user first.
                     */

                    if (
                        a.uid ===
                        currentUser?.uid
                    ) {

                        return -1;

                    }


                    if (
                        b.uid ===
                        currentUser?.uid
                    ) {

                        return 1;

                    }


                    /*
                     * Online users before offline.
                     */

                    if (
                        a.isOnline !==
                        b.isOnline
                    ) {

                        return a.isOnline
                            ? -1
                            : 1;

                    }


                    return getFullName(a)
                        .localeCompare(
                            getFullName(b)
                        );

                }
            );


    box.innerHTML =
        users
            .map(
                user => {

                    const name =
                        getFullName(user);


                    const isSelf =
                        user.uid ===
                        currentUser?.uid;


                    const following =
                        Array.isArray(
                            currentProfile?.following
                        ) &&
                        currentProfile.following.includes(
                            user.uid
                        );


                    const photo =
                        user.photoURL ||
                        user.photoUrl ||
                        "";


                    return `

                        <div
                            class="user-card"
                            data-uid="${escapeHtml(
                                user.uid
                            )}"
                        >

                            <div
                                class="user-card-profile"
                            >

                                <div
                                    class="
                                        avatar
                                        large
                                        ${
                                            user.isOnline
                                                ? "avatar-green"
                                                : ""
                                        }
                                    "
                                >

                                    ${
                                        photo

                                            ? `
                                                <img
                                                    src="${escapeHtml(
                                                        photo
                                                    )}"
                                                    alt="${escapeHtml(
                                                        name
                                                    )}"
                                                    loading="lazy"
                                                >
                                              `

                                            : escapeHtml(
                                                initials(name)
                                            )
                                    }

                                </div>


                                <strong>

                                    ${escapeHtml(
                                        name
                                    )}

                                    ${verifiedBadge(
                                        user
                                    )}

                                </strong>


                                <small
                                    class="
                                        online-text
                                        ${
                                            user.isOnline
                                                ? "online"
                                                : "offline"
                                        }
                                    "
                                >

                                    <span
                                        class="
                                            status-dot
                                            ${
                                                user.isOnline
                                                    ? "online"
                                                    : "offline"
                                            }
                                        "
                                    ></span>

                                    ${
                                        user.isOnline
                                            ? "Online"
                                            : "Offline"
                                    }

                                </small>


                                ${
                                    !isSelf

                                        ? `

                                            <button
                                                class="
                                                    follow-btn
                                                    ${
                                                        following
                                                            ? "following"
                                                            : ""
                                                    }
                                                "
                                                data-follow-uid="${escapeHtml(
                                                    user.uid
                                                )}"
                                            >

                                                ${
                                                    following
                                                        ? "Following"
                                                        : "Follow"
                                                }

                                            </button>

                                          `

                                        : ""
                                }

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    /*
     * Profile navigation.
     */

    box
        .querySelectorAll(
            ".user-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target.closest(
                                ".follow-btn"
                            )
                        ) {

                            return;

                        }


                        const uid =
                            card.dataset.uid;


                        if (!uid) {

                            return;

                        }


                        location.href =
                            `profile.html?uid=${encodeURIComponent(
                                uid
                            )}`;

                    }
                );

            }
        );


    /*
     * Follow buttons.
     */

    box
        .querySelectorAll(
            "[data-follow-uid]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async event => {

                        event.stopPropagation();


                        await toggleFollow(
                            button.dataset.followUid
                        );

                    }
                );

            }
        );

}


/* =========================================================
   FOLLOW
========================================================= */

async function toggleFollow(
    targetUid
) {

    if (
        !currentUser ||
        !targetUid ||
        targetUid === currentUser.uid
    ) {

        return;

    }


    try {

        const currentRef =
            doc(
                db,
                "users",
                currentUser.uid
            );


        const targetRef =
            doc(
                db,
                "users",
                targetUid
            );


        await runTransaction(
            db,
            async transaction => {

                const currentSnap =
                    await transaction.get(
                        currentRef
                    );


                const targetSnap =
                    await transaction.get(
                        targetRef
                    );


                if (
                    !currentSnap.exists() ||
                    !targetSnap.exists()
                ) {

                    throw new Error(
                        "User profile not found."
                    );

                }


                const currentData =
                    currentSnap.data();


                const targetData =
                    targetSnap.data();


                const following =
                    Array.isArray(
                        currentData.following
                    )
                        ? [
                            ...currentData.following
                        ]
                        : [];


                const targetFollowers =
                    Array.isArray(
                        targetData.followers
                    )
                        ? [
                            ...targetData.followers
                        ]
                        : [];


                const alreadyFollowing =
                    following.includes(
                        targetUid
                    );


                if (
                    alreadyFollowing
                ) {

                    const nextFollowing =
                        following.filter(
                            uid =>
                                uid !==
                                targetUid
                        );


                    const nextFollowers =
                        targetFollowers.filter(
                            uid =>
                                uid !==
                                currentUser.uid
                        );


                    transaction.update(
                        currentRef,
                        {

                            following:
                                nextFollowing,

                            followingCount:
                                Math.max(
                                    0,
                                    Number(
                                        currentData.followingCount ||
                                        0
                                    ) - 1
                                )

                        }
                    );


                    transaction.update(
                        targetRef,
                        {

                            followers:
                                nextFollowers,

                            followersCount:
                                Math.max(
                                    0,
                                    Number(
                                        targetData.followersCount ||
                                        0
                                    ) - 1
                                )

                        }
                    );

                } else {

                    following.push(
                        targetUid
                    );


                    if (
                        !targetFollowers.includes(
                            currentUser.uid
                        )
                    ) {

                        targetFollowers.push(
                            currentUser.uid
                        );

                    }


                    transaction.update(
                        currentRef,
                        {

                            following,

                            followingCount:
                                Number(
                                    currentData.followingCount ||
                                    0
                                ) + 1

                        }
                    );


                    transaction.update(
                        targetRef,
                        {

                            followers:
                                targetFollowers,

                            followersCount:
                                Number(
                                    targetData.followersCount ||
                                    0
                                ) + 1

                        }
                    );

                }

            }
        );


        /*
         * Refresh own profile.
         */

        const profileSnap =
            await getDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                )
            );


        if (
            profileSnap.exists()
        ) {

            currentProfile = {

                uid:
                    currentUser.uid,

                ...profileSnap.data()

            };


            saveProfileToCache(
                currentProfile
            );


            renderProfile();

        }


        renderOnline();

        saveDashboardCache();


    } catch (error) {

        console.error(
            "[CONNECTA] Follow error:",
            error
        );


        showToast(
            error?.message ||
            "Could not update follow status."
        );

    }

}


/* =========================================================
   GET USER PROFILE
========================================================= */

async function getUserProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    /*
     * Live users are the fastest source.
     */

    const live =
        onlineUsers.find(
            user =>
                user.uid === uid
        );


    if (live) {

        return live;

    }


    /*
     * Cached profile.
     */

    const cached =
        getCachedProfile(uid);


    if (cached) {

        return {

            uid,

            ...cached

        };

    }


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snapshot.exists()
        ) {

            return null;

        }


        const profile = {

            uid,

            ...snapshot.data()

        };


        saveProfileToCache(
            profile
        );


        return profile;

    } catch {

        return null;

    }

}


/* =========================================================
   REFRESH USER PROFILE
========================================================= */

async function refreshUserProfile(
    uid
) {

    if (!uid) {

        return null;

    }


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snapshot.exists()
        ) {

            return null;

        }


        const profile = {

            uid,

            ...snapshot.data()

        };


        saveProfileToCache(
            profile
        );


        recentChats =
            recentChats.map(
                chat => {

                    if (
                        chat.otherUid !== uid
                    ) {

                        return chat;

                    }


                    return {

                        ...chat,

                        otherUserName:
                            getFullName(
                                profile
                            ),

                        otherUserPhoto:
                            profile.photoURL ||
                            profile.photoUrl ||
                            "",

                        otherUserVerified:
                            profile.isVerified === true

                    };

                }
            );


        recentGroups =
            recentGroups.map(
                group => {

                    if (
                        group.lastMessageSenderId !==
                        uid
                    ) {

                        return group;

                    }


                    return {

                        ...group,

                        lastMessageSenderName:
                            getFullName(
                                profile
                            ),

                        lastMessageSenderVerified:
                            profile.isVerified === true

                    };

                }
            );


        mergeRecentChats();


        return profile;

    } catch {

        return null;

    }

}


/* =========================================================
   PRIVATE CHAT LISTENER
========================================================= */

function listenToChats(
    uid
) {

    if (stopChats) {

        stopChats();

        stopChats = null;

    }


    const chatsQuery =
        query(

            collection(
                db,
                "chats"
            ),

            orderBy(
                "updatedAt",
                "desc"
            ),

            limit(50)

        );


    stopChats =
        onSnapshot(

            chatsQuery,

            async snapshot => {

                const result = [];


                for (
                    const chatDoc
                    of snapshot.docs
                ) {

                    const data =
                        chatDoc.data();


                    if (
                        !Array.isArray(
                            data.participants
                        ) ||
                        !data.participants.includes(
                            uid
                        )
                    ) {

                        continue;

                    }


                    const otherUid =
                        data.participants.find(
                            participant =>
                                participant !== uid
                        );


                    if (!otherUid) {

                        continue;

                    }


                    let profile =
                        onlineUsers.find(
                            user =>
                                user.uid ===
                                otherUid
                        );


                    if (!profile) {

                        profile =
                            getCachedProfile(
                                otherUid
                            );

                    }


                    const name =
                        profile
                            ? getFullName(profile)
                            : (
                                data.otherUserName ||
                                "CONNECTA User"
                            );


                    const photo =
                        profile?.photoURL ||
                        profile?.photoUrl ||
                        data.otherUserPhoto ||
                        "";


                    const verified =
                        profile?.isVerified === true ||
                        data.otherUserVerified === true;


                    const unread =
                        Number(
                            data.unreadCount?.[uid] ||
                            data.unread?.[uid] ||
                            0
                        );


                    const lastSenderId =
                        data.lastSenderId ||
                        data.lastMessageSenderId ||
                        "";


                    const lastMessageType =
                        data.lastMessageType ||
                        "text";


                    let preview =
                        data.lastMessage ||
                        "";


                    if (
                        lastMessageType ===
                        "image"
                    ) {

                        preview =
                            "📷 Photo";

                    }


                    if (
                        !preview
                    ) {

                        preview =
                            lastSenderId === uid
                                ? "You started a conversation"
                                : "Start a conversation";

                    }


                    result.push({

                        type:
                            "private",

                        chatId:
                            chatDoc.id,

                        otherUid,

                        otherUserName:
                            name,

                        otherUserPhoto:
                            photo,

                        otherUserVerified:
                            verified,

                        lastMessage:
                            preview,

                        lastMessageType,

                        lastSenderId,

                        unread,

                        lastMessageAt:
                            data.updatedAt ||
                            data.lastMessageAt ||
                            null,

                        updatedAt:
                            data.updatedAt ||
                            null

                    });

                }


                recentChats =
                    result;


                /*
                 * IMPORTANT:
                 * Use unified rendering.
                 */

                mergeRecentChats();


                /*
                 * Refresh profiles in background.
                 */

                result.forEach(
                    chat => {

                        refreshUserProfile(
                            chat.otherUid
                        );

                    }
                );

            },

            error => {

                console.error(
                    "[CONNECTA] Private chat listener:",
                    error
                );


                /*
                 * Keep groups visible even if
                 * private chats fail.
                 */

                mergeRecentChats();

            }

        );

}


/* =========================================================
   GROUP UNREAD COUNT
========================================================= */

async function getGroupUnreadCount(
    groupId,
    readData
) {

    if (
        !groupId ||
        !currentUser
    ) {

        return 0;

    }


    try {

        const messagesRef =
            collection(
                db,
                "groups",
                groupId,
                "groupMessages"
            );


        /*
         * Read the latest messages.
         *
         * This avoids requiring a Firestore composite
         * index for createdAt > date + orderBy.
         */

        const messagesQuery =
            query(

                messagesRef,

                orderBy(
                    "createdAt",
                    "desc"
                ),

                limit(100)

            );


        const snapshot =
            await getDocs(
                messagesQuery
            );


        const readDate =
            timestampToDate(
                readData?.lastReadAt
            );


        return snapshot.docs.filter(
            messageDoc => {

                const data =
                    messageDoc.data();


                /*
                 * Don't count own messages.
                 */

                if (
                    data.senderId ===
                    currentUser.uid
                ) {

                    return false;

                }


                /*
                 * Never opened.
                 */

                if (!readDate) {

                    return true;

                }


                const messageDate =
                    timestampToDate(
                        data.createdAt
                    );


                if (!messageDate) {

                    return false;

                }


                return (
                    messageDate.getTime() >
                    readDate.getTime()
                );

            }
        ).length;


    } catch (error) {

        console.warn(
            `[CONNECTA] Group unread count failed for ${groupId}:`,
            error
        );


        return 0;

    }

}


/* =========================================================
   PROCESS GROUPS
========================================================= */

async function processGroups() {

    const version =
        ++groupProcessVersion;


    if (!currentUser) {

        return;

    }


    const allGroups =
        new Map();


    [
        ...groupListeners.memberIds,
        ...groupListeners.members,
        ...groupListeners.owned
    ]
        .forEach(
            groupDoc => {

                if (
                    !groupDoc?.id
                ) {

                    return;

                }


                allGroups.set(

                    groupDoc.id,

                    {

                        groupId:
                            groupDoc.id,

                        ...groupDoc.data()

                    }

                );

            }
        );


    const groups =
        Array.from(
            allGroups.values()
        );


    const enriched = [];


    for (
        const group
        of groups
    ) {

        const isMember =

            (
                Array.isArray(
                    group.memberIds
                ) &&
                group.memberIds.includes(
                    currentUser.uid
                )
            )

            ||

            (
                Array.isArray(
                    group.members
                ) &&
                group.members.includes(
                    currentUser.uid
                )
            )

            ||

            group.ownerId ===
            currentUser.uid;


        if (!isMember) {

            continue;

        }


        let readData = null;


        try {

            const readSnapshot =
                await getDoc(
                    doc(
                        db,
                        "groups",
                        group.groupId,
                        "reads",
                        currentUser.uid
                    )
                );


            if (
                readSnapshot.exists()
            ) {

                readData =
                    readSnapshot.data();

            }

        } catch {

            readData = null;

        }


        const unread =
            await getGroupUnreadCount(
                group.groupId,
                readData
            );


        let senderProfile =
            null;


        if (
            group.lastMessageSenderId
        ) {

            senderProfile =
                onlineUsers.find(
                    user =>
                        user.uid ===
                        group.lastMessageSenderId
                ) ||

                getCachedProfile(
                    group.lastMessageSenderId
                );

        }


        const senderName =
            group.lastMessageSenderName ||

            (
                senderProfile
                    ? getFullName(
                        senderProfile
                    )
                    : "User"
            );


        const senderVerified =
            group.lastMessageSenderVerified ===
                true ||

            senderProfile?.isVerified ===
                true;


        enriched.push({

            type:
                "group",

            groupId:
                group.groupId,

            groupName:
                group.name ||
                "Group",

            photoURL:
                group.photoURL ||
                "",

            lastMessage:
                group.lastMessage ||
                "",

            lastMessageType:
                group.lastMessageType ||
                "",

            lastMessageSenderId:
                group.lastMessageSenderId ||
                "",

            lastMessageSenderName:
                senderName,

            lastMessageSenderVerified:
                senderVerified,

            lastMessageAt:
                group.lastMessageAt ||
                group.updatedAt ||
                null,

            updatedAt:
                group.updatedAt ||
                null,

            unread,

            readData,

            status:
                group.status ||
                "",

            chatLocked:
                group.chatLocked === true

        });

    }


    /*
     * Ignore old async processing.
     */

    if (
        version !==
        groupProcessVersion
    ) {

        return;

    }


    recentGroups =
        enriched;


    /*
     * Group badge.
     */

    const groupUnread =
        recentGroups.reduce(
            (
                total,
                group
            ) =>
                total +
                Number(
                    group.unread || 0
                ),
            0
        );


    const groupBadge =
        $("groupBadge");


    if (groupBadge) {

        if (groupUnread > 0) {

            groupBadge.hidden =
                false;

            groupBadge.textContent =
                groupUnread > 99
                    ? "99+"
                    : String(groupUnread);

        } else {

            groupBadge.hidden =
                true;

        }

    }


    mergeRecentChats();

}


/* =========================================================
   QUEUE GROUP PROCESSING
========================================================= */

function queueGroupProcessing() {

    clearTimeout(
        groupProcessTimer
    );


    groupProcessTimer =
        setTimeout(
            () => {

                processGroups()
                    .catch(
                        error => {

                            console.error(
                                "[CONNECTA] Group processing:",
                                error
                            );

                        }
                    );

            },
            80
        );

}


/* =========================================================
   GROUP LISTENER
========================================================= */

function listenToGroups(
    uid
) {

    /*
     * Remove previous listeners.
     */

    groupListeners.unsubscribers
        .forEach(
            unsubscribe => {

                if (
                    typeof unsubscribe ===
                    "function"
                ) {

                    unsubscribe();

                }

            }
        );


    groupListeners = {

        memberIds: [],
        members: [],
        owned: [],
        unsubscribers: []

    };


    /*
     * MEMBER IDS
     */

    const memberIdsQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "memberIds",
                "array-contains",
                uid
            ),

            limit(30)

        );


    /*
     * MEMBERS
     */

    const membersQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "members",
                "array-contains",
                uid
            ),

            limit(30)

        );


    /*
     * OWNER
     */

    const ownerQuery =
        query(

            collection(
                db,
                "groups"
            ),

            where(
                "ownerId",
                "==",
                uid
            ),

            limit(30)

        );


    /*
     * Initial fetch.
     */

    Promise.allSettled([

        getDocs(
            memberIdsQuery
        ),

        getDocs(
            membersQuery
        ),

        getDocs(
            ownerQuery
        )

    ])
        .then(
            results => {

                const [
                    memberIdsResult,
                    membersResult,
                    ownerResult
                ] = results;


                if (
                    memberIdsResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.memberIds =
                        memberIdsResult.value.docs;

                }


                if (
                    membersResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.members =
                        membersResult.value.docs;

                }


                if (
                    ownerResult.status ===
                    "fulfilled"
                ) {

                    groupListeners.owned =
                        ownerResult.value.docs;

                }


                queueGroupProcessing();

            }
        );


    /*
     * LIVE memberIds.
     */

    const stopMemberIds =
        onSnapshot(

            memberIdsQuery,

            snapshot => {

                groupListeners.memberIds =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] memberIds group listener:",
                    error
                );

            }

        );


    /*
     * LIVE members.
     */

    const stopMembers =
        onSnapshot(

            membersQuery,

            snapshot => {

                groupListeners.members =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] members group listener:",
                    error
                );

            }

        );


    /*
     * LIVE owner groups.
     */

    const stopOwned =
        onSnapshot(

            ownerQuery,

            snapshot => {

                groupListeners.owned =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "[CONNECTA] owner group listener:",
                    error
                );

            }

        );


    groupListeners.unsubscribers = [

        stopMemberIds,
        stopMembers,
        stopOwned

    ];

}


/* =========================================================
   MERGE PRIVATE CHATS + GROUPS
========================================================= */

function mergeRecentChats() {

    const combined = [

        ...recentChats,

        ...recentGroups

    ];


    /*
     * Remove duplicate private chats/groups.
     */

    const unique =
        new Map();


    combined.forEach(
        item => {

            const key =
                item.type === "group"

                    ? `group:${item.groupId}`

                    : `private:${item.chatId}`;


            unique.set(
                key,
                item
            );

        }
    );


    const sorted =
        Array.from(
            unique.values()
        );


    sorted.sort(
        (
            first,
            second
        ) => {

            const firstDate =
                timestampToDate(
                    first.lastMessageAt ||
                    first.updatedAt
                );


            const secondDate =
                timestampToDate(
                    second.lastMessageAt ||
                    second.updatedAt
                );


            const firstTime =
                firstDate
                    ? firstDate.getTime()
                    : 0;


            const secondTime =
                secondDate
                    ? secondDate.getTime()
                    : 0;


            return (
                secondTime -
                firstTime
            );

        }
    );


    renderChats(
        sorted
    );


    saveDashboardCache();

}


/* =========================================================
   CHAT AVATAR
========================================================= */

function chatAvatar(
    name,
    photo,
    isGroup = false
) {

    if (photo) {

        return `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
                loading="lazy"
            >

        `;

    }


    return escapeHtml(
        initials(name)
    );

}


/* =========================================================
   RENDER RECENT CHATS
========================================================= */

function renderChats(
    chats
) {

    const box =
        $("chatList");


    if (!box) {

        return;

    }


    hideChatSkeleton();


    if (!chats.length) {

        box.innerHTML = `

            <div class="empty-state">

                No conversations yet.

            </div>

        `;


        return;

    }


    box.innerHTML =
        chats
            .map(
                chat => {

                    const isGroup =
                        chat.type === "group";


                    const name =
                        isGroup

                            ? (
                                chat.groupName ||
                                "Group"
                            )

                            : (
                                chat.otherUserName ||
                                "CONNECTA User"
                            );


                    const photo =
                        isGroup

                            ? (
                                chat.photoURL ||
                                ""
                            )

                            : (
                                chat.otherUserPhoto ||
                                ""
                            );


                    const unread =
                        Number(
                            chat.unread || 0
                        );


                    const time =
                        formatTimestamp(
                            chat.lastMessageAt ||
                            chat.updatedAt
                        );


                    let preview =
                        chat.lastMessage ||
                        "";


                    if (
                        chat.lastMessageType ===
                        "image"
                    ) {

                        preview =
                            "📷 Photo";

                    }


                    if (
                        !preview
                    ) {

                        preview =
                            isGroup
                                ? "No messages yet"
                                : "Start a conversation";

                    }


                    /*
                     * Group sender prefix.
                     */

                    let previewMarkup;


                    if (
                        isGroup &&
                        chat.lastMessageSenderName
                    ) {

                        const senderBadge =
                            chat.lastMessageSenderVerified

                                ? verifiedBadge({
                                    isVerified: true
                                })

                                : "";


                        previewMarkup = `

                            <span>

                                ${escapeHtml(
                                    chat.lastMessageSenderName
                                )}

                                ${senderBadge}

                            </span>

                            <span>
                                :
                                ${escapeHtml(
                                    preview
                                )}
                            </span>

                        `;

                    } else {

                        previewMarkup =
                            escapeHtml(
                                preview
                            );

                    }


                    /*
                     * Private chat verified badge.
                     */

                    const nameBadge =
                        !isGroup

                            ? verifiedBadge({

                                isVerified:
                                    chat.otherUserVerified

                            })

                            : "";


                    return `

                        <div
                            class="
                                chat-item
                                chat-list-item
                                ${isGroup ? "group-chat" : ""}
                                ${
                                    unread > 0
                                        ? "unread"
                                        : ""
                                }
                            "
                            data-chat-type="${
                                isGroup
                                    ? "group"
                                    : "private"
                            }"
                            data-chat-id="${escapeHtml(
                                isGroup
                                    ? chat.groupId
                                    : chat.chatId
                            )}"
                            data-user-id="${escapeHtml(
                                isGroup
                                    ? ""
                                    : chat.otherUid
                            )}"
                        >

                            <div
                                class="
                                    avatar
                                    ${
                                        isGroup
                                            ? "avatar-green"
                                            : ""
                                    }
                                "
                            >

                                ${chatAvatar(
                                    name,
                                    photo,
                                    isGroup
                                )}

                            </div>


                            <div
                                class="chat-copy"
                            >

                                <strong>

                                    ${escapeHtml(
                                        name
                                    )}

                                    ${nameBadge}

                                </strong>


                                <p>

                                    ${previewMarkup}

                                </p>

                            </div>


                            <div
                                class="chat-meta"
                            >

                                <time>

                                    ${escapeHtml(
                                        time
                                    )}

                                </time>


                                ${
                                    unread > 0

                                        ? `

                                            <span
                                                class="
                                                    unread
                                                    connecta-dashboard-unread
                                                "
                                            >
                                                ${
                                                    unread > 99
                                                        ? "99+"
                                                        : unread
                                                }
                                            </span>

                                          `

                                        : ""
                                }

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    /*
     * Navigation.
     */

    box
        .querySelectorAll(
            ".chat-item"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        const type =
                            item.dataset.chatType;


                        const chatId =
                            item.dataset.chatId;


                        const userId =
                            item.dataset.userId;


                        if (
                            type === "group"
                        ) {

                            if (!chatId) {

                                return;

                            }


                            location.href =
                                `group-chat.html?groupId=${encodeURIComponent(
                                    chatId
                                )}`;


                            return;

                        }


                        if (userId) {

                            location.href =
                                `chat.html?uid=${encodeURIComponent(
                                    userId
                                )}`;

                        }

                    }
                );

            }
        );

}


/* =========================================================
   SEARCH CHATS
========================================================= */

function searchChats(
    term
) {

    const value =
        String(
            term || ""
        )
            .trim()
            .toLowerCase();


    if (!value) {

        mergeRecentChats();

        return;

    }


    const combined = [

        ...recentChats,

        ...recentGroups

    ];


    const filtered =
        combined.filter(
            chat => {

                const text = [

                    chat.groupName,

                    chat.otherUserName,

                    chat.lastMessage,

                    chat.lastMessageSenderName,

                    chat.otherUid

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                return text.includes(
                    value
                );

            }
        );


    renderChats(
        filtered
    );

}


/* =========================================================
   PRESENCE
========================================================= */

async function setPresence(
    online
) {

    if (!currentUser) {

        return;

    }


    try {

        await setDoc(

            doc(
                db,
                "users",
                currentUser.uid
            ),

            {

                isOnline:
                    online === true,

                lastSeen:
                    serverTimestamp()

            },

            {
                merge:
                    true
            }

        );

    } catch (error) {

        console.warn(
            "[CONNECTA] Presence update failed:",
            error
        );

    }

}


/* =========================================================
   VISIBILITY PRESENCE
========================================================= */

function handleVisibilityPresence() {

    if (
        document.visibilityState ===
        "visible"
    ) {

        setPresence(true);

    } else {

        setPresence(false);

    }

}


/* =========================================================
   START PRESENCE
========================================================= */

function startPresence() {

    if (!currentUser) {

        return;

    }


    setPresence(true);


    clearInterval(
        presenceInterval
    );


    presenceInterval =
        setInterval(
            () => {

                setPresence(true);

            },
            60000
        );


    document.removeEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );


    document.addEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   STOP DASHBOARD LISTENERS
========================================================= */

function stopDashboardListeners() {

    if (stopUsers) {

        stopUsers();

        stopUsers = null;

    }


    if (stopChats) {

        stopChats();

        stopChats = null;

    }


    groupListeners.unsubscribers
        .forEach(
            unsubscribe => {

                if (
                    typeof unsubscribe ===
                    "function"
                ) {

                    unsubscribe();

                }

            }
        );


    groupListeners = {

        memberIds: [],
        members: [],
        owned: [],
        unsubscribers: []

    };


    clearTimeout(
        groupProcessTimer
    );


    clearInterval(
        presenceInterval
    );


    presenceInterval =
        null;


    document.removeEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   DASHBOARD UI
========================================================= */

function setupUI() {

    /*
     * =====================================================
     * MENU
     * =====================================================
     *
     * IMPORTANT:
     * dashboard.html uses:
     *
     * menuBtn
     * sideMenu
     * menuOverlay
     *
     * not menuButton/sidebar/sidebarOverlay.
     */

    const menuButton =
        $("menuBtn");


    const sidebar =
        $("sideMenu");


    const sidebarOverlay =
        $("menuOverlay");


    function openMenu() {

        sidebar?.classList.add(
            "open"
        );


        sidebarOverlay?.classList.add(
            "open"
        );


        sidebar?.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    function closeMenu() {

        sidebar?.classList.remove(
            "open"
        );


        sidebarOverlay?.classList.remove(
            "open"
        );


        sidebar?.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    menuButton?.addEventListener(
        "click",
        openMenu
    );


    sidebarOverlay?.addEventListener(
        "click",
        closeMenu
    );


    sidebar
        ?.querySelectorAll(
            "a"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        closeMenu();

                    }
                );

            }
        );


    /*
     * =====================================================
     * PROFILE
     * =====================================================
     */

    $("profileBtn")?.addEventListener(
        "click",
        () => {

            if (
                currentUser?.uid
            ) {

                location.href =
                    `profile.html?uid=${encodeURIComponent(
                        currentUser.uid
                    )}`;

            }

        }
    );


    /*
     * =====================================================
     * CONNECTION
     * =====================================================
     */

    $("connectionBtn")?.addEventListener(
        "click",
        () => {

            showToast(
                "Connection feature coming soon."
            );

        }
    );


    /*
     * =====================================================
     * ONLINE SEARCH BUTTON
     * =====================================================
     */

    $("onlineSearchBtn")?.addEventListener(
        "click",
        () => {

            const wrap =
                $("onlineSearchWrap");


            wrap?.classList.toggle(
                "open"
            );


            if (
                wrap?.classList.contains(
                    "open"
                )
            ) {

                $("onlineSearch")?.focus();

            }

        }
    );


    /*
     * =====================================================
     * CHAT SEARCH BUTTON
     * =====================================================
     */

    $("chatSearchBtn")?.addEventListener(
        "click",
        () => {

            const wrap =
                $("chatSearchWrap");


            wrap?.classList.toggle(
                "open"
            );


            if (
                wrap?.classList.contains(
                    "open"
                )
            ) {

                $("chatSearch")?.focus();

            }

        }
    );


    /*
     * =====================================================
     * ONLINE SEARCH
     * =====================================================
     */

    $("onlineSearch")?.addEventListener(
        "input",
        event => {

            const term =
                event.target.value
                    .trim()
                    .toLowerCase();


            if (!term) {

                renderOnline(
                    onlineUsers
                );

                return;

            }


            const filtered =
                onlineUsers.filter(
                    user => {

                        const text = [

                            getFullName(
                                user
                            ),

                            user.username,

                            user.bio

                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        return text.includes(
                            term
                        );

                    }
                );


            renderOnline(
                filtered
            );

        }
    );


    /*
     * =====================================================
     * CHAT SEARCH
     * =====================================================
     */

    $("chatSearch")?.addEventListener(
        "input",
        event => {

            searchChats(
                event.target.value
            );

        }
    );


    /*
     * =====================================================
     * LOGOUT
     * =====================================================
     */

    $("logoutBtn")?.addEventListener(
        "click",
        async () => {

            await setPresence(
                false
            );


            stopDashboardListeners();


            await logout(
                true
            );

        }
    );


    /*
     * =====================================================
     * COMING SOON LINKS
     * =====================================================
     */

    document
        .querySelectorAll(
            "[data-coming]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    event => {

                        /*
                         * Allow real links to work.
                         */

                        if (
                            element.getAttribute(
                                "href"
                            ) !== "#"
                        ) {

                            return;

                        }


                        event.preventDefault();


                        showToast(
                            `${element.dataset.coming} feature coming soon.`
                        );

                    }
                );

            }
        );

}


/* =========================================================
   USERS LISTENER
========================================================= */

function listenToUsers() {

    if (stopUsers) {

        stopUsers();

        stopUsers = null;

    }


    const usersQuery =
        query(

            collection(
                db,
                "users"
            ),

            limit(100)

        );


    stopUsers =
        onSnapshot(

            usersQuery,

            snapshot => {

                const users =
                    snapshot.docs.map(
                        userDoc => {

                            return {

                                uid:
                                    userDoc.id,

                                ...publicProfileData(
                                    userDoc.data()
                                )

                            };

                        }
                    );


                onlineUsers =
                    users;


                /*
                 * Own profile.
                 */

                const own =
                    users.find(
                        user =>
                            user.uid ===
                            currentUser?.uid
                    );


                if (own) {

                    currentProfile = {

                        ...currentProfile,

                        ...own

                    };


                    saveProfileToCache(
                        currentProfile
                    );


                    renderProfile();

                }


                /*
                 * Render users.
                 */

                const searchTerm =
                    $("onlineSearch")
                        ?.value
                        ?.trim()
                        ?.toLowerCase() ||
                    "";


                if (searchTerm) {

                    const filtered =
                        users.filter(
                            user => {

                                const text = [

                                    getFullName(
                                        user
                                    ),

                                    user.username,

                                    user.bio

                                ]
                                    .filter(Boolean)
                                    .join(" ")
                                    .toLowerCase();


                                return text.includes(
                                    searchTerm
                                );

                            }
                        );


                    renderOnline(
                        filtered
                    );

                } else {

                    renderOnline(
                        users
                    );

                }


                /*
                 * Update private chat names.
                 */

                recentChats =
                    recentChats.map(
                        chat => {

                            const profile =
                                users.find(
                                    user =>
                                        user.uid ===
                                        chat.otherUid
                                );


                            if (!profile) {

                                return chat;

                            }


                            return {

                                ...chat,

                                otherUserName:
                                    getFullName(
                                        profile
                                    ),

                                otherUserPhoto:
                                    profile.photoURL ||
                                    "",

                                otherUserVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


                /*
                 * Update group sender names.
                 */

                recentGroups =
                    recentGroups.map(
                        group => {

                            const profile =
                                users.find(
                                    user =>
                                        user.uid ===
                                        group.lastMessageSenderId
                                );


                            if (!profile) {

                                return group;

                            }


                            return {

                                ...group,

                                lastMessageSenderName:
                                    getFullName(
                                        profile
                                    ),

                                lastMessageSenderVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


                mergeRecentChats();

            },

            error => {

                console.error(
                    "[CONNECTA] Users listener:",
                    error
                );


                const box =
                    $("onlineUsers");


                hideOnlineSkeleton();


                if (box) {

                    box.innerHTML = `

                        <div
                            class="connecta-dashboard-error"
                        >
                            Users could not be loaded.
                        </div>

                    `;

                }

            }

        );

}


/* =========================================================
   INITIALIZE DASHBOARD
========================================================= */

async function initializeDashboard() {

    try {

        /*
         * Authenticate.
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

                displayName:
                    currentUser.displayName ||
                    "",

                photoURL:
                    currentUser.photoURL ||
                    "",

                status:
                    "active",

                balance:
                    0,

                following:
                    []

            };


        /*
         * =================================================
         * CACHE FIRST
         * =================================================
         */

        loadDashboardCache();


        renderProfile();


        /*
         * =================================================
         * ACCOUNT CONTROL
         * =================================================
         */

        const control =
            getAccountControl(
                currentProfile
            );


        if (
            control.blocked
        ) {

            showAccountBlockedScreen(
                control
            );


            return;

        }


        /*
         * =================================================
         * PRESENCE
         * =================================================
         */

        startPresence();


        /*
         * =================================================
         * LIVE USERS
         * =================================================
         */

        listenToUsers();


        /*
         * =================================================
         * LIVE PRIVATE CHATS
         * =================================================
         */

        listenToChats(
            currentUser.uid
        );


        /*
         * =================================================
         * LIVE GROUPS
         * =================================================
         */

        listenToGroups(
            currentUser.uid
        );


    } catch (error) {

        console.error(
            "[CONNECTA] Dashboard initialization failed:",
            error
        );


        showToast(
            "Could not initialize CONNECTA dashboard."
        );

    }

}


/* =========================================================
   PAGE HIDE
========================================================= */

window.addEventListener(
    "pagehide",
    () => {

        clearTimeout(
            groupProcessTimer
        );


        clearInterval(
            presenceInterval
        );


        if (
            currentUser
        ) {

            setPresence(
                false
            );

        }


        stopDashboardListeners();

    }
);


/* =========================================================
   START
========================================================= */

installInstantDashboardStyles();

showDashboardSkeleton();

setupUI();

initializeDashboard();
