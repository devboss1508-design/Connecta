# CONNECTA Frontend — Batch 1/2

Mobile-first social platform frontend.

## Current dashboard functionality
- Responsive mobile/desktop layout
- CONNECTA green/white app UI
- Firebase Auth guard
- Reads current user's Firestore profile
- Real-time online-user list from `users`
- Search online users
- Follow/unfollow field on the current user's document
- Presence heartbeat (`isOnline`, `lastSeen`)
- Real-time `chats` listener prepared for the chat module
- Side navigation and mobile bottom navigation
- Logout

## Firebase
The Firebase Web SDK configuration is in `js/firebase.js`.

Do not put a Firebase Admin SDK service-account private key in the frontend.

## Important
The dashboard expects an authenticated Firebase user. Registration/login still need to be switched from the temporary demo flow to Firebase Authentication in the next step.

Firestore rules are provided as a starting development ruleset. Review and tighten them before production.
