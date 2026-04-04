from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RequestOTPView, VerifyOTPView, SetupProfileView, MeView, UserListView, ToggleAdminView, AddAdminView

urlpatterns = [
    path('request-otp/', RequestOTPView.as_view(), name='request-otp'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify-otp'),
    path('setup-profile/', SetupProfileView.as_view(), name='setup-profile'),
    path('me/', MeView.as_view(), name='me'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/toggle-admin/', ToggleAdminView.as_view(), name='toggle-admin'),
    path('users/add-admin/', AddAdminView.as_view(), name='add-admin'),
]

