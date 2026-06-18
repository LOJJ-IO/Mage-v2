# Email Templates — Reference for Agent 2 & Agent 3

All emails are plain text, sent via `send_email(to, subject, body)` in
`backend/app/services/email_service.py`.

---

## Guest flows (Agent 2)

### 1. Email verification — step 1 of guest registration

**When:** Guest submits stay info on `/onboard/guest/register`. Backend creates an
`email_verifications` record and sends a one-time code or link.

**Subject:**
```
Verify your email — {HOTEL_NAME}
```

**Body:**
```
Hi {first_name},

You're almost set up for your stay at {HOTEL_NAME}.

Verify your email to continue:

  {verify_url}

This link expires in 24 hours. If you didn't request this, you can ignore it.

— The {HOTEL_NAME} team
```

**Variables:** `first_name`, `HOTEL_NAME`, `verify_url` (token URL to `/onboard/guest/verify-email?t=...`)

---

### 2. Magic link — sign-in after email verification (and future return visits)

**When:** Guest verifies email (step 2) OR requests a new sign-in link.

**Subject:**
```
Your link to chat with {property_name}
```

**Body:**
```
Use this link to access the guest assistant for {property_name}:

  {verify_url}

This link expires soon — bookmark it to sign back in during your stay.
```

**Variables:** `property_name`, `verify_url` (token URL to `/auth/verify?t=...`)

> This template is already implemented in `auth_service.send_magic_link_email()`.

---

## Staff flows (Agent 3)

### 3. Staff request received (optional — notify applicant)

**When:** Staff member submits a request on `/onboard/staff/request`. Status is `pending`.

**Subject:**
```
Your Mage staff request has been received
```

**Body:**
```
Hi {first_name},

Your request to join {HOTEL_NAME} as {role} has been received.

Your provisional Staff ID is: {staff_code}

A manager will review your request. You'll receive an email when you've been approved
and your access key is ready.

— Mage
```

**Variables:** `first_name`, `HOTEL_NAME`, `role`, `staff_code`

---

### 4. Staff approved — access key delivery

**When:** Manager approves a staff member on `/onboard/admin/approve`. Backend generates
a unique access key and emails it to the staff member.

**Subject:**
```
You're approved — your Mage access key is ready
```

**Body:**
```
Hi {first_name},

You've been approved as {role} at {HOTEL_NAME}.

Your access key:

  {access_key}

Sign in at: {sign_in_url}

Keep this key private — it's your credential for every sign-in. If you lose it,
contact your manager to issue a new one.

— Mage
```

**Variables:** `first_name`, `role`, `HOTEL_NAME`, `access_key`, `sign_in_url` (e.g. `{FRONTEND_URL}/onboard/staff/sign-in`)

---

### 5. Staff rejected (optional)

**When:** Manager rejects a staff request.

**Subject:**
```
Update on your Mage staff request
```

**Body:**
```
Hi {first_name},

Your request to join {HOTEL_NAME} as {role} was not approved at this time.

If you think this is an error, please contact your manager directly.

— Mage
```

**Variables:** `first_name`, `HOTEL_NAME`, `role`

---

## Usage in code

```python
from app.services.email_service import send_email

await send_email(
    to=staff_member.email,
    subject=f"You're approved — your Mage access key is ready",
    body=body_string,
)
```

`send_email` returns `True` on success (or in debug mode), `False` on delivery failure.
Callers may log the failure but should not raise — the user flow continues either way.
