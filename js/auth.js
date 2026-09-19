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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function showMessage(id, message, success = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = success ? "#15803D" : "#DC2626";
}

function makeReferralCode(username = "") {
  const clean = username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7) || "USER";
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${clean}${random}`;
}

function getReferralFromUrl() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  return ref ? ref.trim().slice(0, 50) : "";
}

document.querySelectorAll(".show-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    btn.textContent = input.type === "password" ? "Show" : "Hide";
  });
});

const registerForm = $("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submit = registerForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Creating account...";

    try {
      const firstName = $("firstName").value.trim();
      const lastName = $("lastName").value.trim();
      const username = $("username").value.trim().replace(/^@/, "");
      const email = $("email").value.trim().toLowerCase();
      const phone = $("phone").value.trim();
      const password = $("registerPassword").value;

      if (username.length < 3) {
        throw new Error("Username must contain at least 3 characters.");
      }

      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      const displayName = `${firstName} ${lastName}`.trim();

      await updateProfile(user, {
        displayName
      });

      const referralCode = makeReferralCode(username);
      const referredBy = getReferralFromUrl();

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        firstName,
        lastName,
        displayName,
        username,
        usernameLower: username.toLowerCase(),
        email,
        phone,
        photoURL: "",
        bio: "",
        isOnline: true,
        lastSeen: serverTimestamp(),
        isVerified: false,
        verificationStatus: "not_submitted",
        referralCode,
        referredBy,
        following: [],
        followersCount: 0,
        followingCount: 0,
        balance: 0,
        status: "active",
        createdAt: serverTimestamp()
      });

      showMessage("registerMessage", "Account created successfully. Opening CONNECTA...", true);

      setTimeout(() => {
        location.replace("dashboard.html");
      }, 700);

    } catch (error) {
      console.error("Registration error:", error);

      let message = "Unable to create account. Please try again.";

      switch (error.code) {
        case "auth/email-already-in-use":
          message = "That email is already registered. Please login instead.";
          break;
        case "auth/invalid-email":
          message = "Please enter a valid email address.";
          break;
        case "auth/weak-password":
          message = "Password is too weak. Use at least 6 characters.";
          break;
        case "auth/network-request-failed":
          message = "Network error. Check your internet connection.";
          break;
        case "permission-denied":
          message = "Firestore permission denied. Check your Firebase rules.";
          break;
        default:
          if (error.message) message = error.message;
      }

      showMessage("registerMessage", message);
      submit.disabled = false;
      submit.textContent = "Create Account";
    }
  });
}

const loginForm = $("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Logging in...";

    try {
      const email = $("loginIdentifier").value.trim().toLowerCase();
      const password = $("loginPassword").value;

      if (!email.includes("@")) {
        throw new Error("For now, please login using the email used during registration.");
      }

      const credential = await signInWithEmailAndPassword(auth, email, password);

      const userRef = doc(db, "users", credential.user.uid);
      const profile = await getDoc(userRef);

      if (profile.exists()) {
        await setDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true });
      }

      showMessage("loginMessage", "Login successful. Opening CONNECTA...", true);

      setTimeout(() => {
        location.replace("dashboard.html");
      }, 500);

    } catch (error) {
      console.error("Login error:", error);

      let message = "Unable to login. Please check your details.";

      switch (error.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          message = "Incorrect email or password.";
          break;
        case "auth/invalid-email":
          message = "Please enter a valid email address.";
          break;
        case "auth/too-many-requests":
          message = "Too many attempts. Please wait and try again.";
          break;
        case "auth/network-request-failed":
          message = "Network error. Check your internet connection.";
          break;
        default:
          if (error.message) message = error.message;
      }

      showMessage("loginMessage", message);
      submit.disabled = false;
      submit.textContent = "Login";
    }
  });
}

// Prevent authenticated users from returning to login/register unnecessarily.
onAuthStateChanged(auth, user => {
  const page = location.pathname.split("/").pop();

  if (user && (page === "login.html" || page === "register.html")) {
    location.replace("dashboard.html");
  }
});

window.connectaLogout = async function () {
  await signOut(auth);
  location.replace("login.html");
};
