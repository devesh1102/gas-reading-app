#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

    # Initialize Application Insights for local dev server too
    # Only activates when APPLICATIONINSIGHTS_CONNECTION_STRING is set in .env
    from decouple import config as env_config
    conn_str = env_config('APPLICATIONINSIGHTS_CONNECTION_STRING', default='')
    if conn_str and 'runserver' in sys.argv:
        from azure.monitor.opentelemetry import configure_azure_monitor
        configure_azure_monitor(connection_string=conn_str)

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
