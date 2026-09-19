import { auth, db, storage } from "./firebase.js";

import {
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";


/* ========================================
   CONFIGURATION
======================================== */

const API_BASE_URL =
  "https://connecta-backend-com.onrender.com";


/*
 * IMPORTANT:
 * Account verification costs KSh 999.
 */
const VERIFICATION_AMOUNT = 1;


/* ========================================
   STATE
======================================== */

let currentUser = null;

let viewedUser = null;

let verificationPollTimer = null;

let verificationPolling = false;


/* ========================================
   HELPER
======================================== */

const $ = id =>
  document.getElementById(id);


/* ========================================
   INITIALS
======================================== */

function initials(name = "U") {

  const parts =
    name
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
   PROFILE UID
======================================== */

function getProfileUid() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  return params.get("uid");

}


/* ========================================
   NUMBER FORMAT
======================================== */

function formatNumber(value) {

  const number =
    Number(value || 0);


  return number.toLocaleString();

}


/* ========================================
   BALANCE FORMAT
======================================== */

function formatBalance(value) {

  const number =
    Number(value || 0);


  return `KSh ${number.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;

}


/* ========================================
   MARK USER ONLINE
======================================== */

async function markCurrentUserOnline() {

  if (!currentUser) {
    return;
  }


  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );


    await updateDoc(
      userRef,
      {
        isOnline: true,
        lastSeen: serverTimestamp()
      }
    );


    console.log(
      "CONNECTA: user marked online"
    );


  } catch (error) {

    console.error(
      "Unable to update online status:",
      error
    );

  }

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


  /*
   * IMPORTANT:
   *
   * If this is the logged-in user's own
   * profile, treat them as online because
   * they are currently inside CONNECTA.
   */

  const isOwnProfile =
    currentUser &&
    currentUser.uid === profile.uid;


  const isOnline =
    isOwnProfile
      ? true
      : profile.isOnline === true;


  const isVerified =
    profile.isVerified === true;


  const followers =
    Number(
      profile.followersCount || 0
    );


  const following =
    Number(
      profile.followingCount || 0
    );


  const balance =
    Number(
      profile.balance || 0
    );


  const status =
    profile.status || "active";


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


  /* ========================================
     STATUS
  ======================================== */

  const statusHtml =
    isOnline

      ? `
        <div class="profile-status online">

          <span
            class="profile-status-dot online"
          ></span>

          Online

        </div>
      `

      : `
        <div class="profile-status offline">

          <span
            class="profile-status-dot offline"
          ></span>

          Offline

        </div>
      `;


  /* ========================================
     BIO
  ======================================== */

  const bioHtml =
    profile.bio

      ? `
        <div class="profile-bio">
          ${escapeHtml(profile.bio)}
        </div>
      `

      : "";


  /* ========================================
     ACTION
  ======================================== */

  let actionHtml = "";


  if (isOwnProfile) {

    if (isVerified) {

      actionHtml = `

        <div class="profile-verified-text">

          <span class="verified-badge">
            ✓
          </span>

          Account Verified

        </div>

      `;

    } else {

      const paymentPending =
        profile.verificationStatus ===
        "payment_pending";


      actionHtml = `

        <button
          id="verifyAccountBtn"
          class="profile-verify-btn"
          type="button"
          ${paymentPending ? "disabled" : ""}
        >

          ${
            paymentPending
              ? "Verification Pending..."
              : "Verify Account"
          }

        </button>

      `;

    }

  } else {

    actionHtml = `

      <button
        id="chatProfileBtn"
        class="profile-chat-btn"
        type="button"
      >
        Chat
      </button>

    `;

  }


  /* ========================================
     PROFILE STRUCTURE
  ======================================== */

  container.innerHTML = `

    <!-- ====================================
         PROFILE HERO
    ==================================== -->

    <section class="profile-hero">

      <div class="profile-photo-area">

        <div class="profile-photo-ring">

          <div class="profile-avatar">

            ${avatar}

          </div>

        </div>


        ${
          isOwnProfile

            ? `

              <button
                id="profilePhotoUploadBtn"
                class="profile-photo-upload"
                type="button"
                aria-label="Upload profile photo"
              >
                📷
              </button>

              <input
                id="profilePhotoInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              >

            `

            : ""
        }

      </div>


      ${
        isOwnProfile

          ? `

            <div class="profile-upload-text">
              Tap to upload photo
            </div>

            <div
              id="profileUploadStatus"
              class="profile-upload-status"
            ></div>

          `

          : ""
      }


      <div class="profile-name-row">

        <div class="profile-name">
          ${escapeHtml(name)}
        </div>

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


      ${bioHtml}


      <div class="profile-main-action">

        ${actionHtml}

      </div>

    </section>


    <!-- ====================================
         ACCOUNT STATISTICS
    ==================================== -->

    <section class="profile-card">

      <div class="profile-card-title">
        Account Statistics
      </div>


      <div class="profile-stat-grid">

        <div class="profile-stat-box">

          <div class="profile-stat-label">
            Balance
          </div>

          <div class="profile-stat-value">
            ${formatBalance(balance)}
          </div>

        </div>


        <div class="profile-stat-box">

          <div class="profile-stat-label">
            Status
          </div>

          <div class="profile-stat-value active">
            ${escapeHtml(
              status.charAt(0).toUpperCase() +
              status.slice(1)
            )}
          </div>

        </div>

      </div>


      <div class="profile-stat-grid">

        <div class="profile-stat-box">

          <div class="profile-stat-label">
            Followers
          </div>

          <div class="profile-stat-value">
            ${formatNumber(followers)}
          </div>

        </div>


        <div class="profile-stat-box">

          <div class="profile-stat-label">
            Following
          </div>

          <div class="profile-stat-value">
            ${formatNumber(following)}
          </div>

        </div>

      </div>

    </section>


    <!-- ====================================
         CONTACT INFORMATION
    ==================================== -->

    <section class="profile-card">

      <div class="profile-card-title">
        Contact Information
      </div>


      <div class="profile-info-row">

        <span class="profile-info-label">
          Email:
        </span>

        <span class="profile-info-value">
          ${escapeHtml(profile.email || "Not provided")}
        </span>

      </div>


      <div class="profile-info-row">

        <span class="profile-info-label">
          Phone:
        </span>

        <span class="profile-info-value">
          ${escapeHtml(profile.phone || "Not provided")}
        </span>

      </div>

    </section>


    <!-- ====================================
         REFERRAL INFORMATION
    ==================================== -->

    <section class="profile-card">

      <div class="profile-card-title">
        Referral Information
      </div>


      <div class="profile-info-row">

        <span class="profile-info-label">
          Referral Code:
        </span>

        <span class="profile-info-value">
          ${escapeHtml(
            profile.referralCode || "—"
          )}
        </span>

      </div>


      <div class="profile-info-row">

        <span class="profile-info-label">
          Referrals:
        </span>

        <span class="profile-info-value">
          ${formatNumber(
            profile.referralCount ||
            profile.referralsCount ||
            0
          )}
        </span>

      </div>


      ${
        isOwnProfile

          ? `

            <button
              id="referEarnBtn"
              class="profile-earn-btn"
              type="button"
            >
              Refer & Earn
            </button>

          `

          : ""
      }

    </section>


    <!-- ====================================
         STORIES
    ==================================== -->

    <section class="profile-card profile-stories-card">

      <div class="profile-card-title">
        Stories
      </div>


      <div class="profile-empty">
        No stories available yet.
      </div>

    </section>

  `;


  /* ========================================
     PHOTO UPLOAD EVENTS
  ======================================== */

  if (isOwnProfile) {

    const uploadButton =
      $("profilePhotoUploadBtn");


    const photoInput =
      $("profilePhotoInput");


    if (
      uploadButton &&
      photoInput
    ) {

      uploadButton.addEventListener(
        "click",
        () => {

          photoInput.click();

        }
      );


      photoInput.addEventListener(
        "change",
        handleProfilePhotoUpload
      );

    }

  }


  /* ========================================
     CHAT BUTTON
  ======================================== */

  const chatButton =
    $("chatProfileBtn");


  if (chatButton) {

    chatButton.addEventListener(
      "click",
      () => {

        location.href =
          `chat.html?uid=${encodeURIComponent(
            profile.uid
          )}`;

      }
    );

  }


  /* ========================================
     VERIFY BUTTON
  ======================================== */

  const verifyButton =
    $("verifyAccountBtn");


  if (verifyButton) {

    verifyButton.addEventListener(
      "click",
      openVerificationModal
    );

  }


  /* ========================================
     REFER & EARN
  ======================================== */

  const referEarnButton =
    $("referEarnBtn");


  if (referEarnButton) {

    referEarnButton.addEventListener(
      "click",
      () => {

        location.href =
          "referrals.html";

      }
    );

  }

}


/* ========================================
   PROFILE PHOTO UPLOAD
======================================== */

async function handleProfilePhotoUpload(
  event
) {

  if (!currentUser) {
    return;
  }


  const file =
    event.target.files?.[0];


  if (!file) {
    return;
  }


  const status =
    $("profileUploadStatus");


  /*
   * Basic file validation.
   */

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];


  if (!allowedTypes.includes(file.type)) {

    if (status) {

      status.textContent =
        "Please choose a JPG, PNG or WebP image.";

      status.className =
        "profile-upload-status error";

    }


    event.target.value = "";

    return;

  }


  /*
   * Keep profile images reasonably small.
   */

  if (file.size > 5 * 1024 * 1024) {

    if (status) {

      status.textContent =
        "Photo must be smaller than 5MB.";

      status.className =
        "profile-upload-status error";

    }


    event.target.value = "";

    return;

  }


  if (status) {

    status.textContent =
      "Uploading photo...";

    status.className =
      "profile-upload-status";

  }


  try {

    /*
     * Store the image under the authenticated
     * user's own folder.
     */

    const extension =
      file.name
        .split(".")
        .pop()
        .toLowerCase();


    const photoRef =
      ref(
        storage,
        `profilePhotos/${currentUser.uid}/profile.${extension}`
      );


    const snapshot =
      await uploadBytes(
        photoRef,
        file,
        {
          contentType: file.type
        }
      );


    const photoURL =
      await getDownloadURL(
        snapshot.ref
      );


    /*
     * Update Firebase Authentication profile.
     */

    await updateProfile(
      currentUser,
      {
        photoURL
      }
    );


    /*
     * Update Firestore profile.
     */

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        photoURL
      }
    );


    /*
     * Update local profile immediately.
     */

    if (viewedUser) {

      viewedUser.photoURL =
        photoURL;

    }


    if (status) {

      status.textContent =
        "Profile photo updated successfully.";

      status.className =
        "profile-upload-status success";

    }


    /*
     * Reload profile so the new image
     * appears immediately.
     */

    await loadProfile(
      currentUser.uid
    );


  } catch (error) {

    console.error(
      "Profile photo upload error:",
      error
    );


    if (status) {

      status.textContent =
        "Unable to upload photo. Please try again.";

      status.className =
        "profile-upload-status error";

    }

  }


  event.target.value = "";

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
      doc(
        db,
        "users",
        uid
      );


    const snapshot =
      await getDoc(
        profileRef
      );


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


  if (message) {

    message.textContent = "";

    message.className =
      "verification-message";

  }


  /*
   * Use the phone stored in the profile.
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


  setTimeout(
    () => {

      if (phoneInput) {
        phoneInput.focus();
      }

    },
    100
  );

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
   START VERIFICATION
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


  if (
    !phoneInput ||
    !submitButton
  ) {

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


  submitButton.disabled =
    true;


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
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body: JSON.stringify({
            phone
          })
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


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
     * The backend normally returns
     * the verification reference.
     */

    if (data.reference) {

      startVerificationPolling(
        data.reference
      );

    }

    else if (
      data.checkout_request_id
    ) {

      startVerificationPolling(
        data.checkout_request_id
      );

    }

    else {

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


    submitButton.disabled =
      false;


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


  verificationPolling =
    true;


  let attempts = 0;


  const maxAttempts =
    40;


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


          if (
            attempts >= maxAttempts
          ) {

            clearInterval(
              verificationPollTimer
            );


            verificationPollTimer =
              null;


            verificationPolling =
              false;


            const button =
              $("verificationSubmit");


            if (button) {

              button.disabled =
                false;


              button.textContent =
                `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

            }


            setVerificationMessage(
              "Payment confirmation is taking longer than expected. Please check your profile again shortly.",
              "pending"
            );

          }


        } catch (error) {

          console.error(
            "Verification status error:",
            error
          );


          if (
            attempts >= maxAttempts
          ) {

            clearInterval(
              verificationPollTimer
            );


            verificationPollTimer =
              null;


            verificationPolling =
              false;


            const button =
              $("verificationSubmit");


            if (button) {

              button.disabled =
                false;


              button.textContent =
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
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${token}`
        },

        body: JSON.stringify({
          reference
        })
      }
    );


  const data =
    await response
      .json()
      .catch(
        () => ({})
      );


  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      "Unable to check verification status."
    );

  }


  /*
   * COMPLETED
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


    const button =
      $("verificationSubmit");


    if (button) {

      button.disabled =
        true;


      button.textContent =
        "✓ Account Verified";

    }


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
   * FAILED
   */

  if (
    data.status === "failed"
  ) {

    setVerificationMessage(
      data.message ||
      "The verification payment failed. Please try again.",
      "error"
    );


    const button =
      $("verificationSubmit");


    if (button) {

      button.disabled =
        false;


      button.textContent =
        `Pay KSh ${VERIFICATION_AMOUNT} & Verify`;

    }


    return true;

  }


  /*
   * PENDING
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
   VERIFICATION CLOSE
======================================== */

const verificationClose =
  $("verificationClose");


if (verificationClose) {

  verificationClose.addEventListener(
    "click",
    closeVerificationModal
  );

}


/* ========================================
   CLOSE MODAL BY BACKDROP
======================================== */

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
   VERIFICATION SUBMIT
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

    currentUser =
      user;


    if (!user) {

      location.replace(
        "login.html"
      );

      return;

    }


    /*
     * Mark the authenticated user online.
     *
     * This fixes the situation where the
     * profile was showing Offline even though
     * the user is currently logged in.
     */

    await markCurrentUserOnline();


    /*
     * Determine which profile to display.
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
