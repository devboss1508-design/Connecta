import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


const $ = (id) =>
  document.getElementById(id);


let currentUser = null;
let currentProfile = null;
let otherUser = null;

let chatId = null;
let stopMessages = null;


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
   GET OTHER USER UID
======================================== */

function getOtherUid() {

  const params =
    new URLSearchParams(location.search);

  return params.get("uid");

}


/* ========================================
   CREATE DETERMINISTIC CHAT ID
======================================== */

function createChatId(uid1, uid2) {

  return [uid1, uid2]
    .sort()
    .join("_");

}


/* ========================================
   FORMAT TIME
======================================== */

function formatTime(timestamp) {

  if (!timestamp?.toDate) {
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


/* ========================================
   RENDER HEADER
======================================== */

function renderChatHeader(user) {

  const name =
    getFullName(user);

  const photo =
    user.photoURL ||
    user.photoUrl ||
    "";

  $("chatUserName").textContent =
    name;


  if (photo) {

    $("chatAvatar").innerHTML = `
      <img
        src="${escapeHtml(photo)}"
        alt="${escapeHtml(name)}"
      >
    `;

  } else {

    $("chatAvatar").textContent =
      initials(name);

  }


  updateUserStatus(user);

}


/* ========================================
   UPDATE ONLINE STATUS
======================================== */

function updateUserStatus(user) {

  const online =
    user.isOnline === true;


  const statusText =
    $("chatStatusText");

  const statusDot =
    $("chatStatusDot");

  const status =
    $("chatUserStatus");


  statusText.textContent =
    online ? "Online" : "Offline";


  status.classList.remove(
    "chat-status-online",
    "chat-status-offline"
  );

  status.classList.add(
    online
      ? "chat-status-online"
      : "chat-status-offline"
  );


  statusDot.classList.remove(
    "online",
    "offline"
  );

  statusDot.classList.add(
    online
      ? "online"
      : "offline"
  );

}


/* ========================================
   LOAD USER PROFILE
======================================== */

async function loadOtherUser(uid) {

  const userRef =
    doc(db, "users", uid);

  const snap =
    await getDoc(userRef);


  if (!snap.exists()) {

    throw new Error(
      "User profile not found."
    );

  }


  otherUser = {
    uid,
    ...snap.data()
  };


  renderChatHeader(
    otherUser
  );

}


/* ========================================
   LISTEN TO USER STATUS
======================================== */

function listenToOtherUser(uid) {

  return onSnapshot(
    doc(db, "users", uid),
    snapshot => {

      if (!snapshot.exists()) {
        return;
      }

      otherUser = {
        uid,
        ...snapshot.data()
      };

      renderChatHeader(
        otherUser
      );

    },
    error => {

      console.warn(
        "User status listener:",
        error
      );

    }
  );

}


/* ========================================
   CREATE CHAT
======================================== */

async function ensureChat() {

  chatId =
    createChatId(
      currentUser.uid,
      otherUser.uid
    );


  const chatRef =
    doc(db, "chats", chatId);


  const chatSnap =
    await getDoc(chatRef);


  if (!chatSnap.exists()) {

    await setDoc(
      chatRef,
      {
        id: chatId,

        participants: [
          currentUser.uid,
          otherUser.uid
        ],

        lastMessage: "",

        updatedAt:
          serverTimestamp(),

        createdAt:
          serverTimestamp()

      }
    );

  }

}


/* ========================================
   LISTEN TO MESSAGES
======================================== */

function listenToMessages() {

  if (!chatId) {
    return;
  }


  const messagesRef =
    collection(
      db,
      "chats",
      chatId,
      "messages"
    );


  const messagesQuery =
    query(
      messagesRef,
      orderBy(
        "createdAt",
        "asc"
      )
    );


  stopMessages =
    onSnapshot(
      messagesQuery,
      snapshot => {

        const messages =
          snapshot.docs.map(
            message => ({
              id: message.id,
              ...message.data()
            })
          );


        renderMessages(
          messages
        );

      },
      error => {

        console.error(
          "Messages listener:",
          error
        );


        $("messagesContainer").innerHTML = `
          <div class="chat-error">
            Could not load messages.
            Please check your Firestore rules.
          </div>
        `;

      }
    );

}


/* ========================================
   RENDER MESSAGES
======================================== */

function renderMessages(messages) {

  const box =
    $("messagesContainer");


  if (!messages.length) {

    box.innerHTML = `

      <div class="chat-empty">

        <div class="chat-empty-icon">
          💬
        </div>

        <strong>
          Start the conversation
        </strong>

        <div style="margin-top:5px;">
          Say hello to
          ${escapeHtml(getFullName(otherUser))}
        </div>

      </div>

    `;

    return;

  }


  box.innerHTML =
    messages.map(message => {

      const mine =
        message.senderId === currentUser.uid;


      return `

        <div
          class="message-row ${mine ? "mine" : "theirs"}"
        >

          <div class="message-bubble">

            <div>
              ${escapeHtml(message.text)}
            </div>

            <div class="message-meta">

              <span>
                ${formatTime(message.createdAt)}
              </span>

              ${
                mine
                  ? `<span>✓</span>`
                  : ""
              }

            </div>

          </div>

        </div>

      `;

    }).join("");


  requestAnimationFrame(() => {

    box.scrollTop =
      box.scrollHeight;

  });

}


/* ========================================
   SEND MESSAGE
======================================== */

async function sendMessage() {

  const input =
    $("messageInput");

  const text =
    input.value.trim();


  if (!text) {
    return;
  }


  if (!currentUser || !otherUser) {
    return;
  }


  if (!chatId) {
    return;
  }


  const sendButton =
    $("sendButton");


  sendButton.disabled =
    true;


  try {

    const messagesRef =
      collection(
        db,
        "chats",
        chatId,
        "messages"
      );


    await addDoc(
      messagesRef,
      {
        senderId:
          currentUser.uid,

        receiverId:
          otherUser.uid,

        text,

        createdAt:
          serverTimestamp(),

        read: false
      }
    );


    await setDoc(
      doc(
        db,
        "chats",
        chatId
      ),
      {
        participants: [
          currentUser.uid,
          otherUser.uid
        ],

        lastMessage:
          text,

        lastSenderId:
          currentUser.uid,

        updatedAt:
          serverTimestamp()

      },
      {
        merge: true
      }
    );


    input.value = "";

    resizeTextarea();


  } catch (error) {

    console.error(
      "Send message error:",
      error
    );


    alert(
      "Message could not be sent."
    );

  } finally {

    sendButton.disabled =
      false;

    input.focus();

  }

}


/* ========================================
   TEXTAREA AUTO RESIZE
======================================== */

function resizeTextarea() {

  const input =
    $("messageInput");


  input.style.height =
    "auto";


  input.style.height =
    Math.min(
      input.scrollHeight,
      100
    ) + "px";

}


/* ========================================
   SETUP UI
======================================== */

function setupUI() {


  /* BACK */

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


  /* PROFILE */

  $("profileBtn").addEventListener(
    "click",
    () => {

      if (!otherUser?.uid) {
        return;
      }

      location.href =
        `profile.html?uid=${encodeURIComponent(otherUser.uid)}`;

    }
  );


  /* SEND */

  $("messageForm").addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      await sendMessage();

    }
  );


  /* ENTER TO SEND */

  $("messageInput").addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        $("messageForm").requestSubmit();

      }

    }
  );


  /* AUTO RESIZE */

  $("messageInput").addEventListener(
    "input",
    resizeTextarea
  );

}


/* ========================================
   AUTH
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


    currentUser =
      user;


    const otherUid =
      getOtherUid();


    if (!otherUid) {

      $("messagesContainer").innerHTML = `
        <div class="chat-error">
          No user was selected for this conversation.
        </div>
      `;

      $("messageForm").style.display =
        "none";

      return;

    }


    if (
      otherUid ===
      currentUser.uid
    ) {

      $("messagesContainer").innerHTML = `
        <div class="chat-error">
          You cannot start a private chat with yourself.
        </div>
      `;

      $("messageForm").style.display =
        "none";

      return;

    }


    try {

      /*
      ======================================
      LOAD OTHER USER
      ======================================
      */

      await loadOtherUser(
        otherUid
      );


      /*
      ======================================
      CREATE / VERIFY CHAT
      ======================================
      */

      await ensureChat();


      /*
      ======================================
      LISTEN FOR MESSAGES
      ======================================
      */

      listenToMessages();


      /*
      ======================================
      LIVE USER STATUS
      ======================================
      */

      listenToOtherUser(
        otherUid
      );


    } catch (error) {

      console.error(
        "Chat initialization error:",
        error
      );


      $("messagesContainer").innerHTML = `
        <div class="chat-error">
          Could not open this conversation.
          Please try again.
        </div>
      `;

    }

  }
);


window.addEventListener(
  "beforeunload",
  () => {

    if (stopMessages) {
      stopMessages();
    }

  }
);


setupUI();
