#!/bin/bash
python manage.py migrate --no-input
python manage.py collectstatic --no-input
gunicorn config.wsgi:application --workers 1 --timeout 120 --bind 0.0.0.0:8000
