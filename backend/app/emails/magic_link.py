"""Branded HTML template for guest magic-link sign-in emails."""
from __future__ import annotations

import html
from typing import Optional

from app.core.config import get_settings

_MAGIC_LINK_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to {property_name}</title>
</head>
<body style="margin:0;padding:0;background-color:{wrapper_color};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:{wrapper_color};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:{brand_color};padding:25px;text-align:center;">
              <a href="{brand_url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
                <img src="{logo_url}" alt="{brand_name}" width="140"
                     style="max-width:140px;height:auto;border:0;display:block;margin:0 auto;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;font-family:Verdana,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#333333;">
              <p style="margin:0 0 16px;">Hello,</p>
              <p style="margin:0 0 24px;">
                Use the button below to access the guest assistant for
                <strong>{property_name}</strong>.
              </p>
              <p style="text-align:center;margin:0 0 24px;">
                <a href="{verify_url}"
                   style="display:inline-block;background-color:{brand_color};color:#ffffff;padding:16px 32px;border-radius:50px;text-decoration:none;font-weight:bold;font-family:Verdana,Arial,Helvetica,sans-serif;">
                  Open guest assistant
                </a>
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#666666;">
                This link expires soon — bookmark it to sign back in during your stay.
              </p>
              <p style="margin:0;font-size:12px;color:#999999;word-break:break-all;">
                Or copy this link:<br />
                <a href="{verify_url}" style="color:{brand_color};">{verify_url}</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="text-align:center;padding:20px;font-size:12px;color:#ffffff;opacity:0.9;margin:16px 0 0;">
          {footer_text}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def build_magic_link_plain_text(*, property_name: str, verify_url: str) -> str:
    return (
        f"Use this link to access the guest assistant for {property_name}:\n\n"
        f"{verify_url}\n\n"
        "This link expires soon — bookmark it to sign back in during your stay."
    )


def render_magic_link_html(
    *,
    property_name: str,
    verify_url: str,
    logo_url: Optional[str] = None,
    brand_color: Optional[str] = None,
    wrapper_color: Optional[str] = None,
    brand_url: Optional[str] = None,
    brand_name: Optional[str] = None,
    footer_text: Optional[str] = None,
) -> str:
    settings = get_settings()
    safe_name = html.escape(property_name, quote=True)
    safe_url = html.escape(verify_url, quote=True)
    return _MAGIC_LINK_HTML.format(
        property_name=safe_name,
        verify_url=safe_url,
        logo_url=html.escape(logo_url or settings.email_logo_url, quote=True),
        brand_color=html.escape(brand_color or settings.email_brand_color, quote=True),
        wrapper_color=html.escape(wrapper_color or settings.email_wrapper_color, quote=True),
        brand_url=html.escape(brand_url or settings.email_brand_url, quote=True),
        brand_name=html.escape(brand_name or settings.email_brand_name, quote=True),
        footer_text=html.escape(footer_text or settings.email_footer_text, quote=True),
    )
