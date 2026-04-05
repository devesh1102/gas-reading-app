from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.conf import settings
import os


def serve_react(request, path=''):
    """Serve React SPA index.html for all non-API, non-admin routes."""
    # index.html is copied to STATIC_ROOT (staticfiles/) by collectstatic.
    # Oryx keeps staticfiles/ in wwwroot; frontend_build/ is excluded by Oryx.
    index = os.path.join(settings.STATIC_ROOT, 'index.html')
    if os.path.exists(index):
        with open(index, 'rb') as f:
            return HttpResponse(f.read(), content_type='text/html')
    return HttpResponse('Frontend not deployed yet.', status=503)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('authentication.urls')),
    path('api/submissions/', include('submissions.urls')),
    # Catch-all: serve React SPA for all non-API routes (supports client-side routing)
    path('', serve_react),
    path('<path:path>', serve_react),
]
