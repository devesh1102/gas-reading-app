from django.contrib import admin
from django.urls import path, include, re_path
from django.http import HttpResponse
from django.conf import settings
import os


def serve_react(request, path=''):
    """Serve React SPA index.html for all non-API, non-admin routes."""
    index = os.path.join(settings.BASE_DIR, 'frontend_build', 'index.html')
    if os.path.exists(index):
        with open(index, 'rb') as f:
            return HttpResponse(f.read(), content_type='text/html')
    return HttpResponse('Frontend not deployed yet.', status=503)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('authentication.urls')),
    path('api/submissions/', include('submissions.urls')),
    # Catch-all: serve React SPA for all non-API routes (supports client-side routing)
    re_path(r'^(?!api/|admin/).*$', serve_react),
]

