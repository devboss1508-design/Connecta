import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


const $ = (id) => document.getElementById(id);

let currentUser = null;
let viewedUser = null;


/* ========================================
   INITIALS
======================================== */

function initials(name = "U") {

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join("")
    .toUpperCase() || "U";

}


/* ========================================
   FULL NAME
======================================== */

function getFullName(user = {}) {

  const displayName =
    String(user.displayName || "").trim();

  if (displayName) {
    return displayName;
  }


  const firstName =
    String(user.firstName || "").trim();

  const lastName =
    String(user.lastName || "").trim();

  const fullName =
    `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }


  const username =
    String(user.username || "").trim();

  if (username) {
    return username.replace(/^@/, "");
  }


  return "CONNECTA User";

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));

}


/* ========================================
   GET USER UID FROM URL
======================================== */

function getProfileUid() {

  const params =
    new URLSearchParams(location.search);

  return params.get("uid");

}


/* ========================================
   RENDER PROFILE
======================================== */

function renderProfile(profile) {

  viewedUser = profile;

  const container =
    $("profileContainer");


  const name =
    getFullName(profile);


  const username =
    profile.username
      ? `@${String(profile.username).replace(/^@/, "")}`
      : "";


  const isOnline =
    profile.isOnline === true;


  const isVerified =
    profile.isVerified === true;


  const followers =
    Number(profile.followersCount || 0);


  const following =
    Number(profile.followingCount || 0);


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
      : initials(name);


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


  const statusClass =
    isOnline
      ? "online"
      : "offline";


  const statusText =
    isOnline
      ? "Online"
      : "Offline";


  const isOwnProfile =
    currentUser &&
    currentUser.uid === profile.uid;


  container.innerHTML = `

    <!-- ==================================
         PROFILE CARD
    ================================== -->

    <article class="profile-card">

      <div class="profile-cover"></div>


      <!-- AVATAR -->

      <div class="profile-avatar-wrap">

        <div class="profile-avatar">

          ${avatar}

        </div>

      </div>


      <!-- PROFILE INFORMATION -->

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
                ${escapeHtml(profile.bio)}
              </p>
            `
            : ""
        }


        <!-- ==============================
             STATS
        ============================== -->

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


        <!-- ==============================
             ACTION
        ============================== -->

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


    <!-- ==================================
         STORIES
    ================================== -->

    <section class="profile-section">

      <div class="profile-section-title">
        Stories
      </div>

      <div class="profile-empty">
        No stories yet.
      </div>

    </section>

  `;


  /* ======================================
     CHAT BUTTON
  ====================================== */

  const chatBtn =
    $("chatBtn");


  if (chatBtn) {

    chatBtn.addEventListener("click", () => {

      location.href =
        `chat.html?uid=${encodeURIComponent(profile.uid)}`;

    });

  }


  /* ======================================
     EDIT PROFILE
  ====================================== */

  const editBtn =
    $("editProfileBtn");


  if (editBtn) {

    editBtn.addEventListener("click", () => {

      alert("Profile editing will be connected next.");

    });

  }

}


/* ========================================
   LOAD PROFILE
======================================== */

async function loadProfile(uid) {

  const container =
    $("profileContainer");


  try {

    const profileRef =
      doc(db, "users", uid);


    const snap =
      await getDoc(profileRef);


    if (!snap.exists()) {

      container.innerHTML = `
        <div class="profile-error">
          This profile could not be found.
        </div>
      `;

      return;

    }


    const profile = {
      uid,
      ...snap.data()
    };


    renderProfile(profile);


  } catch (error) {

    console.error(
      "Profile loading error:",
      error
    );


    container.innerHTML = `
      <div class="profile-error">
        Could not load this profile.
        Please try again.
      </div>
    `;

  }

}


/* ========================================
   BACK BUTTON
======================================== */

$("backBtn").addEventListener(
  "click",
  () => {

    if (history.length > 1) {

      history.back();

    } else {

      location.href =
        "dashboard.html";

    }

  }
);


/* ========================================
   AUTH STATE
======================================== */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      location.replace(
        "login.html"
      );

      return;

    }


    currentUser = user;


    /*
    ========================================
    DETERMINE PROFILE TO VIEW
    ========================================
    */

    const requestedUid =
      getProfileUid();


    /*
    If no uid is supplied,
    show the logged-in user's profile.
    */

    const profileUid =
      requestedUid ||
      user.uid;


    await loadProfile(profileUid);

  }
);
