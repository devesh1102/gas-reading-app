from django.contrib import admin
from .models import User, OTPToken


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['email', 'block_number', 'flat_number', 'is_admin', 'is_profile_complete', 'date_joined']
    list_filter = ['is_admin', 'is_profile_complete', 'block_number']
    search_fields = ['email', 'flat_number']


@admin.register(OTPToken)
class OTPTokenAdmin(admin.ModelAdmin):
    list_display = ['email', 'code', 'created_at', 'expires_at', 'is_used']
    list_filter = ['is_used']

