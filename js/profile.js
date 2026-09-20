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


/*
=====================================================
CURRENT USER FOLLOWING
=====================================================

IMPORTANT:

This comes from Firestore:

users/{currentUser.uid}

It does NOT come from the Firebase Auth user object.
*/

let currentUserFollowing = [];


/* =====================================================
   CACHE
===================================================== */

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

  /*
  Prefer displayName if it contains a real name.
  */

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


  /*
  Otherwise build the name from firstName + lastName.
  */

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


  /*
  Username is the next fallback.
  */

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

    /*
    ONLY public information is stored.
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


  /*
  Only fields that can safely be displayed publicly.
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

        isOnline:
          true,

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

  try {

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

    }

  } catch (error) {

    console.warn(
      "Following cache read failed:",
      error
    );

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


    /*
    Keep own cache synchronized.
    */

    const cached =
      getOwnProfileCache();


    if (cached) {

      cached.following =
        [
          ...currentUserFollowing
        ];


      cached.followingCount =
        Number(
          data.followingCount ??
          currentUserFollowing.length
        );


      cached.cachedAt =
        Date.now();


      localStorage.setItem(
        OWN_PROFILE_CACHE_KEY,
        JSON.stringify(
          cached
        )
      );

    }


    /*
    If viewing another profile,
    refresh Follow/Following button.
    */

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
      "Unable to load current user's following list:",
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
  Other users are rendered only from
  public profile fields.
  */

  const safeProfile =
    own
      ? profile
      : getPublicProfile(
          profile
        );


  if (!safeProfile) {
    return;
  }


  /*
  =====================================================
  FOLLOW STATE
  =====================================================
  */

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
        >
      `

      : initials(name);


  /*
  =====================================================
  VERIFIED BADGE
  =====================================================
  */

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


  /* =====================================================
     OWN PROFILE
  ===================================================== */

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


  /* =====================================================
     OTHER USER PROFILE
  ===================================================== */

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
     OWN PROFILE PHOTO UPLOAD
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
     CHAT BUTTON
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
     FOLLOW BUTTON
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
     VERIFY BUTTON
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


    /*
    =================================================
    FIRESTORE TRANSACTION
    =================================================

    User A:
      following
      followingCount

    User B:
      followers
      followersCount

    are updated together.

    Firestore retries the transaction if another
    client changes a document being read.
    */

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


          /*
          ============================================
          CURRENT USER FOLLOWING
          ============================================
          */

          const following =
            Array.isArray(
              currentData.following
            )
              ? [
                  ...currentData.following
                ]
              : [];


          /*
          ============================================
          TARGET USER FOLLOWERS
          ============================================
          */

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
          ============================================
          UNFOLLOW
          ============================================
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
          ============================================
          FOLLOW
          ============================================
          */

          const newFollowing =
            [
              ...following,
              targetUid
            ];


          const newFollowers =
            followers.includes(
              currentUser.uid
            )
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


          /*
          Only increase target's follower count
          if this UID was not already there.
          */

          const followerWasAlreadyPresent =
            followers.includes(
              currentUser.uid
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
    UPDATE LOCAL STATE
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
    UPDATE OWN PROFILE CACHE
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
    IMMEDIATE BUTTON UPDATE
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

  /*
  =====================================================
  ALLOWED IMAGE TYPES
  =====================================================
  */

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


  /*
  =====================================================
  MAX FILE SIZE — 5MB
  =====================================================
  */

  if (file.size > 5 * 1024 * 1024) {

    if (status) {

      status.textContent =
        "Photo must be smaller than 5MB.";

      status.className =
        "profile-upload-status error";
    }

    event.target.value = "";

    return;
  }


  /*
  =====================================================
  UPLOAD STATUS
  =====================================================
  */

  if (status) {

    status.textContent =
      "Preparing upload...";

    status.className =
      "profile-upload-status";
  }


  try {

    /*
    ===================================================
    STORAGE PATH

    MUST MATCH FIREBASE STORAGE RULES:

    users/{userId}/profile/{fileName}
    ===================================================
    */

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


    /*
    ===================================================
    UPLOAD
    ===================================================
    */

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


    /*
    ===================================================
    GET DOWNLOAD URL
    ===================================================
    */

    const photoURL =
      await getDownloadURL(
        snapshot.ref
      );


    /*
    ===================================================
    UPDATE FIREBASE AUTH PROFILE
    ===================================================
    */

    await updateProfile(
      currentUser,
      {
        photoURL
      }
    );


    /*
    ===================================================
    UPDATE FIRESTORE USER PROFILE
    ===================================================
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
    ===================================================
    UPDATE LOCAL STATE
    ===================================================
    */

    if (viewedUser) {

      viewedUser.photoURL =
        photoURL;

    }


    /*
    ===================================================
    UPDATE CACHE
    ===================================================
    */

    if (viewedUser) {

      saveOwnProfileCache(
        viewedUser
      );

    }


    /*
    ===================================================
    UPDATE PROFILE IMAGE IMMEDIATELY
    ===================================================
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
        >

      `;

    }


    /*
    ===================================================
    SUCCESS
    ===================================================
    */

    if (status) {

      status.textContent =
        "Profile photo updated successfully.";

      status.className =
        "profile-upload-status success";

    }


    /*
    ===================================================
    CACHE-BUST OTHER UI ELEMENTS

    The realtime Firestore listener will also
    update other CONNECTA pages that are open.
    ===================================================
    */

    console.log(
      "CONNECTA profile photo uploaded:",
      storagePath
    );


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


  /*
  =====================================================
  RESET FILE INPUT

  Allows the user to select the same image again.
  =====================================================
  */

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
  Own profile is always online while active.
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


  if (
    !container ||
    !uid
  ) {

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

      profile.email =
        profile.email ||
        currentUser?.email ||
        "";


      profile.isOnline =
        true;


      /*
      Keep following state synchronized.
      */

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

    console.error(
      "Profile loading error:",
      error
    );


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


          /*
          IMPORTANT:

          Keep current user's following list updated
          in realtime.
          */

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
    */

    const hasCachedProfile =
      loadCachedProfile(
        profileUid
      );


    /*
    =================================================
    OWN PROFILE PRESENCE
    =================================================
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
    LOAD CURRENT USER FOLLOWING
    =================================================

    This happens in the background and does not
    block the profile from appearing.
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
    =================================================
    REALTIME PROFILE LISTENER
    =================================================
    */

    listenToProfile(
      profileUid
    );


    /*
    =================================================
    FIRESTORE REFRESH
    =================================================

    Cached profile is already visible, so there
    is no reason to display another loading state.
    */

    loadProfile(
      profileUid,
      !hasCachedProfile
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
