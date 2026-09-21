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
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;

let onlineUsers = [];
let recentChats = [];

let stopUsers = null;
let stopChats = null;

let presenceInterval = null;


/* =========================================================
   DASHBOARD CACHE
========================================================= */

const DASHBOARD_CACHE_PREFIX =
  "connectaDashboardCache_v2_";

const PROFILE_CACHE_KEY =
  "connectaProfileCache";


/* =========================================================
   SAFE PROFILE DATA
   Only fields needed by dashboard UI are cached.
========================================================= */

function publicProfileData(uid, profile = {}) {

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
      Number(profile.followersCount || 0),

    followingCount:
      Number(profile.followingCount || 0)

  };

}


/* =========================================================
   DASHBOARD CACHE
========================================================= */

function getDashboardCache(uid) {

  if (!uid) {
    return null;
  }

  try {

    const raw =
      localStorage.getItem(
        `${DASHBOARD_CACHE_PREFIX}${uid}`
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);

  } catch (error) {

    console.warn(
      "Dashboard cache read failed:",
      error
    );

    return null;
  }

}


function saveDashboardCache(uid) {

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

            /*
            The current user's following list
            is useful for rendering Follow buttons.
            It is not a secret field.
            */

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
        Array.isArray(onlineUsers)
          ? onlineUsers.map(user =>
              publicProfileData(
                user.uid,
                user
              )
            )
          : [],

      chats:
        Array.isArray(recentChats)
          ? recentChats
          : [],

      cachedAt:
        Date.now()

    };


    localStorage.setItem(

      `${DASHBOARD_CACHE_PREFIX}${uid}`,

      JSON.stringify(cache)

    );

  } catch (error) {

    console.warn(
      "Dashboard cache save failed:",
      error
    );

  }

}


/* =========================================================
   LOAD DASHBOARD CACHE
========================================================= */

function loadDashboardCache(uid) {

  const cache =
    getDashboardCache(uid);

  if (!cache) {
    return false;
  }


  let hasData = false;


  /* =====================================================
     PROFILE
  ===================================================== */

  if (
    cache.profile &&
    typeof cache.profile === "object"
  ) {

    currentProfile =
      cache.profile;

    renderProfile(
      currentProfile
    );

    hasData = true;

  }


  /* =====================================================
     USERS
  ===================================================== */

  if (
    Array.isArray(cache.users) &&
    cache.users.length
  ) {

    onlineUsers =
      cache.users.map(user =>
        publicProfileData(
          user.uid,
          user
        )
      );

    renderOnline(
      $("onlineSearch")?.value || ""
    );

    hasData = true;

  }


  /* =====================================================
     CHATS
  ===================================================== */

  if (
    Array.isArray(cache.chats)
  ) {

    recentChats =
      cache.chats;

    renderChats(
      recentChats,
      $("chatSearch")?.value || ""
    );

    hasData = true;

  }


  return hasData;

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


    cache[uid] =
      {
        ...publicProfileData(
          uid,
          profile
        ),

        cachedAt:
          Date.now()
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

  return String(name)
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

function getFullName(
  user = {},
  fallbackUser = null
) {

  const displayName =
    String(
      user.displayName || ""
    ).trim();


  /*
  Never show the placeholder
  as an actual user's name.
  */

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
    ).trim()
    .replace(/^@/, "");


  if (username) {
    return username;
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
   TOAST
========================================================= */

function showToast(message) {

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
   ADMIN ACCOUNT CONTROL
   Central account-level restriction check.

   Controlled by Admin Panel:
   - active
   - suspended
   - banned

   IMPORTANT:
   This is a frontend UX/security layer.
   Firestore/backend rules must also enforce
   these restrictions server-side.
========================================================= */

function getAccountControl(profile = {}) {

  const status =
    String(
      profile.status || "active"
    ).toLowerCase().trim();


  if (status === "banned") {

    return {
      blocked: true,
      status: "banned",
      message:
        "Your CONNECTA account has been banned."
    };

  }


  if (status === "suspended") {

    return {
      blocked: true,
      status: "suspended",
      message:
        "Your CONNECTA account is currently suspended."
    };

  }


  return {
    blocked: false,
    status: "active",
    message: ""
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
          background:#ffffff;
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
            color:#ffffff;
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

        try {

          await signOut(auth);

        } catch (error) {

          console.error(
            "Restricted-account logout failed:",
            error
          );

        }

        location.replace(
          "login.html"
        );

      }
    );

}

/* =========================================================
   AVATAR
========================================================= */

function avatarMarkup(
  user = {},
  extra = ""
) {

  const name =
    getFullName(
      user
    );


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
   VERIFIED BADGE
   Blue verified badge — same visual style as Profile
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
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:18px;
        height:18px;
        margin-left:5px;
        border-radius:50%;
        background:#2196F3;
        color:#ffffff;
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
   CURRENT USER PROFILE
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


  /*
  Balance is intentionally read only
  from the current user's live profile.
  */

  const balanceAmount =
    $("balanceAmount");

  if (balanceAmount) {

    const balance =
      Number(
        currentProfile.balance || 0
      );


    balanceAmount.textContent =
      balance.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
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


  const term =
    String(filter || "")
      .trim()
      .toLowerCase();


  const list =
    [...onlineUsers]

      .filter(user => {

        const fullName =
          getFullName(
            user,
            user.uid === currentUser?.uid
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

      })


      .sort((a, b) => {

        /*
        Current user first.
        */

        if (
          a.uid === currentUser?.uid
        ) {

          return -1;

        }


        if (
          b.uid === currentUser?.uid
        ) {

          return 1;

        }


        /*
        Online users before offline users.
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


        return 0;

      });


  /*
  ONLINE COUNT
  */

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
                ${escapeHtml(name)}
                ${verifiedBadge(user)}
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


  /*
  FOLLOW BUTTONS
  */

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


  /*
  USER CARD → PROFILE
  */

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
    targetUid === currentUser.uid
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


          const followerIndex =
            targetFollowers.indexOf(
              currentUid
            );


          if (
            followerIndex >= 0
          ) {

            targetFollowers.splice(
              followerIndex,
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


        /*
        Update local online user copy.
        */

        const targetIndex =
          onlineUsers.findIndex(
            user =>
              user.uid === targetUid
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


        /*
        Save immediately to local cache.
        */

        saveProfileToCache(
          currentUid,
          currentProfile
        );

      }
    );


    renderProfile(
      currentProfile
    );


    renderOnline(
      $("onlineSearch")?.value || ""
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
   GET USER PROFILE
========================================================= */

async function getUserProfile(
  uid
) {

  if (!uid) {
    return {};
  }


  /*
  1. Live user list.
  */

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


  /*
  2. Local cache.
  */

  const cached =
    getCachedProfile(uid);


  if (cached) {

    refreshUserProfile(
      uid
    );


    return cached;

  }


  /*
  3. Firestore.
  */

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


    if (!snap.exists()) {
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
              getFullName(profile),

            username:
              profile.username || "",

            photoURL:
              profile.photoURL || ""

          };

        }
      );


    renderOnline(
      $("onlineSearch")?.value || ""
    );


    renderChats(
      recentChats,
      $("chatSearch")?.value || ""
    );


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
   RECENT CHAT RENDERING
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


  const term =
    String(filter || "")
      .trim()
      .toLowerCase();


  const filtered =
    chats.filter(
      chat => {

        const searchText =
          `${chat.name || ""}
           ${chat.lastMessage || ""}
           ${chat.username || ""}`
            .toLowerCase();


        return (
          !term ||
          searchText.includes(term)
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
    filtered.map(
      chat => {

        const otherUid =
          chat.otherUid || "";


        const href =
          otherUid

            ? `chat.html?uid=${encodeURIComponent(
                otherUid
              )}`

            : "#";


        const unread =
          Number(
            chat.unread || 0
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
                  color:#ffffff;
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
          "CONNECTA User";


        return `
          <a
            class="chat-item"
            href="${href}"
            data-chat-id="${escapeHtml(
              chat.id || ""
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

                  : initials(
                      name
                    )
              }

            </div>


            <div class="chat-copy">

              <strong>
                ${escapeHtml(name)}
              </strong>

              <p>
                ${escapeHtml(
                  chat.lastMessage ||
                  "No messages yet"
                )}
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
                  chat.time || ""
                )}
              </time>

              ${unreadBadge}

            </div>

          </a>
        `;

      }
    ).join("");

}


/* =========================================================
   LOAD RECENT CHATS
========================================================= */

async function listenToChats(
  uid
) {

  try {

    const q =
      query(
        collection(
          db,
          "chats"
        ),
        orderBy(
          "updatedAt",
          "desc"
        ),
        limit(30)
      );


    stopChats =
      onSnapshot(

        q,

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
                    participantUid !== uid
                );


              if (!otherUid) {
                return;
              }


              /*
              Find profile from live users,
              cache or chat metadata.
              */

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


              chats.push({

                id:
                  snap.id,

                otherUid,

                name,

                username:
                  cachedUser?.username ||
                  "",

                photoURL,

                lastMessage:
                  data.lastMessage ||
                  "",

                time:
                  formatTimestamp(
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


          recentChats =
            chats;


          saveDashboardCache(
            uid
          );


          renderChats(
            recentChats,
            $("chatSearch")?.value ||
            ""
          );

        },

        error => {

          console.error(
            "Chats listener error:",
            error
          );


          renderChats([]);

        }

      );

  } catch (error) {

    console.error(
      "Could not listen to chats:",
      error
    );


    renderChats([]);

  }

}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTimestamp(
  timestamp
) {

  if (
    !timestamp?.toDate
  ) {

    return "";

  }


  const date =
    timestamp.toDate();


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
        merge: true
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

  if (presenceInterval) {

    clearInterval(
      presenceInterval
    );

  }


  /*
  Initial presence write
  does not block dashboard.
  */

  setPresence(
    true
  );


  /*
  Keep user online while
  dashboard remains open.
  */

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

  if (stopUsers) {

    stopUsers();

    stopUsers = null;

  }


  if (stopChats) {

    stopChats();

    stopChats = null;

  }


  if (presenceInterval) {

    clearInterval(
      presenceInterval
    );

    presenceInterval = null;

  }

}


/* =========================================================
   UI SETUP
========================================================= */

function setupUI() {

  /*
  MENU
  */

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


  /*
  PROFILE BUTTON
  */

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


  /*
  CONNECTION BUTTON
  */

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


  /*
  ONLINE SEARCH
  */

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


  /*
  CHAT SEARCH
  */

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
          recentChats,
          event.target.value
        );

      }
    );

  }


  /*
  COMING SOON
  */

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


  /*
  LOGOUT
  */

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


          await signOut(
            auth
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
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    /*
    If signed out.
    */

    if (!user) {

      stopDashboardListeners();


      location.replace(
        "login.html"
      );


      return;

    }


    /*
    Prevent duplicate listeners.
    */

    stopDashboardListeners();


    currentUser =
      user;


    /* =====================================================
       INSTANT CACHE
    ===================================================== */

    loadDashboardCache(
      user.uid
    );


    /*
    Individual profile cache fallback.
    */

    if (!currentProfile) {

      const cachedProfile =
        getCachedProfile(
          user.uid
        );


      if (cachedProfile) {

        currentProfile =
          cachedProfile;


        renderProfile(
          cachedProfile
        );

      }

    }


    /* =====================================================
       CURRENT USER PROFILE
    ===================================================== */

    try {

      const userRef =
        doc(
          db,
          "users",
          user.uid
        );


      const snap =
        await getDoc(
          userRef
        );


      let profile =
        snap.exists()
          ? {
              uid: user.uid,
              ...snap.data()
            }
          : {
              uid: user.uid
            };


      /*
      Synchronize Firebase Auth display name
      if Firestore profile is missing it.
      */

      const authDisplayName =
        String(
          user.displayName || ""
        ).trim();


      if (
        !profile.displayName &&
        authDisplayName
      ) {

        profile.displayName =
          authDisplayName;

      }


      if (
        !profile.firstName &&
        authDisplayName
      ) {

        const parts =
          authDisplayName
            .trim()
            .split(/\s+/);


        profile.firstName =
          parts.shift() || "";


        profile.lastName =
          parts.join(" ") || "";

      }


      /*
      Repair missing name fields.
      */

      const originalData =
        snap.exists()
          ? snap.data()
          : {};


      if (
        authDisplayName &&
        (
          !snap.exists() ||
          !originalData.displayName ||
          !originalData.firstName ||
          !originalData.lastName
        )
      ) {

        await setDoc(

          userRef,

          {
            displayName:
              profile.displayName,

            firstName:
              profile.firstName,

            lastName:
              profile.lastName

          },

          {
            merge: true
          }

        );

      }


      /*
      Keep the LIVE profile in memory.
      */

      currentProfile =
    profile;


/* =====================================================
   ADMIN ACCOUNT CONTROL
===================================================== */

const accountControl =
    getAccountControl(
        profile
    );


if (accountControl.blocked) {

    console.warn(
        "[CONNECTA] Account restricted:",
        accountControl.status
    );


    showAccountBlockedScreen(
        accountControl
    );


    return;

}


/*
Save only safe profile data
to the general profile cache.
*/

saveProfileToCache(
    user.uid,
    profile
);


      /*
      Render the profile.
      */

      renderProfile(
        profile
      );


      /*
      Update dashboard cache.
      */

      saveDashboardCache(
        user.uid
      );


    } catch (error) {

      console.warn(
        "Profile read/repair failed:",
        error
      );


      /*
      Use Firebase Auth data as
      emergency fallback.
      */

      currentProfile = {

        uid:
          user.uid,

        displayName:
          user.displayName || "",

        photoURL:
          user.photoURL || "",

        isOnline:
          true

      };


      renderProfile(
        currentProfile
      );

    }


    /* =====================================================
       PRESENCE
    ===================================================== */

    startPresence();


    /* =====================================================
       LOAD USERS
    ===================================================== */

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
            snapshot.docs
              .map(
                snap => {

                  const data =
                    snap.data();


                  const safeUser =
                    publicProfileData(
                      snap.id,
                      data
                    );


                  /*
                  Keep following list only
                  for current user's own profile.
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
          Keep current user's
          following array synchronized.
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


            renderProfile(
              currentProfile
            );

          }


          /*
          Render online users.
          */

          renderOnline(
            $("onlineSearch")?.value ||
            ""
          );


          /*
          Update names/photos in recent chats.
          */

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
                      ""

                  };

                }
              );


            renderChats(
              recentChats,
              $("chatSearch")?.value ||
              ""
            );

          }


          /*
          Save dashboard state.
          */

          saveDashboardCache(
            currentUser.uid
          );

        },

        error => {

          console.error(
            "Users listener:",
            error
          );


          const box =
            $("onlineUsers");


          if (box) {

            box.innerHTML = `
              <div class="empty-state small">
                Could not load users.
                Check Firestore rules.
              </div>
            `;

          }

        }

      );


    /* =====================================================
       LOAD RECENT CHATS
    ===================================================== */

    listenToChats(
      user.uid
    );

  }
);


/* =========================================================
   BEST-EFFORT PAGE EXIT PRESENCE
========================================================= */

window.addEventListener(
  "pagehide",
  () => {

    /*
    This is best-effort only.
    Firestore writes are not guaranteed
    during page termination.
    */

    setPresence(
      false
    );

  }
);


/* =========================================================
   INITIALIZE UI
========================================================= */

setupUI();
