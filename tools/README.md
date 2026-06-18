# Firebase Role Setup

This folder contains a one-time helper for assigning Auth claims and Firestore profiles.

## What it does

- Sets the commissioner claim for the commissioner account.
- Sets `modeRoles.coop = lead_driver` for each co-op team leader.
- Writes a small profile doc to `users/{uid}` so the UI can show team names.

## What you need first

- A Firebase Admin service account JSON file downloaded from Firebase Console.
- Python 3.
- The `firebase-admin` package.

## Install

```bash
python3 -m pip install firebase-admin
```

## Run

```bash
python3 tools/assign_roles.py --service-account /path/to/serviceAccountKey.json
```

If you want to use a different accounts file:

```bash
python3 tools/assign_roles.py --service-account /path/to/serviceAccountKey.json --accounts tools/co-op-accounts.json
```

## Important

- After the script runs, users must sign out and sign back in so custom claims refresh.
- Keep the service account JSON private. Do not upload it to GitHub.
