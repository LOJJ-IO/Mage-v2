"""Tests for magic-link email HTML template."""
from app.emails.magic_link import (
    build_magic_link_plain_text,
    render_magic_link_html,
)


def test_plain_text_magic_link():
    body = build_magic_link_plain_text(
        property_name="The Grand Horizon Hotel",
        verify_url="http://localhost:3000/auth/verify?t=abc",
    )
    assert "The Grand Horizon Hotel" in body
    assert "http://localhost:3000/auth/verify?t=abc" in body
    assert "expires soon" in body


def test_html_magic_link_includes_branding_and_link():
    html = render_magic_link_html(
        property_name="The Grand Horizon Hotel",
        verify_url="http://localhost:3000/auth/verify?t=abc",
        logo_url="https://example.com/logo.png",
        brand_color="#223d14",
        wrapper_color="#8a9c80",
        brand_url="https://lojj.io",
        brand_name="LOJJ.io",
        footer_text="© 2026 Test",
    )
    assert "The Grand Horizon Hotel" in html
    assert "http://localhost:3000/auth/verify?t=abc" in html
    assert "Open guest assistant" in html
    assert "#223d14" in html
    assert "#8a9c80" in html
    assert "https://example.com/logo.png" in html
    assert "expires soon" in html


def test_html_escapes_special_characters():
    html = render_magic_link_html(
        property_name='Hotel "Test" & Co',
        verify_url='http://x.test/?a=1&b=2',
    )
    assert "Hotel &quot;Test&quot; &amp; Co" in html
    assert "http://x.test/?a=1&amp;b=2" in html
