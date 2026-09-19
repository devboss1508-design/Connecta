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
  updateDoc,
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

/* =========================================================
   DASHBOARD CACHE
   Stores the last dashboard state so it can render instantly.
========================================================= */

const DASHBOARD_CACHE_PREFIX =
  "connectaDashboardCache_v1_";


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

    const cache = {

      profile:
        currentProfile || null,

      users:
        Array.isArray(onlineUsers)
          ? onlineUsers
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
   LOAD DASHBOARD FROM CACHE
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
      cache.users;

    renderOnline(
      $("onlineSearch")?.value || ""
    );

    hasData = true;

  }


  /* =====================================================
     CHATS
  ===================================================== */

  if (
    Array.isArray(cache.chats) &&
    cache.chats.length
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
   USER PROFILE CACHE
   Makes names/photos appear faster
========================================================= */

const PROFILE_CACHE_KEY = "connectaProfileCache";

function getProfileCache() {
  try {
    return JSON.parse(
      localStorage.getItem(PROFILE_CACHE_KEY) || "{}"
    );
  } catch {
    return {};
  }
}

function saveProfileToCache(uid, profile) {

  if (!uid || !profile) {
    return;
  }

  try {

    const cache =
      getProfileCache();


    /*
    Only cache information required
    by the frontend UI.

    Do NOT store private fields such as
    email, phone, etc. in localStorage.
    */

    cache[uid] = {

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
        profile.photoURL || "",

      bio:
        profile.bio || "",

      isOnline:
        profile.isOnline === true,

      isVerified:
        profile.isVerified === true,

      following:
        Array.isArray(profile.following)
          ? profile.following
          : [],

      followersCount:
        Number(profile.followersCount || 0),

      followingCount:
        Number(profile.followingCount || 0),

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
  if (!uid) return null;

  try {
    const cache = getProfileCache();
    return cache[uid] || null;
  } catch {
    return null;
  }
}


/* =========================================================
   NAME / INITIALS
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


function getFullName(user = {}, fallbackUser = null) {

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


  const authName =
    String(fallbackUser?.displayName || "").trim();

  if (authName) {
    return authName;
  }


  const username =
    String(user.username || "").trim();

  if (username) {
    return username.replace(/^@/, "");
  }


  const emailName =
    String(fallbackUser?.email || "")
      .split("@")[0]
      .trim();

  return emailName || "CONNECTA User";
}


/* =========================================================
   ESCAPE HTML
========================================================= */

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


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {

    toast.classList.remove("show");

  }, 2200);

}


/* =========================================================
   AVATAR
========================================================= */

function avatarMarkup(user = {}, extra = "") {

  const name =
    getFullName(user, null);

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
            >
          `
          : initials(name)
      }
    </div>
  `;
}


/* =========================================================
   CURRENT USER PROFILE
========================================================= */

function renderProfile(profile) {

  currentProfile = profile || {};

  const name =
    getFullName(
      currentProfile,
      currentUser
    );

  const username =
    profile?.username
      ? `@${profile.username.replace(/^@/, "")}`
      : "@username";

  const init =
    initials(name);


  $("welcomeName").textContent =
    name;

  $("welcomeAvatar").innerHTML =
    profile?.photoURL
      ? `<img src="${escapeHtml(profile.photoURL)}" alt="">`
      : init;

  $("profileBtn").innerHTML =
    profile?.photoURL
      ? `<img src="${escapeHtml(profile.photoURL)}" alt="">`
      : init;

  $("menuAvatar").innerHTML =
    profile?.photoURL
      ? `<img src="${escapeHtml(profile.photoURL)}" alt="">`
      : init;

  $("menuName").textContent =
    name;

  $("menuUsername").textContent =
    username;
}


/* =========================================================
   ONLINE USERS
========================================================= */

function renderOnline(filter = "") {

  const box =
    $("onlineUsers");

  const term =
    filter.trim().toLowerCase();


  const list =
    onlineUsers

      .filter(u => {

        const fullName =
          getFullName(
            u,
            u.uid === currentUser?.uid
              ? currentUser
              : null
          );

        const haystack =
          `${fullName} ${u.username || ""}`
            .toLowerCase();

        return !term ||
          haystack.includes(term);

      })

      .sort((a, b) => {

        /*
        Current user first
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
        Online users before offline users
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
  ONLINE COUNT ONLY
  */

  const onlineCount =
    onlineUsers.filter(
      u => u.isOnline === true
    ).length;

  $("onlineCount").textContent =
    `(${onlineCount})`;


  if (!list.length) {

    box.innerHTML = `
      <div class="empty-state small">
        No users found.
      </div>
    `;

    return;
  }


  /*
  RENDER USER CARDS
  */

  box.innerHTML =
    list.map(u => {

      const isMe =
        u.uid === currentUser?.uid;

      const name =
        getFullName(
          u,
          isMe
            ? currentUser
            : null
        );

      const isOnline =
        u.isOnline === true;

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
          u.uid
        );


      return `
        <article
          class="user-card"
          data-user-profile="${escapeHtml(u.uid)}"
        >

          <div class="user-card-profile">

            ${avatarMarkup(
              u,
              u.photoURL
                ? ""
                : "avatar-green"
            )}

            <strong>
              ${escapeHtml(name)}
            </strong>

            <small
              class="online-text ${statusClass}"
            >

              <span
                class="status-dot ${statusClass}"
              ></span>

              ${escapeHtml(statusText)}

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
                  class="${following ? "following" : ""}"
                  data-follow="${escapeHtml(u.uid)}"
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

    }).join("");


  /*
  FOLLOW BUTTON
  */

  box
    .querySelectorAll("[data-follow]")
    .forEach(btn => {

      btn.addEventListener(
        "click",
        async event => {

          event.stopPropagation();

          await toggleFollow(
            btn.dataset.follow
          );

        }
      );

    });


  /*
  USER CARD → PROFILE
  */

  box
    .querySelectorAll("[data-user-profile]")
    .forEach(card => {

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

          if (!uid) return;


          location.href =
            `profile.html?uid=${encodeURIComponent(uid)}`;

        }
      );

    });

}


/* =========================================================
   FOLLOW / UNFOLLOW
========================================================= */

async function toggleFollow(targetUid) {

  if (
    !currentUser ||
    targetUid === currentUser.uid
  ) {
    return;
  }


  const currentFollowing =
    Array.isArray(
      currentProfile?.following
    )
      ? [...currentProfile.following]
      : [];


  const index =
    currentFollowing.indexOf(
      targetUid
    );


  if (index >= 0) {

    currentFollowing.splice(
      index,
      1
    );

  } else {

    currentFollowing.push(
      targetUid
    );

  }


  try {

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        following: currentFollowing
      }
    );


    currentProfile.following =
      currentFollowing;


    renderOnline(
      $("onlineSearch").value
    );


    showToast(
      index >= 0
        ? "Unfollowed user"
        : "Following user"
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
   FIND USER PROFILE
   1. Current online list
   2. Cache
   3. Firestore
========================================================= */

async function getUserProfile(uid) {

  if (!uid) {
    return {};
  }


  /*
  Current users already loaded by dashboard
  */

  const liveUser =
    onlineUsers.find(
      u => u.uid === uid
    );

  if (liveUser) {

    saveProfileToCache(
      uid,
      liveUser
    );

    return liveUser;
  }


  /*
  Cached profile
  */

  const cached =
    getCachedProfile(uid);

  if (cached) {

    /*
    Refresh in background
    */

    refreshUserProfile(uid);

    return cached;
  }


  /*
  Firestore
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
        ...snap.data()
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

async function refreshUserProfile(uid) {

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


    const profile = {
      uid,
      ...snap.data()
    };


    saveProfileToCache(
      uid,
      profile
    );


    /*
    Update matching online user
    */

    const index =
      onlineUsers.findIndex(
        u => u.uid === uid
      );


    if (index >= 0) {

      onlineUsers[index] = {
        ...onlineUsers[index],
        ...profile
      };

    }


    /*
    Re-render chats so the new
    name/photo appears immediately.
    */

    recentChats =
      recentChats.map(chat => {

        if (
          chat.otherUid !== uid
        ) {
          return chat;
        }


        return {
          ...chat,
          name: getFullName(profile),
          photoURL:
            profile.photoURL || ""
        };

      });


    renderChats(
      recentChats,
      $("chatSearch")?.value || ""
    );


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

  if (!box) return;


  const term =
    String(filter || "")
      .trim()
      .toLowerCase();


  const filtered =
    chats.filter(chat => {

      const searchText =
        `${chat.name || ""}
         ${chat.lastMessage || ""}
         ${chat.username || ""}`
          .toLowerCase();

      return !term ||
        searchText.includes(term);

    });


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
    filtered.map(chat => {

      const otherUid =
        chat.otherUid || "";


      const href =
        otherUid
          ? `chat.html?uid=${encodeURIComponent(otherUid)}`
          : "#";


      /*
      Always convert unread to a real number.
      */

      const unread =
        Number(chat.unread || 0);


      /*
      Badge HTML.

      Inline styling intentionally makes the badge
      visible even if dashboard.css doesn't yet
      contain a .unread style.
      */

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


      return `
        <a
          class="chat-item"
          href="${href}"
          data-chat-id="${escapeHtml(chat.id || "")}"
        >

          <div class="avatar ${chat.color || ""}">

            ${
              chat.photoURL

                ? `
                  <img
                    src="${escapeHtml(chat.photoURL)}"
                    alt="${escapeHtml(
                      chat.name || "User"
                    )}"
                  >
                `

                : initials(
                    chat.name || "User"
                  )
            }

          </div>


          <div class="chat-copy">

            <strong>
              ${escapeHtml(
                chat.name || "Conversation"
              )}
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

    }).join("");

  }


/* =========================================================
   LOAD RECENT CHATS
========================================================= */

async function listenToChats(uid) {

  try {

    const q =
      query(
        collection(db, "chats"),
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
            s => {

              const d =
                s.data();


              /*
              Only conversations belonging
              to the current user.
              */

              if (
                !Array.isArray(
                  d.participants
                )
              ) {

                return;

              }


              if (
                !d.participants.includes(uid)
              ) {

                return;

              }


              /*
              Find the other participant.
              */

              const otherUid =
                d.participants.find(
                  participantUid =>
                    participantUid !== uid
                );


              if (!otherUid) {
                return;
              }


              /*
              Find profile from live users,
              cache, or chat metadata.
              */

              const knownUser =
                onlineUsers.find(
                  u =>
                    u.uid === otherUid
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
                      d.otherUserName ||
                      "CONNECTA User"
                    );


              const photoURL =
                cachedUser?.photoURL ||
                d.photoURL ||
                d.otherUserPhotoURL ||
                "";


              /*
              ==========================================
              IMPORTANT UNREAD COUNT
              ==========================================
              */

              const unreadCount =
                Number(
                  d.unreadCount?.[uid] ??
                  d.unread?.[uid] ??
                  0
                );


              chats.push({

                id: s.id,

                otherUid,

                name,

                username:
                  cachedUser?.username ||
                  "",

                photoURL,

                lastMessage:
                  d.lastMessage || "",

                time:
                  formatTimestamp(
                    d.updatedAt
                  ),

                /*
                THIS is the value that the UI
                displays as 1, 2, 3...
                */

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
          Store globally.
          */

          recentChats =
  chats;


/*
=========================================================
SAVE CHATS FOR NEXT VISIT
=========================================================
*/

saveDashboardCache(
  uid
);


/*
=========================================================
RENDER IMMEDIATELY
=========================================================
*/

renderChats(
  recentChats,
  $("chatSearch")?.value || ""
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

function formatTimestamp(timestamp) {

  if (
    !timestamp?.toDate
  ) {
    return "";
  }


  const date =
    timestamp.toDate();


  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit"
    }
  );

}


/* =========================================================
   PRESENCE
========================================================= */

async function setPresence(online) {

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
        isOnline: online,
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
   UI SETUP
========================================================= */

function setupUI() {


  /*
  MENU
  */

  $("menuBtn").addEventListener(
    "click",
    () => {

      $("sideMenu")
        .classList.add("open");

      $("sideMenu")
        .setAttribute(
          "aria-hidden",
          "false"
        );

      $("menuOverlay")
        .classList.add("open");

    }
  );


  const closeMenu = () => {

    $("sideMenu")
      .classList.remove("open");

    $("sideMenu")
      .setAttribute(
        "aria-hidden",
        "true"
      );

    $("menuOverlay")
      .classList.remove("open");

  };


  $("menuOverlay")
    .addEventListener(
      "click",
      closeMenu
    );


  /*
  CURRENT USER PROFILE
  */

  $("profileBtn")
    .addEventListener(
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


  /*
  CONNECTION BUTTON
  */

  $("connectionBtn")
    .addEventListener(
      "click",
      () => {

        showToast(
          "Connection feature will be connected next."
        );

      }
    );


  /*
  ONLINE SEARCH
  */

  $("onlineSearchBtn")
    .addEventListener(
      "click",
      () => {

        $("onlineSearchWrap")
          .classList.toggle("open");


        if (
          $("onlineSearchWrap")
            .classList.contains("open")
        ) {

          $("onlineSearch")
            .focus();

        }

      }
    );


  /*
  CHAT SEARCH
  */

  $("chatSearchBtn")
    .addEventListener(
      "click",
      () => {

        $("chatSearchWrap")
          .classList.toggle("open");


        if (
          $("chatSearchWrap")
            .classList.contains("open")
        ) {

          $("chatSearch")
            .focus();

        }

      }
    );


  /*
  ONLINE SEARCH
  */

  $("onlineSearch")
    .addEventListener(
      "input",
      event => {

        renderOnline(
          event.target.value
        );

      }
    );


  /*
  CHAT SEARCH
  IMPORTANT:
  Do NOT render an empty array.
  */

  $("chatSearch")
    .addEventListener(
      "input",
      event => {

        renderChats(
          recentChats,
          event.target.value
        );

      }
    );


  /*
  COMING SOON BUTTONS
  */

  document
    .querySelectorAll(
      "[data-coming]"
    )
    .forEach(el => {

      el.addEventListener(
        "click",
        event => {

          event.preventDefault();

          showToast(
            `${el.dataset.coming} is coming in the next module.`
          );

        }
      );

    });


  /*
  LOGOUT
  */

  $("logoutBtn")
    .addEventListener(
      "click",
      async () => {

        await setPresence(false);

        await signOut(auth);

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


    currentUser = user;


/* =====================================================
   INSTANT DASHBOARD CACHE
===================================================== */

/*
Load everything we already know BEFORE
waiting for Firestore.

This makes the dashboard appear immediately
on repeat visits.
*/

loadDashboardCache(
  user.uid
);


/*
Also load the individual profile cache
if the dashboard cache does not contain it.
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
   LOAD CURRENT PROFILE FROM FIRESTORE
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
          ? snap.data()
          : {};


      /*
      Repair / sync profile name
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
            .split(/\s+/);


        profile.firstName =
          parts.shift() || "";


        profile.lastName =
          parts.join(" ") || "";

      }


      /*
      Save missing name fields
      */

      if (
        authDisplayName &&
        (
          !snap.exists() ||
          !snap.data()?.displayName ||
          !snap.data()?.firstName ||
          !snap.data()?.lastName
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
      Cache current profile
      */

      saveProfileToCache(
        user.uid,
        {
          uid: user.uid,
          ...profile
        }
      );


      renderProfile(
        profile
      );


    } catch (error) {

      console.warn(
        "Profile read/repair failed:",
        error
      );


      renderProfile({
        displayName:
          user.displayName || ""
      });

    }


    /* =====================================================
   PRESENCE
===================================================== */

/*
Do NOT block dashboard loading while
the presence write is happening.
*/

setPresence(true).catch(
  error => {

    console.warn(
      "Initial presence update failed:",
      error
    );

  }
);


    /*
    Refresh presence every 45 seconds.
    */

    setInterval(
      () => setPresence(true),
      45000
    );


    /* =====================================================
       LOAD ALL USERS
    ===================================================== */

    const usersQuery =
      query(
        collection(db, "users"),
        limit(100)
      );


    stopUsers =
      onSnapshot(
        usersQuery,

        snapshot => {

          onlineUsers =
            snapshot.docs.map(
              s => {

                const userData = {
                  uid: s.id,
                  ...s.data()
                };


                /*
                Save profiles locally.
                */

                saveProfileToCache(
                  s.id,
                  userData
                );


                return userData;

              }
            );


          /*
          Render users.
          */

          renderOnline(
            $("onlineSearch").value
          );

          /* =====================================================
   SAVE COMPLETE DASHBOARD STATE
===================================================== */

saveDashboardCache(
  currentUser.uid
);


          /*
          Update Recent Chats immediately
          if a user's name/photo has just
          arrived through the users listener.
          */

          if (
            recentChats.length
          ) {

            recentChats =
              recentChats.map(
                chat => {

                  const user =
                    onlineUsers.find(
                      u =>
                        u.uid ===
                        chat.otherUid
                    );


                  if (!user) {
                    return chat;
                  }


                  return {
                    ...chat,

                    name:
                      getFullName(
                        user
                      ),

                    username:
                      user.username ||
                      "",

                    photoURL:
                      user.photoURL ||
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

        },


        error => {

          console.error(
            "Users listener:",
            error
          );


          $("onlineUsers").innerHTML = `
            <div class="empty-state small">
              Could not load users.
              Check Firestore rules.
            </div>
          `;

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
   BEST-EFFORT OFFLINE PRESENCE
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    setPresence(false);

  }
);


/* =========================================================
   INITIALIZE UI
========================================================= */

setupUI();
