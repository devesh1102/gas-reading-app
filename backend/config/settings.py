from pathlib import Path
from decouple import config
from datetime import timedelta
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY', default='dev-secret-key-change-in-prod')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'whitenoise.runserver_nostatic',   # whitenoise serves static files in dev too
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    # Our apps
    'authentication',
    'submissions',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',          # must be right after SecurityMiddleware
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

import dj_database_url

DATABASES = {
    'default': dj_database_url.config(
        default=config('DATABASE_URL', default='sqlite:///db.sqlite3'),
        conn_max_age=600,
        ssl_require=False,
    )
}

# Tell Django to use our custom User model instead of the built-in one
AUTH_USER_MODEL = 'authentication.User'

# Django REST Framework — use JWT for all API authentication by default
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

# JWT token lifetimes and custom claims
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'TOKEN_OBTAIN_SERIALIZER': 'authentication.serializers.CustomTokenObtainSerializer',
}

# CORS — allow React dev server to talk to Django during development
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173,http://localhost:3000'
).split(',')

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME = config('AZURE_STORAGE_ACCOUNT_NAME', default='')
AZURE_STORAGE_ACCOUNT_KEY = config('AZURE_STORAGE_ACCOUNT_KEY', default='')
AZURE_BLOB_CONTAINER_NAME = config('AZURE_BLOB_CONTAINER_NAME', default='meter-images')

# Azure Communication Services
AZURE_COMMUNICATION_CONNECTION_STRING = config('AZURE_COMMUNICATION_CONNECTION_STRING', default='')
EMAIL_SENDER_ADDRESS = config('EMAIL_SENDER_ADDRESS', default='')

# OTP config
OTP_EXPIRY_MINUTES = config('OTP_EXPIRY_MINUTES', default=5, cast=int)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
# Python's logging system has 4 key concepts:
#   Logger   — what you call in code:  logger = logging.getLogger('authentication')
#   Handler  — where logs go (console, file, etc.)
#   Formatter — how logs look (timestamp, level, message)
#   Level    — severity filter: DEBUG < INFO < WARNING < ERROR < CRITICAL
#
# Our setup:
#   - Console handler  → always on (visible in terminal + App Service log stream)
#   - File handler     → writes to logs/app.log (rotates at 5MB, keeps 5 backups)
#   - Our app loggers  → DEBUG level (see everything)
#   - Django internals → WARNING level (only problems)
#   - Azure SDK        → WARNING level (suppress verbose SDK chatter)

LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,

    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} | {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },

    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            # RotatingFileHandler keeps log files from growing forever
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'app.log',
            'maxBytes': 5 * 1024 * 1024,   # 5 MB per file
            'backupCount': 5,               # keep last 5 rotated files
            'formatter': 'verbose',
        },
    },

    'loggers': {
        # Our authentication app — log everything
        'authentication': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        # Our submissions app — log everything
        'submissions': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        # Django request logs (404s, 500s, slow queries)
        'django.request': {
            'handlers': ['console', 'file'],
            'level': 'WARNING',
            'propagate': False,
        },
        # Django DB queries — set to DEBUG locally to see every SQL query
        'django.db.backends': {
            'handlers': ['console'],
            'level': config('DB_LOG_LEVEL', default='WARNING'),
            'propagate': False,
        },
        # Suppress noisy Azure SDK logs
        'azure': {
            'handlers': ['file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },

    # Root logger — catch anything not handled above
    'root': {
        'handlers': ['console', 'file'],
        'level': 'WARNING',
    },
}
