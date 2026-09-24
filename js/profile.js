/* =========================================================
   CONNECTA — PROFILE
   File: frontend/js/profile.js

   FEATURES
   ---------------------------------------------------------
   • Instant profile display
   • Cache-first rendering
   • Firebase Auth fallback
   • Background Firestore refresh
   • Realtime profile updates
   • Own/private profile
   • Other/public profile
   • Follow / Unfollow
   • Chat button
   • Profile photo upload
   • Firebase Storage
   • Account verification
   • M-PESA verification
   • Referral information
   • No "Loading profile..." screen
========================================================= */

import {
    auth,
    db,
    storage
} from "./firebase.js";

import {
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE_URL =
    "https://connecta-backend-com.onrender.com";

const VERIFICATION_AMOUNT =
    999;


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let viewedUser = null;

let stopProfileListener = null;

let verificationPollTimer = null;

let verificationPolling = false;

let isFollowing = false;

let currentUserFollowing = [];


/* =========================================================
   CACHE
========================================================= */

const OWN_PROFILE_CACHE_KEY =
    "connectaOwnProfileCache_v2";

const PUBLIC_PROFILE_CACHE_KEY =
    "connectaPublicProfileCache_v2";


/* =========================================================
   HELPER
========================================================= */

const $ = id =>
    document.getElementById(id);


/* =========================================================
   INSTALL PROFILE STYLES
========================================================= */

function installInstantProfileStyles() {

    if (
        document.getElementById(
            "connectaInstantProfileStyles"
        )
    ) {
        return;
    }


    const style =
        document.createElement("style");


    style.id =
        "connectaInstantProfileStyles";


    style.textContent = `

        .connecta-instant-profile {
            animation:
                connectaProfileAppear
                .18s
                ease-out;
        }

        @keyframes connectaProfileAppear {

            from {
                opacity: .35;
                transform: translateY(3px);
            }

            to {
                opacity: 1;
                transform: translateY(0);
            }

        }


        .profile-avatar img {
            opacity: 0;
            transition:
                opacity .18s ease;
        }


        .profile-avatar img.connecta-profile-image-ready {
            opacity: 1;
        }


        .connecta-profile-sync {
            font-size: 10px;
            color: #94a3b8;
            text-align: center;
            min-height: 14px;
            margin-top: 5px;
        }


        .connecta-profile-sync.success {
            color: #15803d;
        }


        .connecta-profile-sync.error {
            color: #dc2626;
        }


        .connecta-profile-fallback {
            padding: 30px 18px;
            text-align: center;
            color: #64748b;
        }


        .connecta-profile-fallback-avatar {
            width: 86px;
            height: 86px;
            margin: 0 auto 14px;
            border-radius: 50%;
            background: #dcfce7;
            color: #15803d;
            display: grid;
            place-items: center;
            font-size: 27px;
            font-weight: 900;
        }

    `;


    document.head.appendChild(style);
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


    if (user.username) {

        return String(
            user.username
        ).replace(
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
    value = ""
) {

    return String(value)

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


/* =========================================================
   PROFILE UID
========================================================= */

function getProfileUid() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    return params.get("uid");
}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(
    value
) {

    const number =
        Number(value || 0);


    return number.toLocaleString();
}


/* =========================================================
   BALANCE FORMAT
========================================================= */

function formatBalance(
    value
) {

    const number =
        Number(value || 0);


    return `KSh ${number.toLocaleString(
        undefined,
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )}`;
}


/* =========================================================
   OWN PROFILE CHECK
========================================================= */

function isOwnProfile(
    uid
) {

    return !!(
        currentUser &&
        uid &&
        currentUser.uid === uid
    );
}


/* =========================================================
   OWN PROFILE CACHE
========================================================= */

function getOwnProfileCache() {

    if (!currentUser) {
        return null;
    }


    try {

        const raw =
            localStorage.getItem(
                OWN_PROFILE_CACHE_KEY
            );


        if (!raw) {
            return null;
        }


        const cache =
            JSON.parse(raw);


        if (
            !cache ||
            cache.uid !== currentUser.uid
        ) {

            return null;
        }


        return cache;

    } catch (error) {

        console.warn(
            "Own profile cache read failed:",
            error
        );


        return null;
    }
}


/* =========================================================
   SAVE OWN PROFILE CACHE
========================================================= */

function saveOwnProfileCache(
    profile
) {

    if (
        !profile ||
        !currentUser ||
        profile.uid !== currentUser.uid
    ) {

        return;
    }


    try {

        const cache = {

            uid:
                profile.uid,

            firstName:
                profile.firstName || "",

            lastName:
                profile.lastName || "",

            displayName:
                profile.displayName || "",

            username:
                profile.username || "",

            email:
                profile.email ||
                currentUser.email ||
                "",

            phone:
                profile.phone || "",

            photoURL:
                profile.photoURL || "",

            photoUrl:
                profile.photoUrl || "",

            bio:
                profile.bio || "",

            isOnline:
                profile.isOnline === true,

            isVerified:
                profile.isVerified === true,

            verificationStatus:
                profile.verificationStatus ||
                "not_submitted",

            verificationAmount:
                Number(
                    profile.verificationAmount || 0
                ),

            verificationTransactionCode:
                profile.verificationTransactionCode ||
                "",

            verifiedAt:
                profile.verifiedAt || null,

            balance:
                Number(
                    profile.balance || 0
                ),

            status:
                profile.status ||
                "active",

            referralCode:
                profile.referralCode ||
                "",

            referralCount:
                Number(
                    profile.referralCount ||
                    profile.referralsCount ||
                    0
                ),

            referralEarnings:
                Number(
                    profile.referralEarnings || 0
                ),

            followersCount:
                Number(
                    profile.followersCount || 0
                ),

            followingCount:
                Number(
                    profile.followingCount || 0
                ),

            following:
                Array.isArray(
                    profile.following
                )
                    ? [
                        ...profile.following
                    ]
                    : [],

            cachedAt:
                Date.now()
        };


        localStorage.setItem(
            OWN_PROFILE_CACHE_KEY,
            JSON.stringify(cache)
        );

    } catch (error) {

        console.warn(
            "Own profile cache save failed:",
            error
        );
    }
}


/* =========================================================
   PUBLIC PROFILE CACHE
========================================================= */

function getPublicProfileCache(
    uid
) {

    if (!uid) {
        return null;
    }


    try {

        const raw =
            localStorage.getItem(
                `${PUBLIC_PROFILE_CACHE_KEY}_${uid}`
            );


        if (!raw) {
            return null;
        }


        return JSON.parse(raw);

    } catch (error) {

        console.warn(
            "Public profile cache read failed:",
            error
        );


        return null;
    }
}


/* =========================================================
   SAVE PUBLIC PROFILE CACHE
========================================================= */

function savePublicProfileCache(
    profile
) {

    if (!profile?.uid) {
        return;
    }


    try {

        const publicProfile = {

            uid:
                profile.uid,

            firstName:
                profile.firstName || "",

            lastName:
                profile.lastName || "",

            displayName:
                profile.displayName || "",

            username:
                profile.username || "",

            photoURL:
                profile.photoURL || "",

            photoUrl:
                profile.photoUrl || "",

            bio:
                profile.bio || "",

            isOnline:
                profile.isOnline === true,

            isVerified:
                profile.isVerified === true,

            followersCount:
                Number(
                    profile.followersCount || 0
                ),

            followingCount:
                Number(
                    profile.followingCount || 0
                ),

            cachedAt:
                Date.now()
        };


        localStorage.setItem(

            `${PUBLIC_PROFILE_CACHE_KEY}_${profile.uid}`,

            JSON.stringify(
                publicProfile
            )

        );

    } catch (error) {

        console.warn(
            "Public profile cache save failed:",
            error
        );
    }
}


/* =========================================================
   PUBLIC PROFILE FILTER
========================================================= */

function getPublicProfile(
    profile
) {

    if (!profile) {
        return null;
    }


    return {

        uid:
            profile.uid,

        firstName:
            profile.firstName || "",

        lastName:
            profile.lastName || "",

        displayName:
            profile.displayName || "",

        username:
            profile.username || "",

        photoURL:
            profile.photoURL || "",

        photoUrl:
            profile.photoUrl || "",

        bio:
            profile.bio || "",

        isOnline:
            profile.isOnline === true,

        isVerified:
            profile.isVerified === true,

        followersCount:
            Number(
                profile.followersCount || 0
            ),

        followingCount:
            Number(
                profile.followingCount || 0
            )

    };
}


/* =========================================================
   AUTH USER → INSTANT PROFILE
========================================================= */

function createInstantAuthProfile(
    user
) {

    if (!user) {
        return null;
    }


    return {

        uid:
            user.uid,

        displayName:
            user.displayName ||
            "CONNECTA User",

        username:
            "",

        email:
            user.email || "",

        phone:
            user.phoneNumber || "",

        photoURL:
            user.photoURL || "",

        photoUrl:
            user.photoURL || "",

        bio:
            "",

        isOnline:
            true,

        isVerified:
            false,

        verificationStatus:
            "not_submitted",

        verificationAmount:
            0,

        verificationTransactionCode:
            "",

        verifiedAt:
            null,

        balance:
            0,

        status:
            "active",

        referralCode:
            "",

        referralCount:
            0,

        referralEarnings:
            0,

        followersCount:
            0,

        followingCount:
            0,

        following:
            []

    };
}


/* =========================================================
   LOAD CACHED PROFILE
========================================================= */

function loadCachedProfile(
    uid
) {

    if (!uid) {
        return false;
    }


    const own =
        isOwnProfile(uid);


    const cached =
        own
            ? getOwnProfileCache()
            : getPublicProfileCache(uid);


    if (!cached) {
        return false;
    }


    if (own) {

        cached.isOnline =
            true;


        if (
            Array.isArray(
                cached.following
            )
        ) {

            currentUserFollowing =
                [
                    ...cached.following
                ];
        }

    }


    renderProfile(
        cached
    );


    return true;
}


/* =========================================================
   MARK CURRENT USER ONLINE
========================================================= */

async function markCurrentUserOnline() {

    if (!currentUser?.uid) {
        return;
    }


    try {

        await updateDoc(

            doc(
                db,
                "users",
                currentUser.uid
            ),

            {

                isOnline:
                    true,

                lastSeen:
                    serverTimestamp()

            }

        );

    } catch (error) {

        console.warn(
            "Unable to update online status:",
            error
        );
    }
}


/* =========================================================
   LOAD CURRENT USER FOLLOWING
========================================================= */

async function loadCurrentUserFollowing() {

    if (!currentUser?.uid) {
        return;
    }


    const cached =
        getOwnProfileCache();


    if (
        cached &&
        Array.isArray(
            cached.following
        )
    ) {

        currentUserFollowing =
            [
                ...cached.following
            ];


        if (
            viewedUser &&
            !isOwnProfile(
                viewedUser.uid
            )
        ) {

            isFollowing =
                currentUserFollowing.includes(
                    viewedUser.uid
                );


            renderProfile(
                viewedUser
            );
        }
    }


    try {

        const snapshot =
            await getDoc(

                doc(
                    db,
                    "users",
                    currentUser.uid
                )

            );


        if (!snapshot.exists()) {
            return;
        }


        const data =
            snapshot.data();


        currentUserFollowing =
            Array.isArray(
                data.following
            )
                ? [
                    ...data.following
                ]
                : [];


        const ownCache =
            getOwnProfileCache();


        if (ownCache) {

            ownCache.following =
                [
                    ...currentUserFollowing
                ];


            ownCache.followingCount =
                Number(
                    data.followingCount ??
                    currentUserFollowing.length
                );


            ownCache.cachedAt =
                Date.now();


            localStorage.setItem(
                OWN_PROFILE_CACHE_KEY,
                JSON.stringify(
                    ownCache
                )
            );
        }


        if (
            viewedUser &&
            !isOwnProfile(
                viewedUser.uid
            )
        ) {

            isFollowing =
                currentUserFollowing.includes(
                    viewedUser.uid
                );


            renderProfile(
                viewedUser
            );
        }

    } catch (error) {

        console.warn(
            "Unable to load following list:",
            error
        );
    }
}


/* =========================================================
   IMAGE READY
========================================================= */

function markProfileImagesReady() {

    document
        .querySelectorAll(
            ".profile-avatar img"
        )
        .forEach(
            image => {

                if (
                    image.complete
                ) {

                    image.classList.add(
                        "connecta-profile-image-ready"
                    );
                }


                image.addEventListener(
                    "load",
                    () => {

                        image.classList.add(
                            "connecta-profile-image-ready"
                        );

                    },
                    {
                        once: true
                    }
                );

            }
        );
}


/* =========================================================
   RENDER PROFILE
========================================================= */

function renderProfile(
    profile
) {

    if (!profile?.uid) {
        return;
    }


    viewedUser =
        profile;


    const container =
        $("profileContainer");


    if (!container) {
        return;
    }


    const own =
        isOwnProfile(
            profile.uid
        );


    const safeProfile =
        own
            ? profile
            : getPublicProfile(profile);


    if (!safeProfile) {
        return;
    }


    if (!own) {

        isFollowing =
            Array.isArray(
                currentUserFollowing
            ) &&
            currentUserFollowing.includes(
                profile.uid
            );
    }


    const name =
        getFullName(
            safeProfile
        );


    const username =
        safeProfile.username
            ? `@${safeProfile.username}`
            : "";


    const online =
        own
            ? true
            : safeProfile.isOnline === true;


    const verified =
        safeProfile.isVerified === true;


    const followers =
        Number(
            safeProfile.followersCount || 0
        );


    const following =
        Number(
            safeProfile.followingCount || 0
        );


    const photo =
        safeProfile.photoURL ||
        safeProfile.photoUrl ||
        "";


    const avatar =
        photo

            ? `
                <img
                    src="${escapeHtml(photo)}"
                    alt="${escapeHtml(name)}"
                    decoding="async"
                >
              `

            : initials(name);


    const verifiedBadge =
        verified

            ? `
                <span
                    class="verified-badge"
                    title="Verified account"
                    aria-label="Verified account"
                >
                    ✓
                </span>
              `

            : "";


    const statusHtml =
        online

            ? `
                <div class="profile-status online">

                    <span
                        class="profile-status-dot online"
                    ></span>

                    Online

                </div>
              `

            : `
                <div class="profile-status offline">

                    <span
                        class="profile-status-dot offline"
                    ></span>

                    Offline

                </div>
              `;


    const bioHtml =
        safeProfile.bio

            ? `
                <div class="profile-bio">
                    ${escapeHtml(
                        safeProfile.bio
                    )}
                </div>
              `

            : "";


    let actionHtml =
        "";


    /* =====================================================
       OWN PROFILE ACTION
    ===================================================== */

    if (own) {

        if (verified) {

            actionHtml = `

                <div class="profile-verified-text">

                    <span class="verified-badge">
                        ✓
                    </span>

                    Account Verified

                </div>

            `;

        } else {

            const paymentPending =
                safeProfile.verificationStatus ===
                "payment_pending";


            actionHtml = `

                <button
                    id="verifyAccountBtn"
                    class="profile-verify-btn"
                    type="button"
                    ${paymentPending ? "disabled" : ""}
                >

                    ${
                        paymentPending
                            ? "Verification Pending..."
                            : "Verify Account"
                    }

                </button>

            `;
        }


    }


    /* =====================================================
       OTHER USER ACTIONS
    ===================================================== */

    else {

        actionHtml = `

            <button
                id="chatProfileBtn"
                class="profile-chat-btn"
                type="button"
            >
                Chat
            </button>


            <button
                id="followProfileBtn"
                class="profile-follow-btn ${
                    isFollowing
                        ? "following"
                        : ""
                }"
                type="button"
            >

                ${
                    isFollowing
                        ? "Following"
                        : "Follow"
                }

            </button>

        `;
    }


    /* =====================================================
       OWN PROFILE
    ===================================================== */

    if (own) {

        container.innerHTML = `

            <div class="connecta-instant-profile">

                <section class="profile-hero">

                    <div class="profile-photo-area">

                        <div class="profile-photo-ring">

                            <div class="profile-avatar">
                                ${avatar}
                            </div>

                        </div>


                        <button
                            id="profilePhotoUploadBtn"
                            class="profile-photo-upload"
                            type="button"
                            aria-label="Upload profile photo"
                        >
                            📷
                        </button>


                        <input
                            id="profilePhotoInput"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                        >

                    </div>


                    <div class="profile-upload-text">
                        Tap to upload photo
                    </div>


                    <div
                        id="profileUploadStatus"
                        class="profile-upload-status"
                    ></div>


                    <div class="profile-name-row">

                        <div class="profile-name">
                            ${escapeHtml(name)}
                        </div>

                        ${verifiedBadge}

                    </div>


                    ${
                        username
                            ? `
                                <div class="profile-username">
                                    ${escapeHtml(username)}
                                </div>
                              `
                            : ""
                    }


                    ${statusHtml}


                    ${bioHtml}


                    <div class="profile-main-action">

                        ${actionHtml}

                    </div>

                </section>


                <!-- ACCOUNT STATISTICS -->

                <section class="profile-card">

                    <div class="profile-card-title">
                        Account Statistics
                    </div>


                    <div class="profile-stat-grid">

                        <div class="profile-stat-box">

                            <div class="profile-stat-label">
                                Balance
                            </div>

                            <div class="profile-stat-value">
                                ${formatBalance(
                                    safeProfile.balance
                                )}
                            </div>

                        </div>


                        <div class="profile-stat-box">

                            <div class="profile-stat-label">
                                Status
                            </div>

                            <div class="profile-stat-value active">

                                ${escapeHtml(
                                    String(
                                        safeProfile.status ||
                                        "active"
                                    )
                                        .charAt(0)
                                        .toUpperCase() +

                                    String(
                                        safeProfile.status ||
                                        "active"
                                    ).slice(1)
                                )}

                            </div>

                        </div>


                        <div class="profile-stat-box">

                            <div class="profile-stat-label">
                                Followers
                            </div>

                            <div class="profile-stat-value">
                                ${formatNumber(
                                    safeProfile.followersCount
                                )}
                            </div>

                        </div>


                        <div class="profile-stat-box">

                            <div class="profile-stat-label">
                                Following
                            </div>

                            <div class="profile-stat-value">
                                ${formatNumber(
                                    safeProfile.followingCount
                                )}
                            </div>

                        </div>

                    </div>

                </section>


                <!-- CONTACT INFORMATION -->

                <section class="profile-card">

                    <div class="profile-card-title">
                        Contact Information
                    </div>


                    <div class="profile-info-row">

                        <span class="profile-info-label">
                            Email:
                        </span>

                        <span class="profile-info-value">

                            ${escapeHtml(
                                safeProfile.email ||
                                currentUser?.email ||
                                "Not provided"
                            )}

                        </span>

                    </div>


                    <div class="profile-info-row">

                        <span class="profile-info-label">
                            Phone:
                        </span>

                        <span class="profile-info-value">

                            ${escapeHtml(
                                safeProfile.phone ||
                                "Not provided"
                            )}

                        </span>

                    </div>

                </section>


                <!-- REFERRAL INFORMATION -->

                <section class="profile-card">

                    <div class="profile-card-title">
                        Referral Information
                    </div>


                    <div class="profile-info-row">

                        <span class="profile-info-label">
                            Referral Code:
                        </span>

                        <span class="profile-info-value">

                            ${escapeHtml(
                                safeProfile.referralCode ||
                                "—"
                            )}

                        </span>

                    </div>


                    <div class="profile-info-row">

                        <span class="profile-info-label">
                            Referrals:
                        </span>

                        <span class="profile-info-value">

                            ${formatNumber(
                                safeProfile.referralCount ||
                                safeProfile.referralsCount ||
                                0
                            )}

                        </span>

                    </div>


                    <button
                        id="referEarnBtn"
                        class="profile-earn-btn"
                        type="button"
                    >
                        Refer & Earn
                    </button>

                </section>


                <!-- STORIES -->

                <section
                    class="profile-card profile-stories-card"
                >

                    <div class="profile-card-title">
                        Stories
                    </div>


                    <div class="profile-empty">
                        No stories available yet.
                    </div>

                </section>

            </div>

        `;


    }


    /* =====================================================
       OTHER USER PROFILE
    ===================================================== */

    else {

        container.innerHTML = `

            <div class="connecta-instant-profile">

                <section class="profile-hero">

                    <div class="profile-photo-area">

                        <div class="profile-photo-ring">

                            <div class="profile-avatar">
                                ${avatar}
                            </div>

                        </div>

                    </div>


                    <div class="profile-name-row">

                        <div class="profile-name">
                            ${escapeHtml(name)}
                        </div>

                        ${verifiedBadge}

                    </div>


                    ${
                        username
                            ? `
                                <div class="profile-username">
                                    ${escapeHtml(username)}
                                </div>
                              `
                            : ""
                    }


                    ${statusHtml}


                    ${bioHtml}


                    <div class="profile-main-action">

                        ${actionHtml}

                    </div>

                </section>


                <!-- PUBLIC STATISTICS -->

                <section class="profile-card">

                    <div class="profile-card-title">
                        Profile Statistics
                    </div>


                    <div class="profile-public-stats">

                        <div class="profile-public-stat">

                            <div class="profile-public-stat-value">
                                ${formatNumber(
                                    followers
                                )}
                            </div>

                            <div class="profile-public-stat-label">
                                Followers
                            </div>

                        </div>


                        <div class="profile-public-stat">

                            <div class="profile-public-stat-value">
                                ${formatNumber(
                                    following
                                )}
                            </div>

                            <div class="profile-public-stat-label">
                                Following
                            </div>

                        </div>

                    </div>

                </section>


                <!-- PUBLIC STORIES -->

                <section
                    class="profile-card profile-stories-card"
                >

                    <div class="profile-card-title">
                        Stories
                    </div>


                    <div class="profile-empty">
                        No stories available yet.
                    </div>

                </section>

            </div>

        `;
    }


    container.dataset.profileRendered =
        "true";


    /* =====================================================
       HEADER TITLE
    ===================================================== */

    const headerTitle =
        $("profileHeaderTitle");


    if (headerTitle) {

        headerTitle.textContent =
            own
                ? "My Profile"
                : "Profile";
    }


    /* =====================================================
       OWN PHOTO UPLOAD
    ===================================================== */

    if (own) {

        const uploadButton =
            $("profilePhotoUploadBtn");


        const photoInput =
            $("profilePhotoInput");


        if (
            uploadButton &&
            photoInput
        ) {

            uploadButton.addEventListener(
                "click",
                () => {

                    photoInput.click();

                }
            );


            photoInput.addEventListener(
                "change",
                handleProfilePhotoUpload
            );
        }
    }


    /* =====================================================
       CHAT
    ===================================================== */

    const chatButton =
        $("chatProfileBtn");


    if (chatButton) {

        chatButton.addEventListener(
            "click",
            () => {

                if (!profile.uid) {
                    return;
                }


                location.href =
                    `chat.html?uid=${encodeURIComponent(
                        profile.uid
                    )}`;

            }
        );
    }


    /* =====================================================
       FOLLOW
    ===================================================== */

    const followButton =
        $("followProfileBtn");


    if (followButton) {

        followButton.addEventListener(
            "click",
            () => {

                toggleFollow(
                    profile.uid,
                    followButton
                );

            }
        );
    }


    /* =====================================================
       VERIFY
    ===================================================== */

    const verifyButton =
        $("verifyAccountBtn");


    if (verifyButton) {

        verifyButton.addEventListener(
            "click",
            openVerificationModal
        );
    }


    /* =====================================================
       REFER & EARN
    ===================================================== */

    const referEarnButton =
        $("referEarnBtn");


    if (referEarnButton) {

        referEarnButton.addEventListener(
            "click",
            () => {

                location.href =
                    "referrals.html";

            }
        );
    }


    requestAnimationFrame(
        markProfileImagesReady
    );
}


/* =========================================================
   FOLLOW / UNFOLLOW
========================================================= */

async function toggleFollow(
    targetUid,
    button
) {

    if (
        !currentUser ||
        !targetUid ||
        targetUid === currentUser.uid
    ) {

        return;
    }


    if (
        button.dataset.busy === "true"
    ) {

        return;
    }


    button.dataset.busy =
        "true";


    button.disabled =
        true;


    const previousFollowing =
        isFollowing;


    try {

        const currentUserRef =
            doc(
                db,
                "users",
                currentUser.uid
            );


        const targetUserRef =
            doc(
                db,
                "users",
                targetUid
            );


        const result =
            await runTransaction(
                db,
                async transaction => {

                    const currentSnapshot =
                        await transaction.get(
                            currentUserRef
                        );


                    const targetSnapshot =
                        await transaction.get(
                            targetUserRef
                        );


                    if (
                        !currentSnapshot.exists()
                    ) {

                        throw new Error(
                            "Your CONNECTA account could not be found."
                        );
                    }


                    if (
                        !targetSnapshot.exists()
                    ) {

                        throw new Error(
                            "This user account could not be found."
                        );
                    }


                    const currentData =
                        currentSnapshot.data();


                    const targetData =
                        targetSnapshot.data();


                    const following =
                        Array.isArray(
                            currentData.following
                        )
                            ? [
                                ...currentData.following
                            ]
                            : [];


                    const followers =
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


                    /* ==============================
                       UNFOLLOW
                    ============================== */

                    if (
                        alreadyFollowing
                    ) {

                        const newFollowing =
                            following.filter(
                                uid =>
                                    uid !==
                                    targetUid
                            );


                        const newFollowers =
                            followers.filter(
                                uid =>
                                    uid !==
                                    currentUser.uid
                            );


                        const oldFollowingCount =
                            Number(
                                currentData.followingCount ??
                                following.length
                            );


                        const oldFollowersCount =
                            Number(
                                targetData.followersCount ??
                                followers.length
                            );


                        const newFollowingCount =
                            Math.max(
                                0,
                                oldFollowingCount - 1
                            );


                        const newFollowersCount =
                            Math.max(
                                0,
                                oldFollowersCount - 1
                            );


                        transaction.update(
                            currentUserRef,
                            {

                                following:
                                    newFollowing,

                                followingCount:
                                    newFollowingCount

                            }
                        );


                        transaction.update(
                            targetUserRef,
                            {

                                followers:
                                    newFollowers,

                                followersCount:
                                    newFollowersCount

                            }
                        );


                        return {

                            following:
                                false,

                            followingList:
                                newFollowing,

                            followersCount:
                                newFollowersCount,

                            followingCount:
                                newFollowingCount

                        };
                    }


                    /* ==============================
                       FOLLOW
                    ============================== */

                    const newFollowing =
                        [
                            ...following,
                            targetUid
                        ];


                    const followerAlreadyPresent =
                        followers.includes(
                            currentUser.uid
                        );


                    const newFollowers =
                        followerAlreadyPresent
                            ? followers
                            : [
                                ...followers,
                                currentUser.uid
                            ];


                    const oldFollowingCount =
                        Number(
                            currentData.followingCount ??
                            following.length
                        );


                    const oldFollowersCount =
                        Number(
                            targetData.followersCount ??
                            followers.length
                        );


                    const newFollowersCount =
                        followerAlreadyPresent
                            ? oldFollowersCount
                            : oldFollowersCount + 1;


                    const newFollowingCount =
                        oldFollowingCount + 1;


                    transaction.update(
                        currentUserRef,
                        {

                            following:
                                newFollowing,

                            followingCount:
                                newFollowingCount

                        }
                    );


                    transaction.update(
                        targetUserRef,
                        {

                            followers:
                                newFollowers,

                            followersCount:
                                newFollowersCount

                        }
                    );


                    return {

                        following:
                            true,

                        followingList:
                            newFollowing,

                        followersCount:
                            newFollowersCount,

                        followingCount:
                            newFollowingCount

                    };

                }
            );


        /* =================================================
           IMMEDIATE LOCAL UPDATE
        ================================================= */

        isFollowing =
            result.following;


        currentUserFollowing =
            Array.isArray(
                result.followingList
            )
                ? [
                    ...result.followingList
                ]
                : [];


        /* =================================================
           UPDATE OWN CACHE
        ================================================= */

        try {

            const ownCache =
                getOwnProfileCache();


            if (ownCache) {

                ownCache.following =
                    [
                        ...currentUserFollowing
                    ];


                ownCache.followingCount =
                    Number(
                        result.followingCount ||
                        currentUserFollowing.length
                    );


                ownCache.cachedAt =
                    Date.now();


                localStorage.setItem(
                    OWN_PROFILE_CACHE_KEY,
                    JSON.stringify(
                        ownCache
                    )
                );
            }

        } catch (cacheError) {

            console.warn(
                "Unable to update following cache:",
                cacheError
            );
        }


        /* =================================================
           UPDATE CURRENT VIEW
        ================================================= */

        if (
            viewedUser &&
            viewedUser.uid === targetUid
        ) {

            viewedUser.followersCount =
                Number(
                    result.followersCount || 0
                );
        }


        button.textContent =
            isFollowing
                ? "Following"
                : "Follow";


        button.classList.toggle(
            "following",
            isFollowing
        );

    } catch (error) {

        console.error(
            "Follow operation failed:",
            error
        );


        isFollowing =
            previousFollowing;


        button.textContent =
            previousFollowing
                ? "Following"
                : "Follow";


        button.classList.toggle(
            "following",
            previousFollowing
        );


        alert(
            error?.message ||
            "Unable to update follow status. Please try again."
        );

    } finally {

        button.disabled =
            false;


        button.dataset.busy =
            "false";
    }
}


/* =========================================================
   PROFILE PHOTO UPLOAD
========================================================= */

async function handleProfilePhotoUpload(
    event
) {

    if (!currentUser) {
        return;
    }


    const file =
        event.target.files?.[0];


    if (!file) {
        return;
    }


    const status =
        $("profileUploadStatus");


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

        if (status) {

            status.textContent =
                "Please choose a JPG, PNG or WebP image.";

            status.className =
                "profile-upload-status error";
        }


        event.target.value =
            "";


        return;
    }


    if (
        file.size >
        5 * 1024 * 1024
    ) {

        if (status) {

            status.textContent =
                "Photo must be smaller than 5MB.";

            status.className =
                "profile-upload-status error";
        }


        event.target.value =
            "";


        return;
    }


    if (status) {

        status.textContent =
            "Preparing upload...";

        status.className =
            "profile-upload-status";
    }


    try {

        const extension =
            file.type === "image/png"

                ? "png"

                : file.type === "image/webp"

                    ? "webp"

                    : "jpg";


        const storagePath =
            `users/${currentUser.uid}/profile/profile.${extension}`;


        const photoRef =
            ref(
                storage,
                storagePath
            );


        const uploadTask =
            uploadBytesResumable(
                photoRef,
                file,
                {

                    contentType:
                        file.type,

                    cacheControl:
                        "public,max-age=3600"

                }
            );


        const snapshot =
            await new Promise(
                (resolve, reject) => {

                    uploadTask.on(

                        "state_changed",

                        uploadSnapshot => {

                            const progress =
                                Math.round(

                                    (
                                        uploadSnapshot.bytesTransferred /
                                        uploadSnapshot.totalBytes
                                    ) * 100

                                );


                            if (status) {

                                status.textContent =
                                    `Uploading photo... ${progress}%`;
                            }

                        },

                        error => {

                            reject(error);

                        },

                        () => {

                            resolve(
                                uploadTask.snapshot
                            );

                        }

                    );

                }
            );


        const photoURL =
            await getDownloadURL(
                snapshot.ref
            );


        /* =================================================
           FIREBASE AUTH PHOTO
        ================================================= */

        await updateProfile(
            currentUser,
            {
                photoURL
            }
        );


        /* =================================================
           FIRESTORE PHOTO
        ================================================= */

        await updateDoc(

            doc(
                db,
                "users",
                currentUser.uid
            ),

            {
                photoURL
            }

        );


        /* =================================================
           LOCAL STATE
        ================================================= */

        if (viewedUser) {

            viewedUser.photoURL =
                photoURL;
        }


        saveOwnProfileCache(
            viewedUser
        );


        /* =================================================
           IMMEDIATE IMAGE UPDATE
        ================================================= */

        const avatar =
            document.querySelector(
                ".profile-avatar"
            );


        if (avatar) {

            avatar.innerHTML = `

                <img
                    src="${escapeHtml(photoURL)}"
                    alt="${escapeHtml(
                        getFullName(
                            viewedUser || {}
                        )
                    )}"
                    class="connecta-profile-image-ready"
                >

            `;
        }


        /* =================================================
           HEADER PROFILE IMAGE
        ================================================= */

        const headerProfileImage =
            document.querySelector(
                ".profile-btn img"
            );


        if (headerProfileImage) {

            headerProfileImage.src =
                photoURL;
        }


        if (status) {

            status.textContent =
                "Profile photo updated successfully.";

            status.className =
                "profile-upload-status success";
        }

    } catch (error) {

        console.error(
            "Profile photo upload error:",
            error
        );


        if (status) {

            let message =
                "Unable to upload photo. Please try again.";


            if (
                error?.code ===
                "storage/unauthorized"
            ) {

                message =
                    "Firebase Storage denied this upload. Check your Storage Rules.";

            }

            else if (
                error?.code ===
                "storage/canceled"
            ) {

                message =
                    "Photo upload was canceled.";

            }

            else if (
                error?.code ===
                "storage/quota-exceeded"
            ) {

                message =
                    "Firebase Storage quota is unavailable.";

            }

            else if (
                error?.code ===
                "storage/unknown"
            ) {

                message =
                    "An unexpected Storage error occurred.";
            }


            status.textContent =
                message;


            status.className =
                "profile-upload-status error";
        }

    }


    event.target.value =
        "";
}


/* =========================================================
   LOAD PROFILE FROM FIRESTORE
========================================================= */

async function loadProfile(
    uid
) {

    if (!uid) {
        return;
    }


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

            /*
             * Do NOT replace the existing
             * profile with "Loading..."
             */

            if (!viewedUser) {

                const container =
                    $("profileContainer");


                if (container) {

                    container.innerHTML = `

                        <div class="connecta-profile-fallback">

                            <div class="connecta-profile-fallback-avatar">
                                ?
                            </div>

                            <strong>
                                Profile unavailable
                            </strong>

                            <p>
                                This CONNECTA profile could not be found.
                            </p>

                        </div>

                    `;
                }
            }


            return;
        }


        const profile = {

            uid,

            ...snapshot.data()

        };


        /* =================================================
           OWN PROFILE
        ================================================= */

        if (
            isOwnProfile(uid)
        ) {

            profile.email =
                profile.email ||
                currentUser?.email ||
                "";


            profile.isOnline =
                true;


            currentUserFollowing =
                Array.isArray(
                    profile.following
                )
                    ? [
                        ...profile.following
                    ]
                    : [];


            viewedUser =
                profile;


            saveOwnProfileCache(
                profile
            );


            renderProfile(
                profile
            );


            return;
        }


        /* =================================================
           OTHER USER
        ================================================= */

        const publicProfile =
            getPublicProfile(
                profile
            );


        savePublicProfileCache(
            publicProfile
        );


        renderProfile(
            publicProfile
        );

    } catch (error) {

        console.warn(
            "Background profile refresh failed:",
            error
        );


        /*
         * IMPORTANT:
         *
         * Do not destroy cached/instant
         * profile because of a temporary
         * network problem.
         */
    }
}


/* =========================================================
   REALTIME PROFILE LISTENER
========================================================= */

function listenToProfile(
    uid
) {

    if (!uid) {
        return;
    }


    if (stopProfileListener) {

        stopProfileListener();

        stopProfileListener =
            null;
    }


    const profileRef =
        doc(
            db,
            "users",
            uid
        );


    stopProfileListener =
        onSnapshot(

            profileRef,

            snapshot => {

                if (
                    !snapshot.exists()
                ) {

                    return;
                }


                const profile = {

                    uid,

                    ...snapshot.data()

                };


                /* =========================================
                   OWN PROFILE
                ========================================= */

                if (
                    isOwnProfile(uid)
                ) {

                    profile.email =
                        profile.email ||
                        currentUser?.email ||
                        "";


                    profile.isOnline =
                        true;


                    currentUserFollowing =
                        Array.isArray(
                            profile.following
                        )
                            ? [
                                ...profile.following
                            ]
                            : [];


                    viewedUser =
                        profile;


                    saveOwnProfileCache(
                        profile
                    );


                    renderProfile(
                        profile
                    );


                    return;
                }


                /* =========================================
                   OTHER USER
                ========================================= */

                const publicProfile =
                    getPublicProfile(
                        profile
                    );


                savePublicProfileCache(
                    publicProfile
                );


                renderProfile(
                    publicProfile
                );

            },

            error => {

                console.warn(
                    "Profile realtime listener:",
                    error
                );

            }

        );
}


/* =========================================================
   VERIFICATION MODAL
========================================================= */

function openVerificationModal() {

    if (!currentUser) {

        alert(
            "Please login before verifying your account."
        );

        return;
    }


    if (
        !viewedUser ||
        !isOwnProfile(
            viewedUser.uid
        )
    ) {

        return;
    }


    const modal =
        $("verificationModal");


    const phoneInput =
        $("verificationPhone");


    const message =
        $("verificationMessage");


    if (!modal) {
        return;
    }


    if (message) {

        message.textContent =
            "";

        message.className =
            "verification-message";
    }


    if (
        phoneInput &&
        viewedUser.phone
    ) {

        phoneInput.value =
            viewedUser.phone;
    }


    modal.classList.add(
        "show"
    );


    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    setTimeout(
        () => {

            if (phoneInput) {

                phoneInput.focus();
            }

        },
        100
    );
}


/* =========================================================
   CLOSE VERIFICATION MODAL
========================================================= */

function closeVerificationModal() {

    const modal =
        $("verificationModal");


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "show"
    );


    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}


/* =========================================================
   PHONE NORMALIZATION
========================================================= */

function normalizePhone(
    phone
) {

    let value =
        String(phone || "")
            .trim()
            .replace(/\s+/g, "")
            .replace(/-/g, "");


    if (
        value.startsWith("+254")
    ) {

        value =
            value.slice(1);
    }


    if (
        value.startsWith("07") ||
        value.startsWith("01")
    ) {

        value =
            "254" +
            value.slice(1);
    }


    return value;
}


/* =========================================================
   KENYAN PHONE VALIDATION
========================================================= */

function isValidKenyanPhone(
    phone
) {

    return /^254[17]\d{8}$/.test(
        phone
    );
}


/* =========================================================
   VERIFICATION MESSAGE
========================================================= */

function setVerificationMessage(
    message,
    type = ""
) {

    const element =
        $("verificationMessage");


    if (!element) {
        return;
    }


    element.textContent =
        message;


    element.className =
        `verification-message ${type}`.trim();
}

/* =========================================================
   RESET VERIFICATION STATE
   Used when payment fails, expires, is cancelled,
   or confirmation times out.
========================================================= */

async function resetVerificationState(
    reason = ""
) {

    if (!currentUser?.uid) {
        return false;
    }


    const resetData = {

        isVerified:
            false,

        verificationStatus:
            "not_submitted",

        verificationAmount:
            0,

        verificationTransactionCode:
            "",

        verifiedAt:
            null

    };


    try {

        await updateDoc(

            doc(
                db,
                "users",
                currentUser.uid
            ),

            resetData

        );


        /* =============================================
           UPDATE CURRENT PROFILE
        ============================================= */

        if (viewedUser) {

            Object.assign(
                viewedUser,
                resetData
            );
        }


        /* =============================================
           UPDATE LOCAL CACHE
        ============================================= */

        const cached =
            getOwnProfileCache();


        if (cached) {

            Object.assign(
                cached,
                resetData
            );


            cached.cachedAt =
                Date.now();


            localStorage.setItem(
                OWN_PROFILE_CACHE_KEY,
                JSON.stringify(cached)
            );
        }


        /* =============================================
           REFRESH PROFILE UI
        ============================================= */

        if (viewedUser) {

            renderProfile(
                viewedUser
            );
        }


        console.log(
            "CONNECTA verification state reset:",
            reason
        );


        return true;

    } catch (error) {

        console.error(
            "Unable to reset verification state:",
            error
        );


        /*
         * Even if Firestore reset fails,
         * restore the local UI so the user
         * can try again.
         */

        if (viewedUser) {

            Object.assign(
                viewedUser,
                resetData
            );


            renderProfile(
                viewedUser
            );
        }


        return false;
    }
}


/* =========================================================
   START VERIFICATION
========================================================= */

async function startVerification() {

    if (!currentUser) {

        setVerificationMessage(
            "Please login again before continuing.",
            "error"
        );

        return;
    }


    const phoneInput =
        $("verificationPhone");


    const submitButton =
        $("verificationSubmit");


    if (
        !phoneInput ||
        !submitButton
    ) {

        return;
    }


    const phone =
        normalizePhone(
            phoneInput.value
        );


    if (
        !isValidKenyanPhone(phone)
    ) {

        setVerificationMessage(
            "Enter a valid Kenyan M-PESA number, for example 0712345678.",
            "error"
        );


        phoneInput.focus();

        return;
    }


    /*
     * Stop an old polling session before
     * starting another verification attempt.
     */

    if (verificationPollTimer) {

        clearInterval(
            verificationPollTimer
        );

        verificationPollTimer =
            null;
    }


    verificationPolling =
        false;


    submitButton.disabled =
        true;


    submitButton.textContent =
        "Starting payment...";


    setVerificationMessage(
        `Sending the KSh ${VERIFICATION_AMOUNT} verification payment request...`,
        "pending"
    );


    try {

        const token =
            await currentUser.getIdToken(
                true
            );


        const response =
            await fetch(
                `${API_BASE_URL}/api/verification/initiate`,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`

                    },

                    body:
                        JSON.stringify({
                            phone
                        })

                }
            );


        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );


        if (!response.ok) {

            throw new Error(
                data.message ||
                data.error ||
                "Unable to start verification payment."
            );
        }


        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to start verification payment."
            );
        }


        setVerificationMessage(
            `STK Push sent. Check your phone and enter your M-PESA PIN to complete the KSh ${VERIFICATION_AMOUNT} payment.`,
            "pending"
        );


        submitButton.textContent =
            "Waiting for payment...";


        const reference =
            data.reference ||
            data.checkout_request_id;


        if (!reference) {

            /*
             * Payment was supposedly initiated,
             * but no reference came back.
             *
             * Do NOT leave the account pending.
             */

            await resetVerificationState(
                "No verification payment reference returned"
            );


            throw new Error(
                "Payment started but no payment reference was returned. You can try again."
            );
        }


        startVerificationPolling(
            reference
        );


    } catch (error) {

        console.error(
            "Verification initiation error:",
            error
        );


        /*
         * IMPORTANT:
         * Reset Firestore pending state so the
         * profile does not remain stuck.
         */

        await resetVerificationState(
            "Verification initiation failed"
        );


        setVerificationMessage(
            error.message ||
            "Unable to start verification payment. Please try again.",
            "error"
        );


        submitButton.disabled =
            false;


        submitButton.textContent =
            `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;
    }
}


/* =========================================================
   VERIFICATION POLLING
========================================================= */

function startVerificationPolling(
    reference
) {

    if (
        verificationPolling
    ) {

        return;
    }


    verificationPolling =
        true;


    let attempts =
        0;


    const maxAttempts =
        40;


    clearInterval(
        verificationPollTimer
    );


    verificationPollTimer =
        setInterval(
            async () => {

                attempts++;


                try {

                    const completed =
                        await checkVerificationStatus(
                            reference
                        );


                    if (completed) {

                        clearInterval(
                            verificationPollTimer
                        );


                        verificationPollTimer =
                            null;


                        verificationPolling =
                            false;


                        return;
                    }


                    /*
                     * Payment has not completed yet.
                     */

                    if (
                        attempts >=
                        maxAttempts
                    ) {

                        clearInterval(
                            verificationPollTimer
                        );


                        verificationPollTimer =
                            null;


                        verificationPolling =
                            false;


                        /*
                         * IMPORTANT:
                         * No response after the maximum
                         * polling period means we must
                         * release the pending state.
                         */

                        await resetVerificationState(
                            "Verification payment confirmation timed out"
                        );


                        const button =
                            $("verificationSubmit");


                        if (button) {

                            button.disabled =
                                false;


                            button.textContent =
                                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;
                        }


                        setVerificationMessage(
                            "No payment confirmation was received. Your account is ready for another verification attempt.",
                            "error"
                        );

                    }

                } catch (error) {

                    console.error(
                        "Verification status error:",
                        error
                    );


                    /*
                     * Do not immediately cancel because
                     * one status request failed.
                     *
                     * Keep polling until maxAttempts.
                     */

                    if (
                        attempts >=
                        maxAttempts
                    ) {

                        clearInterval(
                            verificationPollTimer
                        );


                        verificationPollTimer =
                            null;


                        verificationPolling =
                            false;


                        await resetVerificationState(
                            "Verification status checking timed out"
                        );


                        const button =
                            $("verificationSubmit");


                        if (button) {

                            button.disabled =
                                false;


                            button.textContent =
                                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;
                        }


                        setVerificationMessage(
                            "We could not confirm the payment. Your account is ready for another verification attempt.",
                            "error"
                        );
                    }
                }

            },

            3000
        );
}
    

/* =========================================================
   CHECK VERIFICATION STATUS
========================================================= */

async function checkVerificationStatus(
    reference
) {

    const token =
        await currentUser.getIdToken(
            true
        );


    const response =
        await fetch(
            `${API_BASE_URL}/api/verification/status`,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${token}`

                },

                body:
                    JSON.stringify({
                        reference
                    })

            }
        );


    const data =
        await response
            .json()
            .catch(
                () => ({})
            );


    if (!response.ok) {

        throw new Error(
            data.message ||
            data.error ||
            "Unable to check verification status."
        );
    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    if (
        data.success === true &&
        (
            data.status === "completed" ||
            data.status === "verified" ||
            data.status === "successful" ||
            data.status === "paid"
        )
    ) {

        setVerificationMessage(
            "Payment confirmed. Your account has been verified successfully.",
            "success"
        );


        const button =
            $("verificationSubmit");


        if (button) {

            button.disabled =
                true;


            button.textContent =
                "✓ Account Verified";
        }


        setTimeout(
            async () => {

                closeVerificationModal();


                await loadProfile(
                    currentUser.uid
                );

            },
            1200
        );


        return true;
    }


    /* =====================================================
       FAILED / CANCELLED / REJECTED / EXPIRED
    ===================================================== */

    const failedStatuses = [

        "failed",

        "cancelled",

        "canceled",

        "rejected",

        "expired",

        "timeout",

        "declined"

    ];


    if (
        failedStatuses.includes(
            String(
                data.status || ""
            ).toLowerCase()
        )
    ) {

        /*
         * CRITICAL:
         * Remove payment_pending from Firestore.
         */

        await resetVerificationState(
            `Verification payment ${data.status || "failed"}`
        );


        const button =
            $("verificationSubmit");


        if (button) {

            button.disabled =
                false;


            button.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;
        }


        setVerificationMessage(
            data.message ||
            "The verification payment was not completed. You can try again.",
            "error"
        );


        return true;
    }


    /* =====================================================
       STILL PROCESSING
    ===================================================== */

    setVerificationMessage(
        "Waiting for M-PESA payment confirmation...",
        "pending"
    );


    return false;
}


/* =========================================================
   BACK BUTTON
========================================================= */

function setupBackButton() {

    const backButton =
        $("backBtn");


    if (!backButton) {
        return;
    }


    backButton.addEventListener(
        "click",
        () => {

            if (
                document.referrer &&
                document.referrer !==
                location.href
            ) {

                history.back();

            } else {

                location.href =
                    "dashboard.html";
            }

        }
    );
}


/* =========================================================
   VERIFICATION EVENTS
========================================================= */

function setupVerificationEvents() {

    const verificationClose =
        $("verificationClose");


    if (verificationClose) {

        verificationClose.addEventListener(
            "click",
            closeVerificationModal
        );
    }


    const verificationModal =
        $("verificationModal");


    if (verificationModal) {

        verificationModal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    verificationModal
                ) {

                    closeVerificationModal();
                }

            }
        );
    }


    const verificationSubmit =
        $("verificationSubmit");


    if (verificationSubmit) {

        verificationSubmit.addEventListener(
            "click",
            startVerification
        );
    }
}


/* =========================================================
   INSTANT INITIALIZATION
========================================================= */

async function initializeProfile(
    user
) {

    currentUser =
        user;


    if (!user) {

        location.replace(
            "login.html"
        );

        return;
    }


    const requestedUid =
        getProfileUid();


    const profileUid =
        requestedUid ||
        user.uid;


    /* =====================================================
       STEP 1
       SHOW LOCAL PROFILE IMMEDIATELY
    ===================================================== */

    let displayedInstantProfile =
        false;


    /*
     * First try Firestore profile cache.
     */

    displayedInstantProfile =
        loadCachedProfile(
            profileUid
        );


    /*
     * If this is OUR profile and there is
     * no Firestore cache, build a profile
     * immediately from Firebase Authentication.
     *
     * This is what prevents the blank
     * "Loading profile..." experience.
     */

    if (
        !displayedInstantProfile &&
        profileUid === user.uid
    ) {

        const instantProfile =
            createInstantAuthProfile(
                user
            );


        if (instantProfile) {

            viewedUser =
                instantProfile;


            renderProfile(
                instantProfile
            );


            displayedInstantProfile =
                true;
        }
    }


    /*
     * For another user's profile, if there
     * is no cache, render a neutral profile
     * immediately instead of "Loading..."
     */

    if (
        !displayedInstantProfile &&
        profileUid !== user.uid
    ) {

        const instantOtherProfile = {

            uid:
                profileUid,

            displayName:
                "CONNECTA User",

            username:
                "",

            photoURL:
                "",

            photoUrl:
                "",

            bio:
                "",

            isOnline:
                false,

            isVerified:
                false,

            followersCount:
                0,

            followingCount:
                0

        };


        renderProfile(
            instantOtherProfile
        );
    }


    /* =====================================================
       STEP 2
       PRESENCE RUNS IN BACKGROUND
    ===================================================== */

    if (
        profileUid === user.uid
    ) {

        markCurrentUserOnline()
            .catch(
                error => {

                    console.warn(
                        "Presence update failed:",
                        error
                    );

                }
            );
    }


    /* =====================================================
       STEP 3
       LOAD FOLLOWING IN BACKGROUND
    ===================================================== */

    loadCurrentUserFollowing()
        .catch(
            error => {

                console.warn(
                    "Following startup failed:",
                    error
                );

            }
        );


    /* =====================================================
       STEP 4
       REALTIME FIRESTORE LISTENER
    ===================================================== */

    listenToProfile(
        profileUid
    );


    /* =====================================================
       STEP 5
       BACKGROUND FIRESTORE REFRESH
    ===================================================== */

    loadProfile(
        profileUid
    )
        .catch(
            error => {

                console.warn(
                    "Profile background refresh failed:",
                    error
                );

            }
        );
}


/* =========================================================
   STARTUP
========================================================= */

installInstantProfileStyles();

setupBackButton();

setupVerificationEvents();


/*
 * Firebase Auth restores the session.
 *
 * There is deliberately NO artificial delay
 * and NO "Loading profile..." state.
 */

onAuthStateChanged(
    auth,
    initializeProfile
);


/* =========================================================
   PAGE CLEANUP
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (
            stopProfileListener
        ) {

            stopProfileListener();

            stopProfileListener =
                null;
        }


        if (
            verificationPollTimer
        ) {

            clearInterval(
                verificationPollTimer
            );


            verificationPollTimer =
                null;
        }


        verificationPolling =
            false;

    }
);
