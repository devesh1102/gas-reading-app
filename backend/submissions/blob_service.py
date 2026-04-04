import uuid
import logging
from django.conf import settings
from azure.storage.blob import BlobServiceClient, ContentSettings

logger = logging.getLogger('submissions')


def upload_meter_image(file_obj, original_filename: str) -> str:
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else 'jpg'
    blob_name = f"{uuid.uuid4()}.{ext}"

    logger.debug(f'Uploading image | blob={blob_name} | account={settings.AZURE_STORAGE_ACCOUNT_NAME} | container={settings.AZURE_BLOB_CONTAINER_NAME}')

    client = BlobServiceClient(
        account_url=f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net",
        credential=settings.AZURE_STORAGE_ACCOUNT_KEY,
    )

    blob_client = client.get_blob_client(
        container=settings.AZURE_BLOB_CONTAINER_NAME,
        blob=blob_name
    )

    blob_client.upload_blob(
        file_obj,
        overwrite=True,
        content_settings=ContentSettings(content_type=f"image/{ext}")
    )

    url = (
        f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net"
        f"/{settings.AZURE_BLOB_CONTAINER_NAME}/{blob_name}"
    )
    logger.info(f'Image uploaded successfully | url={url}')
    return url
