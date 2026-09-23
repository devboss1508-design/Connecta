/* =========================================================
   CONNECTA DASHBOARD ENGINE
   File: frontend/js/dashboard.js

   Compatible with:
   - dashboard.html
   - dashboard.css
   - firebase.js
   - globalAuth.js
   - chat.js
   - group-chat.js

   FEATURES
   - Cache-first dashboard
   - Instant previous data
   - Skeleton instead of "Loading..."
   - Live users
   - Online/offline status
   - Private chats
   - Groups
   - Group membership: members OR memberIds
   - Group unread counts
   - Unified recent chats
   - Verified badges
   - Follow system
   - Profile cache
   - Dashboard cache
   - Presence heartbeat
   - Account restriction protection
========================================================= */

import {
    db
} from "./firebase.js";

import {
    getCurrentConnectaUser,
    logout
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
    where,
    runTransaction,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   DOM
========================================================= */

const $ = id => document.getElementById(id);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let onlineUsers = [];

let recentChats = [];
let recentGroups = [];

let stopUsers = null;
let stopChats = null;

let groupListeners = {
    memberIds: [],
    members: [],
    owned: []
};

let groupUnsubscribers = [];

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
   INSTANT STYLES
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
                background-position:-600px 0;
            }

            100% {
                background-position:600px 0;
            }

        }

        .connecta-skeleton {

            background:
                linear-gradient(
                    90deg,
                    #edf2ee 25%,
                    #f8faf8 50%,
                    #edf2ee 75%
                );

            background-size:1200px 100%;

            animation:
                connectaShimmer
                1.25s infinite linear;

            border-radius:16px;

        }

        .connecta-skeleton-users {

            display:flex;
            gap:10px;
            width:100%;
            overflow:hidden;

        }

        .connecta-skeleton-user {

            min-width:122px;
            height:150px;
            flex:0 0 122px;

        }

        .connecta-skeleton-chat {

            width:100%;
            height:68px;
            margin-bottom:8px;

        }

        .verified-badge {

            display:inline-flex;
            align-items:center;
            justify-content:center;

            width:16px;
            height:16px;

            margin-left:3px;

            border-radius:50%;

            background:#22c55e;
            color:#fff;

            font-size:10px;
            font-weight:900;

            vertical-align:middle;

        }

        .chat-status-ticks {

            font-size:10px;
            margin-left:3px;
            color:#94a3b8;

        }

        .chat-status-ticks.read {

            color:#22c55e;

        }

        .connecta-empty {

            width:100%;
            min-height:100px;

            display:grid;
            place-items:center;

            padding:20px;

            color:#718078;

            font-size:13px;
            text-align:center;

        }

        .connecta-error {

            width:100%;
            padding:18px;

            color:#b42318;

            font-size:13px;
            text-align:center;

        }

        .user-card {

            cursor:pointer;

        }

        .chat-item {

            cursor:pointer;

        }

        .group-avatar {

            background:#dcfce7;
            color:#166534;

        }

    `;

    document.head.appendChild(style);
}


/* =========================================================
   SKELETON
========================================================= */

function showDashboardSkeleton() {

    const onlineBox =
        $("onlineUsers");

    const chatBox =
        $("chatList");


    if (onlineBox) {

        onlineBox.innerHTML = `

            <div
                class="connecta-skeleton-users"
                aria-hidden="true"
            >

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-user
                    "
                ></div>

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-user
                    "
                ></div>

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-user
                    "
                ></div>

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-user
                    "
                ></div>

            </div>

        `;

        onlineBox.setAttribute(
            "aria-busy",
            "true"
        );
    }


    if (chatBox) {

        chatBox.innerHTML = `

            <div aria-hidden="true">

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-chat
                    "
                ></div>

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-chat
                    "
                ></div>

                <div
                    class="
                        connecta-skeleton
                        connecta-skeleton-chat
                    "
                ></div>

            </div>

        `;

        chatBox.setAttribute(
            "aria-busy",
            "true"
        );
    }
}


/* =========================================================
   PUBLIC PROFILE DATA
========================================================= */

function publicProfileData(user = {}) {

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
            Number(user.followersCount || 0),

        followingCount:
            Number(user.followingCount || 0),

        lastSeen:
            user.lastSeen || null
    };
}


/* =========================================================
   CACHE KEY
========================================================= */

function getDashboardCacheKey(uid) {

    return (
        DASHBOARD_CACHE_PREFIX +
        uid
    );

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


function saveProfileToCache(profile) {

    if (!profile?.uid) {
        return;
    }

    try {

        const cache =
            getProfileCache();

        cache[profile.uid] = {

            ...publicProfileData(
                profile
            ),

            cachedAt:
                Date.now()

        };

        localStorage.setItem(
            PROFILE_CACHE_KEY,
            JSON.stringify(cache)
        );

    } catch {

        // Cache is optional.
    }

}


function getCachedProfile(uid) {

    if (!uid) {
        return null;
    }

    try {

        const cache =
            getProfileCache();

        return cache[uid] || null;

    } catch {

        return null;

    }

}


/* =========================================================
   SAVE DASHBOARD CACHE
========================================================= */

function saveDashboardCache() {

    if (!currentUser) {
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
                            ? currentProfile.following
                            : [],

                    balance:
                        Number(
                            currentProfile.balance || 0
                        ),

                    status:
                        currentProfile.status ||
                        "active"

                }
                : null;


        const safeGroups =
            recentGroups.map(group => {

                const {
                    readData,
                    ...safeGroup
                } = group;

                return safeGroup;

            });


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
            "Dashboard cache save failed:",
            error
        );

    }

}


/* =========================================================
   LOAD DASHBOARD CACHE
========================================================= */

function loadDashboardCache() {

    if (!currentUser) {
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


        /* PROFILE */

        if (cache.profile) {

            currentProfile = {

                ...cache.profile,

                ...currentProfile

            };

            renderProfile();

        }


        /* USERS */

        if (
            Array.isArray(
                cache.users
            )
        ) {

            onlineUsers =
                cache.users;

            renderOnline();

        }


        /* PRIVATE CHATS */

        if (
            Array.isArray(
                cache.chats
            )
        ) {

            recentChats =
                cache.chats;

        }


        /* GROUPS */

        if (
            Array.isArray(
                cache.groups
            )
        ) {

            recentGroups =
                cache.groups;

        }


        if (
            recentChats.length ||
            recentGroups.length
        ) {

            mergeRecentChats();

        }


        return true;

    } catch (error) {

        console.warn(
            "Dashboard cache load failed:",
            error
        );

        return false;

    }

}


/* =========================================================
   NAME
========================================================= */

function getFullName(user = {}) {

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
   INITIALS
========================================================= */

function initials(name = "U") {

    const parts =
        String(name)
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


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
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

            })[character]
        );

}


/* =========================================================
   VERIFIED BADGE
========================================================= */

function verifiedBadge(user) {

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

function timestampToDate(value) {

    if (!value) {
        return null;
    }


    if (
        value instanceof Date
    ) {

        return value;

    }


    if (
        typeof value?.toDate ===
        "function"
    ) {

        return value.toDate();

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
        typeof value.seconds ===
        "number"
    ) {

        return new Date(
            value.seconds * 1000
        );

    }


    if (
        typeof value._seconds ===
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

function formatTimestamp(value) {

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
                hour: "numeric",
                minute: "2-digit"
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
            day: "numeric",
            month: "short"
        }
    );

}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(profile) {

    if (!profile) {

        return {

            blocked: true,
            status: "unknown",
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


    if (status === "banned") {

        return {

            blocked: true,
            status: "banned",

            message:
                "Your CONNECTA account has been banned."

        };

    }


    if (status === "suspended") {

        return {

            blocked: true,
            status: "suspended",

            message:
                "Your CONNECTA account is currently suspended."

        };

    }


    return {

        blocked: false,
        status: "active",
        message: ""

    };

}


/* =========================================================
   BLOCKED SCREEN
========================================================= */

function showAccountBlockedScreen(control) {

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
                    box-shadow:
                        0 15px 45px
                        rgba(0,0,0,.08);
                "
            >

                <div
                    style="
                        width:64px;
                        height:64px;
                        border-radius:50%;
                        margin:0 auto 18px;
                        display:grid;
                        place-items:center;
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
    user,
    className = ""
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


    element.classList.add(
        ...className
            .split(" ")
            .filter(Boolean)
    );


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


    const fullName =
        getFullName(
            currentProfile
        );


    const photo =
        currentProfile.photoURL ||
        currentProfile.photoUrl ||
        "";


    const welcomeName =
        $("welcomeName");

    const balanceAmount =
        $("balanceAmount");

    const menuName =
        $("menuName");

    const menuUsername =
        $("menuUsername");

    const menuAvatar =
        $("menuAvatar");

    const welcomeAvatar =
        $("welcomeAvatar");

    const profileBtn =
        $("profileBtn");


    if (welcomeName) {

        welcomeName.textContent =
            fullName;

    }


    if (balanceAmount) {

        balanceAmount.textContent =
            Number(
                currentProfile.balance || 0
            ).toLocaleString(
                "en-KE",
                {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                }
            );

    }


    if (menuName) {

        menuName.textContent =
            fullName;

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
        menuAvatar,
        currentProfile
    );


    renderAvatarElement(
        welcomeAvatar,
        currentProfile
    );


    if (profileBtn) {

        if (photo) {

            profileBtn.innerHTML = `

                <img
                    src="${escapeHtml(photo)}"
                    alt="${escapeHtml(fullName)}"
                >

            `;

        } else {

            profileBtn.textContent =
                initials(fullName);

        }

        profileBtn.setAttribute(
            "aria-label",
            `${fullName} profile`
        );

    }

}

/* =========================================================
   RENDER ONLINE USERS
   ORDER:
   1. Current logged-in user
   2. Other ONLINE users
   3. OFFLINE users
========================================================= */

function renderOnline() {

    const box =
        $("onlineUsers");

    if (!box) {
        return;
    }

    box.setAttribute(
        "aria-busy",
        "false"
    );

    /*
     * The Firebase Auth UID is the primary source of truth.
     */
    const currentUid =
        String(
            currentUser?.uid || ""
        );

    /*
     * Update ONLINE count.
     *
     * This counts only users whose isOnline is true.
     */
    const onlineCount =
        $("onlineCount");

    const activeCount =
        onlineUsers.filter(
            user =>
                user.isOnline === true
        ).length;

    if (onlineCount) {

        onlineCount.textContent =
            `(${activeCount})`;

    }

    /*
     * Nothing to show.
     */
    if (!onlineUsers.length) {

        box.innerHTML = `
            <div class="connecta-empty">
                No users found.
            </div>
        `;

        return;
    }

    /*
     * =====================================================
     * NORMALIZE USERS
     * =====================================================
     *
     * Make absolutely sure every user has a UID.
     */
    const normalizedUsers =
        onlineUsers
            .map(user => ({

                ...user,

                uid:
                    String(
                        user.uid || ""
                    )

            }))
            .filter(
                user =>
                    user.uid
            );

    /*
     * =====================================================
     * SORT
     * =====================================================
     *
     * 1. CURRENT USER FIRST
     * 2. OTHER ONLINE USERS
     * 3. OFFLINE USERS
     *
     * This means the current user ALWAYS stays first,
     * regardless of name or online status.
     */
    const sortedUsers =
        [...normalizedUsers].sort(
            (a, b) => {

                const aIsCurrent =
                    a.uid === currentUid;

                const bIsCurrent =
                    b.uid === currentUid;

                /*
                 * CURRENT USER FIRST
                 */
                if (
                    aIsCurrent &&
                    !bIsCurrent
                ) {

                    return -1;

                }

                if (
                    !aIsCurrent &&
                    bIsCurrent
                ) {

                    return 1;

                }

                /*
                 * OTHER ONLINE USERS BEFORE OFFLINE USERS
                 */
                if (
                    a.isOnline !==
                    b.isOnline
                ) {

                    return a.isOnline
                        ? -1
                        : 1;

                }

                /*
                 * Same category:
                 * alphabetical order.
                 */
                return getFullName(a)
                    .localeCompare(
                        getFullName(b)
                    );

            }
        );

    /*
     * =====================================================
     * RENDER CARDS
     * =====================================================
     */
    box.innerHTML =
        sortedUsers
            .map(user => {

                const userUid =
                    String(
                        user.uid || ""
                    );

                /*
                 * CURRENT USER
                 */
                const isCurrentUser =
                    userUid === currentUid;

                const name =
                    getFullName(user);

                const photo =
                    user.photoURL ||
                    user.photoUrl ||
                    "";

                /*
                 * Following only applies to OTHER users.
                 */
                const isFollowing =
                    !isCurrentUser &&
                    Array.isArray(
                        currentProfile?.following
                    ) &&
                    currentProfile.following
                        .map(String)
                        .includes(
                            userUid
                        );

                return `

                    <div
                        class="user-card"
                        data-user-card="${escapeHtml(
                            userUid
                        )}"
                    >

                        <div class="user-card-profile">

                            <!-- PROFILE PHOTO -->

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

                            <!-- NAME -->

                            <strong>

                                ${escapeHtml(
                                    name
                                )}

                                ${verifiedBadge(user)}

                            </strong>

                            <!-- STATUS -->

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

                            <!-- ACTION -->

                            ${
                                isCurrentUser

                                    ? `

                                        <button
                                            type="button"
                                            class="
                                                follow-btn
                                                following
                                            "
                                            data-own-profile="true"
                                        >
                                            You
                                        </button>

                                      `

                                    : `

                                        <button
                                            type="button"
                                            class="
                                                follow-btn
                                                ${
                                                    isFollowing
                                                        ? "following"
                                                        : ""
                                                }
                                            "
                                            data-follow-uid="${escapeHtml(
                                                userUid
                                            )}"
                                        >
                                            ${
                                                isFollowing
                                                    ? "Following"
                                                    : "Follow"
                                            }
                                        </button>

                                      `
                            }

                        </div>

                    </div>

                `;

            })
            .join("");

    /*
     * =====================================================
     * FOLLOW BUTTONS
     * =====================================================
     *
     * Give every Follow button its own click handler.
     *
     * This is more reliable than depending only on
     * event delegation from the parent container.
     */
    box
        .querySelectorAll(
            "[data-follow-uid]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async event => {

                    event.preventDefault();
                    event.stopPropagation();

                    const targetUid =
                        String(
                            button.dataset.followUid ||
                            ""
                        );

                    if (!targetUid) {
                        return;
                    }

                    /*
                     * Prevent double taps.
                     */
                    if (
                        button.disabled
                    ) {
                        return;
                    }

                    button.disabled = true;

                    const oldText =
                        button.textContent;

                    button.textContent =
                        "Updating...";

                    try {

                        await toggleFollow(
                            targetUid
                        );

                    } catch (error) {

                        console.error(
                            "[CONNECTA] Follow button error:",
                            error
                        );

                        button.textContent =
                            oldText;

                    } finally {

                        button.disabled =
                            false;

                    }

                }
            );

        });

    /*
     * =====================================================
     * USER CARD CLICK
     * =====================================================
     *
     * Clicking anywhere on the card except the Follow
     * button opens that user's profile.
     */
    box
        .querySelectorAll(
            "[data-user-card]"
        )
        .forEach(card => {

            card.addEventListener(
                "click",
                event => {

                    /*
                     * Do not open the profile when the
                     * Follow button was clicked.
                     */
                    if (
                        event.target.closest(
                            "[data-follow-uid]"
                        )
                    ) {

                        return;

                    }

                    const uid =
                        String(
                            card.dataset.userCard ||
                            ""
                        );

                    if (!uid) {
                        return;
                    }

                    console.log(
                        "[CONNECTA] Opening user profile:",
                        uid
                    );

                    window.location.href =
                        `profile.html?uid=${encodeURIComponent(
                            uid
                        )}`;

                }
            );

        });

   }


/* =========================================================
   FOLLOW
========================================================= */

async function toggleFollow(targetUid) {

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
                        ? [...currentData.following]
                        : [];


                const followers =
                    Array.isArray(
                        targetData.followers
                    )
                        ? [...targetData.followers]
                        : [];


                const alreadyFollowing =
                    following.includes(
                        targetUid
                    );


                if (alreadyFollowing) {

                    const nextFollowing =
                        following.filter(
                            id =>
                                id !== targetUid
                        );


                    const nextFollowers =
                        followers.filter(
                            id =>
                                id !==
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
                                        currentData.followingCount || 0
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
                                        targetData.followersCount || 0
                                    ) - 1
                                )

                        }
                    );

                } else {

                    following.push(
                        targetUid
                    );


                    if (
                        !followers.includes(
                            currentUser.uid
                        )
                    ) {

                        followers.push(
                            currentUser.uid
                        );

                    }


                    transaction.update(
                        currentRef,
                        {

                            following,

                            followingCount:
                                Number(
                                    currentData.followingCount || 0
                                ) + 1

                        }
                    );


                    transaction.update(
                        targetRef,
                        {

                            followers,

                            followersCount:
                                Number(
                                    targetData.followersCount || 0
                                ) + 1

                        }
                    );

                }

            }
        );


        const profileSnap =
            await getDoc(
                doc(
                    db,
                    "users",
                    currentUser.uid
                )
            );


        if (profileSnap.exists()) {

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
            "Follow error:",
            error
        );

        showToast(
            error?.message ||
            "Could not update follow status."
        );

    }

}


/* =========================================================
   USER PROFILE
========================================================= */

async function getUserProfile(uid) {

    if (!uid) {
        return null;
    }


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


        if (!snapshot.exists()) {
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

async function refreshUserProfile(uid) {

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


        if (!snapshot.exists()) {
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
                        group.lastMessageSenderId !== uid
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
   PRIVATE CHAT LIVE LISTENER
   =========================================================
   - Listens ONLY to chats involving the current user
   - Updates immediately when a message is sent
   - No page refresh required
   - No composite index required
   - Sorts chats locally by updatedAt
========================================================= */

function listenToChats(uid) {

    if (!uid) {
        return;
    }


    /* STOP PREVIOUS LISTENER */

    if (stopChats) {

        stopChats();

        stopChats = null;

    }


    const chatsRef =
        collection(
            db,
            "chats"
        );


    /*
     * IMPORTANT
     *
     * We intentionally do NOT use:
     *
     * orderBy("updatedAt", "desc")
     *
     * here.
     *
     * That combination with array-contains can require
     * a composite Firestore index.
     *
     * Instead, Firestore listens to all chats belonging
     * to this user and we sort them locally.
     */

    const chatsQuery =
        query(

            chatsRef,

            where(
                "participants",
                "array-contains",
                uid
            ),

            limit(100)

        );


    console.log(
        "[CONNECTA] Starting LIVE private chat listener:",
        uid
    );


    stopChats =
        onSnapshot(

            chatsQuery,

            async snapshot => {

                console.log(
                    "[CONNECTA] LIVE chat snapshot:",
                    snapshot.docs.length
                );


                const result = [];


                for (
                    const chatDoc
                    of snapshot.docs
                ) {

                    const data =
                        chatDoc.data();


                    /*
                     * FIND OTHER USER
                     */

                    const participants =
                        Array.isArray(
                            data.participants
                        )
                            ? data.participants
                            : [];


                    const otherUid =
                        participants.find(
                            participant =>
                                participant !== uid
                        );


                    if (!otherUid) {

                        continue;

                    }


                    /*
                     * FIND USER PROFILE
                     *
                     * First use users already loaded
                     * by the dashboard.
                     */

                    let profile =
                        onlineUsers.find(
                            user =>
                                user.uid ===
                                otherUid
                        );


                    /*
                     * Then try local profile cache.
                     */

                    if (!profile) {

                        profile =
                            getCachedProfile(
                                otherUid
                            );

                    }


                    /*
                     * DO NOT WAIT FOR PROFILE
                     *
                     * The chat must appear immediately
                     * even if the profile hasn't loaded.
                     */

                    const otherName =
                        profile

                            ? getFullName(
                                profile
                            )

                            : (
                                data.otherUserName ||
                                "CONNECTA User"
                            );


                    const otherPhoto =
                        profile?.photoURL ||
                        profile?.photoUrl ||
                        data.otherUserPhoto ||
                        "";


                    const otherVerified =
                        profile?.isVerified === true ||
                        data.otherUserVerified === true;


                    /*
                     * UNREAD COUNT
                     */

                    const unread =
                        Number(
                            data.unreadCount?.[uid] ||
                            data.unread?.[uid] ||
                            0
                        );


                    /*
                     * LAST SENDER
                     */

                    const lastSenderId =
                        data.lastSenderId ||
                        data.lastMessageSenderId ||
                        "";


                    /*
                     * LAST MESSAGE
                     */

                    const lastMessage =
                        data.lastMessage ||
                        "";


                    /*
                     * MESSAGE TYPE
                     */

                    const lastMessageType =
                        data.lastMessageType ||
                        "text";


                    let preview =
                        lastMessage;


                    if (
                        lastMessageType ===
                        "image"
                    ) {

                        preview =
                            "📷 Photo";

                    }


                    /*
                     * EMPTY / NEW CHAT
                     */

                    if (
                        !preview &&
                        lastSenderId === uid
                    ) {

                        preview =
                            "You started a conversation";

                    }


                    /*
                     * BUILD CHAT OBJECT
                     */

                    result.push({

                        type:
                            "private",

                        chatId:
                            chatDoc.id,

                        otherUid:

                            otherUid,

                        otherUserName:
                            otherName,

                        otherUserPhoto:
                            otherPhoto,

                        otherUserVerified:
                            otherVerified,

                        lastMessage:
                            preview,

                        lastMessageType:
                            lastMessageType,

                        lastSenderId:
                            lastSenderId,

                        unread:
                            unread,

                        /*
                         * IMPORTANT:
                         *
                         * chat.js updates updatedAt
                         * whenever a new message is sent.
                         *
                         * This value is used to move the
                         * conversation to the top.
                         */

                        lastMessageAt:
                            data.updatedAt ||
                            data.lastMessageAt ||
                            null,

                        updatedAt:
                            data.updatedAt ||
                            null,

                        delivered:
                            data.delivered === true,

                        read:
                            data.read === true

                    });

                }


                /*
                 * SORT LOCALLY
                 *
                 * Newest conversation first.
                 */

                result.sort(
                    (a, b) => {

                        const dateA =
                            timestampToDate(
                                a.lastMessageAt ||
                                a.updatedAt
                            );


                        const dateB =
                            timestampToDate(
                                b.lastMessageAt ||
                                b.updatedAt
                            );


                        return (

                            (dateB?.getTime() || 0) -
                            (dateA?.getTime() || 0)

                        );

                    }
                );


                /*
                 * REPLACE LIVE CHAT DATA
                 */

                recentChats =
                    result;


                /*
                 * RENDER IMMEDIATELY
                 */

                mergeRecentChats();


                /*
                 * REFRESH OTHER USER PROFILES
                 *
                 * This happens in the background.
                 * It does NOT delay the chat preview.
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
                    "[CONNECTA] LIVE chat listener error:",
                    error
                );


                /*
                 * Keep cached chats visible.
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
         * Never opened.
         */

        if (
            !readData?.lastReadAt
        ) {

            const q =
                query(
                    messagesRef,
                    orderBy(
                        "createdAt",
                        "desc"
                    ),
                    limit(100)
                );


            const snapshot =
                await getDocs(q);


            return snapshot.docs.filter(
                messageDoc =>
                    messageDoc.data().senderId !==
                    currentUser.uid
            ).length;

        }


        const readDate =
            timestampToDate(
                readData.lastReadAt
            );


        if (!readDate) {
            return 0;
        }


        const q =
            query(
                messagesRef,
                where(
                    "createdAt",
                    ">",
                    readDate
                ),
                orderBy(
                    "createdAt",
                    "desc"
                ),
                limit(100)
            );


        const snapshot =
            await getDocs(q);


        return snapshot.docs.filter(
            messageDoc =>
                messageDoc.data().senderId !==
                currentUser.uid
        ).length;

    } catch (error) {

        console.warn(
            "Group unread count failed:",
            groupId,
            error
        );

        return 0;

    }

}


/* =========================================================
   PROCESS GROUPS
========================================================= */

async function processGroups() {

    if (!currentUser) {
        return;
    }


    const version =
        ++groupProcessVersion;


    const groupMap =
        new Map();


    /* =====================================================
       COLLECT GROUPS FROM ALL MEMBERSHIP SOURCES
    ===================================================== */

    for (
        const groupDoc
        of groupListeners.memberIds
    ) {

        groupMap.set(
            groupDoc.id,
            {
                groupId:
                    groupDoc.id,

                ...groupDoc.data()
            }
        );

    }


    for (
        const groupDoc
        of groupListeners.members
    ) {

        groupMap.set(
            groupDoc.id,
            {
                groupId:
                    groupDoc.id,

                ...groupDoc.data()
            }
        );

    }


    for (
        const groupDoc
        of groupListeners.owned
    ) {

        groupMap.set(
            groupDoc.id,
            {
                groupId:
                    groupDoc.id,

                ...groupDoc.data()
            }
        );

    }


    const groups =
        Array.from(
            groupMap.values()
        );


    /* =====================================================
       BUILD GROUPS IMMEDIATELY
       
       IMPORTANT:
       Do NOT wait for unread-count queries before
       rendering Recent Chats.
       
       This makes:
       - newly joined groups appear immediately
       - new group messages appear immediately
       - group preview/time update immediately
    ===================================================== */

    const enriched =
        groups
            .filter(group => {

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

                    String(
                        group.ownerId || ""
                    ) ===
                    String(
                        currentUser.uid
                    );


                return isMember;

            })
            .map(group => {

                let senderProfile = null;


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
                    group.lastMessageSenderVerified === true ||

                    senderProfile?.isVerified === true;


                return {

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
                        (
                            String(
                                group.lastMessage ||
                                ""
                            ).startsWith("📷")
                                ? "image"
                                : "text"
                        ),

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

                    /*
                     * Keep the previous unread value while
                     * the realtime group preview is rendered.
                     */
                    unread:
                        Number(
                            recentGroups.find(
                                item =>
                                    item.groupId ===
                                    group.groupId
                            )?.unread || 0
                        ),

                    readData:
                        null,

                    status:
                        group.status ||
                        "",

                    chatLocked:
                        group.chatLocked === true

                };

            });


    /* =====================================================
       CANCEL STALE PROCESS
    ===================================================== */

    if (
        version !==
        groupProcessVersion
    ) {

        return;

    }


    /* =====================================================
       RENDER IMMEDIATELY
    ===================================================== */

    recentGroups =
        enriched;


    updateGroupBadge();

    mergeRecentChats();


    /* =====================================================
       LOAD READ / UNREAD DATA IN BACKGROUND
       
       This happens AFTER Recent Chats has already
       rendered.
    ===================================================== */

    const unreadTasks =
        enriched.map(
            async group => {

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


                    const readData =
                        readSnapshot.exists()
                            ? readSnapshot.data()
                            : null;


                    const unread =
                        await getGroupUnreadCount(
                            group.groupId,
                            readData
                        );


                    return {

                        groupId:
                            group.groupId,

                        unread,

                        readData

                    };

                } catch (error) {

                    console.warn(
                        "Group unread background update failed:",
                        group.groupId,
                        error
                    );


                    return {

                        groupId:
                            group.groupId,

                        unread:
                            Number(
                                group.unread || 0
                            ),

                        readData:
                            null

                    };

                }

            }
        );


    const unreadResults =
        await Promise.all(
            unreadTasks
        );


    /*
     * The user may have received another realtime
     * group update while unread counts were loading.
     *
     * Never overwrite newer data.
     */

    if (
        version !==
        groupProcessVersion
    ) {

        return;

    }


    const unreadMap =
        new Map(
            unreadResults.map(
                item => [
                    item.groupId,
                    item
                ]
            )
        );


    recentGroups =
        recentGroups.map(
            group => {

                const unreadData =
                    unreadMap.get(
                        group.groupId
                    );


                if (!unreadData) {
                    return group;
                }


                return {

                    ...group,

                    unread:
                        unreadData.unread,

                    readData:
                        unreadData.readData

                };

            }
        );


    updateGroupBadge();

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
                    .catch(error => {

                        console.error(
                            "Group processing error:",
                            error
                        );

                    });

            },
            0
        );

}


/* =========================================================
   GROUP LISTENER
========================================================= */

function listenToGroups(uid) {

    groupUnsubscribers.forEach(
        unsubscribe => {

            if (
                typeof unsubscribe ===
                "function"
            ) {

                unsubscribe();

            }

        }
    );


    groupUnsubscribers = [];


    groupListeners = {

        memberIds: [],
        members: [],
        owned: []

    };


    recentGroups = [];


    const groupsRef =
        collection(
            db,
            "groups"
        );


    const memberIdsQuery =
    query(
        groupsRef,
        where(
            "memberIds",
            "array-contains",
            uid
        ),
        limit(100)
    );


const membersQuery =
    query(
        groupsRef,
        where(
            "members",
            "array-contains",
            uid
        ),
        limit(100)
    );


const ownerQuery =
    query(
        groupsRef,
        where(
            "ownerId",
            "==",
            uid
        ),
        limit(100)
    );


    /*
     * Initial data.
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

    ]).then(results => {

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

    });


    /*
     * memberIds
     */

    groupUnsubscribers.push(

        onSnapshot(
            memberIdsQuery,

            snapshot => {

                groupListeners.memberIds =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "memberIds listener:",
                    error
                );

            }
        )

    );


    /*
     * members
     */

    groupUnsubscribers.push(

        onSnapshot(
            membersQuery,

            snapshot => {

                groupListeners.members =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "members listener:",
                    error
                );

            }
        )

    );


    /*
     * owner
     */

    groupUnsubscribers.push(

        onSnapshot(
            ownerQuery,

            snapshot => {

                groupListeners.owned =
                    snapshot.docs;

                queueGroupProcessing();

            },

            error => {

                console.warn(
                    "owner listener:",
                    error
                );

            }
        )

    );

}


/* =========================================================
   GROUP BADGE
========================================================= */

function updateGroupBadge() {

    const badge =
        $("groupBadge");


    if (!badge) {
        return;
    }


    const unread =
        recentGroups.reduce(
            (total, group) =>
                total +
                Number(
                    group.unread || 0
                ),
            0
        );


    if (unread > 0) {

        badge.hidden = false;

        badge.textContent =
            unread > 99
                ? "99+"
                : String(unread);

    } else {

        badge.hidden = true;

    }

}


/* =========================================================
   MERGE RECENT CHATS
========================================================= */

function mergeRecentChats() {

    const map =
        new Map();


    for (
        const chat
        of recentChats
    ) {

        map.set(
            `private:${chat.chatId}`,
            chat
        );

    }


    for (
        const group
        of recentGroups
    ) {

        map.set(
            `group:${group.groupId}`,
            group
        );

    }


    const combined =
        Array.from(
            map.values()
        );


    combined.sort(
        (a, b) => {

            const dateA =
                timestampToDate(
                    a.lastMessageAt ||
                    a.updatedAt
                );


            const dateB =
                timestampToDate(
                    b.lastMessageAt ||
                    b.updatedAt
                );


            return (

                (dateB?.getTime() || 0) -
                (dateA?.getTime() || 0)

            );

        }
    );


    renderChats(
        combined
    );


    saveDashboardCache();

}


/* =========================================================
   CHAT STATUS
========================================================= */

function getMessageStatus(chat) {

    if (
        chat.lastSenderId !==
        currentUser?.uid
    ) {

        return "";

    }


    if (
        chat.read === true
    ) {

        return `
            <span
                class="chat-status-ticks read"
                title="Read"
            >
                ✓✓
            </span>
        `;

    }


    if (
        chat.delivered === true
    ) {

        return `
            <span
                class="chat-status-ticks"
                title="Delivered"
            >
                ✓✓
            </span>
        `;

    }


    return `
        <span
            class="chat-status-ticks"
            title="Sent"
        >
            ✓
        </span>
    `;

}


/* =========================================================
   RENDER CHATS
========================================================= */

function renderChats(chats) {

    const box =
        $("chatList");


    if (!box) {
        return;
    }


    box.setAttribute(
        "aria-busy",
        "false"
    );


    if (!chats.length) {

        box.innerHTML = `

            <div class="empty-state">
                No conversations yet.
            </div>

        `;

        return;

    }


    box.innerHTML =
        chats.map(
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


                const avatar =
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
                 * GROUP MESSAGE PREVIEW
                 */

                let previewMarkup =
                    escapeHtml(
                        preview
                    );


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
                        </span>

                        ${senderBadge}

                        <span>
                            :
                            ${escapeHtml(
                                preview
                            )}
                        </span>

                    `;

                }


                const nameBadge =
                    !isGroup
                        ? verifiedBadge({
                            isVerified:
                                chat.otherUserVerified
                        })
                        : "";


                return `

                    <div
                        class="chat-item"
                        data-chat-type="${isGroup
                            ? "group"
                            : "private"}"
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
                                        ? "group-avatar"
                                        : "avatar-green"
                                }
                            "
                        >

                            ${avatar}

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

                                ${
                                    !isGroup
                                        ? getMessageStatus(chat)
                                        : ""
                                }

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
                                            class="unread"
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
        ).join("");


    box
        .querySelectorAll(
            ".chat-item"
        )
        .forEach(item => {

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

        });

}


/* =========================================================
   CHAT SEARCH
========================================================= */

function searchChats(term) {

    const value =
        String(term || "")
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

async function setPresence(online) {

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
                merge: true
            }

        );

    } catch (error) {

        console.warn(
            "Presence update failed:",
            error
        );

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

                if (
                    document.visibilityState ===
                    "visible"
                ) {

                    setPresence(true);

                }

            },
            60000
        );


    document.addEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   VISIBILITY
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
   STOP EVERYTHING
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


    groupUnsubscribers.forEach(
        unsubscribe => {

            if (
                typeof unsubscribe ===
                "function"
            ) {

                unsubscribe();

            }

        }
    );


    groupUnsubscribers = [];


    clearTimeout(
        groupProcessTimer
    );


    clearInterval(
        presenceInterval
    );


    presenceInterval = null;


    document.removeEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

    const toast =
        $("toast");


    if (!toast) {
        return;
    }


    toast.textContent =
        message;


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
            2600
        );

}


/* =========================================================
   DASHBOARD UI
========================================================= */

function setupUI() {

       /* =====================================================
       ONLINE USER CARD INTERACTIONS
       - Follow button -> Follow / Unfollow
       - User card -> Open profile
    ===================================================== */

    const onlineUsersBox =
        $("onlineUsers");

    onlineUsersBox?.addEventListener(
        "click",
        async event => {

            /* ---------------------------------------------
               FOLLOW BUTTON
            --------------------------------------------- */

            const followButton =
                event.target.closest(
                    "[data-follow-uid]"
                );


            if (followButton) {

                event.preventDefault();
                event.stopPropagation();


                const targetUid =
                    followButton.dataset.followUid;


                if (!targetUid) {
                    return;
                }


                followButton.disabled =
                    true;


                try {

                    await toggleFollow(
                        targetUid
                    );

                } finally {

                    followButton.disabled =
                        false;

                }


                return;
            }


            /* ---------------------------------------------
               USER CARD
            --------------------------------------------- */

            const card =
                event.target.closest(
                    "[data-user-card]"
                );


            if (!card) {
                return;
            }


            const uid =
                card.dataset.userCard;


            if (!uid) {
                return;
            }


            console.log(
                "[CONNECTA] Opening profile:",
                uid
            );


            window.location.href =
                `profile.html?uid=${encodeURIComponent(
                    uid
                )}`;

        }
    );

    /* MENU */

    const menuBtn =
        $("menuBtn");

    const sideMenu =
        $("sideMenu");

    const menuOverlay =
        $("menuOverlay");


    function openMenu() {

        sideMenu?.classList.add(
            "open"
        );

        menuOverlay?.classList.add(
            "open"
        );

        sideMenu?.setAttribute(
            "aria-hidden",
            "false"
        );

    }


    function closeMenu() {

        sideMenu?.classList.remove(
            "open"
        );

        menuOverlay?.classList.remove(
            "open"
        );

        sideMenu?.setAttribute(
            "aria-hidden",
            "true"
        );

    }


    menuBtn?.addEventListener(
        "click",
        openMenu
    );


    menuOverlay?.addEventListener(
        "click",
        closeMenu
    );


    sideMenu
        ?.querySelectorAll("a")
        .forEach(link => {

            link.addEventListener(
                "click",
                closeMenu
            );

        });


    /* PROFILE */

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


    /* CONNECTION */

    $("connectionBtn")?.addEventListener(
        "click",
        () => {

            showToast(
                "Connection feature coming soon."
            );

        }
    );


    /* ONLINE SEARCH BUTTON */

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


    /* CHAT SEARCH BUTTON */

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


    /* ONLINE SEARCH */

    $("onlineSearch")?.addEventListener(
        "input",
        event => {

            const term =
                String(
                    event.target.value || ""
                )
                    .trim()
                    .toLowerCase();


            const filtered =
                onlineUsers.filter(
                    user => {

                        if (!term) {
                            return true;
                        }


                        const text = [

                            getFullName(user),

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


            const original =
                onlineUsers;


            onlineUsers =
                filtered;


            renderOnline();


            onlineUsers =
                original;

        }
    );


    /* CHAT SEARCH */

    $("chatSearch")?.addEventListener(
        "input",
        event => {

            searchChats(
                event.target.value
            );

        }
    );


    /* COMING SOON */

    document
        .querySelectorAll(
            "[data-coming]"
        )
        .forEach(element => {

            element.addEventListener(
                "click",
                event => {

                    if (
                        element.getAttribute(
                            "href"
                        ) === "#"
                    ) {

                        event.preventDefault();

                    }


                    closeMenu();


                    showToast(
                        `${element.dataset.coming} feature coming soon.`
                    );

                }
            );

        });


    /* LOGOUT */

    $("logoutBtn")?.addEventListener(
        "click",
        async () => {

            await setPresence(false);

            stopDashboardListeners();

            await logout(true);

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

                onlineUsers =
    snapshot.docs.map(
        userDoc => {

            return {
               
                ...publicProfileData(
                    userDoc.data()
                ),

                /*
                 * Put the document UID LAST so that
                 * publicProfileData() cannot overwrite it.
                 */

                uid:
                    userDoc.id

            };

        }
    );


                /* OWN PROFILE */

                const own =
                    onlineUsers.find(
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


                renderOnline();


                /* UPDATE PRIVATE CHAT NAMES */

                recentChats =
                    recentChats.map(
                        chat => {

                            const profile =
                                onlineUsers.find(
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
                                    profile.photoUrl ||
                                    "",

                                otherUserVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


                /* UPDATE GROUP SENDERS */

                recentGroups =
                    recentGroups.map(
                        group => {

                            const profile =
                                onlineUsers.find(
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
                    "Users listener:",
                    error
                );


                const box =
                    $("onlineUsers");


                if (box) {

                    box.innerHTML = `

                        <div class="connecta-error">
                            Users could not be loaded.
                        </div>

                    `;

                }

            }

        );

}

/* =========================================================
   HYDRATE OWN PROFILE
   =========================================================
   New accounts can reach dashboard immediately after
   registration. Firebase Auth already knows the user's
   displayName, so use it immediately while Firestore
   profile data is being confirmed in the background.
========================================================= */

async function hydrateOwnProfile() {

    if (!currentUser?.uid) {
        return;
    }

    const uid =
        currentUser.uid;

    const authDisplayName =
        String(
            currentUser.displayName || ""
        ).trim();

    const authPhotoURL =
        currentUser.photoURL || "";

    /*
     * -----------------------------------------------------
     * STEP 1
     * Immediately use Firebase Auth information.
     * -----------------------------------------------------
     */

    if (
        authDisplayName &&
        authDisplayName !== "CONNECTA User"
    ) {

        currentProfile = {

            ...currentProfile,

            uid,

            displayName:
                authDisplayName,

            photoURL:
                currentProfile?.photoURL ||
                authPhotoURL ||
                ""

        };

        saveProfileToCache(
            currentProfile
        );

        renderProfile();

    }


    /*
     * -----------------------------------------------------
     * STEP 2
     * Get the real Firestore profile.
     * -----------------------------------------------------
     */

    try {

        const profileRef =
            doc(
                db,
                "users",
                uid
            );

        const snapshot =
            await getDoc(
                profileRef
            );


        if (
            !snapshot.exists()
        ) {

            console.warn(
                "[CONNECTA] Firestore profile does not exist yet:",
                uid
            );

            return;

        }


        const firestoreProfile = {

            uid,

            ...snapshot.data()

        };


        /*
         * -------------------------------------------------
         * STEP 3
         * Never allow an empty/"CONNECTA User" Firestore
         * value to replace a valid Firebase Auth name.
         * -------------------------------------------------
         */

        const firestoreName =
            String(
                firestoreProfile.displayName || ""
            ).trim();


        const firestoreFirstName =
            String(
                firestoreProfile.firstName || ""
            ).trim();


        const firestoreLastName =
            String(
                firestoreProfile.lastName || ""
            ).trim();


        let finalDisplayName =
            firestoreName;


        /*
         * If Firestore has the placeholder, reconstruct
         * the name from firstName + lastName.
         */

        if (
            !finalDisplayName ||
            finalDisplayName === "CONNECTA User"
        ) {

            const constructedName =
                `${firestoreFirstName} ${firestoreLastName}`
                    .trim();


            if (constructedName) {

                finalDisplayName =
                    constructedName;

            }

        }


        /*
         * If Firestore still has no usable name,
         * preserve Firebase Auth's real name.
         */

        if (
            !finalDisplayName ||
            finalDisplayName === "CONNECTA User"
        ) {

            if (
                authDisplayName &&
                authDisplayName !== "CONNECTA User"
            ) {

                finalDisplayName =
                    authDisplayName;

            }

        }


        currentProfile = {

            ...currentProfile,

            ...firestoreProfile,

            uid,

            displayName:
                finalDisplayName ||
                authDisplayName ||
                "CONNECTA User",

            photoURL:
                firestoreProfile.photoURL ||
                firestoreProfile.photoUrl ||
                currentProfile?.photoURL ||
                authPhotoURL ||
                "",

            balance:
                Number(
                    firestoreProfile.balance ?? 
                    currentProfile?.balance ??
                    0
                ),

            following:
                Array.isArray(
                    firestoreProfile.following
                )
                    ? firestoreProfile.following
                    : (
                        Array.isArray(
                            currentProfile?.following
                        )
                            ? currentProfile.following
                            : []
                    )

        };


        /*
         * -------------------------------------------------
         * STEP 4
         * Save immediately for the next dashboard visit.
         * -------------------------------------------------
         */

        saveProfileToCache(
            currentProfile
        );

        saveDashboardCache();


        /*
         * -------------------------------------------------
         * STEP 5
         * Update dashboard immediately.
         * -------------------------------------------------
         */

        renderProfile();

        renderOnline();


        console.log(
            "[CONNECTA] Own profile hydrated:",
            currentProfile.displayName
        );


    } catch (error) {

        console.warn(
            "[CONNECTA] Own profile hydration failed:",
            error
        );

        /*
         * Firebase Auth name remains visible, so the
         * dashboard does not need to show "Loading..."
         * or break if Firestore takes longer.
         */

        renderProfile();

    }

}

/* =========================================================
   INITIALIZE DASHBOARD
   =========================================================
   Profile-first startup.

   The dashboard never waits for Firestore before showing
   the user's basic identity.

   Priority:

   1. Firebase Auth
   2. Dashboard cache
   3. Firestore profile
   4. Live listeners
========================================================= */

async function initializeDashboard() {

    try {

        /*
         * -------------------------------------------------
         * AUTHENTICATION
         * -------------------------------------------------
         */

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


        /*
         * -------------------------------------------------
         * FIREBASE AUTH PROFILE
         * -------------------------------------------------
         *
         * Firebase Auth already knows displayName directly
         * after registration.
         */

        const authDisplayName =
            String(
                currentUser?.displayName || ""
            ).trim();


        const authPhotoURL =
            currentUser?.photoURL ||
            "";


        /*
         * -------------------------------------------------
         * EXISTING SESSION PROFILE
         * -------------------------------------------------
         */

        const sessionProfile =
            session.profile || {};


        /*
         * -------------------------------------------------
         * DETERMINE INITIAL NAME
         * -------------------------------------------------
         *
         * Never start a new account with CONNECTA User when
         * Firebase Auth already contains the real name.
         */

        let initialName =
            String(
                sessionProfile.displayName || ""
            ).trim();


        if (
            !initialName ||
            initialName === "CONNECTA User"
        ) {

            initialName =
                authDisplayName;

        }


        /*
         * -------------------------------------------------
         * INITIAL PROFILE
         * -------------------------------------------------
         *
         * This object is rendered immediately.
         */

        currentProfile = {

            ...sessionProfile,

            uid:
                currentUser.uid,

            displayName:
                initialName ||
                "",

            photoURL:
                sessionProfile.photoURL ||
                sessionProfile.photoUrl ||
                authPhotoURL ||
                "",

            status:
                sessionProfile.status ||
                "active",

            balance:
                Number(
                    sessionProfile.balance ?? 0
                ),

            following:
                Array.isArray(
                    sessionProfile.following
                )
                    ? sessionProfile.following
                    : []

        };


        /*
         * -------------------------------------------------
         * CACHE
         * -------------------------------------------------
         *
         * Load any previous dashboard data.
         *
         * Important:
         * We only allow the cache to improve the profile,
         * not replace a valid Firebase Auth name with
         * "CONNECTA User".
         */

        loadDashboardCache();


        /*
         * -------------------------------------------------
         * RESTORE AUTH NAME AFTER CACHE
         * -------------------------------------------------
         *
         * loadDashboardCache() may contain an old profile.
         * Make sure a valid Auth name wins over the
         * placeholder.
         */

        const cachedName =
            String(
                currentProfile?.displayName || ""
            ).trim();


        if (
            authDisplayName &&
            authDisplayName !== "CONNECTA User" &&
            (
                !cachedName ||
                cachedName === "CONNECTA User"
            )
        ) {

            currentProfile.displayName =
                authDisplayName;

        }


        /*
         * -------------------------------------------------
         * RESTORE AUTH PHOTO
         * -------------------------------------------------
         */

        if (
            !currentProfile.photoURL &&
            authPhotoURL
        ) {

            currentProfile.photoURL =
                authPhotoURL;

        }


        /*
         * -------------------------------------------------
         * INSTANT PROFILE RENDER
         * -------------------------------------------------
         *
         * This happens before waiting for Firestore.
         */

        renderProfile();


        /*
         * Save the usable initial profile immediately.
         */

        saveProfileToCache(
            currentProfile
        );


        /*
         * -------------------------------------------------
         * ACCOUNT STATUS
         * -------------------------------------------------
         */

        const control =
            getAccountControl(
                currentProfile
            );


        if (control.blocked) {

            showAccountBlockedScreen(
                control
            );

            return;

        }


        /*
         * -------------------------------------------------
         * FIRESTORE PROFILE HYDRATION
         * -------------------------------------------------
         *
         * This runs in the background.
         *
         * The dashboard is already visible.
         */

        hydrateOwnProfile();


        /*
         * -------------------------------------------------
         * PRESENCE
         * -------------------------------------------------
         */

        startPresence();


        /*
         * -------------------------------------------------
         * LIVE USERS
         * -------------------------------------------------
         */

        listenToUsers();


        /*
         * -------------------------------------------------
         * LIVE PRIVATE CHATS
         * -------------------------------------------------
         */

        listenToChats(
            currentUser.uid
        );


        /*
         * -------------------------------------------------
         * LIVE GROUPS
         * -------------------------------------------------
         */

        listenToGroups(
            currentUser.uid
        );


        console.log(
            "[CONNECTA] Dashboard started for:",
            currentProfile.displayName ||
            currentUser.displayName ||
            currentUser.uid
        );


    } catch (error) {

        console.error(
            "[CONNECTA] Dashboard initialization failed:",
            error
        );


        /*
         * Do NOT replace the dashboard with a loading
         * screen. The user can still see their basic
         * Firebase Auth profile if it was available.
         */

        if (
            currentUser?.displayName
        ) {

            currentProfile = {

                ...currentProfile,

                uid:
                    currentUser.uid,

                displayName:
                    currentUser.displayName,

                photoURL:
                    currentUser.photoURL ||
                    currentProfile?.photoURL ||
                    ""

            };


            renderProfile();

        } else {

            showToast(
                "Unable to load CONNECTA dashboard."
            );

        }

    }

}

/* =========================================================
   PAGE LIFECYCLE
   =========================================================
   Important:
   When navigating Dashboard → Chat → Back,
   the browser may restore Dashboard from BFCache.

   pagehide stops the listeners before leaving.
   pageshow starts them again when Dashboard returns.
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


        if (currentUser) {

            setPresence(false);

        }


        stopDashboardListeners();

    }
);


/* =========================================================
   RESUME DASHBOARD AFTER BACK/FORWARD
========================================================= */

window.addEventListener(
    "pageshow",
    event => {

        console.log(
            "[CONNECTA] Dashboard pageshow:",
            event.persisted
        );


        /*
         * If the browser restored this page from
         * BFCache, restart everything.
         */

        if (
            event.persisted
        ) {

            resumeDashboardLive();

        }

    }
);


/* =========================================================
   RESUME LIVE DASHBOARD
========================================================= */

function resumeDashboardLive() {

    if (!currentUser?.uid) {

        /*
         * If the page was restored before authentication
         * was available, initialize normally.
         */

        initializeDashboard();

        return;

    }


    console.log(
        "[CONNECTA] Restarting dashboard live listeners..."
    );


    /*
     * Restart presence.
     */

    startPresence();


    /*
     * Restart live users.
     */

    listenToUsers();


    /*
     * Restart private chat listener.
     */

    listenToChats(
        currentUser.uid
    );


    /*
     * Restart group listeners.
     */

    listenToGroups(
        currentUser.uid
    );

}

/* =========================================================
   START
========================================================= */

installInstantDashboardStyles();

setupUI();

initializeDashboard();
