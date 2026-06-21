# TYPEMILL

A creative writing workspace — write stories chapter by chapter, track your progress with analytics, keep a writer's journal, and export your work as an EPUB. Accounts and data are powered by Firebase (Authentication + Cloud Firestore).

## Tech
- Vanilla HTML / CSS / JavaScript (no build step)
- Firebase Authentication (email/password + Google)
- Cloud Firestore (per-user data)

## Local development
Serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Hosting
This is a static site and can be hosted on GitHub Pages, Firebase Hosting, Netlify, etc.

### Firebase notes
- `firebase-config.js` holds the public web app config (safe to commit — these are client identifiers, not secrets).
- Firestore security rules live in `firestore.rules`.
- When hosting on a new domain (e.g. `username.github.io`), add that domain to **Firebase Console → Authentication → Settings → Authorized domains** so Google sign-in works.
