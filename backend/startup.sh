#!/bin/bash
# This runs on Azure App Service (Linux) when the app starts.
#
# gunicorn = production-grade WSGI server (Django's built-in dev server is NOT safe for production)
# --workers 2 = 2 parallel worker processes
# --timeout 120 = kill workers that take >120s (prevents hanging requests)
# config.wsgi:application = tells gunicorn where the Django WSGI app lives

python manage.py migrate --no-input
python manage.py collectstatic --no-input
gunicorn config.wsgi:application --workers 2 --timeout 120 --bind 0.0.0.0:8000
