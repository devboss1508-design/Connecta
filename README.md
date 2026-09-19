# CONNECTA Frontend

Mobile-first social platform frontend.

## Current functionality
- CONNECTA landing page
- Responsive login/register UI
- Firebase Email/Password Authentication
- Firestore user profile creation
- Referral code generation during registration
- Optional referral link capture using `?ref=CODE`
- Firebase-authenticated dashboard
- Real-time online users from Firestore
- Online presence (`isOnline`, `lastSeen`)
- Follow/unfollow support
- Search online users
- Responsive side menu and bottom navigation
- Dashboard chat listener prepared for the chat module

## Firebase project
Configured for the CONNECTA Firebase Web App supplied in the project setup.

## Before testing
1. Firebase Console → Authentication → Sign-in method → enable Email/Password.
2. Firestore Database → create the database.
3. Deploy/serve the frontend over HTTP/HTTPS; do not open module pages with `file://`.
4. Review Firestore rules before production.

## Security
The Firebase Web configuration belongs in frontend code. Never place a Firebase Admin SDK private service-account key in the frontend.

The current phone field is stored in Firestore but is not yet used for phone authentication. Phone verification can be added later.
