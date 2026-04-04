import os
import threading
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

def _init_app_insights():
    """Initialize App Insights in background — avoids blocking startup."""
    try:
        from decouple import config as env_config
        conn_str = env_config('APPLICATIONINSIGHTS_CONNECTION_STRING', default='')
        if conn_str:
            from azure.monitor.opentelemetry import configure_azure_monitor
            configure_azure_monitor(connection_string=conn_str)
    except Exception as e:
        print(f'[AppInsights] Failed to initialize: {e}')

threading.Thread(target=_init_app_insights, daemon=True).start()

application = get_wsgi_application()
