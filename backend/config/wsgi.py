import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Configure Azure Monitor before the app starts serving requests.
# This must be called early — before any Django views are imported.
# It auto-instruments:
#   - Every HTTP request/response (logged as "requests" in App Insights)
#   - Every DB query via psycopg2 (logged as "dependencies")
#   - All outgoing HTTP calls to Blob/ACS (logged as "dependencies")
#   - All Python logger.info/warning/error calls (logged as "traces")
#   - Unhandled exceptions (logged as "exceptions")
from decouple import config as env_config
conn_str = env_config('APPLICATIONINSIGHTS_CONNECTION_STRING', default='')
if conn_str:
    from azure.monitor.opentelemetry import configure_azure_monitor
    configure_azure_monitor(connection_string=conn_str)

application = get_wsgi_application()
