/* =========================================================
   CONNECTA — GLOBAL CHAT / MEET & CHAT
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
   CONFIG
========================================================= */

const BACKEND_URL =
  "https://connecta-backend-com.onrender.com";

const GLOBAL_CHAT_PAYMENT_INITIATE =
  `${BACKEND_URL}/api/global-chat/payment/initiate`;

const GLOBAL_CHAT_PAYMENT_STATUS =
  `${BACKEND_URL}/api/global-chat/payment/status`;

const GLOBAL_CHAT_FEE = 20;


/*
 * Public profiles are used for discovery.
 *
 * Expected document:
 *
 * publicProfiles/{uid}
 *
 * {
 *   uid,
 *   displayName,
 *   username,
 *   photoURL,
 *   gender,
 *   country,
 *   isOnline,
 *   isVerified,
 *   globalChatEnabled,
 *   globalChatStatus,
 *   globalChatBio
 * }
 */
const PUBLIC_PROFILES_COLLECTION =
  "publicProfiles";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let allUsers = [];
let followingUsers = [];
let followerUsers = [];

let activeTab = "discover";

let searchTerm = "";

let selectedGender = "everyone";

let selectedCountry = "all";

let selectedChatUser = null;

let unsubscribeUsers = null;
let unsubscribeProfile = null;

let toastTimer = null;

let paymentPollingTimer = null;

let paymentInProgress = false;


/* =========================================================
   ELEMENTS
========================================================= */

const friendSearch =
  document.getElementById(
    "friendSearch"
  );

const discoverList =
  document.getElementById(
    "discoverList"
  );

const followingList =
  document.getElementById(
    "followingList"
  );

const followersList =
  document.getElementById(
    "followersList"
  );

const discoverCount =
  document.getElementById(
    "discoverCount"
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


/* =========================================================
   GLOBAL CHAT ELEMENTS
========================================================= */

const genderButtons =
  document.querySelectorAll(
    ".gender-btn"
  );

const countryFilter =
  document.getElementById(
    "countryFilter"
  );

const paymentOverlay =
  document.getElementById(
    "chatPaymentOverlay"
  );

const paymentAvatar =
  document.getElementById(
    "chatPaymentAvatar"
  );

const paymentUserName =
  document.getElementById(
    "chatPaymentUserName"
  );

const paymentAmount =
  document.getElementById(
    "chatPaymentAmount"
  );

const paymentPhone =
  document.getElementById(
    "chatPaymentPhone"
  );

const paymentCancel =
  document.getElementById(
    "chatPaymentCancel"
  );

const paymentSubmit =
  document.getElementById(
    "chatPaymentSubmit"
  );


/* =========================================================
   HELPERS
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
   VERIFIED BADGE
========================================================= */

function verifiedBadge(user = {}) {

  if (
    user.isVerified !== true
  ) {

    return "";

  }


  return `
    <span
      class="verified-badge"
      aria-label="Verified account"
      title="Verified account"
    >
      ✓
    </span>
  `;
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

  if (!toast) {
    return;
  }


  clearTimeout(toastTimer);


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
      2800
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
   IS FOLLOWING
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
   NORMALIZE COUNTRY
========================================================= */

function normalizeCountry(value = "") {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

}


/* =========================================================
   COUNTRY DISPLAY
========================================================= */

function countryLabel(value = "") {

  const normalized =
    normalizeCountry(value);


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


  return countries[normalized] ||
    (
      value
        ? String(value)
        : "Unknown country"
    );

}


/* =========================================================
   RENDER AVATAR
========================================================= */

function renderAvatar(user) {

  const initials =
    escapeHtml(
      getInitials(user)
    );


  const photo =
    user.photoURL
      ? `
        <img
          src="${escapeHtml(
            user.photoURL
          )}"
          alt=""
          loading="lazy"
        >
      `
      : initials;


  const online =
    user.isOnline === true
      ? `<span class="online-dot"></span>`
      : "";


  return `
    <div class="user-avatar">
      ${photo}
      ${online}
    </div>
  `;
}


/* =========================================================
   RENDER GLOBAL USER CARD
========================================================= */

function renderGlobalUserCard(user) {

  const userId =
    user.uid;


  const name =
    getFullName(user);


  const username =
    user.username
      ? `@${user.username}`
      : "";


  const following =
    isFollowing(userId);


  const isOnline =
    user.isOnline === true;


  const followText =
    following
      ? "Following"
      : "Follow";


  const followClass =
    following
      ? "follow-btn following"
      : "follow-btn";


  const country =
    countryLabel(
      user.country
    );


  const gender =
    String(
      user.gender || ""
    ).toLowerCase();


  let genderLabel =
    "";


  if (gender === "male") {

    genderLabel =
      "👨 Male";

  } else if (gender === "female") {

    genderLabel =
      "👩 Female";

  }


  const bio =
    String(
      user.globalChatBio || ""
    ).trim();


  return `
    <article
      class="user-card"
      data-user-id="${escapeHtml(userId)}"
    >

      ${renderAvatar(user)}

      <div
        class="user-info"
        data-profile-id="${escapeHtml(userId)}"
      >

        <div class="user-name">

          <span class="user-name-text">
            ${escapeHtml(name)}
          </span>

          ${verifiedBadge(user)}

        </div>


        <div class="username">
          ${escapeHtml(username)}
        </div>


        <div
          class="
            online-status
            ${isOnline ? "online" : "offline"}
          "
        >
          ${
            isOnline
              ? "● Online"
              : "○ Offline"
          }
        </div>


        <div class="global-user-details">

          <span class="user-meta-chip">
            ${escapeHtml(country)}
          </span>

          ${
            genderLabel
              ? `
                <span class="user-meta-chip">
                  ${escapeHtml(
                    genderLabel
                  )}
                </span>
              `
              : ""
          }

        </div>


        ${
          bio
            ? `
              <div class="global-bio">
                ${escapeHtml(bio)}
              </div>
            `
            : ""
        }

      </div>


      <div class="user-actions">

        <button
          type="button"
          class="${followClass}"
          data-follow-id="${escapeHtml(userId)}"
        >
          ${followText}
        </button>


        <button
          type="button"
          class="chat-btn"
          data-chat-id="${escapeHtml(userId)}"
        >
          💬 Chat
        </button>


        <div class="chat-fee-label">
          KSh ${GLOBAL_CHAT_FEE}
        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   SEARCH MATCH
========================================================= */

function matchesSearch(user) {

  if (!searchTerm) {
    return true;
  }


  const name =
    getFullName(user)
      .toLowerCase();


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
      user.globalChatBio || ""
    ).toLowerCase();


  return (
    name.includes(searchTerm) ||
    username.includes(searchTerm) ||
    country.includes(searchTerm) ||
    bio.includes(searchTerm)
  );
}


/* =========================================================
   GENDER MATCH
========================================================= */

function matchesGender(user) {

  if (
    selectedGender ===
    "everyone"
  ) {

    return true;

  }


  return String(
    user.gender || ""
  ).trim().toLowerCase()
    === selectedGender;
}


/* =========================================================
   COUNTRY MATCH
========================================================= */

function matchesCountry(user) {

  if (
    selectedCountry ===
    "all"
  ) {

    return true;

  }


  return normalizeCountry(
    user.country
  ) === selectedCountry;
}


/* =========================================================
   GLOBAL CHAT ELIGIBILITY
========================================================= */

function isAvailableForGlobalChat(user) {

  if (!user) {
    return false;
  }


  if (
    user.uid ===
    currentUser?.uid
  ) {

    return false;

  }


  if (
    user.globalChatEnabled !== true
  ) {

    return false;

  }


  if (
    user.globalChatStatus &&
    user.globalChatStatus !==
      "available"
  ) {

    return false;

  }


  return true;
}


/* =========================================================
   SORT GLOBAL USERS
========================================================= */

function sortGlobalUsers(users) {

  return [...users].sort(
    (a, b) => {

      /*
       * Online first.
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
       * Verified first.
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

      const nameA =
        getFullName(a)
          .toLowerCase();

      const nameB =
        getFullName(b)
          .toLowerCase();


      return nameA.localeCompare(
        nameB
      );

    }
  );

}


/* =========================================================
   FILTER GLOBAL USERS
========================================================= */

function getFilteredGlobalUsers() {

  return sortGlobalUsers(

    allUsers.filter(
      user => {

        return (
          isAvailableForGlobalChat(user) &&
          matchesGender(user) &&
          matchesCountry(user) &&
          matchesSearch(user)
        );

      }
    )

  );

}


/* =========================================================
   EMPTY DISCOVER
========================================================= */

function renderGlobalEmpty() {

  if (!discoverList) {
    return;
  }


  let message =
    "No people match your current filters.";


  if (
    !searchTerm &&
    selectedGender === "everyone" &&
    selectedCountry === "all"
  ) {

    message =
      "No one is currently available for Global Chat.";

  }


  discoverList.innerHTML = `
    <div class="empty-state">

      <div class="empty-icon">
        🌍
      </div>

      <div class="empty-title">
        No chat partners found
      </div>

      <div class="empty-text">
        ${escapeHtml(message)}
        Try changing your gender, country or search filter.
      </div>

    </div>
  `;
}


/* =========================================================
   RENDER DISCOVER
========================================================= */

function renderDiscover() {

  const users =
    getFilteredGlobalUsers();


  /*
   * There are duplicate discover IDs in the
   * current HTML for compatibility. The first
   * element is the main visible Global Chat list.
   */

  if (discoverCount) {

    discoverCount.textContent =
      users.length;

  }


  if (!discoverList) {
    return;
  }


  if (!users.length) {

    renderGlobalEmpty();

    return;

  }


  discoverList.innerHTML =
    users
      .map(
        renderGlobalUserCard
      )
      .join("");

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
    sortGlobalUsers(
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
          ${
            searchTerm
              ? "No matches"
              : "No following yet"
          }
        </div>

        <div class="empty-text">
          ${
            searchTerm
              ? "No followed users match your search."
              : "People you follow will appear here."
          }
        </div>

      </div>
    `;

    return;

  }


  followingList.innerHTML =
    users
      .map(
        renderFollowingCard
      )
      .join("");

}


/* =========================================================
   FOLLOWING CARD
========================================================= */

function renderFollowingCard(user) {

  const userId =
    user.uid;


  const name =
    getFullName(user);


  const username =
    user.username
      ? `@${user.username}`
      : "";


  const following =
    isFollowing(userId);


  return `
    <article
      class="user-card"
      data-user-id="${escapeHtml(userId)}"
    >

      ${renderAvatar(user)}

      <div
        class="user-info"
        data-profile-id="${escapeHtml(userId)}"
      >

        <div class="user-name">

          <span class="user-name-text">
            ${escapeHtml(name)}
          </span>

          ${verifiedBadge(user)}

        </div>


        <div class="username">
          ${escapeHtml(username)}
        </div>


        <div
          class="
            online-status
            ${user.isOnline ? "online" : "offline"}
          "
        >
          ${
            user.isOnline
              ? "● Online"
              : "○ Offline"
          }
        </div>

      </div>


      <button
        type="button"
        class="
          follow-btn
          ${following ? "following" : ""}
        "
        data-follow-id="${escapeHtml(userId)}"
      >
        ${following ? "Following" : "Follow"}
      </button>

    </article>
  `;
}


/* =========================================================
   RENDER FOLLOWERS
========================================================= */

function renderFollowers() {

  if (!followersList) {
    return;
  }


  const users =
    sortGlobalUsers(
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
          ${
            searchTerm
              ? "No matches"
              : "No followers yet"
          }
        </div>

        <div class="empty-text">
          ${
            searchTerm
              ? "No followers match your search."
              : "People who follow you will appear here."
          }
        </div>

      </div>
    `;

    return;

  }


  followersList.innerHTML =
    users
      .map(
        renderFollowingCard
      )
      .join("");

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
   TAB SWITCHING
========================================================= */

const tabs =
  document.querySelectorAll(
    ".friend-tab"
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


function switchTab(tabName) {

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


  if (discoverSection) {

    discoverSection.hidden =
      tabName !== "discover";

  }


  if (followingSection) {

    followingSection.hidden =
      tabName !== "following";

  }


  if (followersSection) {

    followersSection.hidden =
      tabName !== "followers";

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
   LOAD CURRENT PROFILE
========================================================= */

async function loadCurrentProfile() {

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


  renderHeaderProfile();

}


/* =========================================================
   PROFILE LISTENER
========================================================= */

function listenToCurrentProfile() {

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


        renderHeaderProfile();

        renderCurrentTab();

      },

      error => {

        console.error(
          "Profile listener error:",
          error
        );

      }
    );

}


/* =========================================================
   LOAD PUBLIC PROFILES
========================================================= */

function listenToUsers() {

  const usersRef =
    collection(
      db,
      PUBLIC_PROFILES_COLLECTION
    );


  const usersQuery =
    query(
      usersRef,
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(200)
    );


  unsubscribeUsers =
    onSnapshot(
      usersQuery,
      snapshot => {

        allUsers =
          snapshot.docs.map(
            item => ({

              uid:
                item.id,

              ...item.data()

            })
          );


        renderCurrentTab();

      },

      error => {

        console.error(
          "Public profiles listener error:",
          error
        );


        /*
         * Don't fall back to reading the private
         * users collection.
         *
         * Doing that would expose private profile
         * fields to every browser.
         */

        if (discoverList) {

          discoverList.innerHTML = `
            <div class="empty-state">

              <div class="empty-icon">
                🔒
              </div>

              <div class="empty-title">
                Global Chat profiles are unavailable
              </div>

              <div class="empty-text">
                Public chat profiles have not been
                configured yet.
              </div>

            </div>
          `;

        }

      }
    );

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

    /*
     * We prefer the actual public-profile
     * relationship count when available.
     */

    followersCount.textContent =
      followerUsers.length;

  }

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
            "That CONNECTA user no longer exists."
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
            ? [...currentData.following]
            : [];


        const alreadyFollowing =
          currentFollowing.includes(
            targetUserId
          );


        const targetFollowersCount =
          Number(
            targetData.followersCount || 0
          );


        const currentFollowingCount =
          Number(
            currentData.followingCount || 0
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
                  currentFollowingCount - 1
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
                  targetFollowersCount - 1
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
                currentFollowingCount + 1,

              updatedAt:
                serverTimestamp()

            }
          );


          transaction.update(
            targetUserRef,
            {

              followersCount:
                targetFollowersCount + 1,

              updatedAt:
                serverTimestamp()

            }
          );

        }

      }
    );


    /*
     * The realtime listener will update
     * currentProfile. Determine the intended
     * action from the previous state.
     */

    const wasFollowingBefore =
      isFollowing(
        targetUserId
      );


    showToast(
      wasFollowingBefore
        ? "Followed successfully."
        : "Unfollowed successfully."
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
   PAYMENT PHONE NORMALIZER
========================================================= */

function normalizeKenyanPhone(value) {

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
   GET FIREBASE TOKEN
========================================================= */

async function getFirebaseToken() {

  if (!auth.currentUser) {

    throw new Error(
      "Your login session has expired. Please log in again."
    );

  }


  return await auth.currentUser.getIdToken(
    true
  );

}


/* =========================================================
   OPEN PAYMENT MODAL
========================================================= */

function openChatPaymentModal(user) {

  if (!user) {
    return;
  }


  selectedChatUser =
    user;


  if (paymentUserName) {

    paymentUserName.textContent =
      getFullName(user);

  }


  if (paymentAmount) {

    paymentAmount.textContent =
      `KSh ${GLOBAL_CHAT_FEE}`;

  }


  if (paymentAvatar) {

    if (user.photoURL) {

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
        getInitials(user);

    }

  }


  if (paymentPhone) {

    paymentPhone.value = "";

  }


  if (paymentSubmit) {

    paymentSubmit.disabled =
      false;

    paymentSubmit.textContent =
      "Pay & Start Chat";

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


  setTimeout(
    () => {

      if (paymentPhone) {

        paymentPhone.focus();

      }

    },
    100
  );

}


/* =========================================================
   CLOSE PAYMENT MODAL
========================================================= */

function closeChatPaymentModal() {

  if (paymentPollingTimer) {

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
      "Pay & Start Chat";

  }

}


if (paymentCancel) {

  paymentCancel.addEventListener(
    "click",
    closeChatPaymentModal
  );

}


if (paymentOverlay) {

  paymentOverlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        paymentOverlay
      ) {

        if (!paymentInProgress) {

          closeChatPaymentModal();

        }

      }

    }
  );

}


/* =========================================================
   INITIATE GLOBAL CHAT PAYMENT
========================================================= */

async function initiateGlobalChatPayment() {

  if (paymentInProgress) {
    return;
  }


  if (!currentUser) {

    showToast(
      "Please log in again."
    );

    return;

  }


  if (!selectedChatUser) {

    showToast(
      "Please select a person to chat with."
    );

    return;

  }


  const phone =
    normalizeKenyanPhone(
      paymentPhone?.value
    );


  if (!phone) {

    showToast(
      "Enter a valid Kenyan M-PESA number."
    );

    if (paymentPhone) {
      paymentPhone.focus();
    }

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
        GLOBAL_CHAT_PAYMENT_INITIATE,
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

              phone,

              amount:
                GLOBAL_CHAT_FEE

            })

        }
      );


    let data = null;


    try {

      data =
        await response.json();

    } catch {

      data = null;

    }


    if (!response.ok) {

      throw new Error(
        data?.message ||
        data?.error ||
        "Unable to start the M-PESA payment."
      );

    }


    const paymentId =
      data?.paymentId ||
      data?.id;


    if (!paymentId) {

      throw new Error(
        "The payment request did not return a payment ID."
      );

    }


    if (paymentSubmit) {

      paymentSubmit.textContent =
        "Waiting for M-PESA...";

    }


    showToast(
      "Check your phone and complete the M-PESA prompt."
    );


    await pollGlobalChatPayment(
      paymentId,
      selectedChatUser.uid
    );


  } catch (error) {

    console.error(
      "Global Chat payment initiation failed:",
      error
    );


    paymentInProgress =
      false;


    if (paymentSubmit) {

      paymentSubmit.disabled =
        false;

      paymentSubmit.textContent =
        "Pay & Start Chat";

    }


    showToast(
      error.message ||
      "Unable to start payment."
    );

  }

}


/* =========================================================
   POLL GLOBAL CHAT PAYMENT
========================================================= */

async function pollGlobalChatPayment(
  paymentId,
  receiverId
) {

  const maxAttempts =
    30;

  let attempts =
    0;


  if (paymentPollingTimer) {

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
                  GLOBAL_CHAT_PAYMENT_STATUS,
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


              let data = null;


              try {

                data =
                  await response.json();

              } catch {

                data = null;

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


                /*
                 * Backend may return any of these
                 * successful states.
                 */

                if (
                  status === "completed" ||
                  status === "success" ||
                  data.paid === true ||
                  data.completed === true
                ) {

                  clearInterval(
                    paymentPollingTimer
                  );

                  paymentPollingTimer =
                    null;


                  paymentInProgress =
                    false;


                  if (paymentSubmit) {

                    paymentSubmit.textContent =
                      "Payment confirmed";

                  }


                  showToast(
                    "Payment confirmed. Opening conversation..."
                  );


                  /*
                   * Give Firestore/backend a short
                   * moment to finish creating/updating
                   * the conversation.
                   */

                  setTimeout(
                    () => {

                      openUnlockedConversation(
                        data,
                        receiverId
                      );


                      resolve(
                        true
                      );

                    },
                    500
                  );


                  return;

                }


                if (
                  status === "failed" ||
                  status === "cancelled" ||
                  status === "expired"
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
                      "Pay & Start Chat";

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

              console.error(
                "Global Chat payment status error:",
                error
              );

              /*
               * Don't immediately fail because of
               * a temporary network problem.
               */

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
                  "Pay & Start Chat";

              }


              showToast(
                "Payment confirmation timed out. If you completed payment, please check your chats shortly."
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
   OPEN UNLOCKED CONVERSATION
========================================================= */

function openUnlockedConversation(
  paymentData,
  receiverId
) {

  const conversationId =
    paymentData?.conversationId ||
    paymentData?.chatId ||
    paymentData?.conversation?.conversationId;


  closeChatPaymentModal();


  if (conversationId) {

    window.location.href =
      `chat.html?conversationId=${encodeURIComponent(
        conversationId
      )}`;

    return;

  }


  /*
   * Fallback for a chat page that accepts the
   * other user's UID.
   */

  if (receiverId) {

    window.location.href =
      `chat.html?uid=${encodeURIComponent(
        receiverId
      )}`;

    return;

  }


  showToast(
    "Payment completed, but the conversation could not be opened."
  );

}


/* =========================================================
   CHAT BUTTON
========================================================= */

function handleChatClick(userId) {

  if (!userId) {
    return;
  }


  if (
    userId ===
    currentUser?.uid
  ) {

    showToast(
      "You cannot start a Global Chat with yourself."
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
      "This user is no longer available."
    );

    return;

  }


  if (
    !isAvailableForGlobalChat(user)
  ) {

    showToast(
      "This person is currently unavailable for Global Chat."
    );

    return;

  }


  openChatPaymentModal(
    user
  );

}


/* =========================================================
   USER CARD CLICKS
========================================================= */

document.addEventListener(
  "click",
  event => {

    /*
     * Follow button.
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
     * Chat button.
     */

    const chatButton =
      event.target.closest(
        "[data-chat-id]"
      );


    if (chatButton) {

      event.preventDefault();

      event.stopPropagation();


      handleChatClick(
        chatButton.dataset.chatId
      );


      return;

    }


    /*
     * Profile.
     */

    const profileElement =
      event.target.closest(
        "[data-profile-id]"
      );


    if (profileElement) {

      const userId =
        profileElement.dataset.profileId;


      if (!userId) {
        return;
      }


      window.location.href =
        `profile.html?uid=${encodeURIComponent(
          userId
        )}`;

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
        "Connection feature coming soon."
      );

    }
  );

}


/* =========================================================
   PAYMENT SUBMIT
========================================================= */

if (paymentSubmit) {

  paymentSubmit.addEventListener(
    "click",
    initiateGlobalChatPayment
  );

}


/* =========================================================
   ENTER KEY IN PAYMENT PHONE
========================================================= */

if (paymentPhone) {

  paymentPhone.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        initiateGlobalChatPayment();

      }

    }
  );

}


/* =========================================================
   ESCAPE KEY
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

        closeChatPaymentModal();

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

        if (unsubscribeUsers) {

          unsubscribeUsers();

        }


        if (unsubscribeProfile) {

          unsubscribeProfile();

        }


        if (paymentPollingTimer) {

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


    currentUser =
      user;


    try {

      /*
       * Load the private profile only for
       * the logged-in user.
       */

      await loadCurrentProfile();


      /*
       * Listen to own profile.
       */

      listenToCurrentProfile();


      /*
       * Load PUBLIC profiles only.
       */

      listenToUsers();


      /*
       * Render initial UI.
       */

      renderCurrentTab();


    } catch (error) {

      console.error(
        "Global Chat startup error:",
        error
      );


      showToast(
        error.message ||
        "Unable to load Global Chat."
      );

    }

  }
);


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (unsubscribeUsers) {

      unsubscribeUsers();

    }


    if (unsubscribeProfile) {

      unsubscribeProfile();

    }


    if (paymentPollingTimer) {

      clearInterval(
        paymentPollingTimer
      );

    }

  }
);
