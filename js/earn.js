import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONNECTA EARN SETTINGS
========================================================= */

const CONNECTA_DOMAIN =
  "https://connecta.com";

const MIN_DEPOSIT =
  50;

const MIN_WITHDRAWAL =
  100;

const REFERRAL_REWARD =
  5;


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentProfile = null;

let currentBalance = 0;

let unsubscribeTransactions = null;


/* =========================================================
   ELEMENTS
========================================================= */

const walletBalance =
  document.getElementById(
    "walletBalance"
  );

const balanceAmount =
  document.getElementById(
    "balanceAmount"
  );

const inviteLink =
  document.getElementById(
    "inviteLink"
  );

const depositForm =
  document.getElementById(
    "depositForm"
  );

const withdrawForm =
  document.getElementById(
    "withdrawForm"
  );

const depositPhone =
  document.getElementById(
    "depositPhone"
  );

const depositAmount =
  document.getElementById(
    "depositAmount"
  );

const withdrawPhone =
  document.getElementById(
    "withdrawPhone"
  );

const withdrawAmount =
  document.getElementById(
    "withdrawAmount"
  );

const depositSubmitBtn =
  document.getElementById(
    "depositSubmitBtn"
  );

const withdrawSubmitBtn =
  document.getElementById(
    "withdrawSubmitBtn"
  );

const transactionList =
  document.getElementById(
    "transactionList"
  );

const toast =
  document.getElementById(
    "earnToast"
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
   TOAST
========================================================= */

let toastTimer = null;


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
      2800
    );

}


/* =========================================================
   ESCAPE HTML
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

function getFullName(
  profile = {}
) {

  const first =
    String(
      profile.firstName || ""
    ).trim();

  const last =
    String(
      profile.lastName || ""
    ).trim();


  const combined =
    `${first} ${last}`.trim();


  if (combined) {
    return combined;
  }


  if (profile.displayName) {

    return String(
      profile.displayName
    ).trim();

  }


  if (profile.username) {

    return `@${profile.username}`;

  }


  return "CONNECTA User";

}


/* =========================================================
   INITIALS
========================================================= */

function getInitials(
  profile = {}
) {

  const name =
    getFullName(
      profile
    );


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
   RENDER HEADER PROFILE
========================================================= */

function renderHeaderProfile() {

  if (!currentProfile) {
    return;
  }


  if (menuName) {

    menuName.textContent =
      getFullName(
        currentProfile
      );

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

}


/* =========================================================
   RENDER BALANCE
========================================================= */

function renderBalance() {

  const amount =
    Number(
      currentBalance || 0
    );


  const formatted =
    amount.toFixed(2);


  if (walletBalance) {

    walletBalance.textContent =
      `KSh ${formatted}`;

  }


  if (balanceAmount) {

    balanceAmount.textContent =
      formatted;

  }

}


/* =========================================================
   REFERRAL LINK
========================================================= */

function renderReferralLink() {

  const code =
    String(
      currentProfile?.referralCode || ""
    )
      .trim();


  if (!inviteLink) {
    return;
  }


  if (!code) {

    inviteLink.value =
      "Referral link unavailable";

    return;

  }


  const link =
    `${CONNECTA_DOMAIN}/register.html?ref=${encodeURIComponent(code)}`;


  inviteLink.value =
    link;

}


/* =========================================================
   COPY TEXT
========================================================= */

async function copyText(
  text,
  message
) {

  if (
    !text ||
    text.includes(
      "unavailable"
    )
  ) {

    showToast(
      "The referral link is not available yet."
    );

    return;

  }


  try {

    await navigator.clipboard.writeText(
      text
    );


    showToast(
      message
    );


  } catch (error) {

    /*
     * Clipboard fallback.
     */

    const textarea =
      document.createElement(
        "textarea"
      );


    textarea.value =
      text;


    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";


    document.body.appendChild(
      textarea
    );


    textarea.select();


    try {

      document.execCommand(
        "copy"
      );

      showToast(
        message
      );

    } catch (copyError) {

      console.error(
        "Copy failed:",
        copyError
      );


      showToast(
        "Unable to copy the link."
      );

    }


    textarea.remove();

  }

}


/* =========================================================
   COPY REFERRAL LINK
========================================================= */

const copyInviteBtn =
  document.getElementById(
    "copyInviteBtn"
  );


if (copyInviteBtn) {

  copyInviteBtn.addEventListener(
    "click",
    () => {

      copyText(
        inviteLink?.value || "",
        "Referral link copied!"
      );

    }
  );

}


/* =========================================================
   SHARE MESSAGE
========================================================= */

function getShareMessage() {

  const link =
    inviteLink?.value || "";


  return (
    `Join me on CONNECTA — Connect • Chat • Share 💚\n\n` +
    `Create your CONNECTA account using my invite link:\n` +
    `${link}\n\n` +
    `You can connect, chat and share on CONNECTA.`
  );

}


/* =========================================================
   WHATSAPP
========================================================= */

const whatsappShareBtn =
  document.getElementById(
    "whatsappShareBtn"
  );


if (whatsappShareBtn) {

  whatsappShareBtn.addEventListener(
    "click",
    () => {

      const message =
        encodeURIComponent(
          getShareMessage()
        );


      window.open(
        `https://wa.me/?text=${message}`,
        "_blank",
        "noopener,noreferrer"
      );

    }
  );

}


/* =========================================================
   FACEBOOK
========================================================= */

const facebookShareBtn =
  document.getElementById(
    "facebookShareBtn"
  );


if (facebookShareBtn) {

  facebookShareBtn.addEventListener(
    "click",
    () => {

      const link =
        encodeURIComponent(
          inviteLink?.value || ""
        );


      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${link}`,
        "_blank",
        "noopener,noreferrer"
      );

    }
  );

}


/* =========================================================
   TELEGRAM
========================================================= */

const telegramShareBtn =
  document.getElementById(
    "telegramShareBtn"
  );


if (telegramShareBtn) {

  telegramShareBtn.addEventListener(
    "click",
    () => {

      const link =
        encodeURIComponent(
          inviteLink?.value || ""
        );


      const text =
        encodeURIComponent(
          "Join me on CONNECTA — Connect • Chat • Share 💚"
        );


      window.open(
        `https://t.me/share/url?url=${link}&text=${text}`,
        "_blank",
        "noopener,noreferrer"
      );

    }
  );

}


/* =========================================================
   NATIVE SHARE
========================================================= */

const moreShareBtn =
  document.getElementById(
    "moreShareBtn"
  );


if (moreShareBtn) {

  moreShareBtn.addEventListener(
    "click",
    async () => {

      const link =
        inviteLink?.value || "";


      if (
        !link ||
        link.includes(
          "unavailable"
        )
      ) {

        showToast(
          "Referral link is not available yet."
        );

        return;

      }


      if (
        navigator.share
      ) {

        try {

          await navigator.share({

            title:
              "Join me on CONNECTA",

            text:
              "Join me on CONNECTA — Connect • Chat • Share 💚",

            url:
              link

          });

        } catch (error) {

          /*
           * User cancelled the share sheet.
           */

        }


        return;

      }


      copyText(
        link,
        "Referral link copied!"
      );

    }
  );

}


/* =========================================================
   NORMALIZE KENYAN PHONE
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
    phone.startsWith(
      "+254"
    )
  ) {

    return phone.slice(1);

  }


  if (
    phone.startsWith(
      "254"
    )
  ) {

    return phone;

  }


  if (
    phone.startsWith(
      "0"
    ) &&
    phone.length === 10
  ) {

    return (
      "254" +
      phone.slice(1)
    );

  }


  return phone;

}


/* =========================================================
   VALIDATE KENYAN PHONE
========================================================= */

function isValidKenyanPhone(
  value
) {

  const phone =
    normalizeKenyanPhone(
      value
    );


  return /^254(7|1)\d{8}$/.test(
    phone
  );

}


/* =========================================================
   GET NUMERIC AMOUNT
========================================================= */

function getAmount(
  value
) {

  const amount =
    Number(
      value
    );


  if (
    !Number.isFinite(
      amount
    )
  ) {

    return 0;

  }


  return amount;

}


/* =========================================================
   DEPOSIT
========================================================= */

if (depositForm) {

  depositForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (!currentUser) {

        showToast(
          "Please login first."
        );

        return;

      }


      const phone =
        normalizeKenyanPhone(
          depositPhone.value
        );


      const amount =
        getAmount(
          depositAmount.value
        );


      /* -----------------------------------------------
         PHONE VALIDATION
      ------------------------------------------------ */

      if (
        !isValidKenyanPhone(
          phone
        )
      ) {

        showToast(
          "Enter a valid Kenyan M-PESA number."
        );

        return;

      }


      /* -----------------------------------------------
         AMOUNT VALIDATION
      ------------------------------------------------ */

      if (
        amount < MIN_DEPOSIT
      ) {

        showToast(
          `Minimum deposit is KSh ${MIN_DEPOSIT}.`
        );

        return;

      }


      if (
        !Number.isInteger(
          amount
        )
      ) {

        showToast(
          "Deposit amount must be a whole number."
        );

        return;

      }


      if (depositSubmitBtn) {

        depositSubmitBtn.disabled =
          true;

        depositSubmitBtn.textContent =
          "Submitting...";

      }


      try {

        /*
         * IMPORTANT:
         *
         * This creates a deposit REQUEST only.
         *
         * It does NOT increase balance.
         *
         * The backend will later initiate the
         * M-PESA STK Push and confirm payment.
         */

        await addDoc(
          collection(
            db,
            "deposits"
          ),
          {

            userId:
              currentUser.uid,

            phone,

            amount,

            status:
              "pending",

            source:
              "connecta_earn",

            createdAt:
              serverTimestamp()

          }
        );


        depositPhone.value =
          "";


        depositAmount.value =
          "";


        showToast(
          "Deposit request submitted. Payment instructions will follow."
        );


      } catch (error) {

        console.error(
          "Deposit request error:",
          error
        );


        showToast(
          "Unable to submit deposit request."
        );


      } finally {

        if (depositSubmitBtn) {

          depositSubmitBtn.disabled =
            false;

          depositSubmitBtn.textContent =
            "Deposit Money";

        }

      }

    }
  );

}


/* =========================================================
   WITHDRAWAL
========================================================= */

if (withdrawForm) {

  withdrawForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (!currentUser) {

        showToast(
          "Please login first."
        );

        return;

      }


      const phone =
        normalizeKenyanPhone(
          withdrawPhone.value
        );


      const amount =
        getAmount(
          withdrawAmount.value
        );


      /* -----------------------------------------------
         PHONE
      ------------------------------------------------ */

      if (
        !isValidKenyanPhone(
          phone
        )
      ) {

        showToast(
          "Enter a valid Kenyan M-PESA number."
        );

        return;

      }


      /* -----------------------------------------------
         MINIMUM
      ------------------------------------------------ */

      if (
        amount < MIN_WITHDRAWAL
      ) {

        showToast(
          `Minimum withdrawal is KSh ${MIN_WITHDRAWAL}.`
        );

        return;

      }


      if (
        !Number.isInteger(
          amount
        )
      ) {

        showToast(
          "Withdrawal amount must be a whole number."
        );

        return;

      }


      /* -----------------------------------------------
         BALANCE
      ------------------------------------------------ */

      if (
        amount >
        currentBalance
      ) {

        showToast(
          "Insufficient wallet balance."
        );

        return;

      }


      if (withdrawSubmitBtn) {

        withdrawSubmitBtn.disabled =
          true;

        withdrawSubmitBtn.textContent =
          "Submitting...";

      }


      try {

        /*
         * IMPORTANT:
         *
         * The browser does NOT deduct balance here.
         *
         * This creates an admin-review request.
         *
         * The backend/admin system must verify the
         * real balance and reserve/deduct funds safely.
         */

        await addDoc(
          collection(
            db,
            "withdrawals"
          ),
          {

            userId:
              currentUser.uid,

            phone,

            amount,

            status:
              "pending_admin",

            source:
              "connecta_earn",

            createdAt:
              serverTimestamp(),

            approvedAt:
              null,

            approvedBy:
              null,

            processedAt:
              null

          }
        );


        withdrawPhone.value =
          "";


        withdrawAmount.value =
          "";


        showToast(
          "Withdrawal submitted. Waiting for admin approval."
        );


      } catch (error) {

        console.error(
          "Withdrawal request error:",
          error
        );


        showToast(
          "Unable to submit withdrawal request."
        );


      } finally {

        if (withdrawSubmitBtn) {

          withdrawSubmitBtn.disabled =
            false;

          withdrawSubmitBtn.textContent =
            "Submit Withdrawal";

        }

      }

    }
  );

}


/* =========================================================
   LOAD PROFILE
========================================================= */

async function loadProfile() {

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
    snapshot.data();


  currentBalance =
    Number(
      currentProfile.balance || 0
    );


  renderHeaderProfile();

  renderBalance();

  renderReferralLink();

}


/* =========================================================
   REALTIME PROFILE
========================================================= */

function listenToProfile() {

  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  onSnapshot(
    userRef,
    snapshot => {

      if (
        !snapshot.exists()
      ) {

        return;

      }


      currentProfile =
        snapshot.data();


      currentBalance =
        Number(
          currentProfile.balance || 0
        );


      renderHeaderProfile();

      renderBalance();

      renderReferralLink();

    },

    error => {

      console.error(
        "Earn profile listener error:",
        error
      );

    }
  );

}


/* =========================================================
   TRANSACTION DATE
========================================================= */

function formatDate(
  timestamp
) {

  if (
    !timestamp ||
    typeof timestamp.toDate !==
      "function"
  ) {

    return "Recently";

  }


  return timestamp
    .toDate()
    .toLocaleDateString(
      undefined,
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    );

}


/* =========================================================
   TRANSACTION STATUS
========================================================= */

function statusLabel(
  status
) {

  const value =
    String(
      status || ""
    )
      .toLowerCase();


  switch (value) {

    case "completed":
    case "success":
    case "successful":

      return "Completed";


    case "pending":
      return "Pending";


    case "pending_admin":
      return "Awaiting approval";


    case "approved":
      return "Approved";


    case "rejected":
      return "Rejected";


    case "failed":
      return "Failed";


    case "processing":
      return "Processing";


    default:
      return status || "Pending";

  }

}


/* =========================================================
   RENDER TRANSACTION
========================================================= */

function renderTransaction(
  transaction
) {

  const type =
    transaction.type ||
    transaction.transactionType ||
    "";


  const isDeposit =
    type === "deposit";


  const amount =
    Number(
      transaction.amount || 0
    );


  const title =
    isDeposit
      ? "Deposit"
      : "Withdrawal";


  const status =
    statusLabel(
      transaction.status
    );


  const icon =
    isDeposit
      ? "↓"
      : "↑";


  const amountClass =
    isDeposit
      ? "deposit"
      : "withdraw";


  const sign =
    isDeposit
      ? "+"
      : "-";


  return `
    <div class="transaction-item">

      <div
        class="transaction-icon ${amountClass}"
      >
        ${icon}
      </div>


      <div class="transaction-info">

        <div class="transaction-title">
          ${escapeHtml(title)}
          •
          ${escapeHtml(status)}
        </div>

        <div class="transaction-date">
          ${escapeHtml(
            formatDate(
              transaction.createdAt
            )
          )}
        </div>

      </div>


      <div
        class="transaction-amount ${amountClass}"
      >
        ${sign}KSh ${amount.toFixed(2)}
      </div>

    </div>
  `;

}


/* =========================================================
   LISTEN TO WALLET ACTIVITY
========================================================= */

function listenToTransactions() {

  if (!currentUser) {
    return;
  }


  if (unsubscribeTransactions) {

    unsubscribeTransactions();

  }


  /*
   * We listen to both collections separately.
   *
   * This avoids requiring a composite query across
   * two different Firestore collections.
   */

  const depositsQuery =
    query(
      collection(
        db,
        "deposits"
      ),
      where(
        "userId",
        "==",
        currentUser.uid
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(20)
    );


  const withdrawalsQuery =
    query(
      collection(
        db,
        "withdrawals"
      ),
      where(
        "userId",
        "==",
        currentUser.uid
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(20)
    );


  let deposits = [];

  let withdrawals = [];


  function renderCombined() {

    const combined = [

      ...deposits.map(
        item => ({
          id:
            item.id,

          type:
            "deposit",

          ...item
        })
      ),

      ...withdrawals.map(
        item => ({
          id:
            item.id,

          type:
            "withdrawal",

          ...item
        })
      )

    ];


    combined.sort(
      (a, b) => {

        const aTime =
          a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : 0;


        const bTime =
          b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : 0;


        return bTime - aTime;

      }
    );


    const recent =
      combined.slice(
        0,
        20
      );


    if (!recent.length) {

      transactionList.innerHTML = `
        <div class="empty-transactions">
          No wallet transactions yet.
        </div>
      `;

      return;

    }


    transactionList.innerHTML =
      recent
        .map(
          renderTransaction
        )
        .join("");

  }


  const unsubscribeDeposits =
    onSnapshot(
      depositsQuery,
      snapshot => {

        deposits =
          snapshot.docs.map(
            item => ({
              id:
                item.id,

              ...item.data()
            })
          );


        renderCombined();

      },

      error => {

        console.error(
          "Deposit listener error:",
          error
        );

      }
    );


  const unsubscribeWithdrawals =
    onSnapshot(
      withdrawalsQuery,
      snapshot => {

        withdrawals =
          snapshot.docs.map(
            item => ({
              id:
                item.id,

              ...item.data()
            })
          );


        renderCombined();

      },

      error => {

        console.error(
          "Withdrawal listener error:",
          error
        );

      }
    );


  unsubscribeTransactions =
    () => {

      unsubscribeDeposits();

      unsubscribeWithdrawals();

    };

}


/* =========================================================
   SCROLL TO DEPOSIT
========================================================= */

const openDepositBtn =
  document.getElementById(
    "openDepositBtn"
  );


const depositCard =
  document.getElementById(
    "depositCard"
  );


if (openDepositBtn) {

  openDepositBtn.addEventListener(
    "click",
    () => {

      depositCard?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });


      setTimeout(
        () => {

          depositPhone?.focus();

        },
        450
      );

    }
  );

}


/* =========================================================
   SCROLL TO WITHDRAW
========================================================= */

const openWithdrawBtn =
  document.getElementById(
    "openWithdrawBtn"
  );


const withdrawCard =
  document.getElementById(
    "withdrawCard"
  );


if (openWithdrawBtn) {

  openWithdrawBtn.addEventListener(
    "click",
    () => {

      withdrawCard?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });


      setTimeout(
        () => {

          withdrawPhone?.focus();

        },
        450
      );

    }
  );

}


/* =========================================================
   MENU
========================================================= */

if (menuBtn) {

  menuBtn.addEventListener(
    "click",
    () => {

      sideMenu?.classList.add(
        "open"
      );

      menuOverlay?.classList.add(
        "show"
      );

      sideMenu?.setAttribute(
        "aria-hidden",
        "false"
      );

    }
  );

}


if (menuOverlay) {

  menuOverlay.addEventListener(
    "click",
    () => {

      sideMenu?.classList.remove(
        "open"
      );

      menuOverlay?.classList.remove(
        "show"
      );

      sideMenu?.setAttribute(
        "aria-hidden",
        "true"
      );

    }
  );

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

        if (
          unsubscribeTransactions
        ) {

          unsubscribeTransactions();

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

      await loadProfile();

      listenToProfile();

      listenToTransactions();

    } catch (error) {

      console.error(
        "Earn page startup error:",
        error
      );


      showToast(
        error.message ||
        "Unable to load your wallet."
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

    if (
      unsubscribeTransactions
    ) {

      unsubscribeTransactions();

    }

  }
);
