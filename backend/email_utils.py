import smtplib
from email.message import EmailMessage

import config


def send_otp_email(to_email, otp, full_name=""):
    """
    Send a password-reset code. Returns True on success, False on failure.

    Deliberately does NOT raise - a failure to send shouldn't crash the
    request or reveal to the caller whether the address existed.
    """
        # No SMTP configured - fall back to printing the code to the console.
    #
    # This is how it worked everywhere before email was set up, and it is
    # what a teammate who clones this repo without mail credentials still
    # gets. The alternative - removing this path entirely - would mean
    # password reset silently failing for them with nothing in the log to
    # say why.
    if not config.SMTP_HOST or not config.SMTP_PASSWORD:
        print(f"\n[OTP] Code for {to_email}: {otp}  (no SMTP configured)\n")
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