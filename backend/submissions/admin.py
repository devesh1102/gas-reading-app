from django.contrib import admin
from django.utils.html import format_html
from .models import Submission


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display  = ['id', 'resident_email', 'block', 'flat', 'submitted_at', 'status', 'reading_value']
    list_filter   = ['status', 'user__block_number']
    search_fields = ['user__email', 'user__flat_number']
    readonly_fields = ['image_preview', 'submitted_at', 'reviewed_at']

    def resident_email(self, obj): return obj.user.email
    def block(self, obj): return obj.user.block_number
    def flat(self, obj): return obj.user.flat_number

    def image_preview(self, obj):
        if obj.image_url:
            return format_html('<img src="{}" style="max-height:300px;"/>', obj.image_url)
        return '—'
    image_preview.short_description = 'Meter Image'

