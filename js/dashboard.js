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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let onlineUsers = [];
let stopUsers = null;
let stopChats = null;

function initials(name = "U") {
  return name.trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase() || "U";
}

function getFullName(user = {}, fallbackUser = null) {
  const displayName = String(user.displayName || "").trim();

  if (displayName) {
    return displayName;
  }

  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  const authName = String(fallbackUser?.displayName || "").trim();

  if (authName) {
    return authName;
  }

  const username = String(user.username || "").trim();

  if (username) {
    return username.replace(/^@/, "");
  }

  const emailName = String(fallbackUser?.email || "").split("@")[0].trim();

  return emailName || "CONNECTA User";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function avatarMarkup(user, extra = "") {
  const name = user.displayName || user.username || "User";
  const photo = user.photoURL || user.photoUrl || "";
  return `<div class="avatar large ${extra}">${photo ? `<img src="${photo}" alt="">` : initials(name)}</div>`;
}

function renderProfile(profile) {
  currentProfile = profile || {};
  const name = getFullName(currentProfile, currentUser);
  const username = profile?.username ? `@${profile.username.replace(/^@/,"")}` : "@username";
  const init = initials(name);

  $("welcomeName").textContent = name;
  $("welcomeAvatar").innerHTML = profile?.photoURL ? `<img src="${profile.photoURL}" alt="">` : init;
  $("profileBtn").innerHTML = profile?.photoURL ? `<img src="${profile.photoURL}" alt="">` : init;
  $("menuAvatar").innerHTML = profile?.photoURL ? `<img src="${profile.photoURL}" alt="">` : init;
  $("menuName").textContent = name;
  $("menuUsername").textContent = username;
}

function renderOnline(filter = "") {
  const box = $("onlineUsers");
  const term = filter.trim().toLowerCase();

  const list = onlineUsers.filter(u => {
    const fullName = getFullName(
      u,
      u.uid === currentUser?.uid ? currentUser : null
    );

    const haystack =
      `${fullName} ${u.username || ""}`.toLowerCase();

    return !term || haystack.includes(term);
  });

  $("onlineCount").textContent = `(${onlineUsers.length})`;

  if (!list.length) {
    box.innerHTML = `
      <div class="empty-state small">
        No users found.
      </div>
    `;
    return;
  }

  box.innerHTML = list.map(u => {
    const isMe = u.uid === currentUser?.uid;

    const name = getFullName(
      u,
      isMe ? currentUser : null
    );

    const isOnline = u.isOnline === true;

    const statusClass = isOnline ? "online" : "offline";

    const statusText = isMe
      ? "online • you"
      : (isOnline ? "online" : "offline");

    const following =
      Array.isArray(currentProfile?.following) &&
      currentProfile.following.includes(u.uid);

    return `
      <article
        class="user-card"
        data-user-profile="${escapeHtml(u.uid)}"
      >

        <div class="user-card-profile">

          ${avatarMarkup(
            u,
            u.photoURL ? "" : "avatar-green"
          )}

          <strong>${escapeHtml(name)}</strong>

          <small class="online-text ${statusClass}">
            <span class="status-dot ${statusClass}"></span>
            ${escapeHtml(statusText)}
          </small>

        </div>

        ${
          isMe
            ? `
              <button
                class="following"
                disabled>
                You
              </button>
            `
            : `
              <button
                class="${following ? "following" : ""}"
                data-follow="${escapeHtml(u.uid)}">
                ${following ? "Following" : "Follow"}
              </button>
            `
        }

      </article>
    `;
  }).join("");

  /*
  ========================================
  FOLLOW BUTTONS
  ========================================
  */

  box.querySelectorAll("[data-follow]").forEach(btn => {

    btn.addEventListener("click", async event => {

      event.stopPropagation();

      await toggleFollow(btn.dataset.follow);

    });

  });

  /*
  ========================================
  USER PROFILE
  ========================================
  */

  box.querySelectorAll("[data-user-profile]").forEach(card => {

    card.addEventListener("click", event => {

      /*
      Do not open the profile when the
      Follow button itself was clicked.
      */
      if (event.target.closest("[data-follow]")) {
        return;
      }

      const uid = card.dataset.userProfile;

      if (!uid) return;

      location.href =
        `profile.html?uid=${encodeURIComponent(uid)}`;

    });

  });
}

async function toggleFollow(targetUid) {
  if (!currentUser || targetUid === currentUser.uid) return;
  const currentFollowing = Array.isArray(currentProfile?.following) ? [...currentProfile.following] : [];
  const index = currentFollowing.indexOf(targetUid);
  if (index >= 0) currentFollowing.splice(index, 1);
  else currentFollowing.push(targetUid);

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { following: currentFollowing });
    currentProfile.following = currentFollowing;
    renderOnline($("onlineSearch").value);
    showToast(index >= 0 ? "Unfollowed user" : "Following user");
  } catch (error) {
    console.error(error);
    showToast("Could not update follow status");
  }
}

function renderChats(chats = [], filter = "") {
  const box = $("chatList");
  const term = filter.trim().toLowerCase();
  const filtered = chats.filter(c => `${c.name || ""} ${c.lastMessage || ""}`.toLowerCase().includes(term));

  if (!filtered.length) {
    box.innerHTML = `<div class="empty-state">${term ? "No matching chats." : "No conversations yet. Start chatting when the chat feature is enabled."}</div>`;
    return;
  }

  box.innerHTML = filtered.map(chat => `
    <a class="chat-item" href="${chat.href || "#"}" data-chat-id="${escapeHtml(chat.id || "")}">
      <div class="avatar ${chat.color || ""}">${chat.photoURL ? `<img src="${chat.photoURL}" alt="">` : initials(chat.name)}</div>
      <div class="chat-copy">
        <strong>${escapeHtml(chat.name || "Conversation")}</strong>
        <p>${escapeHtml(chat.lastMessage || "No messages yet")}</p>
      </div>
      <div class="chat-meta">
        <time>${escapeHtml(chat.time || "")}</time>
        ${chat.unread ? `<span class="unread">${chat.unread > 99 ? "99+" : chat.unread}</span>` : ""}
      </div>
    </a>`).join("");
}

async function listenToChats(uid) {
  // Chats collection can be added later without changing the dashboard.
  // Expected shape: participants: [uid1, uid2], lastMessage, updatedAt, unread.
  try {
    const q = query(collection(db, "chats"), orderBy("updatedAt", "desc"), limit(30));
    stopChats = onSnapshot(q, snapshot => {
      const chats = [];
      snapshot.forEach(s => {
        const d = s.data();
        if (Array.isArray(d.participants) && d.participants.includes(uid)) {
          chats.push({
            id: s.id,
            name: d.name || d.otherUserName || "Conversation",
            lastMessage: d.lastMessage || "",
            photoURL: d.photoURL || "",
            time: formatTimestamp(d.updatedAt),
            unread: Number(d.unread?.[uid] || 0),
            href: "#"
          });
        }
      });
      renderChats(chats, $("chatSearch").value);
    }, error => {
      console.warn("Chats listener:", error);
      renderChats([]);
    });
  } catch (e) {
    renderChats([]);
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp?.toDate) return "";
  const date = timestamp.toDate();
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function setPresence(online) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      isOnline: online,
      lastSeen: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn("Presence update failed:", e);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function setupUI() {
  $("menuBtn").addEventListener("click", () => {
    $("sideMenu").classList.add("open");
    $("sideMenu").setAttribute("aria-hidden", "false");
    $("menuOverlay").classList.add("open");
  });

  const closeMenu = () => {
    $("sideMenu").classList.remove("open");
    $("sideMenu").setAttribute("aria-hidden", "true");
    $("menuOverlay").classList.remove("open");
  };
  $("menuOverlay").addEventListener("click", closeMenu);

  $("profileBtn").addEventListener("click", () => {
    showToast("Profile page will be connected next.");
  });

  $("connectionBtn").addEventListener("click", () => {
    showToast("Connection feature will be connected next.");
  });

  $("onlineSearchBtn").addEventListener("click", () => {
    $("onlineSearchWrap").classList.toggle("open");
    if ($("onlineSearchWrap").classList.contains("open")) $("onlineSearch").focus();
  });

  $("chatSearchBtn").addEventListener("click", () => {
    $("chatSearchWrap").classList.toggle("open");
    if ($("chatSearchWrap").classList.contains("open")) $("chatSearch").focus();
  });

  $("onlineSearch").addEventListener("input", e => renderOnline(e.target.value));
  $("chatSearch").addEventListener("input", e => renderChats([], e.target.value));

  document.querySelectorAll("[data-coming]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      showToast(`${el.dataset.coming} is coming in the next module.`);
    });
  });

  $("logoutBtn").addEventListener("click", async () => {
    await setPresence(false);
    await signOut(auth);
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.replace("login.html");
    return;
  }

  currentUser = user;

  try {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  let profile = snap.exists() ? snap.data() : {};

  /*
  ========================================
  REPAIR / SYNC USER PROFILE
  ========================================
  */

  const authDisplayName = String(user.displayName || "").trim();

  if (!profile.displayName && authDisplayName) {
    profile.displayName = authDisplayName;
  }

  if (!profile.firstName && authDisplayName) {
    const parts = authDisplayName.split(/\s+/);

    profile.firstName = parts.shift() || "";
    profile.lastName = parts.join(" ") || "";
  }

  /*
  Save missing name information back to
  Firestore without replacing existing data.
  */
  if (
    authDisplayName &&
    (!snap.exists() ||
     !snap.data()?.displayName ||
     !snap.data()?.firstName ||
     !snap.data()?.lastName)
  ) {
    await setDoc(userRef, {
      displayName: profile.displayName,
      firstName: profile.firstName,
      lastName: profile.lastName
    }, { merge: true });
  }

  renderProfile(profile);

} catch (e) {
  console.warn("Profile read/repair failed:", e);
  renderProfile({
    displayName: user.displayName || "" 
   });
  }

  await setPresence(true);

  // Refresh presence while the app is open.
  setInterval(() => setPresence(true), 45000);

  const usersQuery = query(
  collection(db, "users"),
  limit(100)
);

stopUsers = onSnapshot(
  usersQuery,
  snapshot => {

    onlineUsers = snapshot.docs.map(s => ({
      uid: s.id,
      ...s.data()
    }));

    renderOnline($("onlineSearch").value);

  },
  error => {

    console.error("Users listener:", error);

    $("onlineUsers").innerHTML = `
      <div class="empty-state small">
        Could not load users. Check Firestore rules.
      </div>
    `;

  }
);

  listenToChats(user.uid);
});

window.addEventListener("beforeunload", () => {
  // Best-effort only; browser unload may terminate before Firestore finishes.
  setPresence(false);
});

setupUI();
