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
  arrayUnion,
  arrayRemove
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


/*
=====================================================
ACCOUNT VERIFICATION
=====================================================
*/

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


/* =====================================================
   CACHE
===================================================== */

/*
   We intentionally use TWO caches.

   OWN PROFILE:
   Can contain the user's own private UI information.

   PUBLIC PROFILE:
   Contains only information that is intended to be
   displayed to other users.

   We do NOT use the old generic profile cache here.
*/

const OWN_PROFILE_CACHE_KEY =
  "connectaOwnProfileCache_v2";

const PUBLIC_PROFILE_CACHE_KEY =
  "connectaPublicProfileCache_v2";


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

  if (
    String(user.displayName || "").trim()
  ) {

    return user.displayName.trim();

  }


  const fullName =
    `${user.firstName || ""} ${user.lastName || ""}`
      .trim();


  if (fullName) {
    return fullName;
  }


  if (user.username) {
    return String(user.username)
      .replace(/^@/, "");
  }


  return "CONNECTA User";

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value = "") {

  return String(value)

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

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

    /*
    Own profile is allowed to contain the information
    required to instantly reconstruct the user's own
    account page.

    This cache is only used for the authenticated user's
    own profile.
    */

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

      balance:
        Number(profile.balance || 0),

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
        Array.isArray(profile.following)
          ? profile.following
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

    /*
    IMPORTANT:

    Only public information is saved here.

    Private fields such as:
    email
    phone
    balance
    referralCode
    referralCount
    verification payment information
    are deliberately NOT cached.
    */

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

      JSON.stringify(publicProfile)

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


  /*
  This creates a safe public representation for rendering.
  */

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
        isOnline: true,

        lastSeen:
          serverTimestamp()
      }
    );


    console.log(
      "CONNECTA: user marked online"
    );


  } catch (error) {

    console.warn(
      "Unable to update online status:",
      error
    );

  }

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


  /*
  Other users are rendered ONLY from the
  public profile representation.
  */

  const safeProfile =
    own
      ? profile
      : getPublicProfile(profile);


  if (!safeProfile) {
    return;
  }


  /*
  Track whether current user follows this user.
  */

  if (!own) {

    const following =
      Array.isArray(
        currentUser?.following
      )
        ? currentUser.following
        : Array.isArray(
            profile.following
          )
          ? profile.following
          : [];


    isFollowing =
      following.includes(
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


  /*
  Own profile is always treated as online while
  the authenticated user is actively using CONNECTA.
  */

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


  /*
  =====================================================
  STATUS
  =====================================================
  */

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


  /*
  =====================================================
  BIO
  =====================================================
  */

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


  /*
  =====================================================
  ACTION BUTTONS
  =====================================================
  */

  let actionHtml = "";


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

  } else {

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


      <!-- =========================================
           ACCOUNT STATISTICS
      ========================================= -->

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

        </div>

      </section>


      <!-- =========================================
           CONTACT INFORMATION
      ========================================= -->

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


      <!-- =========================================
           REFERRAL INFORMATION
      ========================================= -->

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


      <!-- =========================================
           STORIES
      ========================================= -->

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


      <!-- =========================================
           PUBLIC PROFILE STATISTICS
      ========================================= -->

      <section class="profile-card">

        <div class="profile-card-title">
          Profile Statistics
        </div>


        <div class="profile-public-stats">

          <div class="profile-public-stat">

            <div class="profile-public-stat-value">
              ${formatNumber(followers)}
            </div>

            <div class="profile-public-stat-label">
              Followers
            </div>

          </div>


          <div class="profile-public-stat">

            <div class="profile-public-stat-value">
              ${formatNumber(following)}
            </div>

            <div class="profile-public-stat-label">
              Following
            </div>

          </div>

        </div>

      </section>


      <!-- =========================================
           PUBLIC STORIES
      ========================================= -->

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
  UPDATE HEADER TITLE
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
  OWN PROFILE PHOTO UPLOAD
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
  CHAT BUTTON
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
  FOLLOW BUTTON
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
  VERIFY BUTTON
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


  const wasFollowing =
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


    if (wasFollowing) {

      await updateDoc(
        currentUserRef,
        {
          following:
            arrayRemove(targetUid)
        }
      );


      /*
      Decrease the public follower count.

      This is kept simple for now. Later we can
      move follow operations to a secure backend
      transaction.
      */

      const targetSnap =
        await getDoc(
          targetUserRef
        );


      if (targetSnap.exists()) {

        const targetData =
          targetSnap.data();


        const currentCount =
          Number(
            targetData.followersCount || 0
          );


        await updateDoc(
          targetUserRef,
          {
            followersCount:
              Math.max(
                0,
                currentCount - 1
              )
          }
        );

      }


      isFollowing =
        false;


    } else {

      await updateDoc(
        currentUserRef,
        {
          following:
            arrayUnion(targetUid)
        }
      );


      const targetSnap =
        await getDoc(
          targetUserRef
        );


      if (targetSnap.exists()) {

        const targetData =
          targetSnap.data();


        const currentCount =
          Number(
            targetData.followersCount || 0
          );


        await updateDoc(
          targetUserRef,
          {
            followersCount:
              currentCount + 1
          }
        );

      }


      isFollowing =
        true;

    }


    /*
    Update local Firebase user state representation.
    */

    if (!Array.isArray(currentUser.following)) {

      currentUser.following = [];

    }


    if (isFollowing) {

      if (
        !currentUser.following.includes(
          targetUid
        )
      ) {

        currentUser.following.push(
          targetUid
        );

      }

    } else {

      currentUser.following =
        currentUser.following.filter(
          uid =>
            uid !== targetUid
        );

    }


    /*
    Update button immediately.
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


    alert(
      "Unable to update follow status. Please try again."
    );


    isFollowing =
      wasFollowing;

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


  /*
  Maximum 5MB.
  */

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

    /*
    =================================================
    STORAGE PATH
    =================================================
    */

    const extension =
      file.name
        .split(".")
        .pop()
        .toLowerCase();


    const photoRef =
      ref(
        storage,
        `profilePhotos/${currentUser.uid}/profile.${extension}`
      );


    /*
    =================================================
    RESUMABLE UPLOAD
    =================================================

    This provides progress instead of appearing to
    hang while the browser uploads.
    */

    const uploadTask =
      uploadBytesResumable(
        photoRef,
        file,
        {
          contentType:
            file.type
        }
      );


    const snapshot =
      await new Promise(
        (
          resolve,
          reject
        ) => {

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


    /*
    =================================================
    GET DOWNLOAD URL
    =================================================
    */

    const photoURL =
      await getDownloadURL(
        snapshot.ref
      );


    /*
    =================================================
    UPDATE FIREBASE AUTH PROFILE
    =================================================
    */

    await updateProfile(
      currentUser,
      {
        photoURL
      }
    );


    /*
    =================================================
    UPDATE FIRESTORE
    =================================================
    */

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


    /*
    =================================================
    UPDATE LOCAL STATE
    =================================================
    */

    if (viewedUser) {

      viewedUser.photoURL =
        photoURL;

    }


    /*
    =================================================
    UPDATE OWN CACHE
    =================================================
    */

    if (viewedUser) {

      saveOwnProfileCache(
        viewedUser
      );

    }


    /*
    =================================================
    SUCCESS
    =================================================
    */

    if (status) {

      status.textContent =
        "Profile photo updated successfully.";

      status.className =
        "profile-upload-status success";

    }


    /*
    =================================================
    IMMEDIATELY UPDATE PHOTO IN UI
    =================================================
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
            getFullName(viewedUser)
          )}"
        >

      `;

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
          "Photo upload is not allowed by Firebase Storage rules.";

      }


      if (
        error?.code ===
        "storage/quota-exceeded"
      ) {

        message =
          "Firebase Storage quota is unavailable.";

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


/* =====================================================
   LOAD CACHED PROFILE
===================================================== */

function loadCachedProfile(uid) {

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


  /*
  Own profile may have stale online state.
  The active user is always considered online.
  */

  if (own) {

    cached.isOnline =
      true;

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
  showLoading = true
) {

  const container =
    $("profileContainer");


  if (!container || !uid) {
    return;
  }


  /*
  =====================================================
  CACHE FIRST
  =====================================================
  */

  const cached =
    loadCachedProfile(
      uid
    );


  /*
  =====================================================
  ONLY SHOW LOADING IF NO CACHE EXISTS
  =====================================================
  */

  if (
    !cached &&
    showLoading
  ) {

    container.innerHTML = `

      <div class="profile-loading">
        Loading profile...
      </div>

    `;

  }


  /*
  =====================================================
  FIRESTORE REFRESH
  =====================================================
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


    if (!snapshot.exists()) {

      if (!cached) {

        container.innerHTML = `

          <div class="profile-error">
            This profile could not be found.
          </div>

        `;

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

      /*
      Firebase Auth is the authoritative source for
      the authenticated user's email.
      */

      profile.email =
        profile.email ||
        currentUser?.email ||
        "";


      /*
      Never allow the user's own profile to appear
      offline while they are actively authenticated.
      */

      profile.isOnline =
        true;


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

    console.error(
      "Profile loading error:",
      error
    );


    /*
    If cache exists, keep the cached profile visible.
    */

    if (!cached) {

      container.innerHTML = `

        <div class="profile-error">
          Unable to load this profile.
          Please check your connection and try again.
        </div>

      `;

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


  /*
  Verification is only available on own profile.
  */

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


  /*
  Use phone stored in own profile.
  */

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
   POLL VERIFICATION STATUS
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


  /*
  =====================================================
  COMPLETED
  =====================================================
  */

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


  /*
  =====================================================
  FAILED
  =====================================================
  */

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


  /*
  =====================================================
  PENDING
  =====================================================
  */

  setVerificationMessage(
    "Waiting for M-PESA payment confirmation...",
    "pending"
  );


  return false;

}


/* =====================================================
   BACK BUTTON
===================================================== */

const backButton =
  $("backBtn");


if (backButton) {

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
   VERIFICATION CLOSE
===================================================== */

const verificationClose =
  $("verificationClose");


if (verificationClose) {

  verificationClose.addEventListener(
    "click",
    closeVerificationModal
  );

}


/* =====================================================
   CLOSE MODAL BY BACKDROP
===================================================== */

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


/* =====================================================
   VERIFICATION SUBMIT
===================================================== */

const verificationSubmit =
  $("verificationSubmit");


if (verificationSubmit) {

  verificationSubmit.addEventListener(
    "click",
    startVerification
  );

}


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(
  auth,

  async user => {

    currentUser =
      user;


    if (!user) {

      location.replace(
        "login.html"
      );

      return;

    }


    /*
    =================================================
    DETERMINE PROFILE
    =================================================
    */

    const requestedUid =
      getProfileUid();


    const profileUid =
      requestedUid ||
      user.uid;


    /*
    =================================================
    SHOW CACHE FIRST
    =================================================

    This happens BEFORE the Firestore request.

    If this profile was previously opened, the user
    immediately sees the cached profile.
    */

    loadCachedProfile(
      profileUid
    );


    /*
    =================================================
    OWN PROFILE
    =================================================

    Do not block rendering while marking the user
    online.
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
    =================================================
    START REALTIME LISTENER
    =================================================

    Firestore can provide cached listener data and
    then synchronize with the server when persistence
    is enabled.
    */

    listenToProfile(
      profileUid
    );


    /*
    =================================================
    FIRESTORE REFRESH
    =================================================

    This is intentionally NOT awaited before showing
    cached data.
    */

    loadProfile(
      profileUid,
      !loadCachedProfile(profileUid)
    )
    .catch(
      error => {

        console.error(
          "Profile startup error:",
          error
        );

      }
    );

  }
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

  }
);
