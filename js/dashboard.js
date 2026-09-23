/* =========================================================
   CONNECTA — DASHBOARD
   File: js/dashboard.js

   FEATURES
   - Firebase Authentication via globalAuth.js
   - Instant cache-first dashboard
   - Background Firestore synchronization
   - Private chats
   - Group chats
   - Group unread counts
   - members + memberIds group membership
   - Online/offline users
   - Follow / unfollow
   - Profile cache
   - Presence
   - Chat search
   - Online-user search
   - Account restriction handling
   - Private message status ticks
   - Verified badges
   - Mobile-friendly app behaviour

   IMPORTANT
   - No blocking "Loading..." screen
   - Cached content renders immediately
   - First visit uses lightweight skeleton animation
   - Firestore updates happen silently in background
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
  db
} from "./firebase.js";


/* =========================================================
   GLOBAL AUTH
========================================================= */

import {
  getCurrentConnectaUser,
  logout
} from "./globalAuth.js";


/* =========================================================
   FIRESTORE
========================================================= */

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
   BASIC HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let currentProfile = null;

let onlineUsers = [];

let recentChats = [];

let recentGroups = [];

let groupListeners = [];

let groupReadListeners = [];

let stopUsers = null;

let stopChats = null;

let presenceInterval = null;


/* =========================================================
   CACHE
========================================================= */

const DASHBOARD_CACHE_PREFIX =
  "connectaDashboardCache_v3_";

const PROFILE_CACHE_KEY =
  "connectaProfileCache";


/* =========================================================
   CACHE VERSION
========================================================= */

function getCacheKey(uid) {

  return `${DASHBOARD_CACHE_PREFIX}${uid}`;

}


/* =========================================================
   PUBLIC PROFILE DATA
========================================================= */

function publicProfileData(
  uid,
  profile = {}
) {

  return {

    uid,

    firstName:
      profile.firstName || "",

    lastName:
      profile.lastName || "",

    displayName:
      profile.displayName || "",

    username:
      profile.username || "",

    photoURL:
      profile.photoURL ||
      profile.photoUrl ||
      "",

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
   FULL NAME
========================================================= */

function getFullName(
  user = {},
  fallbackUser = null
) {

  const displayName =
    String(
      user.displayName || ""
    ).trim();


  if (
    displayName &&
    displayName.toLowerCase() !==
      "connecta user"
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


  const authName =
    String(
      fallbackUser?.displayName || ""
    ).trim();


  if (
    authName &&
    authName.toLowerCase() !==
      "connecta user"
  ) {

    return authName;

  }


  const username =
    String(
      user.username || ""
    )
      .trim()
      .replace(/^@/, "");


  if (username) {

    return username;

  }


  return "CONNECTA User";

}


/* =========================================================
   INITIALS
========================================================= */

function initials(
  name = "U"
) {

  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      part =>
        part[0]
    )
    .join("")
    .toUpperCase() || "U";

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
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character])
    );

}


/* =========================================================
   FIRESTORE DATE
========================================================= */

function timestampToDate(
  value
) {

  if (!value) {

    return null;

  }


  if (
    typeof value.toDate ===
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


  const date =
    new Date(value);


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;

}


/* =========================================================
   FORMAT TIME
========================================================= */

function formatTimestamp(
  timestamp
) {

  const date =
    timestampToDate(
      timestamp
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


  return date.toLocaleDateString(
    [],
    {
      day: "numeric",
      month: "short"
    }
  );

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message
) {

  const toast =
    $("toast");


  if (!toast) {

    return;

  }


  toast.textContent =
    message;


  toast.classList.add(
    "show"
  );


  clearTimeout(
    showToast.timer
  );


  showToast.timer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      2200
    );

}


/* =========================================================
   VERIFIED BADGE
========================================================= */

function verifiedBadge(
  user = {}
) {

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
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:18px;
        height:18px;
        margin-left:5px;
        border-radius:50%;
        background:#2196F3;
        color:#fff;
        font-size:11px;
        font-weight:800;
        line-height:1;
        vertical-align:middle;
        flex-shrink:0;
      "
    >✓</span>
  `;

}


/* =========================================================
   AVATAR
========================================================= */

function avatarMarkup(
  user = {},
  extra = ""
) {

  const name =
    getFullName(user);


  const photo =
    user.photoURL ||
    user.photoUrl ||
    "";


  return `
    <div class="avatar large ${extra}">
      ${
        photo
          ? `
            <img
              src="${escapeHtml(photo)}"
              alt="${escapeHtml(name)}"
              loading="lazy"
            >
          `
          : initials(name)
      }
    </div>
  `;

}


/* =========================================================
   DASHBOARD CACHE
========================================================= */

function getDashboardCache(
  uid
) {

  if (!uid) {

    return null;

  }


  try {

    const raw =
      localStorage.getItem(
        getCacheKey(uid)
      );


    if (!raw) {

      return null;

    }


    return JSON.parse(
      raw
    );

  } catch (error) {

    console.warn(
      "Dashboard cache read failed:",
      error
    );


    return null;

  }

}


/* =========================================================
   SAVE DASHBOARD CACHE
========================================================= */

function saveDashboardCache(
  uid
) {

  if (!uid) {

    return;

  }


  try {

    const safeProfile =
      currentProfile
        ? {
            ...publicProfileData(
              uid,
              currentProfile
            ),

            following:
              Array.isArray(
                currentProfile.following
              )
                ? currentProfile.following
                : []
          }
        : null;


    const cache = {

      profile:
        safeProfile,

      users:
        Array.isArray(
          onlineUsers
        )
          ? onlineUsers.map(
              user =>
                publicProfileData(
                  user.uid,
                  user
                )
            )
          : [],

      chats:
        Array.isArray(
          recentChats
        )
          ? recentChats
          : [],

      groups:
        Array.isArray(
          recentGroups
        )
          ? recentGroups
          : [],

      cachedAt:
        Date.now()

    };


    localStorage.setItem(

      getCacheKey(uid),

      JSON.stringify(
        cache
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


/* =========================================================
   SAVE PROFILE CACHE
========================================================= */

function saveProfileToCache(
  uid,
  profile
) {

  if (
    !uid ||
    !profile
  ) {

    return;

  }


  try {

    const cache =
      getProfileCache();


    cache[uid] = {

      ...publicProfileData(
        uid,
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

  } catch (error) {

    console.warn(
      "Profile cache save failed:",
      error
    );

  }

}


/* =========================================================
   GET PROFILE CACHE
========================================================= */

function getCachedProfile(
  uid
) {

  if (!uid) {

    return null;

  }


  try {

    const cache =
      getProfileCache();


    return (
      cache[uid] ||
      null
    );

  } catch {

    return null;

  }

}


/* =========================================================
   SKELETON
========================================================= */

function injectDashboardSkeletonStyle() {

  if (
    document.getElementById(
      "connectaDashboardSkeletonStyle"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "connectaDashboardSkeletonStyle";


  style.textContent = `

    @keyframes connectaSkeletonPulse {

      0% {
        opacity:.45;
      }

      50% {
        opacity:.9;
      }

      100% {
        opacity:.45;
      }

    }

    .connecta-skeleton {
      background:
        linear-gradient(
          90deg,
          rgba(226,232,240,.7),
          rgba(241,245,249,.95),
          rgba(226,232,240,.7)
        );

      background-size:200% 100%;

      animation:
        connectaSkeletonPulse 1.3s ease-in-out infinite;

      border-radius:12px;
    }

    .connecta-dashboard-skeleton {
      padding:10px 0;
    }

    .connecta-skeleton-chat {
      display:flex;
      align-items:center;
      gap:12px;
      padding:12px 4px;
    }

    .connecta-skeleton-avatar {
      width:48px;
      height:48px;
      border-radius:50%;
      flex-shrink:0;
    }

    .connecta-skeleton-lines {
      flex:1;
      min-width:0;
    }

    .connecta-skeleton-line {
      height:11px;
      margin-bottom:8px;
      max-width:75%;
    }

    .connecta-skeleton-line.short {
      max-width:45%;
    }

    .connecta-skeleton-online {
      display:flex;
      gap:10px;
      overflow:hidden;
      padding:8px 0;
    }

    .connecta-skeleton-user {
      width:78px;
      flex:0 0 78px;
      text-align:center;
    }

    .connecta-skeleton-user .connecta-skeleton-avatar {
      width:58px;
      height:58px;
      margin:0 auto 7px;
    }

  `;


  document.head.appendChild(
    style
  );

}


/* =========================================================
   SHOW NON-BLOCKING SKELETON
========================================================= */

function showDashboardSkeleton() {

  injectDashboardSkeletonStyle();


  const onlineBox =
    $("onlineUsers");


  if (
    onlineBox &&
    !onlineBox.children.length
  ) {

    onlineBox.innerHTML = `

      <div class="connecta-dashboard-skeleton">

        <div class="connecta-skeleton-online">

          ${Array.from(
            {
              length: 5
            }
          )
            .map(
              () => `
                <div
                  class="connecta-skeleton-user"
                >

                  <div
                    class="
                      connecta-skeleton
                      connecta-skeleton-avatar
                    "
                  ></div>

                  <div
                    class="
                      connecta-skeleton
                      connecta-skeleton-line
                      short
                    "
                    style="
                      margin:0 auto;
                    "
                  ></div>

                </div>
              `
            )
            .join("")}

        </div>

      </div>

    `;

  }


  const chatBox =
    $("chatList");


  if (
    chatBox &&
    !chatBox.children.length
  ) {

    chatBox.innerHTML = `

      <div class="connecta-dashboard-skeleton">

        ${Array.from(
          {
            length: 4
          }
        )
          .map(
            () => `
              <div
                class="connecta-skeleton-chat"
              >

                <div
                  class="
                    connecta-skeleton
                    connecta-skeleton-avatar
                  "
                ></div>

                <div
                  class="
                    connecta-skeleton-lines
                  "
                >

                  <div
                    class="
                      connecta-skeleton
                      connecta-skeleton-line
                    "
                  ></div>

                  <div
                    class="
                      connecta-skeleton
                      connecta-skeleton-line
                      short
                    "
                  ></div>

                </div>

              </div>
            `
          )
          .join("")}

      </div>

    `;

  }

}


/* =========================================================
   REMOVE SKELETON IF REAL DATA EXISTS
========================================================= */

function removeDashboardSkeleton(
  element
) {

  if (!element) {

    return;

  }


  const skeleton =
    element.querySelector(
      ".connecta-dashboard-skeleton"
    );


  if (skeleton) {

    skeleton.remove();

  }

}


/* =========================================================
   LOAD DASHBOARD CACHE
========================================================= */

function loadDashboardCache(
  uid
) {

  const cache =
    getDashboardCache(uid);


  if (!cache) {

    return false;

  }


  let hasData =
    false;


  /* PROFILE */

  if (
    cache.profile &&
    typeof cache.profile ===
      "object"
  ) {

    currentProfile =
      cache.profile;


    renderProfile(
      currentProfile
    );


    hasData =
      true;

  }


  /* USERS */

  if (
    Array.isArray(
      cache.users
    ) &&
    cache.users.length
  ) {

    onlineUsers =
      cache.users.map(
        user =>
          publicProfileData(
            user.uid,
            user
          )
      );


    renderOnline(
      $("onlineSearch")?.value ||
      ""
    );


    hasData =
      true;

  }


  /* PRIVATE CHATS */

  if (
    Array.isArray(
      cache.chats
    )
  ) {

    recentChats =
      cache.chats;


    hasData =
      true;

  }


  /* GROUP CHATS */

  if (
    Array.isArray(
      cache.groups
    )
  ) {

    recentGroups =
      cache.groups;


    hasData =
      true;

  }


  /* RENDER EVERYTHING TOGETHER */

  if (
    recentChats.length ||
    recentGroups.length
  ) {

    mergeRecentChats();

  }


  return hasData;

}


/* =========================================================
   ACCOUNT CONTROL
========================================================= */

function getAccountControl(
  profile = {}
) {

  const status =
    String(
      profile.status ||
      "active"
    )
      .toLowerCase()
      .trim();


  if (
    status === "banned"
  ) {

    return {

      blocked:
        true,

      status:
        "banned",

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

      message:
        "Your CONNECTA account is currently suspended."

    };

  }


  return {

    blocked:
      false,

    status:
      "active",

    message:
      ""

  };

}


/* =========================================================
   ACCOUNT BLOCK SCREEN
========================================================= */

function showAccountBlockedScreen(
  control
) {

  stopDashboardListeners();


  const message =
    escapeHtml(
      control?.message ||
      "Your CONNECTA account is currently restricted."
    );


  document.body.innerHTML = `

    <div
      style="
        min-height:100vh;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px;
        background:#f4faf6;
        font-family:Arial,sans-serif;
      "
    >

      <div
        style="
          width:100%;
          max-width:420px;
          background:#fff;
          border-radius:22px;
          padding:30px 24px;
          text-align:center;
          box-shadow:0 12px 40px rgba(0,0,0,.08);
        "
      >

        <div
          style="
            width:64px;
            height:64px;
            margin:0 auto 18px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#fee2e2;
            color:#dc2626;
            font-size:28px;
            font-weight:800;
          "
        >
          !
        </div>

        <h1
          style="
            margin:0 0 10px;
            color:#17221b;
            font-size:22px;
          "
        >
          Account Restricted
        </h1>

        <p
          style="
            margin:0;
            color:#647067;
            font-size:14px;
            line-height:1.6;
          "
        >
          ${message}
        </p>

        <p
          style="
            margin:16px 0 24px;
            color:#7b857e;
            font-size:13px;
            line-height:1.5;
          "
        >
          If you believe this action was made in error,
          please contact CONNECTA support.
        </p>

        <button
          id="restrictedLogoutBtn"
          type="button"
          style="
            width:100%;
            border:0;
            border-radius:12px;
            padding:13px 16px;
            background:#22c55e;
            color:#fff;
            font-size:14px;
            font-weight:800;
            cursor:pointer;
          "
        >
          Log Out
        </button>

      </div>

    </div>

  `;


  $("restrictedLogoutBtn")
    ?.addEventListener(
      "click",
      async () => {

        await logout(
          true
        );

      }
    );

}


/* =========================================================
   CURRENT PROFILE
========================================================= */

function renderProfile(
  profile
) {

  currentProfile =
    profile || {};


  const name =
    getFullName(
      currentProfile,
      currentUser
    );


  const username =
    currentProfile.username

      ? `@${String(
          currentProfile.username
        ).replace(/^@/, "")}`

      : "@username";


  const init =
    initials(name);


  const welcomeName =
    $("welcomeName");


  if (welcomeName) {

    welcomeName.textContent =
      name;

  }


  const welcomeAvatar =
    $("welcomeAvatar");


  if (welcomeAvatar) {

    welcomeAvatar.innerHTML =

      currentProfile.photoURL

        ? `
          <img
            src="${escapeHtml(
              currentProfile.photoURL
            )}"
            alt="${escapeHtml(name)}"
          >
        `

        : init;

  }


  const profileBtn =
    $("profileBtn");


  if (profileBtn) {

    profileBtn.innerHTML =

      currentProfile.photoURL

        ? `
          <img
            src="${escapeHtml(
              currentProfile.photoURL
            )}"
            alt="${escapeHtml(name)}"
          >
        `

        : init;

  }


  const menuAvatar =
    $("menuAvatar");


  if (menuAvatar) {

    menuAvatar.innerHTML =

      currentProfile.photoURL

        ? `
          <img
            src="${escapeHtml(
              currentProfile.photoURL
            )}"
            alt="${escapeHtml(name)}"
          >
        `

        : init;

  }


  const menuName =
    $("menuName");


  if (menuName) {

    menuName.textContent =
      name;

  }


  const menuUsername =
    $("menuUsername");


  if (menuUsername) {

    menuUsername.textContent =
      username;

  }


  const balanceAmount =
    $("balanceAmount");


  if (balanceAmount) {

    const balance =
      Number(
        currentProfile.balance ||
        0
      );


    balanceAmount.textContent =
      balance.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits:2,
          maximumFractionDigits:2
        }
      );

  }

}


/* =========================================================
   ONLINE USERS
========================================================= */

function renderOnline(
  filter = ""
) {

  const box =
    $("onlineUsers");


  if (!box) {

    return;

  }


  removeDashboardSkeleton(
    box
  );


  const term =
    String(
      filter || ""
    )
      .trim()
      .toLowerCase();


  const list =
    [...onlineUsers]
      .filter(
        user => {

          const fullName =
            getFullName(
              user,
              user.uid ===
                currentUser?.uid
                ? currentUser
                : null
            );


          const haystack =
            `${fullName}
             ${user.username || ""}
             ${user.bio || ""}`
              .toLowerCase();


          return (
            !term ||
            haystack.includes(term)
          );

        }
      )
      .sort(
        (a,b) => {

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


          return 0;

        }
      );


  const onlineCount =
    onlineUsers.filter(
      user =>
        user.isOnline === true
    ).length;


  const countElement =
    $("onlineCount");


  if (countElement) {

    countElement.textContent =
      `(${onlineCount})`;

  }


  if (!list.length) {

    box.innerHTML = `

      <div class="empty-state small">
        No users found.
      </div>

    `;

    return;

  }


  box.innerHTML =
    list.map(
      user => {

        const isMe =
          user.uid ===
          currentUser?.uid;


        const name =
          getFullName(
            user,
            isMe
              ? currentUser
              : null
          );


        const isOnline =
          user.isOnline === true;


        const statusClass =
          isOnline
            ? "online"
            : "offline";


        const statusText =
          isMe
            ? "online • you"
            : isOnline
              ? "online"
              : "offline";


        const following =
          Array.isArray(
            currentProfile?.following
          ) &&
          currentProfile.following.includes(
            user.uid
          );


        return `

          <article
            class="user-card"
            data-user-profile="${escapeHtml(
              user.uid
            )}"
          >

            <div class="user-card-profile">

              ${avatarMarkup(
                user,
                user.photoURL
                  ? ""
                  : "avatar-green"
              )}

              <strong>

                ${escapeHtml(
                  name
                )}

                ${verifiedBadge(
                  user
                )}

              </strong>

              <small
                class="online-text ${statusClass}"
              >

                <span
                  class="status-dot ${statusClass}"
                ></span>

                ${escapeHtml(
                  statusText
                )}

              </small>

            </div>

            ${
              isMe

                ? `

                  <button
                    class="following"
                    disabled
                  >
                    You
                  </button>

                `

                : `

                  <button
                    class="${
                      following
                        ? "following"
                        : ""
                    }"
                    data-follow="${escapeHtml(
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
            }

          </article>

        `;

      }
    ).join("");


  box
    .querySelectorAll(
      "[data-follow]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async event => {

            event.stopPropagation();


            await toggleFollow(
              button.dataset.follow
            );

          }
        );

      }
    );


  box
    .querySelectorAll(
      "[data-user-profile]"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          event => {

            if (
              event.target.closest(
                "[data-follow]"
              )
            ) {

              return;

            }


            const uid =
              card.dataset.userProfile;


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

}


/* =========================================================
   FOLLOW / UNFOLLOW
========================================================= */

async function toggleFollow(
  targetUid
) {

  if (
    !currentUser ||
    !targetUid ||
    targetUid ===
      currentUser.uid
  ) {

    return;

  }


  const currentUid =
    currentUser.uid;


  const currentRef =
    doc(
      db,
      "users",
      currentUid
    );


  const targetRef =
    doc(
      db,
      "users",
      targetUid
    );


  try {

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


        let following =
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

          following =
            following.filter(
              uid =>
                uid !== targetUid
            );


          const index =
            targetFollowers.indexOf(
              currentUid
            );


          if (index >= 0) {

            targetFollowers.splice(
              index,
              1
            );

          }

        } else {

          following.push(
            targetUid
          );


          if (
            !targetFollowers.includes(
              currentUid
            )
          ) {

            targetFollowers.push(
              currentUid
            );

          }

        }


        transaction.update(
          currentRef,
          {

            following,

            followingCount:
              following.length

          }
        );


        transaction.update(
          targetRef,
          {

            followers:
              targetFollowers,

            followersCount:
              targetFollowers.length

          }
        );


        currentProfile = {

          ...currentProfile,

          following,

          followingCount:
            following.length

        };


        const targetIndex =
          onlineUsers.findIndex(
            user =>
              user.uid ===
              targetUid
          );


        if (
          targetIndex >= 0
        ) {

          onlineUsers[
            targetIndex
          ] = {

            ...onlineUsers[
              targetIndex
            ],

            followersCount:
              targetFollowers.length

          };

        }

      }
    );


    saveProfileToCache(
      currentUid,
      currentProfile
    );


    renderProfile(
      currentProfile
    );


    renderOnline(
      $("onlineSearch")?.value ||
      ""
    );


    saveDashboardCache(
      currentUid
    );


    showToast(

      Array.isArray(
        currentProfile.following
      ) &&
      currentProfile.following.includes(
        targetUid
      )

        ? "Following user"

        : "Unfollowed user"

    );

  } catch (error) {

    console.error(
      "Follow error:",
      error
    );


    showToast(
      "Could not update follow status"
    );

  }

}


/* =========================================================
   PROFILE LOOKUP
========================================================= */

async function getUserProfile(
  uid
) {

  if (!uid) {

    return {};

  }


  const liveUser =
    onlineUsers.find(
      user =>
        user.uid === uid
    );


  if (liveUser) {

    saveProfileToCache(
      uid,
      liveUser
    );


    return liveUser;

  }


  const cached =
    getCachedProfile(uid);


  if (cached) {

    refreshUserProfile(
      uid
    );


    return cached;

  }


  try {

    const snap =
      await getDoc(
        doc(
          db,
          "users",
          uid
        )
      );


    if (
      snap.exists()
    ) {

      const profile = {

        uid,

        ...publicProfileData(
          uid,
          snap.data()
        )

      };


      saveProfileToCache(
        uid,
        profile
      );


      return profile;

    }

  } catch (error) {

    console.warn(
      "Could not load user profile:",
      error
    );

  }


  return {};

}


/* =========================================================
   BACKGROUND PROFILE REFRESH
========================================================= */

async function refreshUserProfile(
  uid
) {

  try {

    const snap =
      await getDoc(
        doc(
          db,
          "users",
          uid
        )
      );


    if (
      !snap.exists()
    ) {

      return;

    }


    const profile =
      publicProfileData(
        uid,
        snap.data()
      );


    saveProfileToCache(
      uid,
      profile
    );


    const index =
      onlineUsers.findIndex(
        user =>
          user.uid === uid
      );


    if (index >= 0) {

      onlineUsers[index] = {

        ...onlineUsers[index],

        ...profile

      };

    }


    recentChats =
      recentChats.map(
        chat => {

          if (
            chat.otherUid !== uid
          ) {

            return chat;

          }


          return {

            ...chat,

            name:
              getFullName(
                profile
              ),

            username:
              profile.username ||
              "",

            photoURL:
              profile.photoURL ||
              "",

            isVerified:
              profile.isVerified ===
              true

          };

        }
      );


    renderOnline(
      $("onlineSearch")?.value ||
      ""
    );


    mergeRecentChats();


    if (currentUser) {

      saveDashboardCache(
        currentUser.uid
      );

    }

  } catch (error) {

    console.warn(
      "Background profile refresh failed:",
      error
    );

  }

}


/* =========================================================
   GROUP UNREAD COUNT
========================================================= */

async function getGroupUnreadCount(
  groupId,
  lastReadAt
) {

  if (
    !groupId ||
    !lastReadAt
  ) {

    return 0;

  }


  const readDate =
    timestampToDate(
      lastReadAt
    );


  if (!readDate) {

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


    const unreadQuery =
      query(

        messagesRef,

        where(
          "createdAt",
          ">",
          readDate
        ),

        limit(100)

      );


    const snapshot =
      await getDocs(
        unreadQuery
      );


    return snapshot.docs.filter(
      messageDoc => {

        const data =
          messageDoc.data();


        return (
          data.senderId !==
          currentUser?.uid
        );

      }
    ).length;

  } catch (error) {

    console.warn(
      "Could not calculate group unread count:",
      groupId,
      error
    );


    return 0;

  }

}


/* =========================================================
   PRIVATE + GROUP CHAT RENDERER
========================================================= */

function renderChats(
  chats = [],
  filter = ""
) {

  const box =
    $("chatList");


  if (!box) {

    return;

  }


  removeDashboardSkeleton(
    box
  );


  const term =
    String(
      filter || ""
    )
      .trim()
      .toLowerCase();


  const filtered =
    chats.filter(
      chat => {

        const searchText =
          `${chat.name || ""}
           ${chat.lastMessage || ""}
           ${chat.username || ""}
           ${chat.type || ""}`
            .toLowerCase();


        return (
          !term ||
          searchText.includes(
            term
          )
        );

      }
    );


  if (!filtered.length) {

    box.innerHTML = `

      <div class="empty-state">

        ${
          term
            ? "No matching chats."
            : "No conversations yet."
        }

      </div>

    `;

    return;

  }


  box.innerHTML =
    filtered
      .map(
        chat => {

          const isGroup =
            chat.type ===
            "group";


          const otherUid =
            chat.otherUid ||
            "";


          const groupId =
            chat.groupId ||
            "";


          const href =
            isGroup

              ? `group-chat.html?groupId=${encodeURIComponent(
                  groupId
                )}`

              : otherUid

                ? `chat.html?uid=${encodeURIComponent(
                    otherUid
                  )}`

                : "#";


          const unread =
            Number(
              chat.unread ||
              0
            );


          const unreadBadge =
            unread > 0

              ? `

                <span
                  class="unread"
                  aria-label="${unread} unread messages"
                  style="
                    min-width:22px;
                    height:22px;
                    padding:0 7px;
                    margin-top:5px;
                    border-radius:999px;
                    background:#22c55e;
                    color:#fff;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:11px;
                    line-height:22px;
                    font-weight:800;
                    flex-shrink:0;
                    box-sizing:border-box;
                  "
                >
                  ${
                    unread > 99
                      ? "99+"
                      : unread
                  }
                </span>

              `

              : "";


          const name =
            chat.name ||
            (
              isGroup
                ? "CONNECTA Group"
                : "CONNECTA User"
            );


          let preview =
            chat.lastMessage ||
            "No messages yet";


          if (
            chat.lastMessageType ===
              "image" ||
            chat.lastMessageType ===
              "photo"
          ) {

            preview =
              "📷 Photo";

          } else if (
            chat.lastMessageType ===
            "video"
          ) {

            preview =
              "🎥 Video";

          } else if (
            chat.lastMessageType ===
            "file"
          ) {

            preview =
              "📎 File";

          }


          if (
            isGroup &&
            chat.lastMessageSenderName &&
            chat.lastMessage
          ) {

            preview =
              `${chat.lastMessageSenderName}: ${preview}`;

          }


          let messageStatus =
            "";


          if (
            !isGroup &&
            chat.lastMessageSenderId ===
              currentUser?.uid
          ) {

            if (
              chat.lastMessageRead ===
              true
            ) {

              messageStatus = `

                <span
                  class="message-status"
                  aria-label="Read"
                  title="Read"
                  style="
                    margin-left:4px;
                    font-size:13px;
                    font-weight:900;
                    color:#2196F3;
                    letter-spacing:-4px;
                    display:inline-block;
                  "
                >
                  ✓✓
                </span>

              `;

            } else if (
              chat.lastMessageDelivered ===
              true
            ) {

              messageStatus = `

                <span
                  class="message-status"
                  aria-label="Delivered"
                  title="Delivered"
                  style="
                    margin-left:4px;
                    font-size:13px;
                    font-weight:900;
                    color:#8b949e;
                    letter-spacing:-4px;
                    display:inline-block;
                  "
                >
                  ✓✓
                </span>

              `;

            } else {

              messageStatus = `

                <span
                  class="message-status"
                  aria-label="Sent"
                  title="Sent"
                  style="
                    margin-left:4px;
                    font-size:13px;
                    font-weight:900;
                    color:#8b949e;
                    display:inline-block;
                  "
                >
                  ✓
                </span>

              `;

            }

          }


          return `

            <a
              class="chat-item"
              href="${href}"
              data-chat-id="${escapeHtml(
                chat.id ||
                groupId ||
                ""
              )}"
              data-chat-type="${escapeHtml(
                chat.type ||
                "individual"
              )}"
            >

              <div class="avatar ${
                chat.color || ""
              }">

                ${
                  chat.photoURL

                    ? `

                      <img
                        src="${escapeHtml(
                          chat.photoURL
                        )}"
                        alt="${escapeHtml(
                          name
                        )}"
                        loading="lazy"
                      >

                    `

                    : initials(name)

                }

              </div>


              <div
                class="chat-copy"
                style="
                  min-width:0;
                  flex:1;
                "
              >

                <strong
                  style="
                    display:flex;
                    align-items:center;
                    min-width:0;
                  "
                >

                  <span
                    style="
                      white-space:nowrap;
                      overflow:hidden;
                      text-overflow:ellipsis;
                    "
                  >
                    ${escapeHtml(name)}
                  </span>

                  ${
                    !isGroup
                      ? verifiedBadge(
                          chat
                        )
                      : ""
                  }

                </strong>


                <p
                  style="
                    display:flex;
                    align-items:center;
                    min-width:0;
                    margin:3px 0 0;
                  "
                >

                  <span
                    style="
                      min-width:0;
                      overflow:hidden;
                      text-overflow:ellipsis;
                      white-space:nowrap;
                    "
                  >
                    ${escapeHtml(
                      preview
                    )}
                  </span>

                  ${messageStatus}

                </p>

              </div>


              <div
                class="chat-meta"
                style="
                  margin-left:auto;
                  display:flex;
                  flex-direction:column;
                  align-items:flex-end;
                  justify-content:center;
                  min-width:40px;
                "
              >

                <time>
                  ${escapeHtml(
                    chat.time ||
                    ""
                  )}
                </time>

                ${unreadBadge}

              </div>

            </a>

          `;

        }
      )
      .join("");

}


/* =========================================================
   MERGE PRIVATE + GROUP CHATS
========================================================= */

function mergeRecentChats() {

  const allChats = [

    ...recentChats,

    ...recentGroups

  ];


  allChats.sort(
    (a,b) => {

      const aDate =
        timestampToDate(
          a.lastMessageAt
        );


      const bDate =
        timestampToDate(
          b.lastMessageAt
        );


      if (
        aDate &&
        bDate
      ) {

        return (
          bDate.getTime() -
          aDate.getTime()
        );

      }


      if (aDate) {

        return -1;

      }


      if (bDate) {

        return 1;

      }


      return (
        Number(
          b.unread || 0
        ) -
        Number(
          a.unread || 0
        )
      );

    }
  );


  renderChats(
    allChats,
    $("chatSearch")?.value ||
    ""
  );


  if (currentUser) {

    saveDashboardCache(
      currentUser.uid
    );

  }

}


/* =========================================================
   LISTEN TO PRIVATE CHATS
========================================================= */

async function listenToChats(
  uid
) {

  try {

    const chatsQuery =
      query(

        collection(
          db,
          "chats"
        ),

        orderBy(
          "updatedAt",
          "desc"
        ),

        limit(50)

      );


    stopChats =
      onSnapshot(

        chatsQuery,

        snapshot => {

          const chats = [];


          snapshot.forEach(
            snap => {

              const data =
                snap.data();


              if (
                !Array.isArray(
                  data.participants
                )
              ) {

                return;

              }


              if (
                !data.participants.includes(
                  uid
                )
              ) {

                return;

              }


              const otherUid =
                data.participants.find(
                  participantUid =>
                    participantUid !==
                    uid
                );


              if (!otherUid) {

                return;

              }


              const knownUser =
                onlineUsers.find(
                  user =>
                    user.uid ===
                    otherUid
                );


              const cachedUser =
                knownUser ||
                getCachedProfile(
                  otherUid
                );


              const name =
                cachedUser

                  ? getFullName(
                      cachedUser
                    )

                  : (
                      data.otherUserName ||
                      "CONNECTA User"
                    );


              const photoURL =
                cachedUser?.photoURL ||
                data.photoURL ||
                data.otherUserPhotoURL ||
                "";


              const unreadCount =
                Number(
                  data.unreadCount?.[uid] ??
                  data.unread?.[uid] ??
                  0
                );


              const lastMessageSenderId =
                data.lastMessageSenderId ||
                data.senderId ||
                data.lastSenderId ||
                "";


              const lastMessageDelivered =
                data.lastMessageDelivered ===
                  true ||
                data.delivered === true ||
                data.lastDelivered === true;


              const lastMessageRead =
                data.lastMessageRead ===
                  true ||
                data.read === true ||
                data.lastRead === true;


              const lastMessageType =
                data.lastMessageType ||
                data.messageType ||
                data.type ||
                "text";


              chats.push({

                id:
                  snap.id,

                type:
                  "individual",

                otherUid,

                name,

                username:
                  cachedUser?.username ||
                  "",

                photoURL,

                isVerified:
                  cachedUser?.isVerified ===
                  true,

                lastMessage:
                  data.lastMessage ||
                  "",

                lastMessageType,

                lastMessageSenderId,

                lastMessageDelivered,

                lastMessageRead,

                lastMessageSenderName:
                  data.lastMessageSenderName ||
                  data.senderName ||
                  name,

                lastMessageAt:
                  data.lastMessageAt ||
                  data.updatedAt ||
                  null,

                time:
                  formatTimestamp(
                    data.lastMessageAt ||
                    data.updatedAt
                  ),

                unread:
                  unreadCount,

                href:
                  `chat.html?uid=${encodeURIComponent(
                    otherUid
                  )}`

              });

            }
          );


          /*
           * Keep unread conversations
           * visible near the top.
           */

          chats.sort(
            (a,b) => {

              const unreadDifference =
                Number(
                  b.unread || 0
                ) -
                Number(
                  a.unread || 0
                );


              if (
                unreadDifference !== 0
              ) {

                return unreadDifference;

              }


              const aDate =
                timestampToDate(
                  a.lastMessageAt
                );


              const bDate =
                timestampToDate(
                  b.lastMessageAt
                );


              if (
                aDate &&
                bDate
              ) {

                return (
                  bDate.getTime() -
                  aDate.getTime()
                );

              }


              return 0;

            }
          );


          recentChats =
            chats;


          mergeRecentChats();

        },

        error => {

          console.error(
            "Chats listener error:",
            error
          );

        }

      );

  } catch (error) {

    console.error(
      "Could not listen to chats:",
      error
    );

  }

}


/* =========================================================
   LISTEN TO GROUPS
========================================================= */

async function listenToGroups(
  uid
) {

  if (!uid) {

    return;

  }


  /*
   * Clean previous listeners.
   */

  groupListeners.forEach(
    unsubscribe => {

      try {

        unsubscribe();

      } catch {}

    }
  );


  groupListeners = [];


  groupReadListeners.forEach(
    unsubscribe => {

      try {

        unsubscribe();

      } catch {}

    }
  );


  groupReadListeners = [];


  recentGroups = [];


  /* =======================================================
     GROUP MEMBERSHIP
  ======================================================= */

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


  let memberIdsGroups = [];

  let membersGroups = [];

  let ownerGroups = [];


  /* =======================================================
     PROCESS GROUPS
  ======================================================= */

  const processGroups =
    async () => {

      const groupMap =
        new Map();


      [

        ...memberIdsGroups,

        ...membersGroups,

        ...ownerGroups

      ].forEach(
        group => {

          if (
            group?.groupId
          ) {

            groupMap.set(
              group.groupId,
              group
            );

          }

        }
      );


      const groups =
        [
          ...groupMap.values()
        ];


      const enriched =
        await Promise.all(

          groups.map(
            async group => {

              let readData =
                null;


              try {

                const readSnap =
                  await getDoc(

                    doc(
                      db,
                      "groups",
                      group.groupId,
                      "reads",
                      uid
                    )

                  );


                if (
                  readSnap.exists()
                ) {

                  readData =
                    readSnap.data();

                }

              } catch (error) {

                console.warn(
                  "Group read state error:",
                  error
                );

              }


              const unread =
                await getGroupUnreadCount(

                  group.groupId,

                  readData?.lastReadAt ||
                  null

                );


              const senderUid =
                group.lastMessageSenderId ||
                "";


              let senderProfile =
                onlineUsers.find(
                  user =>
                    user.uid ===
                    senderUid
                );


              if (
                !senderProfile &&
                senderUid
              ) {

                senderProfile =
                  getCachedProfile(
                    senderUid
                  );

              }


              return {

                id:
                  `group_${group.groupId}`,

                type:
                  "group",

                groupId:
                  group.groupId,

                name:
                  group.name ||
                  "CONNECTA Group",

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
                  senderUid,

                lastMessageSenderName:
                  group.lastMessageSenderName ||
                  (
                    senderProfile
                      ? getFullName(
                          senderProfile
                        )
                      : "User"
                  ),

                lastMessageSenderVerified:
                  senderProfile?.isVerified ===
                  true,

                lastMessageAt:
                  group.lastMessageAt ||
                  group.updatedAt ||
                  null,

                time:
                  formatTimestamp(
                    group.lastMessageAt ||
                    group.updatedAt
                  ),

                unread,

                readData

              };

            }
          )

        );


      recentGroups =
        enriched;


      mergeRecentChats();

    };


  /* =======================================================
     FIRST LOAD
  ======================================================= */

  try {

    const [

      memberIdsSnapshot,

      membersSnapshot,

      ownerSnapshot

    ] = await Promise.all([

      getDocs(
        memberIdsQuery
      ),

      getDocs(
        membersQuery
      ),

      getDocs(
        ownerQuery
      )

    ]);


    memberIdsGroups =
      memberIdsSnapshot.docs.map(
        snap => ({

          groupId:
            snap.id,

          ...snap.data()

        })
      );


    membersGroups =
      membersSnapshot.docs.map(
        snap => ({

          groupId:
            snap.id,

          ...snap.data()

        })
      );


    ownerGroups =
      ownerSnapshot.docs.map(
        snap => ({

          groupId:
            snap.id,

          ...snap.data()

        })
      );


    await processGroups();

  } catch (error) {

    console.error(
      "Could not load groups:",
      error
    );

  }


  /* =======================================================
     LIVE MEMBERIDS LISTENER
  ======================================================= */

  const memberIdsUnsubscribe =
    onSnapshot(

      memberIdsQuery,

      async snapshot => {

        memberIdsGroups =
          snapshot.docs.map(
            snap => ({

              groupId:
                snap.id,

              ...snap.data()

            })
          );


        await processGroups();

      },

      error => {

        console.warn(
          "MemberIds groups listener error:",
          error
        );

      }

    );


  groupListeners.push(
    memberIdsUnsubscribe
  );


  /* =======================================================
     LIVE MEMBERS LISTENER
  ======================================================= */

  const membersUnsubscribe =
    onSnapshot(

      membersQuery,

      async snapshot => {

        membersGroups =
          snapshot.docs.map(
            snap => ({

              groupId:
                snap.id,

              ...snap.data()

            })
          );


        await processGroups();

      },

      error => {

        console.warn(
          "Members groups listener error:",
          error
        );

      }

    );


  groupListeners.push(
    membersUnsubscribe
  );


  /* =======================================================
     LIVE OWNER LISTENER
  ======================================================= */

  const ownerUnsubscribe =
    onSnapshot(

      ownerQuery,

      async snapshot => {

        ownerGroups =
          snapshot.docs.map(
            snap => ({

              groupId:
                snap.id,

              ...snap.data()

            })
          );


        await processGroups();

      },

      error => {

        console.warn(
          "Owner groups listener error:",
          error
        );

      }

    );


  groupListeners.push(
    ownerUnsubscribe
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
          online,

        lastSeen:
          serverTimestamp()

      },

      {
        merge:true
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

  if (
    presenceInterval
  ) {

    clearInterval(
      presenceInterval
    );

  }


  setPresence(
    true
  );


  presenceInterval =
    setInterval(
      () => {

        setPresence(
          true
        );

      },
      45000
    );

}


/* =========================================================
   STOP LISTENERS
========================================================= */

function stopDashboardListeners() {

  groupListeners.forEach(
    unsubscribe => {

      try {

        unsubscribe();

      } catch {}

    }
  );


  groupListeners = [];


  groupReadListeners.forEach(
    unsubscribe => {

      try {

        unsubscribe();

      } catch {}

    }
  );


  groupReadListeners = [];


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


  if (presenceInterval) {

    clearInterval(
      presenceInterval
    );

    presenceInterval =
      null;

  }

}


/* =========================================================
   UI SETUP
========================================================= */

function setupUI() {

  /* =======================================================
     MENU
  ======================================================= */

  const menuBtn =
    $("menuBtn");

  const sideMenu =
    $("sideMenu");

  const menuOverlay =
    $("menuOverlay");


  if (
    menuBtn &&
    sideMenu &&
    menuOverlay
  ) {

    menuBtn.addEventListener(
      "click",
      () => {

        sideMenu.classList.add(
          "open"
        );

        sideMenu.setAttribute(
          "aria-hidden",
          "false"
        );

        menuOverlay.classList.add(
          "open"
        );

      }
    );


    const closeMenu =
      () => {

        sideMenu.classList.remove(
          "open"
        );

        sideMenu.setAttribute(
          "aria-hidden",
          "true"
        );

        menuOverlay.classList.remove(
          "open"
        );

      };


    menuOverlay.addEventListener(
      "click",
      closeMenu
    );

  }


  /* =======================================================
     PROFILE
  ======================================================= */

  const profileBtn =
    $("profileBtn");


  if (profileBtn) {

    profileBtn.addEventListener(
      "click",
      () => {

        if (!currentUser) {

          return;

        }


        location.href =
          `profile.html?uid=${encodeURIComponent(
            currentUser.uid
          )}`;

      }
    );

  }


  /* =======================================================
     CONNECTION
  ======================================================= */

  const connectionBtn =
    $("connectionBtn");


  if (connectionBtn) {

    connectionBtn.addEventListener(
      "click",
      () => {

        showToast(
          "Connection feature will be connected next."
        );

      }
    );

  }


  /* =======================================================
     ONLINE SEARCH
  ======================================================= */

  const onlineSearchBtn =
    $("onlineSearchBtn");

  const onlineSearchWrap =
    $("onlineSearchWrap");

  const onlineSearch =
    $("onlineSearch");


  if (
    onlineSearchBtn &&
    onlineSearchWrap
  ) {

    onlineSearchBtn.addEventListener(
      "click",
      () => {

        onlineSearchWrap.classList.toggle(
          "open"
        );


        if (
          onlineSearchWrap.classList.contains(
            "open"
          )
        ) {

          onlineSearch?.focus();

        }

      }
    );

  }


  if (onlineSearch) {

    onlineSearch.addEventListener(
      "input",
      event => {

        renderOnline(
          event.target.value
        );

      }
    );

  }


  /* =======================================================
     CHAT SEARCH
  ======================================================= */

  const chatSearchBtn =
    $("chatSearchBtn");

  const chatSearchWrap =
    $("chatSearchWrap");

  const chatSearch =
    $("chatSearch");


  if (
    chatSearchBtn &&
    chatSearchWrap
  ) {

    chatSearchBtn.addEventListener(
      "click",
      () => {

        chatSearchWrap.classList.toggle(
          "open"
        );


        if (
          chatSearchWrap.classList.contains(
            "open"
          )
        ) {

          chatSearch?.focus();

        }

      }
    );

  }


  if (chatSearch) {

    chatSearch.addEventListener(
      "input",
      event => {

        renderChats(

          [
            ...recentChats,
            ...recentGroups
          ],

          event.target.value

        );

      }
    );

  }


  /* =======================================================
     COMING SOON
  ======================================================= */

  document
    .querySelectorAll(
      "[data-coming]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          event => {

            event.preventDefault();


            showToast(
              `${element.dataset.coming} is coming in the next module.`
            );

          }
        );

      }
    );


  /* =======================================================
     LOGOUT
  ======================================================= */

  const logoutBtn =
    $("logoutBtn");


  if (logoutBtn) {

    logoutBtn.addEventListener(
      "click",
      async () => {

        logoutBtn.disabled =
          true;


        try {

          await setPresence(
            false
          );


          stopDashboardListeners();


          await logout(
            true
          );

        } catch (error) {

          console.error(
            "Logout failed:",
            error
          );


          logoutBtn.disabled =
            false;


          showToast(
            "Could not log out"
          );

        }

      }
    );

  }

}


/* =========================================================
   INITIALIZE DASHBOARD
========================================================= */

async function initializeDashboard() {

  /*
   * Draw skeleton immediately only when
   * there is nothing cached.
   */

  showDashboardSkeleton();


  /*
   * Authenticate through globalAuth.
   */

  const session =
    await getCurrentConnectaUser({

      redirect:true,

      allowBlocked:true

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

      isOnline:
        true

    };


  console.log(
    "[CONNECTA] Logged-in user:",
    currentUser.uid
  );


  /* =======================================================
     ACCOUNT CONTROL
  ======================================================= */

  const accountControl =
    getAccountControl(
      currentProfile
    );


  if (
    accountControl.blocked
  ) {

    showAccountBlockedScreen(
      accountControl
    );


    return;

  }


  /* =======================================================
     CACHE FIRST
  ======================================================= */

  loadDashboardCache(
    currentUser.uid
  );


  /*
   * Always render authenticated
   * user's current profile.
   */

  renderProfile(
    currentProfile
  );


  saveProfileToCache(
    currentUser.uid,
    currentProfile
  );


  saveDashboardCache(
    currentUser.uid
  );


  /* =======================================================
     PRESENCE
  ======================================================= */

  startPresence();


  /* =======================================================
     USERS
  ======================================================= */

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

        onlineUsers =
          snapshot.docs.map(
            snap => {

              const data =
                snap.data();


              const safeUser =
                publicProfileData(
                  snap.id,
                  data
                );


              /*
               * Only keep private following
               * array for own profile.
               */

              if (
                snap.id ===
                currentUser.uid
              ) {

                safeUser.following =
                  Array.isArray(
                    data.following
                  )
                    ? data.following
                    : [];

              }


              saveProfileToCache(
                snap.id,
                safeUser
              );


              return safeUser;

            }
          );


        /*
         * Synchronize own profile.
         */

        const ownUser =
          snapshot.docs.find(
            snap =>
              snap.id ===
              currentUser.uid
          );


        if (ownUser) {

          const ownData =
            ownUser.data();


          currentProfile = {

            ...currentProfile,

            ...publicProfileData(
              currentUser.uid,
              ownData
            ),

            following:
              Array.isArray(
                ownData.following
              )
                ? ownData.following
                : []

          };


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


          renderProfile(
            currentProfile
          );

        }


        /* ONLINE USERS */

        renderOnline(
          $("onlineSearch")?.value ||
          ""
        );


        /* UPDATE PRIVATE CHAT PROFILES */

        if (
          recentChats.length
        ) {

          recentChats =
            recentChats.map(
              chat => {

                const profile =
                  onlineUsers.find(
                    user =>
                      user.uid ===
                      chat.otherUid
                  );


                if (!profile) {

                  return chat;

                }


                return {

                  ...chat,

                  name:
                    getFullName(
                      profile
                    ),

                  username:
                    profile.username ||
                    "",

                  photoURL:
                    profile.photoURL ||
                    "",

                  isVerified:
                    profile.isVerified ===
                    true

                };

              }
            );

          }


        /*
         * RENDER PRIVATE + GROUP CHATS
         */

        mergeRecentChats();


        saveDashboardCache(
          currentUser.uid
        );

      },

      error => {

        console.error(
          "Users listener error:",
          error
        );

      }

    );


  /* =======================================================
     PRIVATE CHATS
  ======================================================= */

  listenToChats(
    currentUser.uid
  );


  /* =======================================================
     GROUP CHATS
  ======================================================= */

  listenToGroups(
    currentUser.uid
  );

}


/* =========================================================
   PAGE EXIT PRESENCE
========================================================= */

window.addEventListener(
  "pagehide",
  () => {

    setPresence(
      false
    );

  }
);


/* =========================================================
   START UI
========================================================= */

setupUI();


/* =========================================================
   START DASHBOARD
========================================================= */

initializeDashboard();
