from django.conf import settings
from azure.communication.email import EmailClient
import threading
import logging
import os

logger = logging.getLogger('authentication')


def _send_async(client, message, to_email):
    """Runs in a background thread so the API responds instantly."""
    try:
        poller = client.begin_send(message)
        result = poller.result()
        logger.info(f'OTP email delivered to {to_email} | message_id={result.get("id", "n/a")}')
    except Exception as e:
        logger.error(f'OTP email delivery failed for {to_email} | error={e}', exc_info=True)


def send_otp_email(to_email: str, otp_code: str) -> None:
    logger.debug(f'Connecting to ACS | endpoint={settings.AZURE_COMMUNICATION_ENDPOINT}')

    # Use specific credential — avoids DefaultAzureCredential probing multiple providers
    if os.environ.get('IDENTITY_ENDPOINT'):   # running on App Service
        from azure.identity import ManagedIdentityCredential
        credential = ManagedIdentityCredential()
    else:                                      # running locally via az login
        from azure.identity import AzureCliCredential
        credential = AzureCliCredential()

    client = EmailClient(settings.AZURE_COMMUNICATION_ENDPOINT, credential)

    message = {
        "senderAddress": settings.EMAIL_SENDER_ADDRESS,
        "recipients": {"to": [{"address": to_email}]},
        "content": {
            "subject": "Your Gas Reading App OTP",
            "plainText": f"Your one-time password is: {otp_code}\n\nIt expires in {settings.OTP_EXPIRY_MINUTES} minutes.",
            "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 400px;">
                    <h2>Gas Reading App</h2>
                    <p>Your one-time password is:</p>
                    <h1 style="letter-spacing: 8px; color: #2563eb;">{otp_code}</h1>
                    <p>This code expires in <strong>{settings.OTP_EXPIRY_MINUTES} minutes</strong>.</p>
                    <p style="color: #6b7280; font-size: 12px;">If you didn't request this, ignore this email.</p>
                </div>
            """
        }
    }

    # Fire the email in a background thread — API returns instantly
    # The OTP is already saved in DB before this call, so the user can proceed
    logger.debug(f'Dispatching OTP email to {to_email} in background thread')
    thread = threading.Thread(target=_send_async, args=(client, message, to_email), daemon=True)
    thread.start()

