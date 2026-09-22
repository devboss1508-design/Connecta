/* =========================================================
   CONNECTA DASHBOARD ENGINE
   File: frontend/js/dashboard.js

   FEATURES
   - Instant cache-first dashboard
   - No blocking "Loading..." screen
   - Skeleton/shimmer only on first visit
   - Live users
   - Live private chats
   - Live groups
   - Group membership via memberIds OR members
   - Group unread counts
   - Unified Recent Chats
   - Private-chat unread counts
   - Verified badges
   - Follow system
   - Online/offline status
   - Dashboard profile cache
   - Group/chat cache
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

let groupListeners = [];
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
        document.getElementById(
            "connectaDashboardInstantStyles"
        )
    ) {

        return;
    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "connectaDashboardInstantStyles";


    style.textContent = `

        @keyframes connectaDashboardShimmer {

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
                    rgba(226,232,228,.75) 25%,
                    rgba(245,248,246,.95) 50%,
                    rgba(226,232,228,.75) 75%
                );

            background-size:
                1000px 100%;

            animation:
                connectaDashboardShimmer
                1.25s infinite linear;

            border-radius:
                14px;

        }


        .connecta-dashboard-skeleton-row {

            display:
                flex;

            gap:
                10px;

            overflow:
                hidden;

            width:
                100%;

        }


        .connecta-dashboard-skeleton-user {

            flex:
                0 0 82px;

            height:
                105px;

            border-radius:
                16px;

        }


        .connecta-dashboard-skeleton-chat {

            height:
                72px;

            width:
                100%;

            margin-bottom:
                9px;

            border-radius:
                16px;

        }


        .connecta-dashboard-skeleton-pulse {

            width:
                9px;

            height:
                9px;

            border-radius:
                50%;

            display:
                inline-block;

            margin-right:
                5px;

            background:
                #22c55e;

            animation:
                connectaDashboardPulse
                1s infinite ease-in-out;

        }


        @keyframes connectaDashboardPulse {

            0%,
            100% {
                opacity: .35;
                transform: scale(.85);
            }

            50% {
                opacity: 1;
                transform: scale(1);
            }

        }


        .connecta-dashboard-error {

            padding:
                18px;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

        }


        .connecta-dashboard-empty {

            padding:
                22px 14px;

            text-align:
                center;

            color:
                #718078;

            font-size:
                13px;

        }


        .connecta-dashboard-unread {

            min-width:
                19px;

            height:
                19px;

            padding:
                0 5px;

            display:
                inline-flex;

            align-items:
                center;

            justify-content:
                center;

            border-radius:
                999px;

            background:
                #22c55e;

            color:
                #fff;

            font-size:
                10px;

            font-weight:
                800;

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   SKELETON
========================================================= */

function showDashboardSkeleton() {

    const onlineBox =
        $("onlineUsers");


    const chatBox =
        $("chatList");


    if (
        onlineBox &&
        !onlineBox.children.length
    ) {

        onlineBox.innerHTML = `

            <div
                class="connecta-dashboard-skeleton-row"
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


        onlineBox.setAttribute(
            "aria-busy",
            "true"
        );

    }


    if (
        chatBox &&
        !chatBox.children.length
    ) {

        chatBox.innerHTML = `

            <div
                aria-hidden="true"
            >

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


    if (box) {

        box.setAttribute(
            "aria-busy",
            "false"
        );

    }

}


function hideChatSkeleton() {

    const box =
        $("chatList");


    if (box) {

        box.setAttribute(
            "aria-busy",
            "false"
        );

    }

}


/* =========================================================
   PUBLIC PROFILE DATA
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
   DASHBOARD CACHE KEY
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
            JSON.parse(
                raw
            );


        if (!cache) {

            return false;

        }


        /*
         * Profile
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
         * Users
         */

        if (
            Array.isArray(
                cache.users
            ) &&
            cache.users.length
        ) {

            onlineUsers =
                cache.users;


            renderOnline();

        }


        /*
         * Private chats
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
         * Groups
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
         * Unified list
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
            "Dashboard cache load failed:",
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

        /* Ignore */

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


        return cache[
            uid
        ] || null;

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

            }[
                character
            ])

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
   TIMESTAMP TO DATE
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
   FORMAT TIMESTAMP
========================================================= */

function formatTimestamp(
    value
) {

    const date =
        timestampToDate(
            value
        );


    if (!date) {
        return "";
    }


    const now =
        new Date();


    const sameDay =
        date.toDateString() ===
        now.toDateString();


    if (sameDay) {

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

function getAccountControl(
    profile
) {

    if (!profile) {

        return {

            blocked:
                true,

            status:
                "unknown",

            messagingRestricted:
                true,

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

            messagingRestricted:
                true,

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

            messagingRestricted:
                true,

            message:
                "Your CONNECTA account is currently suspended."

        };

    }


    return {

        blocked:
            false,

        status:
            "active",

        messagingRestricted:
            profile.messagingRestricted === true,

        message:
            profile.messagingRestricted === true

                ? "Messaging has been restricted by CONNECTA."

                : ""

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
                        control.status ===
                        "banned"

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
                        cursor:pointer;
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
   RENDER PROFILE
========================================================= */

function renderProfile() {

    if (!currentProfile) {
        return;
    }


    const welcomeName =
        $("welcomeName");


    const profileBtn =
        $("profileBtn");


    const menuName =
        $("menuUserName");


    const menuUsername =
        $("menuUsername");


    const menuAvatar =
        $("menuAvatar");


    const profileAvatar =
        $("profileAvatar");


    const balance =
        $("balanceAmount");


    const fullName =
        getFullName(
            currentProfile
        );


    const photo =
        currentProfile.photoURL ||
        currentProfile.photoUrl ||
        "";


    if (welcomeName) {

        welcomeName.textContent =
            fullName;

    }


    if (balance) {

        balance.textContent =
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
        profileAvatar,
        currentProfile
    );


    if (profileBtn) {

        profileBtn.setAttribute(
            "aria-label",
            `${fullName} profile`
        );

    }

}


/* =========================================================
   AVATAR
========================================================= */

function renderAvatarElement(
    element,
    user
) {

    if (!element) {
        return;
    }


    const name =
        getFullName(
            user
        );


    const photo =
        user?.photoURL ||
        user?.photoUrl ||
        "";


    if (photo) {

        element.innerHTML = `

            <img
                src="${escapeHtml(photo)}"
                alt="${escapeHtml(name)}"
                loading="lazy"
            >

        `;

    } else {

        element.textContent =
            initials(name);

    }

}


/* =========================================================
   RENDER ONLINE USERS
========================================================= */

function renderOnline() {

    const box =
        $("onlineUsers");


    if (!box) {
        return;
    }


    hideOnlineSkeleton();


    if (!onlineUsers.length) {

        box.innerHTML = `

            <div
                class="connecta-dashboard-empty"
            >
                No users found.
            </div>

        `;


        return;

    }


    const users =
        [...onlineUsers]
            .sort(
                (a, b) => {

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


                    if (
                        a.isOnline !==
                        b.isOnline
                    ) {

                        return a.isOnline
                            ? -1
                            : 1;

                    }


                    return getFullName(
                        a
                    ).localeCompare(
                        getFullName(
                            b
                        )
                    );

                }
            );


    box.innerHTML =
        users
            .map(
                user => {

                    const name =
                        getFullName(
                            user
                        );


                    const isSelf =
                        user.uid ===
                        currentUser?.uid;


                    const following =
                        Array.isArray(
                            currentProfile?.following
                        ) &&
                        currentProfile.following
                            .includes(
                                user.uid
                            );


                    const photo =
                        user.photoURL ||
                        user.photoUrl ||
                        "";


                    return `

                        <div
                            class="online-user-card"
                            data-uid="${escapeHtml(
                                user.uid
                            )}"
                        >

                            <div
                                class="
                                    online-user-avatar-wrap
                                    ${
                                        user.isOnline
                                            ? "online"
                                            : "offline"
                                    }
                                "
                            >

                                <div
                                    class="online-user-avatar"
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
                                                initials(
                                                    name
                                                )
                                            )
                                    }

                                </div>

                            </div>


                            <div
                                class="online-user-name"
                            >

                                ${escapeHtml(
                                    name
                                )}

                                ${verifiedBadge(
                                    user
                                )}

                            </div>


                            <div
                                class="
                                    online-user-status
                                    ${
                                        user.isOnline
                                            ? "online"
                                            : "offline"
                                    }
                                "
                            >

                                ${
                                    user.isOnline
                                        ? "Online"
                                        : "Offline"
                                }

                            </div>


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

                    `;

                }
            )
            .join("");


    box
        .querySelectorAll(
            "[data-uid]"
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


    box
        .querySelectorAll(
            "[data-follow-uid]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();


                        toggleFollow(
                            button.dataset.followUid
                        );

                    }
                );

            }
        );

}


/* =========================================================
   TOGGLE FOLLOW
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

                const [
                    currentSnap,
                    targetSnap
                ] = await Promise.all([

                    transaction.get(
                        currentRef
                    ),

                    transaction.get(
                        targetRef
                    )

                ]);


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
   GET USER PROFILE
========================================================= */

async function getUserProfile(
    uid
) {

    if (!uid) {
        return null;
    }


    const cached =
        getCachedProfile(
            uid
        );


    if (cached) {

        /*
         * Return cached data immediately.
         * Live user listener will update it later.
         */

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


        /*
         * Update private-chat preview.
         */

        recentChats =
            recentChats.map(
                chat => {

                    if (
                        chat.otherUid !==
                        uid
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
                            profile.isVerified ===
                            true

                    };

                }
            );


        /*
         * Update group preview sender.
         */

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
                            profile.isVerified ===
                            true

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


    const chatsRef =
        collection(
            db,
            "chats"
        );


    const chatsQuery =
        query(
            chatsRef,
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

                const chatDocuments =
                    snapshot.docs.filter(
                        chatDoc => {

                            const data =
                                chatDoc.data();


                            return (
                                Array.isArray(
                                    data.participants
                                ) &&
                                data.participants.includes(
                                    uid
                                )
                            );

                        }
                    );


                const result = [];


                for (
                    const chatDoc
                    of chatDocuments
                ) {

                    const data =
                        chatDoc.data();


                    const otherUid =
                        data.participants.find(
                            participant =>
                                participant !==
                                uid
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


                    /*
                     * We don't block rendering on a
                     * profile request.
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
                        profile?.isVerified ===
                            true ||
                        data.otherUserVerified ===
                            true;


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


                    const lastMessage =
                        data.lastMessage ||
                        "";


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


                    if (
                        !preview &&
                        lastSenderId === uid
                    ) {

                        preview =
                            "You started a conversation";

                    }


                    result.push({

                        type:
                            "private",

                        chatId:
                            chatDoc.id,

                        otherUid,

                        otherUserName:
                            otherName,

                        otherUserPhoto:
                            otherPhoto,

                        otherUserVerified:
                            otherVerified,

                        lastMessage:
                            preview,

                        lastMessageType,

                        lastSenderId,

                        unread,

                        lastMessageAt:
                            data.lastMessageAt ||
                            data.updatedAt ||
                            null,

                        updatedAt:
                            data.updatedAt ||
                            null,

                        delivered:
                            data.delivered ===
                                true,

                        read:
                            data.read ===
                                true

                    });

                }


                recentChats =
                    result;


                mergeRecentChats();


                /*
                 * Refresh profiles in the background.
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
                    "Private chat listener:",
                    error
                );


                /*
                 * Don't destroy group chats if
                 * private chat listening fails.
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
         * No read state means this user has
         * never opened the group.
         *
         * Count recent messages from other
         * users.
         */

        if (
            !readData?.lastReadAt
        ) {

            const firstQuery =
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
                    firstQuery
                );


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


        const unreadQuery =
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
            await getDocs(
                unreadQuery
            );


        return snapshot.docs.filter(
            messageDoc =>
                messageDoc.data().senderId !==
                currentUser.uid
        ).length;


    } catch (error) {

        console.warn(
            `Could not calculate unread group count for ${groupId}:`,
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


    const allGroups = new Map();


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

        /*
         * Only groups where the current user is
         * actually a member/owner.
         */

        const member =
            (
                Array.isArray(
                    group.memberIds
                ) &&
                group.memberIds.includes(
                    currentUser.uid
                )
            ) ||

            (
                Array.isArray(
                    group.members
                ) &&
                group.members.includes(
                    currentUser.uid
                )
            ) ||

            group.ownerId ===
                currentUser.uid;


        if (!member) {

            continue;

        }


        let readData =
            null;


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

            readData =
                null;

        }


        const unread =
            await getGroupUnreadCount(
                group.groupId,
                readData
            );


        /*
         * Resolve sender profile if available.
         */

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


        const lastSenderName =
            group.lastMessageSenderName ||

            (
                senderProfile
                    ? getFullName(
                        senderProfile
                    )
                    : "User"
            );


        const lastSenderVerified =
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
                lastSenderName,

            lastMessageSenderVerified:
                lastSenderVerified,

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
                group.chatLocked ===
                true

        });

    }


    /*
     * Prevent stale async processing from
     * overwriting newer data.
     */

    if (
        version !==
        groupProcessVersion
    ) {

        return;

    }


    recentGroups =
        enriched;


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
                                "Group processing error:",
                                error
                            );

                        }
                    );

            },
            40
        );

}


/* =========================================================
   GROUP LISTENER
========================================================= */

function listenToGroups(
    uid
) {

    groupListeners.forEach(
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

        memberIds:
            [],

        members:
            [],

        owned:
            []

    };


    recentGroups =
        [];


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
     * Initial reads.
     *
     * Promise.allSettled means one query failing
     * does not break the others.
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
        )
        .catch(
            error => {

                console.error(
                    "Initial group loading error:",
                    error
                );

            }
        );


    /*
     * Live memberIds listener
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
                    "memberIds group listener:",
                    error
                );

            }

        );


    /*
     * Live members listener
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
                    "members group listener:",
                    error
                );

            }

        );


    /*
     * Live owner listener
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
                    "owner group listener:",
                    error
                );

            }

        );


    /*
     * Keep unsubscribe callbacks.
     */

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


    combined.sort(
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
        combined
    );


    saveDashboardCache();

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

            <div
                class="connecta-dashboard-empty"
            >
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
                        chat.type ===
                        "group";


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
                                initials(
                                    name
                                )
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
                        isGroup &&
                        !preview
                    ) {

                        preview =
                            "No messages yet";

                    }


                    if (
                        !isGroup &&
                        !preview
                    ) {

                        preview =
                            "Start a conversation";

                    }


                    /*
                     * GROUP PREVIEW
                     *
                     * Example:
                     *
                     * John Chumo ✓: Hello
                     */

                    let previewMarkup =
                        escapeHtml(
                            preview
                        );


                    if (
                        isGroup &&
                        chat.lastMessageSenderName &&
                        preview
                    ) {

                        const senderName =
                            escapeHtml(
                                chat.lastMessageSenderName
                            );


                        const senderBadge =
                            chat.lastMessageSenderVerified

                                ? `
                                    <span
                                        class="verified-badge"
                                        title="Verified account"
                                    >
                                        ✓
                                    </span>
                                  `

                                : "";


                        previewMarkup = `

                            <span>
                                ${senderName}
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


                    /*
                     * PRIVATE VERIFIED BADGE
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
                                chat-list-item
                                ${
                                    unread > 0
                                        ? "unread"
                                        : ""
                                }
                            "
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
                                class="chat-list-avatar"
                            >

                                ${avatar}

                            </div>


                            <div
                                class="chat-list-content"
                            >

                                <div
                                    class="chat-list-top"
                                >

                                    <div
                                        class="chat-list-name"
                                    >

                                        ${escapeHtml(
                                            name
                                        )}

                                        ${nameBadge}

                                    </div>


                                    <div
                                        class="chat-list-time"
                                    >
                                        ${escapeHtml(
                                            time
                                        )}
                                    </div>

                                </div>


                                <div
                                    class="chat-list-bottom"
                                >

                                    <div
                                        class="chat-list-preview"
                                    >
                                        ${previewMarkup}
                                    </div>


                                    ${
                                        unread > 0

                                            ? `

                                                <span
                                                    class="
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

                        </div>

                    `;

                }
            )
            .join("");


    box
        .querySelectorAll(
            ".chat-list-item"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    () => {

                        const type =
                            item.dataset.chatType;


                        const id =
                            item.dataset.chatId;


                        const userId =
                            item.dataset.userId;


                        if (
                            type ===
                            "group"
                        ) {

                            if (!id) {
                                return;
                            }


                            location.href =
                                `group-chat.html?groupId=${encodeURIComponent(
                                    id
                                )}`;


                            return;

                        }


                        if (
                            userId
                        ) {

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
   CHAT SEARCH
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


    setPresence(
        true
    );


    clearInterval(
        presenceInterval
    );


    /*
     * Heartbeat every 60 seconds.
     */

    presenceInterval =
        setInterval(
            () => {

                setPresence(
                    true
                );

            },
            60000
        );


    document.addEventListener(
        "visibilitychange",
        handleVisibilityPresence
    );

}


/* =========================================================
   VISIBILITY PRESENCE
========================================================= */

function handleVisibilityPresence() {

    if (
        document.visibilityState ===
        "visible"
    ) {

        setPresence(
            true
        );

    } else {

        setPresence(
            false
        );

    }

}


/* =========================================================
   STOP LISTENERS
========================================================= */

function stopDashboardListeners() {

    if (stopUsers) {

        stopUsers();

        stopUsers =
            null;

    }


    if (stopChats) {

        stopChats();

        stopChats =
            null;

    }


    if (
        groupListeners?.unsubscribers
    ) {

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

    }


    groupListeners = {

        memberIds:
            [],

        members:
            [],

        owned:
            []

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
     * SIDE MENU
     */

    const menuButton =
        $("menuButton");


    const sidebar =
        $("sidebar");


    const sidebarOverlay =
        $("sidebarOverlay");


    function openMenu() {

        sidebar?.classList.add(
            "open"
        );

        sidebarOverlay?.classList.add(
            "open"
        );

    }


    function closeMenu() {

        sidebar?.classList.remove(
            "open"
        );

        sidebarOverlay?.classList.remove(
            "open"
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


    /*
     * SIDE NAV
     */

    document
        .querySelectorAll(
            ".nav-item"
        )
        .forEach(
            item => {

                item.addEventListener(
                    "click",
                    closeMenu
                );

            }
        );


    /*
     * PROFILE
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
     * GET CONNECTION
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
     * ONLINE SEARCH
     */

    $("onlineSearch")?.addEventListener(
        "input",
        event => {

            const term =
                event.target.value
                    .trim()
                    .toLowerCase();


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


            const original =
                onlineUsers;


            onlineUsers =
                filtered;


            renderOnline();


            onlineUsers =
                original;

        }
    );


    /*
     * CHAT SEARCH
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
     * LOGOUT
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
     * QUICK BUTTONS
     */

    document
        .querySelectorAll(
            "[data-coming-soon]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        showToast(
                            button.dataset.comingSoon ||
                            "This feature is coming soon."
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

        stopUsers =
            null;

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
                 * Update own profile with live
                 * balance/status/following.
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


                    /*
                     * Preserve private own fields
                     * already loaded by globalAuth.
                     */

                    saveProfileToCache(
                        currentProfile
                    );


                    renderProfile();

                }


                renderOnline();


                /*
                 * Refresh chat and group names
                 * from live user data.
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
                                    profile.photoUrl ||
                                    "",

                                otherUserVerified:
                                    profile.isVerified ===
                                    true

                            };

                        }
                    );


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
                    "Users listener:",
                    error
                );


                hideOnlineSkeleton();


                const box =
                    $("onlineUsers");


                if (box) {

                    box.innerHTML = `

                        <div
                            class="
                                connecta-dashboard-error
                            "
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

    /*
     * The skeleton is already visible before
     * authentication finishes.
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
     * =====================================================
     * CACHE FIRST
     * =====================================================
     *
     * Render cached data immediately.
     *
     * Firestore updates it afterwards.
     */

    loadDashboardCache();


    renderProfile();


    /*
     * =====================================================
     * ACCOUNT CONTROL
     * =====================================================
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
     * =====================================================
     * PRESENCE
     * =====================================================
     */

    startPresence();


    /*
     * =====================================================
     * LIVE USERS
     * =====================================================
     */

    listenToUsers();


    /*
     * =====================================================
     * LIVE PRIVATE CHATS
     * =====================================================
     */

    listenToChats(
        currentUser.uid
    );


    /*
     * =====================================================
     * LIVE GROUPS
     * =====================================================
     */

    listenToGroups(
        currentUser.uid
    );

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
   START DASHBOARD
========================================================= */

installInstantDashboardStyles();

showDashboardSkeleton();

setupUI();

initializeDashboard();
