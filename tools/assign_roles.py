#!/usr/bin/env python3
"""Assign Firebase Auth custom claims and Firestore profile docs.

This is a one-time local admin script. It is not meant to run in the browser.

Requirements:
  python3 -m pip install firebase-admin

Usage:
  python3 tools/assign_roles.py --service-account /path/to/serviceAccountKey.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import firebase_admin
from firebase_admin import auth, credentials, firestore


ROOT = Path(__file__).resolve().parent
DEFAULT_ACCOUNTS_PATH = ROOT / "co-op-accounts.json"


def load_accounts(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def clean_username(value: str) -> str:
    return str(value or "").strip().lower()


def build_claims(account: Dict[str, Any]) -> Dict[str, Any]:
    if account.get("role") == "commissioner":
        return {"role": "commissioner"}

    claims: Dict[str, Any] = {}
    mode_roles = account.get("modeRoles") or {}
    if mode_roles:
        claims["modeRoles"] = mode_roles
    return claims


def build_profile(account: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "email": account["email"],
        "username": clean_username(account.get("username") or account["email"].split("@", 1)[0]),
        "teamName": account.get("teamName", ""),
        "displayName": account.get("teamName", ""),
        "role": account.get("role", "team_leader"),
        "modeRoles": account.get("modeRoles", {}),
        "updatedBy": "tools/assign_roles.py",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Assign Firebase Auth claims for IRL accounts.")
    parser.add_argument(
        "--service-account",
        required=True,
        help="Path to your Firebase Admin service account JSON file.",
    )
    parser.add_argument(
        "--accounts",
        default=str(DEFAULT_ACCOUNTS_PATH),
        help="Path to the accounts JSON mapping file.",
    )
    args = parser.parse_args()

    service_account_path = Path(args.service_account).expanduser().resolve()
    accounts_path = Path(args.accounts).expanduser().resolve()

    if not service_account_path.exists():
        raise SystemExit(f"Service account file not found: {service_account_path}")
    if not accounts_path.exists():
        raise SystemExit(f"Accounts file not found: {accounts_path}")

    cred = credentials.Certificate(str(service_account_path))
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    accounts = load_accounts(accounts_path)

    print(f"Loaded {len(accounts)} accounts from {accounts_path.name}")
    for account in accounts:
        email = account["email"]
        username = clean_username(account.get("username") or email.split("@", 1)[0])
        team_name = account.get("teamName", "")
        claims = build_claims(account)
        profile = build_profile(account)

        user = auth.get_user_by_email(email)
        auth.set_custom_user_claims(user.uid, claims)

        db.collection("users").document(user.uid).set(
            {
                **profile,
                "uid": user.uid,
                "username": username,
            },
            merge=True,
        )

        print(f"Updated {email} -> uid {user.uid} | teamName={team_name} | claims={claims}")

    print("Done. Ask each user to sign out and sign back in so their claims refresh.")


if __name__ == "__main__":
    main()
