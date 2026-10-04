from app.services.guest_session import create_session_token, decode_session_token


def test_session_tokens_round_trip_even_when_signature_contains_separator():
    # ~12% of HMAC-SHA256 signatures contain a b"." byte; 200 tokens covers that.
    for i in range(200):
        token = create_session_token(f"guest-{i:04d}", "grand-horizon", i + 1)
        session = decode_session_token(token)
        assert session is not None
        assert session.guest_id == f"guest-{i:04d}"
        assert session.session_version == i + 1


def test_tampered_session_token_is_rejected():
    import base64

    token = create_session_token("guest-0001", "grand-horizon", 1)
    decoded = bytearray(base64.urlsafe_b64decode(token.encode()))
    decoded[5] ^= 1
    assert decode_session_token(base64.urlsafe_b64encode(bytes(decoded)).decode()) is None
