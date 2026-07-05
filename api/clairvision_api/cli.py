"""Operator CLI — currently just organizer bootstrap.

Invocation:
    docker compose exec api python -m clairvision_api.cli create-organizer \\
        --email owner@example.com --password '<a strong password>'

argparse (not click/typer): zero new dependency needed.
"""
import argparse
import sys

from clairvision_shared.auth.passwords import hash_password
from clairvision_shared.db.models import Organizer
from clairvision_shared.db.session import get_sessionmaker

MIN_PASSWORD_LENGTH = 12


def create_organizer(email: str, password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"password must be at least {MIN_PASSWORD_LENGTH} characters")

    normalized = email.strip().lower()
    Session = get_sessionmaker()
    with Session() as db:
        existing = db.query(Organizer).filter(Organizer.email == normalized).one_or_none()
        if existing is not None:
            raise SystemExit(f"organizer already exists: {normalized}")

        organizer = Organizer(
            email=normalized,
            password_hash=hash_password(password),
            is_active=True,
            invited_by_id=None,
        )
        db.add(organizer)
        db.commit()
        print(f"created organizer {normalized} ({organizer.id})")


def main() -> None:
    parser = argparse.ArgumentParser(prog="clairvision_api.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create-organizer")
    create_parser.add_argument("--email", required=True)
    create_parser.add_argument("--password", required=True)

    args = parser.parse_args()
    if args.command == "create-organizer":
        create_organizer(args.email, args.password)


if __name__ == "__main__":
    sys.exit(main())
