"""Recover a missing Base64 symbol from a GitHub-transferred PNG.
The original exact SHA-256 is the only acceptance criterion. Never accept a guess.
"""
from __future__ import annotations
import base64
import hashlib
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "src/assets/maintenance/angular-parts-v3.png"
TARGET = bytes.fromhex("604ec70cc28770b0919a581243f21ca555bc22f884c60285048028a64ddbf91e")
raw = FILE.read_bytes()
if hashlib.sha256(raw).digest() == TARGET:
    print("PASS: PNG already byte-exact")
    raise SystemExit(0)
if len(raw) != 7205:
    raise SystemExit(f"Unexpected transport corruption ({len(raw)} bytes); refusing repair")
encoded = base64.b64encode(raw).decode("ascii").rstrip("=")
if len(encoded) != 9607:
    raise SystemExit("Unexpected Base64 length; refusing repair")
alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
last_base = alphabet.index(encoded[-1]) & ~3
print("One decoded byte missing; searching a single lost base64 character", flush=True)
for low in range(4):
    recovered = encoded[:-1] + alphabet[last_base + low]
    for position in range(len(recovered) + 1):
        before, after = recovered[:position], recovered[position:]
        for symbol in alphabet:
            attempt = base64.b64decode(before + symbol + after)
            if hashlib.sha256(attempt).digest() == TARGET:
                FILE.write_bytes(attempt)
                print(f"PASS: exact PNG restored, inserted symbol at {position}; bytes={len(attempt)}", flush=True)
                raise SystemExit(0)
    print(f"Checked terminal pad variant {low + 1}/4", flush=True)
raise SystemExit("No exact PNG match; original remains untouched. Release blocked.")
