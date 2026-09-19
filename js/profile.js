import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* ========================================
   CONFIGURATION
======================================== */

const API_BASE_URL =
  "https://connecta-backend-com.onrender.com";


const VERIFICATION_AMOUNT = 1;


/* ========================================
   HELPERS
======================================== */

const $ = (id) =>
  document.getElementById(id);


let currentUser = null;
let viewedUser = null;

let verificationPollTimer = null;
let verificationPolling = false;


/* ========================================
   INITIALS
======================================== */

function initials(name = "U") {

  const parts = name
    .trim()
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


/* ========================================
   FULL NAME
======================================== */

function getFullName(user = {}) {

  if (user.displayName) {
    return user.displayName.trim();
  }

  const fullName =
    `${user.firstName || ""} ${user.lastName || ""}`
      .trim();

  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return user.username;
  }

  return "CONNECTA User";
}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeHtml(value = "") {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* ========================================
   GET PROFILE UID
======================================== */

function getProfileUid() {

  const params =
    new URLSearchParams(window.location.search);

  return params.get("uid");
}


/* ========================================
   FORMAT NUMBER
======================================== */

function formatNumber(value) {

  const number = Number(value || 0);

  return number.toLocaleString();
}


/* ========================================
   RENDER PROFILE
======================================== */

function renderProfile(profile) {

  viewedUser = profile;

  const container =
    $("profileContainer");

  if (!container) {
    return;
  }


  const name =
    getFullName(profile);


  const username =
    profile.username
      ? `@${profile.username}`
      : "";


  const isOnline =
    profile.isOnline === true;


  const isVerified =
    profile.isVerified === true;


  const followers =
    Number(profile.followersCount || 0);


  const following =
    Number(profile.followingCount || 0);


  const photo =
    profile.photoURL ||
    profile.photoUrl ||
    "";


  const avatar =
    photo

      ? `
        <img
          src="${escapeHtml(photo)}"
          alt="${escapeHtml(name)}"
        >
      `

      : initials(name);


  const verifiedBadge =
    isVerified

      ? `
        <span
          class="verified-badge"
          title="Verified account"
          aria-label="Verified account"
        >
          ✓
        </span>
      `

      : "";


  const statusHtml = isOnline

    ? `
      <div class="profile-status online">

        <span class="profile-status-dot online"></span>

        Online

      </div>
    `

    : `
      <div class="profile-status offline">

        <span class="profile-status-dot offline"></span>

        Offline

      </div>
    `;


  const bio =
    profile.bio
      ? escapeHtml(profile.bio)
      : "";


  const isOwnProfile =
    currentUser &&
    currentUser.uid === profile.uid;


  let actionsHtml = "";


  /* ========================================
     OWN PROFILE
  ======================================== */

  if (isOwnProfile) {

    if (isVerified) {

      actionsHtml = `

        <button
          id="editProfileBtn"
          class="profile-edit-btn"
          type="button"
        >
          Edit Profile
        </button>

        <div class="profile-verified-message">
          ✓ Your account is verified
        </div>

      `;

    } else {

      const paymentPending =
        profile.verificationStatus === "payment_pending";


      actionsHtml = `

        <button
          id="editProfileBtn"
          class="profile-edit-btn"
          type="button"
        >
          Edit Profile
        </button>

        <button
          id="verifyAccountBtn"
          class="profile-verify-btn"
          type="button"
          ${paymentPending ? "disabled" : ""}
        >
          ${
            paymentPending
              ? "Verification Payment Pending..."
              : "✓ Verify Account — KSh 999"
          }
        </button>

      `;

    }

  }

  /* ========================================
     OTHER USER
  ======================================== */

  else {

    actionsHtml = `

      <button
        id="chatProfileBtn"
        class="profile-chat-btn"
        type="button"
      >
        Chat
      </button>

    `;

  }


  container.innerHTML = `

    <article class="profile-card">

      <div class="profile-cover"></div>


      <div class="profile-avatar-wrap">

        <div class="profile-avatar">

          ${avatar}

        </div>

      </div>


      <div class="profile-info">

        <div class="profile-name">

          <span>
            ${escapeHtml(name)}
          </span>

          ${verifiedBadge}

        </div>


        ${
          username

            ? `
              <div class="profile-username">
                ${escapeHtml(username)}
              </div>
            `

            : ""
        }


        ${statusHtml}


        ${
          bio

            ? `
              <div class="profile-bio">
                ${bio}
              </div>
            `

            : ""
        }


        <div class="profile-stats">

          <div class="profile-stat">

            <strong>
              ${formatNumber(followers)}
            </strong>

            <span>
              Followers
            </span>

          </div>


          <div class="profile-stat">

            <strong>
              ${formatNumber(following)}
            </strong>

            <span>
              Following
            </span>

          </div>

        </div>


        <div class="profile-actions">

          ${actionsHtml}

        </div>

      </div>

    </article>


    <section class="profile-section">

      <div class="profile-section-title">
        Stories
      </div>

      <div class="profile-empty">
        No stories available yet.
      </div>

    </section>

  `;


  /* ========================================
     CHAT
  ======================================== */

  const chatButton =
    $("chatProfileBtn");

  if (chatButton) {

    chatButton.addEventListener(
      "click",
      () => {

        location.href =
          `chat.html?uid=${encodeURIComponent(profile.uid)}`;

      }
    );

  }


  /* ========================================
     EDIT PROFILE
  ======================================== */

  const editButton =
    $("editProfileBtn");

  if (editButton) {

    editButton.addEventListener(
      "click",
      () => {

        /*
         * Profile editing will be connected
         * to the photo/bio editor next.
         */
        alert(
          "Profile editing will be available here."
        );

      }
    );

  }


  /* ========================================
     VERIFY ACCOUNT
  ======================================== */

  const verifyButton =
    $("verifyAccountBtn");

  if (verifyButton) {

    verifyButton.addEventListener(
      "click",
      openVerificationModal
    );

  }

}


/* ========================================
   LOAD PROFILE
======================================== */

async function loadProfile(uid) {

  const container =
    $("profileContainer");

  if (!container) {
    return;
  }


  container.innerHTML = `

    <div class="profile-loading">
      Loading profile...
    </div>

  `;


  try {

    const profileRef =
      doc(db, "users", uid);


    const snapshot =
      await getDoc(profileRef);


    if (!snapshot.exists()) {

      container.innerHTML = `

        <div class="profile-error">
          This profile could not be found.
        </div>

      `;

      return;
    }


    renderProfile({
      uid,
      ...snapshot.data()
    });


  } catch (error) {

    console.error(
      "Profile loading error:",
      error
    );


    container.innerHTML = `

      <div class="profile-error">
        Unable to load this profile.
        Please check your connection and try again.
      </div>

    `;

  }

}


/* ========================================
   VERIFICATION MODAL
======================================== */

function openVerificationModal() {

  if (!currentUser) {

    alert(
      "Please login before verifying your account."
    );

    return;
  }


  const modal =
    $("verificationModal");

  const phoneInput =
    $("verificationPhone");

  const message =
    $("verificationMessage");


  if (!modal) {
    return;
  }


  message.textContent = "";
  message.className =
    "verification-message";


  /*
   * Use the phone saved in the user's
   * CONNECTA profile as the default.
   */

  if (
    phoneInput &&
    viewedUser &&
    viewedUser.phone
  ) {

    phoneInput.value =
      viewedUser.phone;

  }


  modal.classList.add("show");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  setTimeout(() => {

    if (phoneInput) {
      phoneInput.focus();
    }

  }, 100);

}


/* ========================================
   CLOSE VERIFICATION MODAL
======================================== */

function closeVerificationModal() {

  const modal =
    $("verificationModal");

  if (!modal) {
    return;
  }


  modal.classList.remove("show");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}


/* ========================================
   PHONE NORMALIZATION
======================================== */

function normalizePhone(phone) {

  let value =
    String(phone || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/-/g, "");


  if (value.startsWith("+254")) {

    value =
      value.slice(1);

  }


  if (
    value.startsWith("07") ||
    value.startsWith("01")
  ) {

    value =
      "254" + value.slice(1);

  }


  return value;
}


/* ========================================
   PHONE VALIDATION
======================================== */

function isValidKenyanPhone(phone) {

  return /^254[17]\d{8}$/.test(phone);

}


/* ========================================
   VERIFICATION MESSAGE
======================================== */

function setVerificationMessage(
  message,
  type = ""
) {

  const element =
    $("verificationMessage");

  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.className =
    `verification-message ${type}`.trim();

}


/* ========================================
   VERIFY ACCOUNT
======================================== */

async function startVerification() {

  if (!currentUser) {

    setVerificationMessage(
      "Please login again before continuing.",
      "error"
    );

    return;

  }


  const phoneInput =
    $("verificationPhone");


  const submitButton =
    $("verificationSubmit");


  if (!phoneInput || !submitButton) {
    return;
  }


  const phone =
    normalizePhone(
      phoneInput.value
    );


  if (!isValidKenyanPhone(phone)) {

    setVerificationMessage(
      "Enter a valid Kenyan M-PESA number, for example 0712345678.",
      "error"
    );

    phoneInput.focus();

    return;
  }


  submitButton.disabled = true;

  submitButton.textContent =
    "Starting payment...";


  setVerificationMessage(
    "Sending the verification payment request...",
    "pending"
  );


  try {

    /*
     * Get a fresh Firebase ID token.
     */

    const token =
      await currentUser.getIdToken(true);


    const response =
      await fetch(
        `${API_BASE_URL}/api/verification/initiate`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },

          body: JSON.stringify({
            phone
          })
        }
      );


    const data =
      await response.json()
        .catch(() => ({}));


    if (!response.ok) {

      throw new Error(
        data.message ||
        data.error ||
        "Unable to start verification payment."
      );

    }


    if (!data.success) {

      throw new Error(
        data.message ||
        "Unable to start verification payment."
      );

    }


    setVerificationMessage(
      "STK Push sent. Check your phone and enter your M-PESA PIN to complete the KSh 999 payment.",
      "pending"
    );


    submitButton.textContent =
      "Waiting for payment...";


    /*
     * Begin checking payment status.
     */

    if (data.reference) {

      startVerificationPolling(
        data.reference
      );

    } else if (data.checkout_request_id) {

      startVerificationPolling(
        data.checkout_request_id
      );

    } else {

      throw new Error(
        "Payment started but no payment reference was returned."
      );

    }


  } catch (error) {

    console.error(
      "Verification initiation error:",
      error
    );


    setVerificationMessage(
      error.message ||
      "Unable to start verification payment.",
      "error"
    );


    submitButton.disabled = false;

    submitButton.textContent =
      `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

  }

}


/* ========================================
   POLL VERIFICATION STATUS
======================================== */

function startVerificationPolling(
  reference
) {

  if (verificationPolling) {
    return;
  }


  verificationPolling = true;


  let attempts = 0;

  const maxAttempts = 40;


  clearInterval(
    verificationPollTimer
  );


  verificationPollTimer =
    setInterval(
      async () => {

        attempts++;


        try {

          const completed =
            await checkVerificationStatus(
              reference
            );


          if (completed) {

            clearInterval(
              verificationPollTimer
            );

            verificationPollTimer =
              null;

            verificationPolling =
              false;

            return;

          }


          if (attempts >= maxAttempts) {

            clearInterval(
              verificationPollTimer
            );

            verificationPollTimer =
              null;

            verificationPolling =
              false;


            const submitButton =
              $("verificationSubmit");


            if (submitButton) {

              submitButton.disabled =
                false;

              submitButton.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

            }


            setVerificationMessage(
              "We are still waiting for payment confirmation. If you completed the payment, please wait a little and check your profile again.",
              "pending"
            );

          }


        } catch (error) {

          console.error(
            "Verification status error:",
            error
          );


          /*
           * Do not immediately fail the payment
           * because a temporary network error
           * may occur.
           */

          if (attempts >= maxAttempts) {

            clearInterval(
              verificationPollTimer
            );

            verificationPollTimer =
              null;

            verificationPolling =
              false;


            const submitButton =
              $("verificationSubmit");


            if (submitButton) {

              submitButton.disabled =
                false;

              submitButton.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

            }


            setVerificationMessage(
              "Payment confirmation is taking longer than expected. Please check your profile again shortly.",
              "pending"
            );

          }

        }

      },
      3000
    );

}


/* ========================================
   CHECK VERIFICATION STATUS
======================================== */

async function checkVerificationStatus(
  reference
) {

  const token =
    await currentUser.getIdToken(true);


  const response =
    await fetch(
      `${API_BASE_URL}/api/verification/status`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
          reference
        })
      }
    );


  const data =
    await response.json()
      .catch(() => ({}));


  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      "Unable to check verification status."
    );

  }


  /*
   * PAYMENT COMPLETED
   */

  if (
    data.success === true &&
    (
      data.status === "completed" ||
      data.status === "verified"
    )
  ) {

    setVerificationMessage(
      "Payment confirmed. Your account has been verified successfully.",
      "success"
    );


    const submitButton =
      $("verificationSubmit");


    if (submitButton) {

      submitButton.disabled =
        true;

      submitButton.textContent =
        "✓ Account Verified";

    }


    /*
     * Reload the profile from Firestore.
     * The backend is responsible for setting
     * isVerified = true.
     */

    setTimeout(
      async () => {

        closeVerificationModal();

        await loadProfile(
          currentUser.uid
        );

      },
      1200
    );


    return true;

  }


  /*
   * PAYMENT FAILED
   */

  if (
    data.status === "failed"
  ) {

    setVerificationMessage(
      data.message ||
      "The verification payment failed. Please try again.",
      "error"
    );


    const submitButton =
      $("verificationSubmit");


    if (submitButton) {

      submitButton.disabled =
        false;

      submitButton.textContent =
        `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

    }


    return true;

  }


  /*
   * STILL PENDING
   */

  setVerificationMessage(
    "Waiting for M-PESA payment confirmation...",
    "pending"
  );


  return false;

}


/* ========================================
   BACK BUTTON
======================================== */

const backButton =
  $("backBtn");


if (backButton) {

  backButton.addEventListener(
    "click",
    () => {

      if (
        document.referrer &&
        document.referrer !== location.href
      ) {

        history.back();

      } else {

        location.href =
          "dashboard.html";

      }

    }
  );

}


/* ========================================
   MODAL EVENTS
======================================== */

const verificationClose =
  $("verificationClose");


if (verificationClose) {

  verificationClose.addEventListener(
    "click",
    closeVerificationModal
  );

}


const verificationModal =
  $("verificationModal");


if (verificationModal) {

  verificationModal.addEventListener(
    "click",
    event => {

      if (
        event.target === verificationModal
      ) {

        closeVerificationModal();

      }

    }
  );

}


/* ========================================
   VERIFY SUBMIT
======================================== */

const verificationSubmit =
  $("verificationSubmit");


if (verificationSubmit) {

  verificationSubmit.addEventListener(
    "click",
    startVerification
  );

}


/* ========================================
   AUTH STATE
======================================== */

onAuthStateChanged(
  auth,
  async user => {

    currentUser = user;


    if (!user) {

      location.replace(
        "login.html"
      );

      return;

    }


    /*
     * If ?uid= is present, show that user's
     * profile. Otherwise show own profile.
     */

    const requestedUid =
      getProfileUid();


    const profileUid =
      requestedUid ||
      user.uid;


    await loadProfile(
      profileUid
    );

  }
);
