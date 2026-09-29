import smtplib
from email.message import EmailMessage

import config


def send_otp_email(to_email, otp, full_name=""):
    """
    Send a password-reset code. Returns True on success, False on failure.

    Deliberately does NOT raise - a failure to send shouldn't crash the
    request or reveal to the caller whether the address existed.
    """
    # TODO(before production): TEMPORARY console-only OTP delivery - NO EMAIL IS
    # SENT. Delete the next two lines (the print and the early return) once
    # SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD are set in backend/.env
    # (for Gmail: an App Password), otherwise password reset only works for
    # whoever can read the server console.
    print(f"\n[OTP] Code for {to_email}: {otp}\n")
    return True

    greeting = f"Hello {full_name}," if full_name else "Hello,"

    body = f"""{greeting}

Someone asked to reset the password for your PolarLog account.

Your verification code is:

    {otp}

This code expires in 10 minutes and can only be used once.

If you didn't ask for this, you can ignore this email - your
password hasn't changed.

- PolarLog
"""

    msg = EmailMessage()
    msg["Subject"] = "PolarLog password reset code"
    msg["From"] = config.SMTP_USER
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT) as smtp:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as err:
        # Log it for you; never surface the detail to the caller
        print(f"[email] Failed to send to {to_email}: {err}")
        return False