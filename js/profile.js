import {
  auth,
  db,
  storage
} from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


const $ = (id) =>
  document.getElementById(id);

let currentUser = null;
let viewedUser = null;


/* =========================================================
   PROFILE CACHE
   ========================================================= */

const PROFILE_CACHE_KEY =
  "connectaProfileCache";


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
  uid,
  profile
) {

  if (!uid || !profile) {
    return;
  }

  try {

    const cache =
      getProfileCache();

    cache[uid] = {
      ...cache[uid],
      ...profile,
      cachedAt: Date.now()
    };

    localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify(cache)
    );

  } catch (error) {

    console.warn(
      "Profile cache save failed:",
      error
    );

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
   INITIALS
   ========================================================= */

function initials(name = "U") {

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join("")
    .toUpperCase() || "U";

}


/* =========================================================
   FULL NAME
   ========================================================= */

function getFullName(user = {}) {

  const displayName =
    String(
      user.displayName || ""
    ).trim();

  if (displayName) {
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

function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
    );

}


/* =========================================================
   GET PROFILE UID
   ========================================================= */

function getProfileUid() {

  const params =
    new URLSearchParams(
      location.search
    );

  return params.get("uid");

}


/* =========================================================
   SHOW PHOTO UPLOAD MESSAGE
   ========================================================= */

function showPhotoMessage(
  message,
  type = "info"
) {

  const existing =
    $("photoUploadMessage");

  if (!existing) {
    return;
  }

  existing.textContent =
    message;

  existing.className =
    `photo-upload-message ${type}`;

}


/* =========================================================
   PROFILE PHOTO MARKUP
   ========================================================= */

function profilePhotoMarkup(
  profile,
  isOwnProfile
) {

  const name =
    getFullName(profile);

  const photo =
    profile.photoURL ||
    profile.photoUrl ||
    "";


  const avatar =
    photo

      ? `
        <img
          src="${escapeHtml(photo)}"
          alt="${escapeHtml(name)}"
        >
      `

      : `
        <span class="profile-initials">
          ${escapeHtml(
            initials(name)
          )}
        </span>
      `;


  /*
  Only the logged-in user's
  photo can be changed.
  */

  if (isOwnProfile) {

    return `
      <button
        type="button"
        id="changePhotoBtn"
        class="profile-avatar profile-avatar-edit"
        aria-label="Change profile photo"
      >

        ${avatar}

        <span
          class="profile-photo-camera"
          aria-hidden="true"
        >
          📷
        </span>

      </button>

      <input
        type="file"
        id="profilePhotoInput"
        accept="image/*"
        hidden
      >

      <div
        id="photoUploadMessage"
        class="photo-upload-message"
      ></div>
    `;

  }


  return `
    <div class="profile-avatar">
      ${avatar}
    </div>
  `;

}


/* =========================================================
   RENDER PROFILE
   ========================================================= */

function renderProfile(profile) {

  viewedUser =
    profile;

  const container =
    $("profileContainer");


  if (!container) {
    return;
  }


  const name =
    getFullName(profile);


  const username =
    profile.username
      ? `@${String(
          profile.username
        ).replace(/^@/, "")}`
      : "";


  const isOnline =
    profile.isOnline === true;


  const isVerified =
    profile.isVerified === true;


  const followers =
    Number(
      profile.followersCount || 0
    );


  const following =
    Number(
      profile.followingCount || 0
    );


  const isOwnProfile =
    currentUser &&
    currentUser.uid ===
      profile.uid;


  const statusClass =
    isOnline
      ? "online"
      : "offline";


  const statusText =
    isOnline
      ? "Online"
      : "Offline";


  const verifiedBadge =
    isVerified

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
  =========================================================
  PROFILE HTML
  =========================================================
  */

  container.innerHTML = `

    <article class="profile-card">

      <div class="profile-cover"></div>


      <!-- ==========================================
           PROFILE PHOTO
           ========================================== -->

      <div class="profile-avatar-wrap">

        ${profilePhotoMarkup(
          profile,
          isOwnProfile
        )}

      </div>


      <!-- ==========================================
           PROFILE INFORMATION
           ========================================== -->

      <div class="profile-info">

        <h1 class="profile-name">

          ${escapeHtml(name)}

          ${verifiedBadge}

        </h1>


        ${
          username

            ? `
              <div class="profile-username">
                ${escapeHtml(username)}
              </div>
            `

            : ""
        }


        <div
          class="profile-status ${statusClass}"
        >

          <span
            class="profile-status-dot ${statusClass}"
          ></span>

          ${statusText}

        </div>


        ${
          profile.bio

            ? `
              <p class="profile-bio">
                ${escapeHtml(
                  profile.bio
                )}
              </p>
            `

            : ""
        }


        <!-- ======================================
             FOLLOWERS / FOLLOWING
             ====================================== -->

        <div class="profile-stats">

          <div class="profile-stat">

            <strong>
              ${followers}
            </strong>

            <span>
              Followers
            </span>

          </div>


          <div class="profile-stat">

            <strong>
              ${following}
            </strong>

            <span>
              Following
            </span>

          </div>

        </div>


        <!-- ======================================
             ACTION
             ====================================== -->

        <div class="profile-actions">

          ${
            isOwnProfile

              ? `
                <button
                  id="editProfileBtn"
                  class="profile-edit-btn"
                  type="button"
                >
                  Edit Profile
                </button>
              `

              : `
                <button
                  id="chatBtn"
                  class="profile-chat-btn"
                  type="button"
                >
                  Chat
                </button>
              `
          }

        </div>


      </div>

    </article>


    <!-- ==========================================
         STORIES
         ========================================== -->

    <section class="profile-section">

      <div class="profile-section-title">
        Stories
      </div>


      <div class="profile-empty">

        No stories yet.

      </div>

    </section>

  `;


  /* ========================================================
     CHAT BUTTON
     ======================================================== */

  const chatBtn =
    $("chatBtn");


  if (chatBtn) {

    chatBtn.addEventListener(
      "click",
      () => {

        location.href =
          `chat.html?uid=${encodeURIComponent(
            profile.uid
          )}`;

      }
    );

  }


  /* ========================================================
     EDIT PROFILE
     ======================================================== */

  const editBtn =
    $("editProfileBtn");


  if (editBtn) {

    editBtn.addEventListener(
      "click",
      () => {

        /*
        We will connect the full
        profile editor later.
        */

        alert(
          "Profile editing will be connected next."
        );

      }
    );

  }


  /* ========================================================
     PROFILE PHOTO BUTTON
     ======================================================== */

  const changePhotoBtn =
    $("changePhotoBtn");

  const photoInput =
    $("profilePhotoInput");


  if (
    changePhotoBtn &&
    photoInput
  ) {

    changePhotoBtn.addEventListener(
      "click",
      () => {

        photoInput.click();

      }
    );


    photoInput.addEventListener(
      "change",
      async event => {

        const file =
          event.target.files?.[0];


        if (!file) {
          return;
        }


        await uploadProfilePhoto(
          file,
          profile.uid
        );

      }
    );

  }

}


/* =========================================================
   UPLOAD PROFILE PHOTO
   ========================================================= */

async function uploadProfilePhoto(
  file,
  uid
) {

  if (
    !currentUser ||
    currentUser.uid !== uid
  ) {

    showPhotoMessage(
      "You can only change your own profile photo.",
      "error"
    );

    return;
  }


  /*
  Only images
  */

  if (
    !file.type.startsWith(
      "image/"
    )
  ) {

    showPhotoMessage(
      "Please select an image file.",
      "error"
    );

    return;
  }


  /*
  Prevent extremely large uploads.
  5 MB maximum for now.
  */

  const maxSize =
    5 * 1024 * 1024;


  if (
    file.size > maxSize
  ) {

    showPhotoMessage(
      "Photo must be 5 MB or smaller.",
      "error"
    );

    return;
  }


  const changePhotoBtn =
    $("changePhotoBtn");


  if (changePhotoBtn) {

    changePhotoBtn.disabled =
      true;

    changePhotoBtn.classList.add(
      "uploading"
    );

  }


  showPhotoMessage(
    "Uploading photo...",
    "info"
  );


  try {

    /*
    Unique file name
    */

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase() ||
      "jpg";


    const fileName =
      `profile_${Date.now()}.${extension}`;


    /*
    Firebase Storage path:

    profilePhotos/{uid}/profile_xxx.jpg
    */

    const storageRef =
      ref(
        storage,
        `profilePhotos/${uid}/${fileName}`
      );


    /*
    Upload
    */

    await uploadBytes(
      storageRef,
      file,
      {
        contentType:
          file.type
      }
    );


    /*
    Get public download URL
    */

    const photoURL =
      await getDownloadURL(
        storageRef
      );


    /*
    IMPORTANT:
    Save URL in Firestore.

    We use updateDoc through
    the user's existing document.
    */

    const profileRef =
      doc(
        db,
        "users",
        uid
      );


    /*
    We need updateDoc here.
    Dynamically import it to keep
    the existing import section clean.
    */

    const {
      updateDoc
    } = await import(
      "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js"
    );


    await updateDoc(
      profileRef,
      {
        photoURL
      }
    );


    /*
    Update local profile
    */

    viewedUser = {
      ...viewedUser,
      photoURL
    };


    /*
    Update cache
    */

    saveProfileToCache(
      uid,
      viewedUser
    );


    /*
    Re-render immediately
    */

    renderProfile(
      viewedUser
    );


    showPhotoMessage(
      "Profile photo updated successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Profile photo upload error:",
      error
    );


    showPhotoMessage(
      "Could not upload your photo. Please try again.",
      "error"
    );


  } finally {

    /*
    The button is recreated by
    renderProfile() after success,
    so only restore it if it still exists.
    */

    const button =
      $("changePhotoBtn");


    if (button) {

      button.disabled =
        false;

      button.classList.remove(
        "uploading"
      );

    }

  }

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

async function loadProfile(
  uid
) {

  const container =
    $("profileContainer");


  if (!container) {
    return;
  }


  /*
  =========================================================
  STEP 1 — SHOW CACHED PROFILE IMMEDIATELY
  =========================================================
  */

  const cached =
    getCachedProfile(uid);


  if (cached) {

    renderProfile(
      cached
    );

  } else {

    /*
    Only show loading when
    there is no cached profile.
    */

    container.innerHTML = `
      <div class="profile-loading">
        Loading profile...
      </div>
    `;

  }


  /*
  =========================================================
  STEP 2 — GET LATEST FIRESTORE PROFILE
  =========================================================
  */

  try {

    const profileRef =
      doc(
        db,
        "users",
        uid
      );


    const snap =
      await getDoc(
        profileRef
      );


    if (!snap.exists()) {

      /*
      Only replace the UI with
      error if we didn't already
      have cached information.
      */

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
      ...snap.data()
    };


    /*
    Save latest profile locally.
    */

    saveProfileToCache(
      uid,
      profile
    );


    /*
    Render latest information.
    */

    renderProfile(
      profile
    );


  } catch (error) {

    console.error(
      "Profile loading error:",
      error
    );


    /*
    If cache exists, keep displaying it.
    */

    if (!cached) {

      container.innerHTML = `
        <div class="profile-error">
          Could not load this profile.
          Please try again.
        </div>
      `;

    }

  }

}


/* =========================================================
   BACK BUTTON
   ========================================================= */

const backBtn =
  $("backBtn");


if (backBtn) {

  backBtn.addEventListener(
    "click",
    () => {

      if (
        history.length > 1
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
   AUTH STATE
   ========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      location.replace(
        "login.html"
      );

      return;
    }


    currentUser =
      user;


    /*
    Determine profile to view.
    */

    const requestedUid =
      getProfileUid();


    const profileUid =
      requestedUid ||
      user.uid;


    /*
    Load profile.
    Cached version appears
    immediately when available.
    */

    await loadProfile(
      profileUid
    );

  }
);
