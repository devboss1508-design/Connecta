import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


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

let unsubscribeUsers = null;
let unsubscribeProfile = null;


/* =========================================================
   ELEMENTS
========================================================= */

const friendSearch =
  document.getElementById("friendSearch");

const discoverList =
  document.getElementById("discoverList");

const followingList =
  document.getElementById("followingList");

const followersList =
  document.getElementById("followersList");

const discoverCount =
  document.getElementById("discoverCount");

const followingListCount =
  document.getElementById("followingListCount");

const followersListCount =
  document.getElementById("followersListCount");

const followingCount =
  document.getElementById("followingCount");

const followersCount =
  document.getElementById("followersCount");

const toast =
  document.getElementById("friendsToast");

const menuBtn =
  document.getElementById("menuBtn");

const sideMenu =
  document.getElementById("sideMenu");

const menuOverlay =
  document.getElementById("menuOverlay");

const logoutBtn =
  document.getElementById("logoutBtn");

const profileBtn =
  document.getElementById("profileBtn");

const connectionBtn =
  document.getElementById("connectionBtn");

const balanceAmount =
  document.getElementById("balanceAmount");

const menuAvatar =
  document.getElementById("menuAvatar");

const menuName =
  document.getElementById("menuName");

const menuUsername =
  document.getElementById("menuUsername");


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

let toastTimer = null;


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
      2600
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
          src="${escapeHtml(currentProfile.photoURL)}"
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


  followingCount.textContent =
    Number(
      currentProfile.followingCount || 0
    );


  followersCount.textContent =
    Number(
      currentProfile.followersCount || 0
    );

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
   RENDER USER AVATAR
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
          src="${escapeHtml(user.photoURL)}"
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
   RENDER USER CARD
========================================================= */

function renderUserCard(user) {

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
          ${isOnline ? "● Online" : "○ Offline"}
        </div>

      </div>


      <button
        type="button"
        class="${followClass}"
        data-follow-id="${escapeHtml(userId)}"
      >
        ${followText}
      </button>

    </article>
  `;

}


/* =========================================================
   FILTER USERS
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


  return (
    name.includes(
      searchTerm
    ) ||
    username.includes(
      searchTerm
    )
  );

}


/* =========================================================
   SORT USERS
========================================================= */

function sortUsers(users) {

  return [...users].sort(
    (a, b) => {

      /*
       * Online users first.
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
   RENDER DISCOVER
========================================================= */

function renderDiscover() {

  const users =
    sortUsers(
      allUsers.filter(
        user =>
          user.uid !==
            currentUser.uid &&
          matchesSearch(user)
      )
    );


  discoverCount.textContent =
    users.length;


  if (!users.length) {

    discoverList.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          🔎
        </div>

        ${
          searchTerm
            ? "No CONNECTA users match your search."
            : "No other CONNECTA users found yet."
        }

      </div>
    `;

    return;

  }


  discoverList.innerHTML =
    users
      .map(renderUserCard)
      .join("");

}


/* =========================================================
   RENDER FOLLOWING
========================================================= */

function renderFollowing() {

  const followingIds =
    Array.isArray(
      currentProfile?.following
    )
      ? currentProfile.following
      : [];


  const users =
    sortUsers(
      allUsers.filter(
        user =>
          followingIds.includes(
            user.uid
          ) &&
          matchesSearch(user)
      )
    );


  followingListCount.textContent =
    users.length;


  if (!users.length) {

    followingList.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          👤
        </div>

        ${
          searchTerm
            ? "No followed users match your search."
            : "You are not following anyone yet."
        }

      </div>
    `;

    return;

  }


  followingList.innerHTML =
    users
      .map(renderUserCard)
      .join("");

}


/* =========================================================
   RENDER FOLLOWERS
========================================================= */

function renderFollowers() {

  const users =
    sortUsers(
      followerUsers.filter(
        user =>
          matchesSearch(user)
      )
    );


  followersListCount.textContent =
    users.length;


  if (!users.length) {

    followersList.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          👥
        </div>

        ${
          searchTerm
            ? "No followers match your search."
            : "You don't have any followers yet."
        }

      </div>
    `;

    return;

  }


  followersList.innerHTML =
    users
      .map(renderUserCard)
      .join("");

}


/* =========================================================
   RENDER CURRENT TAB
========================================================= */

function renderCurrentTab() {

  if (!currentUser || !currentProfile) {
    return;
  }


  renderDiscover();

  renderFollowing();

  renderFollowers();

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


  discoverSection.hidden =
    tabName !== "discover";


  followingSection.hidden =
    tabName !== "following";


  followersSection.hidden =
    tabName !== "followers";


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


  currentProfile =
    {
      uid:
        snapshot.id,

      ...snapshot.data()
    };


  renderHeaderProfile();

}


/* =========================================================
   LISTEN TO CURRENT PROFILE
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

        if (!snapshot.exists()) {
          return;
        }


        currentProfile =
          {
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
   LOAD USERS
========================================================= */

function listenToUsers() {

  const usersRef =
    collection(
      db,
      "users"
    );


  const usersQuery =
    query(
      usersRef,
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(100)
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
          "Users listener error:",
          error
        );


        /*
         * If createdAt index/query causes a problem,
         * try a simple collection listener.
         */

        listenToUsersFallback();

      }
    );

}


/* =========================================================
   USERS FALLBACK
========================================================= */

function listenToUsersFallback() {

  if (unsubscribeUsers) {

    unsubscribeUsers();

    unsubscribeUsers =
      null;

  }


  const usersRef =
    collection(
      db,
      "users"
    );


  unsubscribeUsers =
    onSnapshot(
      usersRef,
      snapshot => {

        allUsers =
          snapshot.docs
            .map(
              item => ({
                uid:
                  item.id,

                ...item.data()
              })
            )
            .slice(
              0,
              100
            );


        renderCurrentTab();

      },

      error => {

        console.error(
          "Users fallback listener error:",
          error
        );


        discoverList.innerHTML = `
          <div class="empty-state">

            <div class="empty-icon">
              ⚠️
            </div>

            Unable to load CONNECTA users.

          </div>
        `;

      }
    );

}


/* =========================================================
   LOAD FOLLOWERS
=========================================================

   Current user documents contain:

   followersCount
   followingCount

   The actual follower relationship is represented
   through the other users' following arrays.

   This function derives followers from loaded users.
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

          /*
           * UNFOLLOW
           */

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

          /*
           * FOLLOW
           */

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


    const wasFollowing =
      isFollowing(
        targetUserId
      );


    showToast(
      wasFollowing
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
   USER CARD CLICKS
========================================================= */

document.addEventListener(
  "click",
  event => {

    /*
     * Follow button
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
     * User profile
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
        `profile.html?uid=${encodeURIComponent(userId)}`;

    }

  }
);


/* =========================================================
   REFRESH FOLLOWERS AFTER USER DATA CHANGES
========================================================= */

const originalRenderCurrentTab =
  renderCurrentTab;


/*
 * Keep followerUsers synchronized whenever
 * allUsers changes.
 */

function syncFollowersAndRender() {

  buildFollowers();

  originalRenderCurrentTab();

}


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

      await loadCurrentProfile();


      /*
       * Start realtime profile listener.
       */

      listenToCurrentProfile();


      /*
       * Start users listener.
       */

      listenToUsers();

    } catch (error) {

      console.error(
        "Friends page startup error:",
        error
      );


      showToast(
        error.message ||
        "Unable to load Friends."
      );

    }

  }
);


/* =========================================================
   PERIODIC FOLLOWER SYNCHRONIZATION
========================================================= */

setInterval(
  () => {

    if (
      currentUser &&
      currentProfile &&
      allUsers.length
    ) {

      buildFollowers();


      /*
       * Re-render only the active view.
       */

      if (
        activeTab ===
        "followers"
      ) {

        renderFollowers();

      }

    }

  },
  1500
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

  }
);
