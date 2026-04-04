from rest_framework.permissions import BasePermission


class IsAppAdmin(BasePermission):
    """
    Custom DRF permission: only users with is_admin=True can access the view.

    DRF's built-in IsAdminUser checks Django's is_staff flag (for /admin site).
    We use our own is_admin field so we can grant review access without giving
    someone full Django admin access.
    """
    message = 'Admin access required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)
