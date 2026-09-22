import { auth, db, storage } from "./firebase.js";

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


/* =====================================================
   CONFIGURATION
===================================================== */

const API_BASE_URL =
  "https://connecta-backend-com.onrender.com";


/* =====================================================
   ACCOUNT VERIFICATION
===================================================== */

const VERIFICATION_AMOUNT = 999;


/* =====================================================
   STATE
===================================================== */

let currentUser = null;

let viewedUser = null;

let stopProfileListener = null;

let verificationPollTimer = null;

let verificationPolling = false;

let isFollowing = false;

let currentUserFollowing = [];


/* =====================================================
   CACHE
===================================================== */

const OWN_PROFILE_CACHE_KEY =
  "connectaOwnProfileCache_v2";

const PUBLIC_PROFILE_CACHE_KEY =
  "connectaPublicProfileCache_v2";


/* =====================================================
   INSTANT PROFILE CSS
===================================================== */

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

    /*
    ================================================
    INSTANT PROFILE SKELETON
    ================================================
    */

    .connecta-profile-skeleton {
      padding: 20px 16px 40px;
      animation: connectaProfileFadeIn .18s ease-out;
    }


    .connecta-skeleton-hero {
      text-align: center;
      padding: 12px 0 28px;
    }


    .connecta-skeleton-avatar {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      margin: 0 auto 18px;
      background: linear-gradient(
        90deg,
        #e8edf2 25%,
        #f7f9fb 37%,
        #e8edf2 63%
      );
      background-size: 400% 100%;
      animation: connectaProfileShimmer 1.25s infinite;
    }


    .connecta-skeleton-line {
      height: 13px;
      border-radius: 999px;
      margin: 9px auto;
      background: linear-gradient(
        90deg,
        #e8edf2 25%,
        #f7f9fb 37%,
        #e8edf2 63%
      );
      background-size: 400% 100%;
      animation: connectaProfileShimmer 1.25s infinite;
    }


    .connecta-skeleton-name {
      width: 150px;
      height: 18px;
    }


    .connecta-skeleton-username {
      width: 100px;
    }


    .connecta-skeleton-status {
      width: 75px;
    }


    .connecta-skeleton-card {
      background: #fff;
      border-radius: 18px;
      padding: 18px;
      margin: 14px 0;
      min-height: 100px;
      box-shadow:
        0 2px 12px rgba(0,0,0,.04);
    }


    .connecta-skeleton-card-title {
      width: 145px;
      height: 16px;
      margin-bottom: 20px;
    }


    .connecta-skeleton-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }


    .connecta-skeleton-box {
      height: 62px;
      border-radius: 12px;
      background: linear-gradient(
        90deg,
        #e8edf2 25%,
        #f7f9fb 37%,
        #e8edf2 63%
      );
      background-size: 400% 100%;
      animation: connectaProfileShimmer 1.25s infinite;
    }


    @keyframes connectaProfileShimmer {

      0% {
        background-position: 100% 0;
      }

      100% {
        background-position: -100% 0;
      }

    }


    @keyframes connectaProfileFadeIn {

      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }

    }


    /*
    ================================================
    IMAGE FADE-IN
    ================================================
    */

    .profile-avatar img {
      opacity: 0;
      transition: opacity .18s ease;
    }


    .profile-avatar img.connecta-profile-image-ready {
      opacity: 1;
    }

  `;


  document.head.appendChild(style);

}


/* =====================================================
   HELPER
===================================================== */

const $ = id =>
  document.getElementById(id);


/* =====================================================
   INITIALS
===================================================== */

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


/* =====================================================
   FULL NAME
===================================================== */

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


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value = "") {

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


/* =====================================================
   PROFILE UID
===================================================== */

function getProfileUid() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  return params.get("uid");

}


/* =====================================================
   NUMBER FORMAT
===================================================== */

function formatNumber(value) {

  const number =
    Number(value || 0);


  return number.toLocaleString();

}


/* =====================================================
   BALANCE FORMAT
===================================================== */

function formatBalance(value) {

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


/* =====================================================
   PROFILE MODE
===================================================== */

function isOwnProfile(uid) {

  return !!(
    currentUser &&
    uid &&
    currentUser.uid === uid
  );

}


/* =====================================================
   OWN PROFILE CACHE
===================================================== */

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


/* =====================================================
   SAVE OWN PROFILE CACHE
===================================================== */

function saveOwnProfileCache(profile) {

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
        profile.referralCode || "",

      referralCount:
        Number(
          profile.referralCount ||
          profile.referralsCount ||
          0
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


/* =====================================================
   PUBLIC PROFILE CACHE
===================================================== */

function getPublicProfileCache(uid) {

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


/* =====================================================
   SAVE PUBLIC PROFILE CACHE
===================================================== */

function savePublicProfileCache(profile) {

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


/* =====================================================
   CREATE PUBLIC PROFILE
===================================================== */

function getPublicProfile(profile) {

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


/* =====================================================
   PROFILE SKELETON
===================================================== */

function showProfileSkeleton() {

  const container =
    $("profileContainer");


  if (!container) {
    return;
  }


  /*
  Do not replace an already rendered profile.
  */

  if (
    container.dataset.profileRendered ===
    "true"
  ) {
    return;
  }


  container.innerHTML = `

    <div class="connecta-profile-skeleton">

      <div class="connecta-skeleton-hero">

        <div class="connecta-skeleton-avatar"></div>

        <div class="
          connecta-skeleton-line
          connecta-skeleton-name
        "></div>

        <div class="
          connecta-skeleton-line
          connecta-skeleton-username
        "></div>

        <div class="
          connecta-skeleton-line
          connecta-skeleton-status
        "></div>

      </div>


      <div class="connecta-skeleton-card">

        <div class="
          connecta-skeleton-line
          connecta-skeleton-card-title
        "></div>


        <div class="connecta-skeleton-grid">

          <div class="connecta-skeleton-box"></div>

          <div class="connecta-skeleton-box"></div>

          <div class="connecta-skeleton-box"></div>

          <div class="connecta-skeleton-box"></div>

        </div>

      </div>


      <div class="connecta-skeleton-card">

        <div class="
          connecta-skeleton-line
          connecta-skeleton-card-title
        "></div>

        <div class="connecta-skeleton-box"></div>

      </div>

    </div>

  `;

}


/* =====================================================
   MARK CURRENT USER ONLINE
===================================================== */

async function markCurrentUserOnline() {

  if (!currentUser) {
    return;
  }


  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    await updateDoc(
      userRef,
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


/* =====================================================
   LOAD CURRENT USER FOLLOWING
===================================================== */

async function loadCurrentUserFollowing() {

  if (!currentUser) {
    return;
  }


  /*
  =====================================================
  CACHE FIRST
  =====================================================
  */

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


  /*
  =====================================================
  FIRESTORE REFRESH
  =====================================================
  */

  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    const snapshot =
      await getDoc(
        userRef
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


/* =====================================================
   IMAGE READY HANDLER
===================================================== */

function markProfileImagesReady() {

  document
    .querySelectorAll(
      ".profile-avatar img"
    )
    .forEach(
      image => {

        if (image.complete) {

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


/* =====================================================
   RENDER PROFILE
===================================================== */

function renderProfile(profile) {

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
      : getPublicProfile(
          profile
        );


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


  let actionHtml = "";


  /*
  =====================================================
  OWN PROFILE ACTION
  =====================================================
  */

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


  /*
  =====================================================
  OTHER USER ACTIONS
  =====================================================
  */

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
        class="
          profile-follow-btn
          ${isFollowing ? "following" : ""}
        "
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


  /*
  =====================================================
  OWN PROFILE
  =====================================================
  */

  if (own) {

    container.innerHTML = `

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

    `;

  }


  /*
  =====================================================
  OTHER USER PROFILE
  =====================================================
  */

  else {

    container.innerHTML = `

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


      <!-- PUBLIC PROFILE STATISTICS -->

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

    `;

  }


  /*
  =====================================================
  MARK PROFILE AS RENDERED
  =====================================================
  */

  container.dataset.profileRendered =
    "true";


  /*
  =====================================================
  HEADER TITLE
  =====================================================
  */

  const headerTitle =
    $("profileHeaderTitle");


  if (headerTitle) {

    headerTitle.textContent =
      own
        ? "My Profile"
        : "Profile";

  }


  /*
  =====================================================
  OWN PHOTO UPLOAD
  =====================================================
  */

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


  /*
  =====================================================
  CHAT
  =====================================================
  */

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


  /*
  =====================================================
  FOLLOW
  =====================================================
  */

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


  /*
  =====================================================
  VERIFY
  =====================================================
  */

  const verifyButton =
    $("verifyAccountBtn");


  if (verifyButton) {

    verifyButton.addEventListener(
      "click",
      openVerificationModal
    );

  }


  /*
  =====================================================
  REFER & EARN
  =====================================================
  */

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


  /*
  =====================================================
  IMAGE FADE-IN
  =====================================================
  */

  requestAnimationFrame(
    markProfileImagesReady
  );

}


/* =====================================================
   FOLLOW / UNFOLLOW
===================================================== */

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


          /*
          ==========================================
          UNFOLLOW
          ==========================================
          */

          if (alreadyFollowing) {

            const newFollowing =
              following.filter(
                uid =>
                  uid !== targetUid
              );


            const newFollowers =
              followers.filter(
                uid =>
                  uid !== currentUser.uid
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


          /*
          ==========================================
          FOLLOW
          ==========================================
          */

          const newFollowing =
            [
              ...following,
              targetUid
            ];


          const followerWasAlreadyPresent =
            followers.includes(
              currentUser.uid
            );


          const newFollowers =
            followerWasAlreadyPresent
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
            followerWasAlreadyPresent
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


    /*
    =================================================
    IMMEDIATE LOCAL UPDATE
    =================================================
    */

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


    /*
    =================================================
    UPDATE OWN CACHE
    =================================================
    */

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


    /*
    =================================================
    UPDATE VIEWED PROFILE
    =================================================
    */

    if (
      viewedUser &&
      viewedUser.uid === targetUid
    ) {

      viewedUser.followersCount =
        Number(
          result.followersCount || 0
        );

    }


    /*
    =================================================
    UPDATE BUTTON WITHOUT RELOAD
    =================================================
    */

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


/* =====================================================
   PROFILE PHOTO UPLOAD
===================================================== */

async function handleProfilePhotoUpload(event) {

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


  if (!allowedTypes.includes(file.type)) {

    if (status) {

      status.textContent =
        "Please choose a JPG, PNG or WebP image.";

      status.className =
        "profile-upload-status error";

    }


    event.target.value = "";

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


    event.target.value = "";

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


    /*
    =====================================================
    UPDATE FIREBASE AUTH
    =====================================================
    */

    await updateProfile(
      currentUser,
      {
        photoURL
      }
    );


    /*
    =====================================================
    UPDATE FIRESTORE
    =====================================================
    */

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    await updateDoc(
      userRef,
      {
        photoURL
      }
    );


    /*
    =====================================================
    UPDATE LOCAL STATE
    =====================================================
    */

    if (viewedUser) {

      viewedUser.photoURL =
        photoURL;

    }


    /*
    =====================================================
    UPDATE CACHE
    =====================================================
    */

    if (viewedUser) {

      saveOwnProfileCache(
        viewedUser
      );

    }


    /*
    =====================================================
    IMMEDIATE IMAGE UPDATE
    =====================================================
    */

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


  event.target.value = "";

}


/* =====================================================
   LOAD CACHED PROFILE
===================================================== */

function loadCachedProfile(uid) {

  if (!uid) {
    return false;
  }


  const own =
    isOwnProfile(
      uid
    );


  const cached =
    own
      ? getOwnProfileCache()
      : getPublicProfileCache(
          uid
        );


  if (!cached) {
    return false;
  }


  /*
  Own profile is considered online while
  the authenticated session is active.
  */

  if (own) {

    cached.isOnline =
      true;

  }


  /*
  Restore following immediately.
  */

  if (
    own &&
    Array.isArray(
      cached.following
    )
  ) {

    currentUserFollowing =
      [
        ...cached.following
      ];

  }


  renderProfile(
    cached
  );


  return true;

}


/* =====================================================
   LOAD PROFILE FROM FIRESTORE
===================================================== */

async function loadProfile(
  uid,
  showSkeleton = false
) {

  if (!uid) {
    return;
  }


  /*
  =====================================================
  IMPORTANT:

  Never replace an already visible cached profile
  with "Loading profile...".
  =====================================================
  */

  if (
    showSkeleton &&
    !viewedUser
  ) {

    showProfileSkeleton();

  }


  try {

    const profileRef =
      doc(
        db,
        "users",
        uid
      );


    /*
    This is now a background refresh.
    The realtime listener is also active.
    */

    const snapshot =
      await getDoc(
        profileRef
      );


    if (!snapshot.exists()) {

      /*
      If cached profile exists, keep showing it.
      */

      if (!viewedUser) {

        const container =
          $("profileContainer");


        if (container) {

          container.innerHTML = `

            <div class="profile-error">
              This profile could not be found.
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


    /*
    =====================================================
    OWN PROFILE
    =====================================================
    */

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


    }


    /*
    =====================================================
    OTHER USER
    =====================================================
    */

    else {

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

    }


  } catch (error) {

    console.warn(
      "Background profile refresh failed:",
      error
    );


    /*
    Never destroy a valid cached profile because
    the network temporarily failed.
    */

    if (!viewedUser) {

      const container =
        $("profileContainer");


      if (container) {

        container.innerHTML = `

          <div class="profile-error">

            Unable to connect right now.

            <br>

            Please check your connection
            and try again.

          </div>

        `;

      }

    }

  }

}


/* =====================================================
   REALTIME PROFILE LISTENER
===================================================== */

function listenToProfile(uid) {

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

        if (!snapshot.exists()) {

          return;

        }


        const profile = {

          uid,

          ...snapshot.data()

        };


        /*
        =================================================
        OWN PROFILE
        =================================================
        */

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


        /*
        =================================================
        OTHER USER
        =================================================
        */

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


/* =====================================================
   VERIFICATION MODAL
===================================================== */

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


/* =====================================================
   CLOSE VERIFICATION MODAL
===================================================== */

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


/* =====================================================
   PHONE NORMALIZATION
===================================================== */

function normalizePhone(phone) {

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


/* =====================================================
   PHONE VALIDATION
===================================================== */

function isValidKenyanPhone(phone) {

  return /^254[17]\d{8}$/.test(
    phone
  );

}


/* =====================================================
   VERIFICATION MESSAGE
===================================================== */

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


/* =====================================================
   START VERIFICATION
===================================================== */

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

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`

          },

          body: JSON.stringify({
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


    if (
      data.reference
    ) {

      startVerificationPolling(
        data.reference
      );

    }

    else if (
      data.checkout_request_id
    ) {

      startVerificationPolling(
        data.checkout_request_id
      );

    }

    else {

      throw new Error(
        "Payment started but no payment reference was returned."
      );

    }


  } catch (error) {

    console.error(
      "Verification initiation error:",
      error
    );


    setVerificationMessage(
      error.message ||
      "Unable to start verification payment.",
      "error"
    );


    submitButton.disabled =
      false;


    submitButton.textContent =
      `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

  }

}


/* =====================================================
   START VERIFICATION POLLING
===================================================== */

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


          if (
            attempts >= maxAttempts
          ) {

            clearInterval(
              verificationPollTimer
            );


            verificationPollTimer =
              null;


            verificationPolling =
              false;


            const button =
              $("verificationSubmit");


            if (button) {

              button.disabled =
                false;


              button.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

            }


            setVerificationMessage(
              "Payment confirmation is taking longer than expected. Please check your profile again shortly.",
              "pending"
            );

          }


        } catch (error) {

          console.error(
            "Verification status error:",
            error
          );


          if (
            attempts >= maxAttempts
          ) {

            clearInterval(
              verificationPollTimer
            );


            verificationPollTimer =
              null;


            verificationPolling =
              false;


            const button =
              $("verificationSubmit");


            if (button) {

              button.disabled =
                false;


              button.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

            }


            setVerificationMessage(
              "Payment confirmation is taking longer than expected. Please check your profile again shortly.",
              "pending"
            );

          }

        }

      },

      3000
    );

}


/* =====================================================
   CHECK VERIFICATION STATUS
===================================================== */

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

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${token}`

        },

        body: JSON.stringify({
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


  if (
    data.success === true &&
    (
      data.status === "completed" ||
      data.status === "verified"
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
          currentUser.uid,
          false
        );

      },

      1200
    );


    return true;

  }


  if (
    data.status === "failed"
  ) {

    setVerificationMessage(
      data.message ||
      "The verification payment failed. Please try again.",
      "error"
    );


    const button =
      $("verificationSubmit");


    if (button) {

      button.disabled =
        false;


      button.textContent =
        `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

    }


    return true;

  }


  setVerificationMessage(
    "Waiting for M-PESA payment confirmation...",
    "pending"
  );


  return false;

}


/* =====================================================
   BACK BUTTON
===================================================== */

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
        document.referrer !== location.href
      ) {

        history.back();

      } else {

        location.href =
          "dashboard.html";

      }

    }
  );

}


/* =====================================================
   VERIFICATION EVENTS
===================================================== */

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


/* =====================================================
   INITIALIZE PROFILE
===================================================== */

async function initializeProfile(user) {

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


  /*
  =====================================================
  STEP 1 — CACHE FIRST
  =====================================================
  */

  const hasCachedProfile =
    loadCachedProfile(
      profileUid
    );


  /*
  =====================================================
  STEP 2 — ONLY SHOW SKELETON IF ABSOLUTELY
  NECESSARY
  =====================================================
  */

  if (!hasCachedProfile) {

    showProfileSkeleton();

  }


  /*
  =====================================================
  STEP 3 — PRESENCE DOES NOT BLOCK UI
  =====================================================
  */

  if (
    profileUid ===
    user.uid
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


  /*
  =====================================================
  STEP 4 — FOLLOWING CACHE/FRESH DATA
  DOES NOT BLOCK PROFILE
  =====================================================
  */

  loadCurrentUserFollowing()
    .catch(
      error => {

        console.warn(
          "Following startup failed:",
          error
        );

      }
    );


  /*
  =====================================================
  STEP 5 — REALTIME PROFILE
  =====================================================
  */

  listenToProfile(
    profileUid
  );


  /*
  =====================================================
  STEP 6 — BACKGROUND FIRESTORE REFRESH
  =====================================================
  */

  loadProfile(
    profileUid,
    false
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


/* =====================================================
   START
===================================================== */

installInstantProfileStyles();

setupBackButton();

setupVerificationEvents();


/*
=====================================================
AUTH LISTENER
=====================================================

The profile is initialized as soon as Firebase Auth
restores the session.

No artificial loading delay.
*/

onAuthStateChanged(
  auth,
  initializeProfile
);


/* =====================================================
   PAGE CLEANUP
===================================================== */

window.addEventListener(
  "beforeunload",
  () => {

    if (stopProfileListener) {

      stopProfileListener();

      stopProfileListener =
        null;

    }


    if (verificationPollTimer) {

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
