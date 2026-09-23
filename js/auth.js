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
   REGISTRATION STATE
=========================================================

   IMPORTANT:

   Firebase Auth changes to "signed in" immediately after
   createUserWithEmailAndPassword() succeeds.

   We MUST prevent onAuthStateChanged() from redirecting
   to dashboard while the Firestore profile is still being
   created.
========================================================= */

let registrationInProgress = false;


/* =========================================================
   HELPERS
========================================================= */

const $ = id =>
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

  if (!el) {
    return;
  }

  el.textContent =
    message;

  el.style.color =
    success
      ? "#15803D"
      : "#DC2626";
}


/* =========================================================
   REFERRAL CODE
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
   FIND REFERRER
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
    uid:
      referrerDoc.id,

    ...referrerDoc.data()
  };
}


/* =========================================================
   CREATE REFERRAL RECORD
========================================================= */

async function createReferralRecord({
  referrer,
  referredUser,
  referredProfile
}) {

  if (!referrer?.uid) {
    return null;
  }


  if (!referredUser?.uid) {
    return null;
  }


  if (
    referrer.uid ===
    referredUser.uid
  ) {

    return null;
  }


  const referralRef =
    doc(
      db,
      "referrals",
      referredUser.uid
    );


  const existingReferral =
    await getDoc(
      referralRef
    );


  if (
    existingReferral.exists()
  ) {

    return existingReferral.data();

  }


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
   PASSWORD SHOW / HIDE
========================================================= */

document
  .querySelectorAll(
    ".show-password"
  )
  .forEach(btn => {

    btn.addEventListener(
      "click",
      () => {

        const input =
          $(btn.dataset.target);


        if (!input) {
          return;
        }


        input.type =
          input.type ===
          "password"
            ? "text"
            : "password";


        btn.textContent =
          input.type ===
          "password"
            ? "Show"
            : "Hide";

      }
    );

  });


/* =========================================================
   PASSWORD MATCH
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
    password ===
    confirmation
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


registerPassword?.addEventListener(
  "input",
  checkPasswordMatch
);


confirmPassword?.addEventListener(
  "input",
  checkPasswordMatch
);


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


      /*
       * IMPORTANT:
       *
       * Set this BEFORE creating the Firebase account.
       *
       * This prevents onAuthStateChanged() from opening
       * dashboard.html prematurely.
       */

      registrationInProgress =
        true;


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
           FORM VALUES
        ====================================== */

        const firstName =
          $("firstName")
            .value
            .trim()
            .replace(
              /\s+/g,
              " "
            );


        const lastName =
          $("lastName")
            .value
            .trim()
            .replace(
              /\s+/g,
              " "
            );


        const username =
          $("username")
            .value
            .trim()
            .replace(
              /^@/,
              ""
            );


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
            ?.value || "";


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
          password !==
          confirmation
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
           REFERRAL
        ====================================== */

        const referralFromUrl =
          getReferralFromUrl();


        let referrer =
          null;


        if (referralFromUrl) {

          try {

            referrer =
              await findReferrerByCode(
                referralFromUrl
              );

          } catch (
            referralLookupError
          ) {

            console.warn(
              "Referral lookup failed:",
              referralLookupError
            );

          }

        }


        /* ======================================
           CREATE FIREBASE AUTH USER
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
           REAL DISPLAY NAME
        ====================================== */

        const displayName =
          `${firstName} ${lastName}`
            .trim();


        /*
         * Wait for Firebase Auth profile update.
         */

        await updateProfile(
          user,
          {
            displayName:
              displayName
          }
        );


        /*
         * Verify that Firebase Auth now contains
         * the real display name.
         */

        await user.reload();


        /* ======================================
           REFERRAL CODE
        ====================================== */

        const referralCode =
          makeReferralCode(
            username
          );


        /* ======================================
           REFERRED BY
        ====================================== */

        const referredBy =
          referrer

            ? String(
                referrer.referralCode ||
                ""
              )
                .trim()
                .toUpperCase()

            : "";


        /* ======================================
           COMPLETE USER PROFILE
        ====================================== */

        const userProfile = {

          uid:
            user.uid,

          firstName:
            firstName,

          lastName:
            lastName,

          displayName:
            displayName,

          username:
            username,

          usernameLower:
            username.toLowerCase(),

          email:
            email,

          phone:
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

          referralCode:
            referralCode,

          referredBy:
            referredBy,

          following:
            [],

          followersCount:
            0,

          followingCount:
            0,

          balance:
            0,

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
           CREATE FIRESTORE PROFILE
        ====================================== */

        const userRef =
          doc(
            db,
            "users",
            user.uid
          );


        await setDoc(
          userRef,
          userProfile
        );


        /* ======================================
           VERIFY PROFILE WAS ACTUALLY SAVED
        ====================================== */

        const savedProfile =
          await getDoc(
            userRef
          );


        if (
          !savedProfile.exists()
        ) {

          throw new Error(
            "Your account was created, but your CONNECTA profile could not be saved. Please try again."
          );

        }


        const savedData =
          savedProfile.data();


        /*
         * Make absolutely sure the name exists.
         */

        if (
          !savedData.displayName ||
          savedData.displayName ===
            "CONNECTA User"
        ) {

          throw new Error(
            "Your CONNECTA profile was created without your name. Please try again."
          );

        }


        /* ======================================
           CACHE PROFILE IMMEDIATELY
        ======================================

           This allows dashboard.js/profile.js to
           display the profile instantly while the
           live Firestore listeners start.
        */

        try {

          const profileCache =
            JSON.parse(
              localStorage.getItem(
                "connectaProfileCache"
              ) || "{}"
            );


          profileCache[user.uid] = {

            uid:
              user.uid,

            firstName:
              savedData.firstName ||
              firstName,

            lastName:
              savedData.lastName ||
              lastName,

            displayName:
              savedData.displayName ||
              displayName,

            username:
              savedData.username ||
              username,

            photoURL:
              savedData.photoURL ||
              "",

            bio:
              savedData.bio ||
              "",

            isOnline:
              true,

            isVerified:
              savedData.isVerified ===
              true,

            followersCount:
              Number(
                savedData.followersCount ||
                0
              ),

            followingCount:
              Number(
                savedData.followingCount ||
                0
              ),

            following:
              Array.isArray(
                savedData.following
              )
                ? savedData.following
                : [],

            balance:
              Number(
                savedData.balance ||
                0
              ),

            status:
              savedData.status ||
              "active",

            cachedAt:
              Date.now()

          };


          localStorage.setItem(
            "connectaProfileCache",
            JSON.stringify(
              profileCache
            )
          );


          /*
           * Also save the last logged-in user.
           */

          localStorage.setItem(
            "connectaLastUser",
            JSON.stringify({

              uid:
                user.uid,

              email:
                user.email ||
                email,

              displayName:
                savedData.displayName ||
                displayName,

              firstName:
                savedData.firstName ||
                firstName,

              lastName:
                savedData.lastName ||
                lastName,

              username:
                savedData.username ||
                username

            })
          );

        } catch (
          cacheError
        ) {

          console.warn(
            "Profile cache unavailable:",
            cacheError
          );

        }


        /* ======================================
           REFERRAL RECORD
        ====================================== */

        if (
          referrer &&
          referrer.uid !== user.uid
        ) {

          try {

            await createReferralRecord({

              referrer,

              referredUser:
                user,

              referredProfile:
                userProfile

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

          } catch (
            referralError
          ) {

            /*
             * Referral failure must NOT prevent
             * the user from entering CONNECTA.
             */

            console.error(
              "Referral record creation failed:",
              referralError
            );

          }

        }


        /* ======================================
           REGISTRATION COMPLETE
        ====================================== */

        showMessage(
          "registerMessage",
          `Welcome to CONNECTA, ${displayName}! Opening your dashboard...`,
          true
        );


        /*
         * IMPORTANT:
         *
         * registrationInProgress stays true until
         * we actually leave this page.
         *
         * Therefore onAuthStateChanged() cannot
         * race us.
         */

        location.replace(
          "dashboard.html"
        );

      } catch (error) {

        console.error(
          "Registration error:",
          error
        );


        /*
         * Registration failed.
         */

        registrationInProgress =
          false;


        let message =
          "Unable to create account. Please try again.";


        switch (
          error.code
        ) {

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

          case "firestore/permission-denied":

            message =
              "Firestore permission denied. Check your Firebase rules.";

            break;


          default:

            if (
              error.message
            ) {

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

        const email =
          $("loginIdentifier")
            .value
            .trim()
            .toLowerCase();


        const password =
          $("loginPassword")
            .value;


        if (
          !email.includes("@")
        ) {

          throw new Error(
            "For now, please login using the email used during registration."
          );

        }


        const credential =
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );


        const uid =
          credential.user.uid;


        /* ======================================
           LOAD PROFILE BEFORE DASHBOARD
        ====================================== */

        const userRef =
          doc(
            db,
            "users",
            uid
          );


        const profileSnapshot =
          await getDoc(
            userRef
          );


        if (
          profileSnapshot.exists()
        ) {

          const profile =
            profileSnapshot.data();


          /*
           * Cache the real profile so the dashboard
           * can display it immediately.
           */

          try {

            const profileCache =
              JSON.parse(
                localStorage.getItem(
                  "connectaProfileCache"
                ) || "{}"
              );


            profileCache[uid] = {

              uid,

              ...profile,

              cachedAt:
                Date.now()

            };


            localStorage.setItem(
              "connectaProfileCache",
              JSON.stringify(
                profileCache
              )
            );

          } catch (
            cacheError
          ) {

            console.warn(
              "Login profile cache failed:",
              cacheError
            );

          }

        }


        /* ======================================
           PRESENCE
        ====================================== */

        setDoc(
          userRef,
          {

            isOnline:
              true,

            lastSeen:
              serverTimestamp()

          },
          {
            merge:
              true
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
           SESSION CACHE
        ====================================== */

        try {

          localStorage.setItem(
            "connectaLastUser",
            JSON.stringify({

              uid:
                credential.user.uid,

              email:
                credential.user.email ||
                "",

              displayName:
                credential.user.displayName ||
                ""

            })
          );

        } catch (
          storageError
        ) {

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


        switch (
          error.code
        ) {

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

            if (
              error.message
            ) {

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
=========================================================

   IMPORTANT FIX:

   Do NOT redirect while registration is still being
   completed.

   Firebase can fire onAuthStateChanged() immediately
   after createUserWithEmailAndPassword(), before the
   Firestore profile has finished saving.
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

      /*
       * Registration owns the redirect while it is
       * creating the account and saving the profile.
       */

      if (
        registrationInProgress
      ) {

        return;

      }


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
