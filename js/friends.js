/* =========================================================
   CONNECTA — GLOBAL MEET
   friends.js
========================================================= */

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const BACKEND_URL =
  "https://connecta-backend-com.onrender.com";


/*
 * These endpoints will be implemented in the
 * CONNECTA backend.
 */

const PAYMENT_INITIATE_URL =
  `${BACKEND_URL}/api/global-meet/payment/initiate`;

const PAYMENT_STATUS_URL =
  `${BACKEND_URL}/api/global-meet/payment/status`;


/*
 * Global Meet connection fee.
 */

const GLOBAL_MEET_FEE = 20;


/*
 * Public discovery collection.
 *
 * IMPORTANT:
 * Do not use the private users collection for
 * discovering other people's profiles.
 */

const PUBLIC_PROFILES_COLLECTION =
  "publicProfiles";


/*
 * Local cache.
 */

const PUBLIC_PROFILES_CACHE_KEY =
  "connectaGlobalMeetProfiles_v1";


const PUBLIC_PROFILES_CACHE_TIME_KEY =
  "connectaGlobalMeetProfilesCacheTime_v1";


const CURRENT_USER_CACHE_KEY =
  "connectaCurrentUserProfile_v1";


/*
 * Cache lifetime.
 *
 * Cached profiles are displayed immediately.
 * Firebase then refreshes them in realtime.
 */

const PROFILE_CACHE_MAX_AGE =
  1000 * 60 * 30;


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentProfile = null;

let allUsers = [];

let followerUsers = [];

let activeTab = "discover";

let searchTerm = "";

let selectedGender = "everyone";

let selectedCountry = "all";

let selectedInterest = "all";

let selectedChatUser = null;

let unsubscribeUsers = null;

let unsubscribeProfile = null;

let paymentPollingTimer = null;

let paymentInProgress = false;

let toastTimer = null;


/* =========================================================
   DOM
========================================================= */

const friendSearch =
  document.getElementById(
    "friendSearch"
  );


const discoverList =
  document.getElementById(
    "discoverList"
  );


const discoverCount =
  document.getElementById(
    "discoverCount"
  );


const followingList =
  document.getElementById(
    "followingList"
  );


const followersList =
  document.getElementById(
    "followersList"
  );


const followingListCount =
  document.getElementById(
    "followingListCount"
  );


const followersListCount =
  document.getElementById(
    "followersListCount"
  );


const followingCount =
  document.getElementById(
    "followingCount"
  );


const followersCount =
  document.getElementById(
    "followersCount"
  );


const toast =
  document.getElementById(
    "friendsToast"
  );


const menuBtn =
  document.getElementById(
    "menuBtn"
  );


const sideMenu =
  document.getElementById(
    "sideMenu"
  );


const menuOverlay =
  document.getElementById(
    "menuOverlay"
  );


const logoutBtn =
  document.getElementById(
    "logoutBtn"
  );


const profileBtn =
  document.getElementById(
    "profileBtn"
  );


const connectionBtn =
  document.getElementById(
    "connectionBtn"
  );


const balanceAmount =
  document.getElementById(
    "balanceAmount"
  );


const menuAvatar =
  document.getElementById(
    "menuAvatar"
  );


const menuName =
  document.getElementById(
    "menuName"
  );


const menuUsername =
  document.getElementById(
    "menuUsername"
  );


const genderButtons =
  document.querySelectorAll(
    ".gender-btn"
  );


const countryFilter =
  document.getElementById(
    "countryFilter"
  );


const interestButtons =
  document.querySelectorAll(
    ".interest-btn"
  );


const paymentOverlay =
  document.getElementById(
    "chatPaymentOverlay"
  );


const paymentForm =
  document.getElementById(
    "paymentForm"
  );


const paymentSuccess =
  document.getElementById(
    "paymentSuccess"
  );


const paymentAvatar =
  document.getElementById(
    "chatPaymentAvatar"
  );


const paymentUserName =
  document.getElementById(
    "chatPaymentUserName"
  );


const paymentCountry =
  document.getElementById(
    "chatPaymentCountry"
  );


const paymentAmount =
  document.getElementById(
    "chatPaymentAmount"
  );


const paymentCancel =
  document.getElementById(
    "chatPaymentCancel"
  );


const paymentSubmit =
  document.getElementById(
    "chatPaymentSubmit"
  );


const contactSupportBtn =
  document.getElementById(
    "contactSupportBtn"
  );


const skeleton =
  document.getElementById(
    "globalMeetSkeleton"
  );


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value = "") {

  return String(value)

    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");

}


/* =========================================================
   FULL NAME
========================================================= */

function getFullName(user = {}) {

  const first =
    String(
      user.firstName || ""
    ).trim();


  const last =
    String(
      user.lastName || ""
    ).trim();


  const combined =
    `${first} ${last}`.trim();


  if (combined) {

    return combined;

  }


  if (user.displayName) {

    return String(
      user.displayName
    ).trim();

  }


  if (user.username) {

    return `@${user.username}`;

  }


  return "CONNECTA User";

}


/* =========================================================
   INITIALS
========================================================= */

function getInitials(user = {}) {

  const name =
    getFullName(user);


  const parts =
    name
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
   TOAST
========================================================= */

function showToast(message) {

  if (!toast) {

    return;

  }


  clearTimeout(
    toastTimer
  );


  toast.textContent =
    message;


  toast.classList.add(
    "show"
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3000
    );

}


/* =========================================================
   MENU
========================================================= */

function openMenu() {

  if (!sideMenu) {

    return;

  }


  sideMenu.classList.add(
    "open"
  );


  if (menuOverlay) {

    menuOverlay.classList.add(
      "show"
    );

  }


  sideMenu.setAttribute(
    "aria-hidden",
    "false"
  );

}


function closeMenu() {

  if (!sideMenu) {

    return;

  }


  sideMenu.classList.remove(
    "open"
  );


  if (menuOverlay) {

    menuOverlay.classList.remove(
      "show"
    );

  }


  sideMenu.setAttribute(
    "aria-hidden",
    "true"
  );

}


if (menuBtn) {

  menuBtn.addEventListener(
    "click",
    openMenu
  );

}


if (menuOverlay) {

  menuOverlay.addEventListener(
    "click",
    closeMenu
  );

}


/* =========================================================
   PROFILE HEADER
========================================================= */

function renderHeaderProfile() {

  if (!currentProfile) {

    return;

  }


  const name =
    getFullName(
      currentProfile
    );


  if (menuName) {

    menuName.textContent =
      name;

  }


  if (menuUsername) {

    menuUsername.textContent =
      currentProfile.username
        ? `@${currentProfile.username}`
        : "@username";

  }


  if (profileBtn) {

    profileBtn.textContent =
      getInitials(
        currentProfile
      );

  }


  if (menuAvatar) {

    if (
      currentProfile.photoURL
    ) {

      menuAvatar.innerHTML = `
        <img
          src="${escapeHtml(
            currentProfile.photoURL
          )}"
          alt=""
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:50%;
          "
        >
      `;

    } else {

      menuAvatar.textContent =
        getInitials(
          currentProfile
        );

    }

  }


  if (balanceAmount) {

    const balance =
      Number(
        currentProfile.balance || 0
      );


    balanceAmount.textContent =
      balance.toFixed(2);

  }


  if (followingCount) {

    followingCount.textContent =
      Number(
        currentProfile.followingCount || 0
      );

  }


  if (followersCount) {

    followersCount.textContent =
      Number(
        currentProfile.followersCount || 0
      );

  }

}


/* =========================================================
   FOLLOWING
========================================================= */

function isFollowing(userId) {

  if (!currentProfile) {

    return false;

  }


  const following =
    Array.isArray(
      currentProfile.following
    )
      ? currentProfile.following
      : [];


  return following.includes(
    userId
  );

}


/* =========================================================
   COUNTRY NORMALIZER
========================================================= */

function normalizeCountry(
  value = ""
) {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

}


/* =========================================================
   COUNTRY LABEL
========================================================= */

function getCountryLabel(
  value = ""
) {

  const normalized =
    normalizeCountry(
      value
    );


  const countries = {

    kenya:
      "🇰🇪 Kenya",

    uganda:
      "🇺🇬 Uganda",

    tanzania:
      "🇹🇿 Tanzania",

    nigeria:
      "🇳🇬 Nigeria",

    ghana:
      "🇬🇭 Ghana",

    "south-africa":
      "🇿🇦 South Africa",

    "united-states":
      "🇺🇸 United States",

    "united-kingdom":
      "🇬🇧 United Kingdom",

    canada:
      "🇨🇦 Canada",

    australia:
      "🇦🇺 Australia",

    germany:
      "🇩🇪 Germany",

    france:
      "🇫🇷 France"

  };


  return countries[
    normalized
  ] || (
    value
      ? String(value)
      : "🌍 Global"
  );

}


/* =========================================================
   GENDER LABEL
========================================================= */

function getGenderLabel(
  value = ""
) {

  const gender =
    String(value || "")
      .trim()
      .toLowerCase();


  if (gender === "male") {

    return "👨 Male";

  }


  if (gender === "female") {

    return "👩 Female";

  }


  return "";

}


/* =========================================================
   INTEREST NORMALIZER
========================================================= */

function normalizeInterest(
  value = ""
) {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

}


/* =========================================================
   INTEREST LABEL
========================================================= */

function getInterestLabel(
  value = ""
) {

  const interest =
    normalizeInterest(
      value
    );


  const labels = {

    relationship:
      "❤️ Relationship",

    friendship:
      "💬 Friendship",

    swahili:
      "🗣️ Swahili",

    "african-languages":
      "🌍 African Languages",

    culture:
      "🤝 Culture",

    dating:
      "💕 Dating",

    language:
      "🗣️ Language",

    travel:
      "✈️ Travel",

    business:
      "💼 Business"

  };


  return labels[
    interest
  ] || String(value);

}


/* =========================================================
   GET INTERESTS
========================================================= */

function getUserInterests(
  user = {}
) {

  let interests = [];


  if (
    Array.isArray(
      user.interests
    )
  ) {

    interests =
      user.interests;

  } else if (
    typeof user.interests ===
    "string"
  ) {

    interests =
      user.interests
        .split(",")
        .map(
          item =>
            item.trim()
        )
        .filter(Boolean);

  }


  /*
   * Support older/public profile
   * fields if present.
   */

  if (
    user.globalChatInterest &&
    !interests.length
  ) {

    interests = [
      user.globalChatInterest
    ];

  }


  return interests;

}


/* =========================================================
   INTEREST MATCH
========================================================= */

function matchesInterest(
  user
) {

  if (
    selectedInterest ===
    "all"
  ) {

    return true;

  }


  const interests =
    getUserInterests(
      user
    );


  return interests.some(
    interest =>
      normalizeInterest(
        interest
      ) ===
      selectedInterest
  );

}


/* =========================================================
   GENDER MATCH
========================================================= */

function matchesGender(
  user
) {

  if (
    selectedGender ===
    "everyone"
  ) {

    return true;

  }


  return String(
    user.gender || ""
  )
    .trim()
    .toLowerCase() ===
    selectedGender;

}


/* =========================================================
   COUNTRY MATCH
========================================================= */

function matchesCountry(
  user
) {

  if (
    selectedCountry ===
    "all"
  ) {

    return true;

  }


  return normalizeCountry(
    user.country
  ) ===
  selectedCountry;

}


/* =========================================================
   SEARCH MATCH
========================================================= */

function matchesSearch(
  user
) {

  if (!searchTerm) {

    return true;

  }


  const name =
    getFullName(
      user
    ).toLowerCase();


  const username =
    String(
      user.username || ""
    ).toLowerCase();


  const country =
    String(
      user.country || ""
    ).toLowerCase();


  const bio =
    String(
      user.bio ||
      user.globalChatBio ||
      ""
    ).toLowerCase();


  const interests =
    getUserInterests(
      user
    )
      .join(" ")
      .toLowerCase();


  return (
    name.includes(
      searchTerm
    ) ||
    username.includes(
      searchTerm
    ) ||
    country.includes(
      searchTerm
    ) ||
    bio.includes(
      searchTerm
    ) ||
    interests.includes(
      searchTerm
    )
  );

}


/* =========================================================
   PROFILE ELIGIBILITY
========================================================= */

function isGlobalMeetProfile(
  user
) {

  if (!user) {

    return false;

  }


  if (
    !user.uid
  ) {

    return false;

  }


  if (
    user.uid ===
    currentUser?.uid
  ) {

    return false;

  }


  /*
   * The profile must explicitly opt in.
   */

  if (
    user.globalChatEnabled !==
    true
  ) {

    return false;

  }


  /*
   * Support both old and new status names.
   */

  if (
    user.globalChatStatus &&
    ![
      "available",
      "online",
      "active"
    ].includes(
      String(
        user.globalChatStatus
      ).toLowerCase()
    )
  ) {

    return false;

  }


  if (
    user.availability &&
    ![
      "available",
      "online",
      "active"
    ].includes(
      String(
        user.availability
      ).toLowerCase()
    )
  ) {

    return false;

  }


  /*
   * Banned/deactivated public profiles
   * should never appear.
   */

  if (
    user.status &&
    [
      "banned",
      "suspended",
      "disabled",
      "inactive"
    ].includes(
      String(
        user.status
      ).toLowerCase()
    )
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   SORT PROFILES
========================================================= */

function sortProfiles(
  users
) {

  return [...users].sort(
    (a, b) => {

      /*
       * Available/online first.
       */

      if (
        a.isOnline === true &&
        b.isOnline !== true
      ) {

        return -1;

      }


      if (
        a.isOnline !== true &&
        b.isOnline === true
      ) {

        return 1;

      }


      /*
       * Verified profiles first.
       */

      if (
        a.isVerified === true &&
        b.isVerified !== true
      ) {

        return -1;

      }


      if (
        a.isVerified !== true &&
        b.isVerified === true
      ) {

        return 1;

      }


      /*
       * Then alphabetical.
       */

      return getFullName(a)
        .toLowerCase()
        .localeCompare(
          getFullName(b)
            .toLowerCase()
        );

    }
  );

}


/* =========================================================
   FILTER PROFILES
========================================================= */

function getFilteredProfiles() {

  return sortProfiles(

    allUsers.filter(
      user => {

        return (
          isGlobalMeetProfile(
            user
          ) &&

          matchesGender(
            user
          ) &&

          matchesCountry(
            user
          ) &&

          matchesInterest(
            user
          ) &&

          matchesSearch(
            user
          )
        );

      }
    )

  );

}


/* =========================================================
   RENDER VERIFIED BADGE
========================================================= */

function renderVerifiedBadge(
  user
) {

  if (
    user.isVerified !==
    true
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
   RENDER PROFILE PHOTO
========================================================= */

function renderProfilePhoto(
  user
) {

  if (
    user.photoURL
  ) {

    return `
      <img
        class="profile-photo"
        src="${escapeHtml(
          user.photoURL
        )}"
        alt=""
        loading="lazy"
      >
    `;

  }


  return `
    <div class="profile-photo-placeholder">
      ${escapeHtml(
        getInitials(user)
      )}
    </div>
  `;

}


/* =========================================================
   RENDER INTEREST CHIPS
========================================================= */

function renderInterestChips(
  user
) {

  const interests =
    getUserInterests(
      user
    )
      .slice(
        0,
        4
      );


  if (!interests.length) {

    return "";

  }


  return interests
    .map(
      interest => `
        <span class="profile-interest">
          ${escapeHtml(
            getInterestLabel(
              interest
            )
          )}
        </span>
      `
    )
    .join("");

}


/* =========================================================
   RENDER PROFILE CARD
========================================================= */

function renderGlobalProfileCard(
  user
) {

  const userId =
    user.uid;


  const name =
    getFullName(
      user
    );


  const username =
    user.username
      ? `@${user.username}`
      : "";


  const country =
    getCountryLabel(
      user.country
    );


  const gender =
    getGenderLabel(
      user.gender
    );


  const following =
    isFollowing(
      userId
    );


  const online =
    user.isOnline ===
    true;


  const bio =
    String(
      user.bio ||
      user.globalChatBio ||
      "Looking forward to meeting new people on CONNECTA."
    ).trim();


  const languages =
    Array.isArray(
      user.languages
    )
      ? user.languages
      : [];


  const languageText =
    languages
      .slice(0, 4)
      .map(
        item =>
          String(item)
      )
      .join(
        " • "
      );


  return `
    <article
      class="global-profile-card"
      data-user-id="${escapeHtml(
        userId
      )}"
    >

      <div class="profile-photo-area">

        ${renderProfilePhoto(user)}

        <div class="photo-gradient"></div>


        <div class="availability-badge">

          <span
            class="
              online-indicator
              ${
                online
                  ? ""
                  : "offline-indicator"
              }
            "
          ></span>

          ${
            online
              ? "Available now"
              : "Available"
          }

        </div>


        <div class="photo-country">

          ${escapeHtml(
            country
          )}

        </div>


        ${
          user.isVerified === true
            ? `
              <div class="photo-verified">
                ✓
              </div>
            `
            : ""
        }

      </div>


      <div class="profile-content">

        <div class="profile-name-row">

          <h3 class="profile-name">

            ${escapeHtml(
              name
            )}

          </h3>

          ${renderVerifiedBadge(
            user
          )}

        </div>


        <div class="profile-username">

          ${escapeHtml(
            username
          )}

          ${
            gender
              ? `
                ·
                ${escapeHtml(
                  gender
                )}
              `
              : ""
          }

        </div>


        <div class="profile-bio">

          ${escapeHtml(
            bio
          )}

        </div>


        <div class="profile-interests">

          ${renderInterestChips(
            user
          )}

        </div>


        ${
          languageText
            ? `
              <div class="profile-languages">
                🗣️
                <span>
                  ${escapeHtml(
                    languageText
                  )}
                </span>
              </div>
            `
            : ""
        }


        <div class="profile-actions">

          <button
            type="button"
            class="
              profile-action
              follow-btn
              ${
                following
                  ? "following"
                  : ""
              }
            "
            data-follow-id="${escapeHtml(
              userId
            )}"
          >

            ${
              following
                ? "Following"
                : "Follow"
            }

          </button>


          <button
            type="button"
            class="
              profile-action
              chat-btn
            "
            data-chat-id="${escapeHtml(
              userId
            )}"
          >

            💬 Connect

          </button>

        </div>


        <div class="chat-price">

          Connection request ·
          KSh ${GLOBAL_MEET_FEE}

        </div>

      </div>

    </article>
  `;

}


/* =========================================================
   EMPTY STATE
========================================================= */

function renderEmptyState() {

  if (!discoverList) {

    return;

  }


  discoverList.innerHTML = `

    <div class="empty-state">

      <div class="empty-icon">
        🌍
      </div>


      <div class="empty-title">
        No profiles found
      </div>


      <div class="empty-text">

        No available Global Meet profiles match
        your current filters. Try choosing another
        country, interest or gender.

      </div>

    </div>

  `;


  discoverList.style.display =
    "grid";

}


/* =========================================================
   HIDE SKELETON
========================================================= */

function hideSkeleton() {

  if (skeleton) {

    skeleton.style.display =
      "none";

  }


  if (discoverList) {

    discoverList.style.display =
      "grid";

  }

}


/* =========================================================
   RENDER DISCOVER
========================================================= */

function renderDiscover() {

  hideSkeleton();


  const profiles =
    getFilteredProfiles();


  if (discoverCount) {

    discoverCount.textContent =
      profiles.length;

  }


  if (!discoverList) {

    return;

  }


  if (!profiles.length) {

    renderEmptyState();

    return;

  }


  discoverList.innerHTML =
    profiles
      .map(
        renderGlobalProfileCard
      )
      .join("");


  discoverList.style.display =
    "grid";

}


/* =========================================================
   RENDER FOLLOWING
========================================================= */

function renderFollowing() {

  if (!followingList) {

    return;

  }


  const followingIds =
    Array.isArray(
      currentProfile?.following
    )
      ? currentProfile.following
      : [];


  const users =
    sortProfiles(
      allUsers.filter(
        user =>
          followingIds.includes(
            user.uid
          ) &&
          matchesSearch(user)
      )
    );


  if (followingListCount) {

    followingListCount.textContent =
      users.length;

  }


  if (!users.length) {

    followingList.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          👤
        </div>

        <div class="empty-title">
          No following yet
        </div>

        <div class="empty-text">
          Profiles you follow will appear here.
        </div>

      </div>

    `;

    return;

  }


  followingList.innerHTML =
    users
      .map(
        renderCommunityProfileCard
      )
      .join("");

}


/* =========================================================
   RENDER FOLLOWERS
========================================================= */

function renderFollowers() {

  if (!followersList) {

    return;

  }


  const users =
    sortProfiles(
      followerUsers.filter(
        user =>
          matchesSearch(user)
      )
    );


  if (followersListCount) {

    followersListCount.textContent =
      users.length;

  }


  if (!users.length) {

    followersList.innerHTML = `

      <div class="empty-state">

        <div class="empty-icon">
          👥
        </div>

        <div class="empty-title">
          No followers yet
        </div>

        <div class="empty-text">
          People who follow you will appear here.
        </div>

      </div>

    `;

    return;

  }


  followersList.innerHTML =
    users
      .map(
        renderCommunityProfileCard
      )
      .join("");

}


/* =========================================================
   COMMUNITY CARD
========================================================= */

function renderCommunityProfileCard(
  user
) {

  const name =
    getFullName(
      user
    );


  const following =
    isFollowing(
      user.uid
    );


  return `

    <article
      class="global-profile-card"
      style="padding:12px;"
    >

      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
        "
      >

        <div
          style="
            width:50px;
            height:50px;
            border-radius:50%;
            overflow:hidden;
            display:grid;
            place-items:center;
            background:#DCFCE7;
            color:#15803D;
            font-weight:900;
            flex:0 0 50px;
          "
        >

          ${
            user.photoURL
              ? `
                <img
                  src="${escapeHtml(
                    user.photoURL
                  )}"
                  alt=""
                  style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                  "
                >
              `
              : escapeHtml(
                  getInitials(user)
                )
          }

        </div>


        <div
          style="
            min-width:0;
            flex:1;
          "
        >

          <div
            style="
              font-size:13px;
              font-weight:900;
            "
          >

            ${escapeHtml(
              name
            )}

            ${renderVerifiedBadge(
              user
            )}

          </div>


          <div
            style="
              margin-top:3px;
              color:#6B7280;
              font-size:9px;
            "
          >

            ${escapeHtml(
              user.username
                ? `@${user.username}`
                : ""
            )}

          </div>

        </div>


        <button
          type="button"
          class="
            profile-action
            follow-btn
            ${
              following
                ? "following"
                : ""
            }
          "
          data-follow-id="${escapeHtml(
            user.uid
          )}"
          style="
            min-width:72px;
            padding:0 8px;
          "
        >

          ${
            following
              ? "Following"
              : "Follow"
          }

        </button>

      </div>

    </article>

  `;

}


/* =========================================================
   BUILD FOLLOWERS
========================================================= */

function buildFollowers() {

  if (!currentUser) {

    return;

  }


  followerUsers =
    allUsers.filter(
      user => {

        if (
          user.uid ===
          currentUser.uid
        ) {

          return false;

        }


        const following =
          Array.isArray(
            user.following
          )
            ? user.following
            : [];


        return following.includes(
          currentUser.uid
        );

      }
    );


  if (followersCount) {

    followersCount.textContent =
      followerUsers.length;

  }

}


/* =========================================================
   CURRENT TAB
========================================================= */

function renderCurrentTab() {

  if (
    !currentUser ||
    !currentProfile
  ) {

    return;

  }


  buildFollowers();


  if (
    activeTab ===
    "discover"
  ) {

    renderDiscover();

  }


  if (
    activeTab ===
    "following"
  ) {

    renderFollowing();

  }


  if (
    activeTab ===
    "followers"
  ) {

    renderFollowers();

  }

}


/* =========================================================
   TABS
========================================================= */

const tabs =
  document.querySelectorAll(
    ".friend-tab"
  );


function switchTab(
  tabName
) {

  activeTab =
    tabName;


  tabs.forEach(
    tab => {

      tab.classList.toggle(
        "active",
        tab.dataset.tab ===
          tabName
      );

    }
  );


  const discoverSection =
    document.getElementById(
      "discoverSection"
    );


  const followingSection =
    document.getElementById(
      "followingSection"
    );


  const followersSection =
    document.getElementById(
      "followersSection"
    );


  if (discoverSection) {

    discoverSection.hidden =
      tabName !==
      "discover";

  }


  if (followingSection) {

    followingSection.hidden =
      tabName !==
      "following";

  }


  if (followersSection) {

    followersSection.hidden =
      tabName !==
      "followers";

  }


  renderCurrentTab();

}


tabs.forEach(
  tab => {

    tab.addEventListener(
      "click",
      () => {

        switchTab(
          tab.dataset.tab
        );

      }
    );

  }
);


/* =========================================================
   GENDER FILTER
========================================================= */

genderButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        selectedGender =
          String(
            button.dataset.gender ||
            "everyone"
          )
          .toLowerCase();


        genderButtons.forEach(
          item => {

            item.classList.toggle(
              "active",
              item === button
            );

          }
        );


        renderDiscover();

      }
    );

  }
);


/* =========================================================
   COUNTRY FILTER
========================================================= */

if (countryFilter) {

  countryFilter.addEventListener(
    "change",
    () => {

      selectedCountry =
        String(
          countryFilter.value ||
          "all"
        )
        .toLowerCase();


      renderDiscover();

    }
  );

}


/* =========================================================
   INTEREST FILTER
========================================================= */

interestButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        selectedInterest =
          normalizeInterest(
            button.dataset.interest ||
            "all"
          );


        interestButtons.forEach(
          item => {

            item.classList.toggle(
              "active",
              item === button
            );

          }
        );


        renderDiscover();

      }
    );

  }
);


/* =========================================================
   SEARCH
========================================================= */

if (friendSearch) {

  friendSearch.addEventListener(
    "input",
    () => {

      searchTerm =
        friendSearch.value
          .trim()
          .toLowerCase();


      renderCurrentTab();

    }
  );

}


/* =========================================================
   CACHE — READ PROFILES
========================================================= */

function loadCachedProfiles() {

  try {

    const raw =
      localStorage.getItem(
        PUBLIC_PROFILES_CACHE_KEY
      );


    if (!raw) {

      return false;

    }


    const parsed =
      JSON.parse(
        raw
      );


    if (
      !Array.isArray(
        parsed
      )
    ) {

      return false;

    }


    allUsers =
      parsed;


    /*
     * Show cached profiles immediately.
     */

    if (
      currentUser &&
      currentProfile
    ) {

      renderCurrentTab();

    }


    return true;

  } catch (error) {

    console.error(
      "Global Meet cache read error:",
      error
    );


    return false;

  }

}


/* =========================================================
   CACHE — SAVE PROFILES
========================================================= */

function saveProfilesCache(
  profiles
) {

  try {

    localStorage.setItem(
      PUBLIC_PROFILES_CACHE_KEY,
      JSON.stringify(
        profiles
      )
    );


    localStorage.setItem(
      PUBLIC_PROFILES_CACHE_TIME_KEY,
      String(
        Date.now()
      )
    );

  } catch (error) {

    console.error(
      "Global Meet cache save error:",
      error
    );

  }

}


/* =========================================================
   CACHE — CURRENT PROFILE
========================================================= */

function saveCurrentProfileCache() {

  if (
    !currentProfile
  ) {

    return;

  }


  try {

    localStorage.setItem(
      CURRENT_USER_CACHE_KEY,
      JSON.stringify(
        currentProfile
      )
    );

  } catch (error) {

    console.error(
      "Current profile cache error:",
      error
    );

  }

}


/* =========================================================
   CACHE — CURRENT PROFILE READ
========================================================= */

function loadCachedCurrentProfile() {

  try {

    const raw =
      localStorage.getItem(
        CURRENT_USER_CACHE_KEY
      );


    if (!raw) {

      return null;

    }


    const parsed =
      JSON.parse(
        raw
      );


    if (
      !parsed ||
      !parsed.uid
    ) {

      return null;

    }


    return parsed;

  } catch {

    return null;

  }

}


/* =========================================================
   LOAD CURRENT PROFILE
========================================================= */

async function loadCurrentProfile() {

  /*
   * Firebase auth session is already active.
   * We don't authenticate again.
   */

  if (!currentUser) {

    throw new Error(
      "No active CONNECTA session."
    );

  }


  /*
   * Display cached private profile immediately
   * when it belongs to this authenticated UID.
   */

  const cached =
    loadCachedCurrentProfile();


  if (
    cached &&
    cached.uid ===
      currentUser.uid
  ) {

    currentProfile =
      cached;


    renderHeaderProfile();

  }


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

    throw new Error(
      "Your CONNECTA profile was not found."
    );

  }


  currentProfile = {

    uid:
      snapshot.id,

    ...snapshot.data()

  };


  saveCurrentProfileCache();

  renderHeaderProfile();

}


/* =========================================================
   CURRENT PROFILE REALTIME
========================================================= */

function listenToCurrentProfile() {

  if (!currentUser) {

    return;

  }


  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  unsubscribeProfile =
    onSnapshot(
      userRef,
      snapshot => {

        if (
          !snapshot.exists()
        ) {

          return;

        }


        currentProfile = {

          uid:
            snapshot.id,

          ...snapshot.data()

        };


        saveCurrentProfileCache();

        renderHeaderProfile();

        renderCurrentTab();

      },

      error => {

        console.error(
          "Current profile listener error:",
          error
        );

      }
    );

}


/* =========================================================
   LOAD PUBLIC PROFILES
========================================================= */

function listenToPublicProfiles() {

  const profilesRef =
    collection(
      db,
      PUBLIC_PROFILES_COLLECTION
    );


  const profilesQuery =
    query(
      profilesRef,
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(200)
    );


  unsubscribeUsers =
    onSnapshot(
      profilesQuery,
      snapshot => {

        allUsers =
          snapshot.docs.map(
            item => ({

              uid:
                item.id,

              ...item.data()

            })
          );


        saveProfilesCache(
          allUsers
        );


        hideSkeleton();

        renderCurrentTab();

      },

      error => {

        console.error(
          "Public profile listener error:",
          error
        );


        /*
         * Do NOT fall back to users collection.
         *
         * The private users collection contains
         * sensitive information.
         */

        hideSkeleton();


        if (
          allUsers.length
        ) {

          renderCurrentTab();

          showToast(
            "Showing saved profiles. Refreshing connection..."
          );

          return;

        }


        if (discoverList) {

          discoverList.innerHTML = `

            <div class="empty-state">

              <div class="empty-icon">
                🔒
              </div>

              <div class="empty-title">
                Global Meet is being prepared
              </div>

              <div class="empty-text">

                Public profiles are not available
                yet. Please try again shortly.

              </div>

            </div>

          `;

          discoverList.style.display =
            "grid";

        }

      }
    );

}


/* =========================================================
   FOLLOW / UNFOLLOW
========================================================= */

async function toggleFollow(
  targetUserId,
  button
) {

  if (!currentUser) {

    return;

  }


  if (
    !targetUserId ||
    targetUserId ===
      currentUser.uid
  ) {

    showToast(
      "You cannot follow yourself."
    );

    return;

  }


  if (button) {

    button.disabled =
      true;

  }


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
        targetUserId
      );


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
            "Your profile could not be found."
          );

        }


        if (
          !targetSnapshot.exists()
        ) {

          throw new Error(
            "That profile no longer exists."
          );

        }


        const currentData =
          currentSnapshot.data();


        const targetData =
          targetSnapshot.data();


        const currentFollowing =
          Array.isArray(
            currentData.following
          )
            ? [
                ...currentData.following
              ]
            : [];


        const alreadyFollowing =
          currentFollowing.includes(
            targetUserId
          );


        const targetFollowersCount =
          Number(
            targetData.followersCount ||
            0
          );


        const currentFollowingCount =
          Number(
            currentData.followingCount ||
            0
          );


        if (
          alreadyFollowing
        ) {

          const updatedFollowing =
            currentFollowing.filter(
              id =>
                id !==
                targetUserId
            );


          transaction.update(
            currentUserRef,
            {

              following:
                updatedFollowing,

              followingCount:
                Math.max(
                  0,
                  currentFollowingCount -
                    1
                ),

              updatedAt:
                serverTimestamp()

            }
          );


          transaction.update(
            targetUserRef,
            {

              followersCount:
                Math.max(
                  0,
                  targetFollowersCount -
                    1
                ),

              updatedAt:
                serverTimestamp()

            }
          );

        } else {

          const updatedFollowing = [
            ...currentFollowing,
            targetUserId
          ];


          transaction.update(
            currentUserRef,
            {

              following:
                updatedFollowing,

              followingCount:
                currentFollowingCount +
                1,

              updatedAt:
                serverTimestamp()

            }
          );


          transaction.update(
            targetUserRef,
            {

              followersCount:
                targetFollowersCount +
                1,

              updatedAt:
                serverTimestamp()

            }
          );

        }

      }
    );


    /*
     * The realtime listener will refresh the state.
     */

    showToast(
      isFollowing(targetUserId)
        ? "Following updated."
        : "Follow updated."
    );


  } catch (error) {

    console.error(
      "Follow operation failed:",
      error
    );


    showToast(
      error.message ||
      "Unable to update follow status."
    );

  } finally {

    if (button) {

      button.disabled =
        false;

    }

  }

}


/* =========================================================
   PHONE NORMALIZER
========================================================= */

function normalizeKenyanPhone(
  value
) {

  let phone =
    String(
      value || ""
    )
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );


  if (
    phone.startsWith("+254")
  ) {

    phone =
      phone.substring(1);

  }


  if (
    phone.startsWith("07") ||
    phone.startsWith("01")
  ) {

    phone =
      "254" +
      phone.substring(1);

  }


  if (
    /^254[17]\d{8}$/.test(
      phone
    )
  ) {

    return phone;

  }


  return null;

}


/* =========================================================
   FIREBASE TOKEN
========================================================= */

async function getFirebaseToken() {

  if (
    !auth.currentUser
  ) {

    throw new Error(
      "Your CONNECTA session has expired. Please log in again."
    );

  }


  return await auth.currentUser.getIdToken(
    true
  );

}


/* =========================================================
   OPEN PAYMENT MODAL
========================================================= */

function openPaymentModal(
  user
) {

  if (!user) {

    return;

  }


  selectedChatUser =
    user;


  if (paymentForm) {

    paymentForm.style.display =
      "";

  }


  if (paymentSuccess) {

    paymentSuccess.style.display =
      "none";

  }


  if (paymentUserName) {

    paymentUserName.textContent =
      getFullName(
        user
      );

  }


  if (paymentCountry) {

    paymentCountry.textContent =
      getCountryLabel(
        user.country
      );

  }


  if (paymentAmount) {

    paymentAmount.textContent =
      `KSh ${GLOBAL_MEET_FEE}`;

  }


  if (paymentAvatar) {

    if (
      user.photoURL
    ) {

      paymentAvatar.innerHTML = `

        <img
          src="${escapeHtml(
            user.photoURL
          )}"
          alt=""
        >

      `;

    } else {

      paymentAvatar.textContent =
        getInitials(
          user
        );

    }

  }


  if (paymentSubmit) {

    paymentSubmit.disabled =
      false;

    paymentSubmit.textContent =
      `Pay KSh ${GLOBAL_MEET_FEE}`;

  }


  paymentInProgress =
    false;


  if (paymentOverlay) {

    paymentOverlay.classList.add(
      "show"
    );

    paymentOverlay.setAttribute(
      "aria-hidden",
      "false"
    );

  }

}


/* =========================================================
   CLOSE PAYMENT MODAL
========================================================= */

function closePaymentModal() {

  if (
    paymentPollingTimer
  ) {

    clearInterval(
      paymentPollingTimer
    );

    paymentPollingTimer =
      null;

  }


  paymentInProgress =
    false;


  selectedChatUser =
    null;


  if (paymentOverlay) {

    paymentOverlay.classList.remove(
      "show"
    );

    paymentOverlay.setAttribute(
      "aria-hidden",
      "true"
    );

  }


  if (paymentSubmit) {

    paymentSubmit.disabled =
      false;

    paymentSubmit.textContent =
      `Pay KSh ${GLOBAL_MEET_FEE}`;

  }

}


if (paymentCancel) {

  paymentCancel.addEventListener(
    "click",
    closePaymentModal
  );

}


if (paymentOverlay) {

  paymentOverlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        paymentOverlay &&
        !paymentInProgress
      ) {

        closePaymentModal();

      }

    }
  );

}


/* =========================================================
   INITIATE PAYMENT
========================================================= */

async function initiatePayment() {

  if (
    paymentInProgress
  ) {

    return;

  }


  if (!currentUser) {

    showToast(
      "Please wait for your CONNECTA session."
    );

    return;

  }


  if (!selectedChatUser) {

    showToast(
      "Please select a profile first."
    );

    return;

  }


  paymentInProgress =
    true;


  if (paymentSubmit) {

    paymentSubmit.disabled =
      true;

    paymentSubmit.textContent =
      "Starting payment...";

  }


  try {

    const token =
      await getFirebaseToken();


    const response =
      await fetch(
        PAYMENT_INITIATE_URL,
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

              receiverId:
                selectedChatUser.uid,

              amount:
                GLOBAL_MEET_FEE

            })

        }
      );


    let data = null;


    try {

      data =
        await response.json();

    } catch {

      data =
        null;

    }


    if (!response.ok) {

      throw new Error(
        data?.message ||
        data?.error ||
        "Unable to start payment."
      );

    }


    const paymentId =
      data?.paymentId ||
      data?.id;


    if (!paymentId) {

      throw new Error(
        "Payment ID was not returned."
      );

    }


    if (paymentSubmit) {

      paymentSubmit.textContent =
        "Waiting for M-PESA...";

    }


    showToast(
      "Check your phone and complete the M-PESA payment."
    );


    await pollPayment(
      paymentId
    );


  } catch (error) {

    console.error(
      "Global Meet payment error:",
      error
    );


    paymentInProgress =
      false;


    if (paymentSubmit) {

      paymentSubmit.disabled =
        false;

      paymentSubmit.textContent =
        `Pay KSh ${GLOBAL_MEET_FEE}`;

    }


    showToast(
      error.message ||
      "Unable to start payment."
    );

  }

}


/* =========================================================
   POLL PAYMENT
========================================================= */

async function pollPayment(
  paymentId
) {

  const maxAttempts =
    30;


  let attempts =
    0;


  if (
    paymentPollingTimer
  ) {

    clearInterval(
      paymentPollingTimer
    );

  }


  return new Promise(
    resolve => {

      paymentPollingTimer =
        setInterval(
          async () => {

            attempts++;


            try {

              const token =
                await getFirebaseToken();


              const response =
                await fetch(
                  PAYMENT_STATUS_URL,
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

                        paymentId

                      })

                  }
                );


              let data =
                null;


              try {

                data =
                  await response.json();

              } catch {

                data =
                  null;

              }


              if (
                response.ok &&
                data
              ) {

                const status =
                  String(
                    data.status ||
                    ""
                  )
                  .toLowerCase();


                if (
                  status ===
                    "completed" ||
                  status ===
                    "success" ||
                  data.paid ===
                    true ||
                  data.completed ===
                    true
                ) {

                  clearInterval(
                    paymentPollingTimer
                  );


                  paymentPollingTimer =
                    null;


                  paymentInProgress =
                    false;


                  showPaymentSuccess(
                    data
                  );


                  resolve(
                    true
                  );


                  return;

                }


                if (
                  [
                    "failed",
                    "cancelled",
                    "expired"
                  ].includes(
                    status
                  )
                ) {

                  clearInterval(
                    paymentPollingTimer
                  );


                  paymentPollingTimer =
                    null;


                  paymentInProgress =
                    false;


                  if (paymentSubmit) {

                    paymentSubmit.disabled =
                      false;

                    paymentSubmit.textContent =
                      `Pay KSh ${GLOBAL_MEET_FEE}`;

                  }


                  showToast(
                    data.message ||
                    "Payment was not completed."
                  );


                  resolve(
                    false
                  );


                  return;

                }

              }

            } catch (error) {

              /*
               * Temporary network failures do not
               * immediately cancel the payment.
               */

              console.error(
                "Payment status error:",
                error
              );

            }


            if (
              attempts >=
              maxAttempts
            ) {

              clearInterval(
                paymentPollingTimer
              );


              paymentPollingTimer =
                null;


              paymentInProgress =
                false;


              if (paymentSubmit) {

                paymentSubmit.disabled =
                  false;

                paymentSubmit.textContent =
                  `Pay KSh ${GLOBAL_MEET_FEE}`;

              }


              showToast(
                "Payment confirmation timed out. If you completed payment, contact CONNECTA Support with your payment reference."
              );


              resolve(
                false
              );

            }

          },
          2000
        );

    }
  );

}


/* =========================================================
   PAYMENT SUCCESS
========================================================= */

function showPaymentSuccess(
  paymentData = {}
) {

  if (paymentForm) {

    paymentForm.style.display =
      "none";

  }


  if (paymentSuccess) {

    paymentSuccess.style.display =
      "";

  }


  /*
   * Store reference locally so the Support
   * button can use it.
   */

  const reference =
    paymentData.transactionCode ||
    paymentData.reference ||
    paymentData.paymentId ||
    "";


  if (contactSupportBtn) {

    contactSupportBtn.dataset.reference =
      reference;

  }


  showToast(
    "Payment confirmed successfully."
  );

}


/* =========================================================
   CONTACT CONNECTA SUPPORT
========================================================= */

function contactSupport() {

  const reference =
    contactSupportBtn?.dataset.reference ||
    "";


  const selectedName =
    selectedChatUser
      ? getFullName(
          selectedChatUser
        )
      : "selected profile";


  /*
   * Replace this number with your official
   * CONNECTA Support WhatsApp number.
   *
   * We intentionally leave it configurable
   * here rather than inventing a number.
   */

  const supportNumber =
    window.CONNECTA_SUPPORT_WHATSAPP ||
    "";


  const message =
    `Hello CONNECTA Support. I have completed a Global Meet connection payment.

Selected profile: ${selectedName}
Payment reference: ${reference || "Not available"}

Please verify my payment and help connect me with the selected profile.`;


  if (supportNumber) {

    const cleanNumber =
      supportNumber.replace(
        /\D/g,
        ""
      );


    window.open(
      `https://wa.me/${cleanNumber}?text=${encodeURIComponent(
        message
      )}`,
      "_blank",
      "noopener"
    );


    return;

  }


  /*
   * If the support number hasn't yet been
   * configured, show the message instead of
   * sending the user to a fake destination.
   */

  if (
    navigator.clipboard
  ) {

    navigator.clipboard.writeText(
      message
    )
      .then(
        () => {

          showToast(
            "Support message copied. Add your CONNECTA Support WhatsApp number to continue."
          );

        }
      )
      .catch(
        () => {

          showToast(
            "CONNECTA Support contact is not configured yet."
          );

        }
      );

  } else {

    showToast(
      "CONNECTA Support contact is not configured yet."
    );

  }

}


if (contactSupportBtn) {

  contactSupportBtn.addEventListener(
    "click",
    contactSupport
  );

}


/* =========================================================
   PROFILE CHAT CLICK
========================================================= */

function handleConnectClick(
  userId
) {

  if (!userId) {

    return;

  }


  if (
    userId ===
    currentUser?.uid
  ) {

    showToast(
      "You cannot connect with yourself."
    );

    return;

  }


  const user =
    allUsers.find(
      item =>
        item.uid ===
        userId
    );


  if (!user) {

    showToast(
      "This profile is no longer available."
    );

    return;

  }


  if (
    !isGlobalMeetProfile(
      user
    )
  ) {

    showToast(
      "This profile is currently unavailable."
    );

    return;

  }


  openPaymentModal(
    user
  );

}


/* =========================================================
   CARD EVENTS
========================================================= */

document.addEventListener(
  "click",
  event => {

    /*
     * Follow.
     */

    const followButton =
      event.target.closest(
        "[data-follow-id]"
      );


    if (followButton) {

      event.preventDefault();

      event.stopPropagation();


      toggleFollow(
        followButton.dataset.followId,
        followButton
      );


      return;

    }


    /*
     * Connect.
     */

    const connectButton =
      event.target.closest(
        "[data-chat-id]"
      );


    if (connectButton) {

      event.preventDefault();

      event.stopPropagation();


      handleConnectClick(
        connectButton.dataset.chatId
      );


      return;

    }

  }
);


/* =========================================================
   PROFILE BUTTON
========================================================= */

if (profileBtn) {

  profileBtn.addEventListener(
    "click",
    () => {

      window.location.href =
        "profile.html";

    }
  );

}


/* =========================================================
   GET CONNECTION
========================================================= */

if (connectionBtn) {

  connectionBtn.addEventListener(
    "click",
    () => {

      showToast(
        "Global Meet connections are available below."
      );

    }
  );

}


/* =========================================================
   PAYMENT BUTTON
========================================================= */

if (paymentSubmit) {

  paymentSubmit.addEventListener(
    "click",
    initiatePayment
  );

}


/* =========================================================
   ESCAPE MODAL
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Escape"
    ) {

      if (
        paymentOverlay &&
        paymentOverlay.classList.contains(
          "show"
        ) &&
        !paymentInProgress
      ) {

        closePaymentModal();

      }

    }

  }
);


/* =========================================================
   LOGOUT
========================================================= */

if (logoutBtn) {

  logoutBtn.addEventListener(
    "click",
    async () => {

      try {

        if (
          unsubscribeUsers
        ) {

          unsubscribeUsers();

        }


        if (
          unsubscribeProfile
        ) {

          unsubscribeProfile();

        }


        if (
          paymentPollingTimer
        ) {

          clearInterval(
            paymentPollingTimer
          );

        }


        await signOut(
          auth
        );


        localStorage.removeItem(
          "connectaLastUser"
        );


        window.location.replace(
          "login.html"
        );


      } catch (error) {

        console.error(
          "Logout error:",
          error
        );


        showToast(
          "Unable to logout. Please try again."
        );

      }

    }
  );

}


/* =========================================================
   AUTH STARTUP
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      window.location.replace(
        "login.html"
      );

      return;

    }


    /*
     * This is the existing Firebase session.
     *
     * We do NOT ask the user to log in again.
     */

    currentUser =
      user;


    /*
     * First restore public profile cache
     * so the page can feel instant.
     */

    loadCachedProfiles();


    try {

      /*
       * Restore/load the current user's
       * private profile.
       */

      await loadCurrentProfile();


      /*
       * Start realtime current-user listener.
       */

      listenToCurrentProfile();


      /*
       * Start public profile listener.
       */

      listenToPublicProfiles();


      /*
       * Render immediately using whatever
       * data is already available.
       */

      renderCurrentTab();


    } catch (error) {

      console.error(
        "Global Meet startup error:",
        error
      );


      hideSkeleton();


      showToast(
        error.message ||
        "Unable to load Global Meet."
      );

    }

  }
);


/* =========================================================
   BEFORE UNLOAD
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      unsubscribeUsers
    ) {

      unsubscribeUsers();

    }


    if (
      unsubscribeProfile
    ) {

      unsubscribeProfile();

    }


    if (
      paymentPollingTimer
    ) {

      clearInterval(
        paymentPollingTimer
      );

    }

  }
);
