"""
Server-side symmetric encryption for provider API keys.

Uses Fernet (AES-128-CBC with HMAC-SHA256) from the `cryptography` library.
Falls back to base64 decode-only if ENCRYPTION_SECRET is not configured
(backwards compatibility with legacy btoa-encoded keys).
"""
import base64
import logging
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy Fernet initialisation
# ---------------------------------------------------------------------------
_fernet = None
_fernet_initialised = False


def _get_fernet():
    """Return a Fernet instance or None if ENCRYPTION_SECRET is not set."""
    global _fernet, _fernet_initialised
    if _fernet_initialised:
        return _fernet

    _fernet_initialised = True
    secret = os.getenv("ENCRYPTION_SECRET", "")
    if not secret:
        logger.warning(
            "ENCRYPTION_SECRET is not set – provider keys will be stored/read "
            "as base64 only (NOT encrypted). Set ENCRYPTION_SECRET to enable "
            "real encryption."
        )
        return None

    from cryptography.fernet import Fernet

    # The secret must be a valid 32-byte url-safe base64 key.
    # If the user supplies a raw passphrase we derive a key from it.
    try:
        # Try using it directly as a Fernet key (must be 32 url-safe-b64 bytes)
        _fernet = Fernet(secret.encode() if isinstance(secret, str) else secret)
    except Exception:
        # Derive a proper key from the passphrase using PBKDF2
        import hashlib
        dk = hashlib.pbkdf2_hmac("sha256", secret.encode(), b"nadir-key-encryption", 100_000)
        fernet_key = base64.urlsafe_b64encode(dk)
        _fernet = Fernet(fernet_key)

    return _fernet


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encrypt_key(plaintext: str) -> str:
    """Encrypt a provider API key. Returns a base64-encoded ciphertext string.

    If ENCRYPTION_SECRET is not configured, returns a base64-encoded version
    (matching legacy behaviour) with a warning.
    """
    f = _get_fernet()
    if f is None:
        logger.warning("encrypt_key called without ENCRYPTION_SECRET – using base64 only")
        return base64.b64encode(plaintext.encode()).decode()

    token = f.encrypt(plaintext.encode())
    return token.decode()  # Fernet tokens are already url-safe base64


def decrypt_key(ciphertext: str) -> str:
    """Decrypt a provider API key stored in the database.

    Tries Fernet decryption first.  If that fails (e.g. the value was stored
    before encryption was enabled), falls back to base64 decoding, then
    returns the raw value as a last resort.
    """
    f = _get_fernet()

    # 1. Try Fernet decryption
    if f is not None:
        try:
            return f.decrypt(ciphertext.encode()).decode()
        except Exception:
            # Not a Fernet token — fall through to base64
            logger.debug("Fernet decryption failed; trying base64 fallback")

    # 2. Try plain base64 (legacy btoa-encoded keys)
    try:
        decoded = base64.b64decode(ciphertext).decode()
        return decoded
    except Exception:
        pass

    # 3. Return as-is (already plaintext)
    return ciphertext
