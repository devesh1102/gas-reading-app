from django.db import models
from django.conf import settings


class Submission(models.Model):
    """
    One meter photo submission by a resident.

    Flow:
      Resident uploads image → stored in Azure Blob → record created here (status=pending)
      Admin reviews it      → enters reading_value → status flipped to reviewed
    """
    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        REVIEWED = 'reviewed', 'Reviewed'

    # Who submitted it — settings.AUTH_USER_MODEL avoids a circular import
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='submissions'
    )
    image_url   = models.URLField(max_length=500)   # public Azure Blob URL
    submitted_at = models.DateTimeField(auto_now_add=True)
    status      = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # Filled in by admin after review
    reading_value = models.CharField(max_length=20, blank=True)
    notes         = models.TextField(blank=True)
    reviewed_at   = models.DateTimeField(null=True, blank=True)
    reviewed_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_submissions'
    )

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f'{self.user.email} — {self.submitted_at:%Y-%m-%d %H:%M} [{self.status}]'

