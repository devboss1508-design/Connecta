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
  const name = profile?.displayName || profile?.username || currentUser?.email?.split("@")[0] || "there";
  const username = profile?.username ? `@${profile.username.replace(/^@/,"")}` : "@username";
  const init = initials(name);

  $("welcomeName").textContent = name.split(" ")[0];
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
    if (u.uid === currentUser?.uid) return true;
    const haystack = `${u.displayName || ""} ${u.username || ""}`.toLowerCase();
    return !term || haystack.includes(term);
  });

  $("onlineCount").textContent = `(${onlineUsers.length})`;

  if (!list.length) {
    box.innerHTML = `<div class="empty-state small">No matching online users.</div>`;
    return;
  }

  box.innerHTML = list.map(u => {
    const isMe = u.uid === currentUser?.uid;
    const name = u.displayName || u.username || "CONNECTA User";
    const following = Array.isArray(currentProfile?.following) && currentProfile.following.includes(u.uid);

    return `
      <article class="user-card">
        ${avatarMarkup(u, u.photoURL ? "" : "avatar-green")}
        <strong>${escapeHtml(name)}</strong>
        <small class="online-text">${isMe ? "online • you" : "online"}</small>
        <button class="${following ? "following" : ""}" data-follow="${u.uid}" ${isMe ? "disabled" : ""}>
          ${isMe ? "Add Story" : (following ? "Following" : "Follow")}
        </button>
      </article>`;
  }).join("");

  box.querySelectorAll("[data-follow]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await toggleFollow(btn.dataset.follow);
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
    const snap = await getDoc(doc(db, "users", user.uid));
    renderProfile(snap.exists() ? snap.data() : { displayName: user.displayName || "" });
  } catch (e) {
    console.warn("Profile read failed:", e);
    renderProfile({ displayName: user.displayName || "" });
  }

  await setPresence(true);

  // Refresh presence while the app is open.
  setInterval(() => setPresence(true), 45000);

  const usersQuery = query(collection(db, "users"), limit(100));
  stopUsers = onSnapshot(usersQuery, snapshot => {
    onlineUsers = snapshot.docs
      .map(s => ({ uid: s.id, ...s.data() }))
      .filter(u => u.isOnline === true);
    renderOnline($("onlineSearch").value);
  }, error => {
    console.error("Users listener:", error);
    $("onlineUsers").innerHTML = `<div class="empty-state small">Could not load online users. Check Firestore rules.</div>`;
  });

  listenToChats(user.uid);
});

window.addEventListener("beforeunload", () => {
  // Best-effort only; browser unload may terminate before Firestore finishes.
  setPresence(false);
});

setupUI();
