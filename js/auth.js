import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   CONNECTA REFERRAL SETTINGS
========================================================= */

const REFERRAL_REWARD = 5;


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) =>
  document.getElementById(id);


/* =========================================================
   SHOW MESSAGE
========================================================= */

function showMessage(
  id,
  message,
  success = false
) {

  const el = $(id);

  if (!el) return;

  el.textContent = message;

  el.style.color =
    success
      ? "#15803D"
      : "#DC2626";

}


/* =========================================================
   REFERRAL CODE GENERATOR
========================================================= */

function makeReferralCode(
  username = ""
) {

  const clean =
    username
      .replace(
        /[^a-zA-Z0-9]/g,
        ""
      )
      .toUpperCase()
      .slice(0, 7) ||
    "USER";


  const random =
    Math.floor(
      1000 +
      Math.random() * 9000
    );


  return `${clean}${random}`;

}


/* =========================================================
   GET REFERRAL FROM URL
========================================================= */

function getReferralFromUrl() {

  const ref =
    new URLSearchParams(
      window.location.search
    ).get("ref");


  return ref
    ? ref.trim().slice(0, 50)
    : "";

}


/* =========================================================
   FIND REFERRER BY REFERRAL CODE
========================================================= */

async function findReferrerByCode(
  referralCode
) {

  if (!referralCode) {
    return null;
  }


  const cleanCode =
    referralCode
      .trim()
      .toUpperCase();


  const usersRef =
    collection(
      db,
      "users"
    );


  const referralQuery =
    query(
      usersRef,
      where(
        "referralCode",
        "==",
        cleanCode
      ),
      limit(1)
    );


  const snapshot =
    await getDocs(
      referralQuery
    );


  if (snapshot.empty) {
    return null;
  }


  const referrerDoc =
    snapshot.docs[0];


  return {
    uid: referrerDoc.id,
    ...referrerDoc.data()
  };

}


/* =========================================================
   CREATE REFERRAL RECORD
=========================================================

   IMPORTANT:

   This creates the referral event.

   It does NOT directly add money to the
   user's wallet.

   The actual KSh 5 financial credit should
   be performed by a trusted backend/admin
   transaction after verifying the referral.
========================================================= */

async function createReferralRecord({
  referrer,
  referredUser,
  referredProfile
}) {

  if (!referrer) {
    return null;
  }


  if (!referrer.uid) {
    return null;
  }


  if (!referredUser?.uid) {
    return null;
  }


  /* -----------------------------------------------
     Prevent self referral
  ------------------------------------------------ */

  if (
    referrer.uid ===
    referredUser.uid
  ) {

    return null;

  }


  /* -----------------------------------------------
     Referral document ID

     Using referred UID makes the referral
     naturally unique for this registration.
  ------------------------------------------------ */

  const referralRef =
    doc(
      db,
      "referrals",
      referredUser.uid
    );


  /* -----------------------------------------------
     Check if referral already exists
  ------------------------------------------------ */

  const existingReferral =
    await getDoc(
      referralRef
    );


  if (existingReferral.exists()) {

    return existingReferral.data();

  }


  /* -----------------------------------------------
     Create referral record
  ------------------------------------------------ */

  const referralData = {

    referralId:
      referralRef.id,

    referrerId:
      referrer.uid,

    referrerName:
      referrer.displayName ||
      `${referrer.firstName || ""} ${referrer.lastName || ""}`.trim() ||
      referrer.username ||
      "CONNECTA User",

    referrerUsername:
      referrer.username ||
      "",

    referredUserId:
      referredUser.uid,

    referredName:
      referredProfile.displayName ||
      `${referredProfile.firstName || ""} ${referredProfile.lastName || ""}`.trim() ||
      referredProfile.username ||
      "CONNECTA User",

    referredUsername:
      referredProfile.username ||
      "",

    rewardAmount:
      REFERRAL_REWARD,

    status:
      "completed",

    rewardCredited:
      false,

    createdAt:
      serverTimestamp(),

    rewardCreditedAt:
      null

  };


  await setDoc(
    referralRef,
    referralData
  );


  return referralData;

}


/* =========================================================
   NAME VALIDATION
========================================================= */

const namePattern =
  /^[\p{L}]+(?:[ '\u2019-][\p{L}]+)*$/u;


/* =========================================================
   USERNAME VALIDATION
========================================================= */

const usernamePattern =
  /^[a-zA-Z0-9_]+$/;


/* =========================================================
   SHOW / HIDE PASSWORD
========================================================= */

document
  .querySelectorAll(".show-password")
  .forEach(btn => {

    btn.addEventListener(
      "click",
      () => {

        const input =
          $(btn.dataset.target);

        if (!input) return;


        input.type =
          input.type === "password"
            ? "text"
            : "password";


        btn.textContent =
          input.type === "password"
            ? "Show"
            : "Hide";

      }
    );

  });


/* =========================================================
   PASSWORD MATCH LIVE VALIDATION
========================================================= */

const registerPassword =
  $("registerPassword");

const confirmPassword =
  $("confirmPassword");

const passwordMatchMessage =
  $("passwordMatchMessage");


function checkPasswordMatch() {

  if (
    !registerPassword ||
    !confirmPassword ||
    !passwordMatchMessage
  ) {
    return true;
  }


  const password =
    registerPassword.value;

  const confirmation =
    confirmPassword.value;


  if (!confirmation) {

    passwordMatchMessage.textContent =
      "";

    return true;

  }


  if (
    password === confirmation
  ) {

    passwordMatchMessage.textContent =
      "Passwords match.";

    passwordMatchMessage.style.color =
      "#15803D";

    return true;

  }


  passwordMatchMessage.textContent =
    "Passwords do not match.";

  passwordMatchMessage.style.color =
    "#DC2626";

  return false;

}


if (registerPassword) {

  registerPassword.addEventListener(
    "input",
    checkPasswordMatch
  );

}


if (confirmPassword) {

  confirmPassword.addEventListener(
    "input",
    checkPasswordMatch
  );

}


/* =========================================================
   REGISTRATION
========================================================= */

const registerForm =
  $("registerForm");


if (registerForm) {

  registerForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const submit =
        registerForm.querySelector(
          'button[type="submit"]'
        );


      if (submit) {

        submit.disabled =
          true;

        submit.textContent =
          "Creating account...";

      }


      try {

        /* ======================================
           GET FORM VALUES
        ====================================== */

        const firstName =
          $("firstName")
            .value
            .trim()
            .replace(/\s+/g, " ");


        const lastName =
          $("lastName")
            .value
            .trim()
            .replace(/\s+/g, " ");


        const username =
          $("username")
            .value
            .trim()
            .replace(/^@/, "");


        const email =
          $("email")
            .value
            .trim()
            .toLowerCase();


        const phone =
          $("phone")
            .value
            .trim();


        const password =
          $("registerPassword")
            .value;


        const confirmation =
          $("confirmPassword")
            ? $("confirmPassword").value
            : "";


        const terms =
          $("terms")
            ? $("terms").checked
            : true;


        /* ======================================
           VALIDATE FIRST NAME
        ====================================== */

        if (!firstName) {

          throw new Error(
            "Please enter your first name."
          );

        }


        if (
          !namePattern.test(
            firstName
          )
        ) {

          throw new Error(
            "First name can contain letters, spaces, hyphens or apostrophes only. Emojis and symbols are not allowed."
          );

        }


        /* ======================================
           VALIDATE LAST NAME
        ====================================== */

        if (!lastName) {

          throw new Error(
            "Please enter your last name."
          );

        }


        if (
          !namePattern.test(
            lastName
          )
        ) {

          throw new Error(
            "Last name can contain letters, spaces, hyphens or apostrophes only. Emojis and symbols are not allowed."
          );

        }


        /* ======================================
           VALIDATE USERNAME
        ====================================== */

        if (
          username.length < 3
        ) {

          throw new Error(
            "Username must contain at least 3 characters."
          );

        }


        if (
          !usernamePattern.test(
            username
          )
        ) {

          throw new Error(
            "Username can contain only letters, numbers and underscores."
          );

        }


        /* ======================================
           EMAIL
        ====================================== */

        if (!email) {

          throw new Error(
            "Please enter your email address."
          );

        }


        /* ======================================
           PHONE
        ====================================== */

        if (!phone) {

          throw new Error(
            "Please enter your phone number."
          );

        }


        /* ======================================
           PASSWORD
        ====================================== */

        if (
          password.length < 6
        ) {

          throw new Error(
            "Password must contain at least 6 characters."
          );

        }


        /* ======================================
           CONFIRM PASSWORD
        ====================================== */

        if (!confirmation) {

          throw new Error(
            "Please confirm your password."
          );

        }


        if (
          password !== confirmation
        ) {

          throw new Error(
            "Passwords do not match."
          );

        }


        /* ======================================
           TERMS
        ====================================== */

        if (!terms) {

          throw new Error(
            "Please agree to the CONNECTA terms and privacy policy."
          );

        }


        /* ======================================
           GET REFERRAL BEFORE ACCOUNT CREATION
        ====================================== */

        const referralFromUrl =
          getReferralFromUrl();


        let referrer = null;


        if (referralFromUrl) {

          try {

            referrer =
              await findReferrerByCode(
                referralFromUrl
              );

          } catch (referralLookupError) {

            console.warn(
              "Referral lookup failed:",
              referralLookupError
            );

          }

        }


        /* ======================================
           CREATE FIREBASE AUTH ACCOUNT
        ====================================== */

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );


        const user =
          credential.user;


        /* ======================================
           DISPLAY NAME
        ====================================== */

        const displayName =
          `${firstName} ${lastName}`.trim();


        await updateProfile(
          user,
          {
            displayName
          }
        );


        /* ======================================
           GENERATE REFERRAL CODE
        ====================================== */

        const referralCode =
          makeReferralCode(
            username
          );


        /* ======================================
           VALIDATED REFERRED BY
        ====================================== */

        const referredBy =
          referrer
            ? String(
                referrer.referralCode || ""
              )
                .trim()
                .toUpperCase()
            : "";


        /* ======================================
           USER PROFILE
        ====================================== */

        const userProfile = {

          uid:
            user.uid,

          firstName,

          lastName,

          displayName,

          username,

          usernameLower:
            username.toLowerCase(),

          email,

          phone,

          photoURL:
            "",

          bio:
            "",

          isOnline:
            true,

          lastSeen:
            serverTimestamp(),

          isVerified:
            false,

          verificationStatus:
            "not_submitted",

          verificationAmount:
            0,

          verificationTransactionCode:
            "",

          verifiedAt:
            null,

          referralCode,

          referredBy,

          following:
            [],

          followersCount:
            0,

          followingCount:
            0,

          balance:
            0,

          /*
           * Referral statistics.
           *
           * The secure backend will eventually
           * update these after successful referral
           * verification.
           */

          referralCount:
            0,

          referralEarnings:
            0,

          status:
            "active",

          createdAt:
            serverTimestamp()

        };


        /* ======================================
           CREATE USER PROFILE
        ====================================== */

        await setDoc(
          doc(
            db,
            "users",
            user.uid
          ),
          userProfile
        );


        /* ======================================
           CREATE REFERRAL RECORD
        ====================================== */

        if (
          referrer &&
          referrer.uid !== user.uid
        ) {

          try {

            await createReferralRecord({
              referrer,
              referredUser: user,
              referredProfile: userProfile
            });


            console.log(
              "CONNECTA referral recorded:",
              {
                referrerId:
                  referrer.uid,

                referredUserId:
                  user.uid,

                reward:
                  REFERRAL_REWARD
              }
            );

          } catch (referralError) {

            /*
             * Do NOT fail registration because
             * referral-record creation failed.

             * The user's CONNECTA account has
             * already been successfully created.
             */

            console.error(
              "Referral record creation failed:",
              referralError
            );

          }

        }


        /* ======================================
           SUCCESS
        ====================================== */

        showMessage(
          "registerMessage",
          "Account created successfully. Opening CONNECTA...",
          true
        );


        setTimeout(
          () => {

            location.replace(
              "dashboard.html"
            );

          },
          700
        );


      } catch (error) {

        console.error(
          "Registration error:",
          error
        );


        let message =
          "Unable to create account. Please try again.";


        switch (error.code) {

          case "auth/email-already-in-use":

            message =
              "That email is already registered. Please login instead.";

            break;


          case "auth/invalid-email":

            message =
              "Please enter a valid email address.";

            break;


          case "auth/weak-password":

            message =
              "Password is too weak. Use at least 6 characters.";

            break;


          case "auth/network-request-failed":

            message =
              "Network error. Check your internet connection.";

            break;


          case "permission-denied":

            message =
              "Firestore permission denied. Check your Firebase rules.";

            break;


          default:

            if (error.message) {

              message =
                error.message;

            }

        }


        showMessage(
          "registerMessage",
          message
        );


        if (submit) {

          submit.disabled =
            false;

          submit.textContent =
            "Create Account";

        }

      }

    }
  );

}


/* =========================================================
   LOGIN
========================================================= */

const loginForm =
  $("loginForm");


if (loginForm) {

  loginForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const submit =
        loginForm.querySelector(
          'button[type="submit"]'
        );


      if (submit) {

        submit.disabled =
          true;

        submit.textContent =
          "Logging in...";

      }


      try {

        /* ======================================
           GET LOGIN VALUES
        ====================================== */

        const email =
          $("loginIdentifier")
            .value
            .trim()
            .toLowerCase();


        const password =
          $("loginPassword")
            .value;


        /* ======================================
           VALIDATE EMAIL
        ====================================== */

        if (!email.includes("@")) {

          throw new Error(
            "For now, please login using the email used during registration."
          );

        }


        /* ======================================
           FIREBASE LOGIN
        ====================================== */

        const credential =
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );


        const uid =
          credential.user.uid;


        /* ======================================
           BACKGROUND ONLINE STATUS
        ====================================== */

        const userRef =
          doc(
            db,
            "users",
            uid
          );


        setDoc(
          userRef,
          {

            isOnline:
              true,

            lastSeen:
              serverTimestamp()

          },
          {
            merge: true
          }
        ).catch(
          error => {

            console.warn(
              "Background presence update failed:",
              error
            );

          }
        );


        /* ======================================
           SAVE SESSION DATA
        ====================================== */

        try {

          localStorage.setItem(
            "connectaLastUser",
            JSON.stringify({

              uid:
                credential.user.uid,

              email:
                credential.user.email || "",

              displayName:
                credential.user.displayName || ""

            })
          );

        } catch (storageError) {

          console.warn(
            "Session cache unavailable:",
            storageError
          );

        }


        /* ======================================
           OPEN DASHBOARD
        ====================================== */

        location.replace(
          "dashboard.html"
        );


      } catch (error) {

        console.error(
          "Login error:",
          error
        );


        let message =
          "Unable to login. Please check your details.";


        switch (error.code) {

          case "auth/invalid-credential":

          case "auth/wrong-password":

          case "auth/user-not-found":

            message =
              "Incorrect email or password.";

            break;


          case "auth/invalid-email":

            message =
              "Please enter a valid email address.";

            break;


          case "auth/too-many-requests":

            message =
              "Too many attempts. Please wait and try again.";

            break;


          case "auth/network-request-failed":

            message =
              "Network error. Check your internet connection.";

            break;


          default:

            if (error.message) {

              message =
                error.message;

            }

        }


        showMessage(
          "loginMessage",
          message
        );


        if (submit) {

          submit.disabled =
            false;

          submit.textContent =
            "Login";

        }

      }

    }
  );

}


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  user => {

    const page =
      location.pathname
        .split("/")
        .pop();


    if (
      user &&
      (
        page === "login.html" ||
        page === "register.html"
      )
    ) {

      location.replace(
        "dashboard.html"
      );

    }

  }
);


/* =========================================================
   GLOBAL LOGOUT
========================================================= */

window.connectaLogout =
  async function () {

    await signOut(
      auth
    );

    location.replace(
      "login.html"
    );

  };
