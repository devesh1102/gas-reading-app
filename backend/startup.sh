#!/bin/bash
gunicorn config.wsgi:application --workers 1 --timeout 120 --bind 0.0.0.0:8000

