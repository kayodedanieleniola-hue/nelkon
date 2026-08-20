"""Firestore read/write helpers that degrade gracefully when Firestore is offline."""

from .timeutil import json_safe

UNCONFIGURED_WARNING = "Firebase Firestore is unconfigured or offline (FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid)."


def safe_set(db, collection, doc_id, data, merge=False, context="Firestore save"):
    """Write a document, logging (instead of raising) when Firestore is unavailable."""
    if not db:
        return False
    try:
        db.collection(collection).document(doc_id).set(data, merge=merge)
        return True
    except Exception as exc:
        print(f"{context} warning: {exc}")
        return False


def stream_documents(db, collection, id_field="id"):
    """Return every document of a collection as JSON-safe dicts carrying their id."""
    return [
        json_safe({**(doc.to_dict() or {}), id_field: doc.id})
        for doc in db.collection(collection).stream()
    ]
