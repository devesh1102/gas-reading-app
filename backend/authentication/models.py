from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from django.conf import settings
import secrets
import string


class UserManager(BaseUserManager):
    """
    Custom manager because our User identifies by email, not username.
    Django's default manager assumes a 'username' field — we override that here.
    """
    def create_user(self, email, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_unusable_password()   # no password — we use OTP only
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_admin', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_profile_complete', True)
        user = self.create_user(email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model that uses email as the unique identifier.
    We extend Django's AbstractBaseUser so we keep all the built-in
    auth machinery (sessions, permissions, admin) but control the fields.
    """
    email = models.EmailField(unique=True)
    flat_number = models.CharField(max_length=20, blank=True)
    block_number = models.CharField(max_length=20, blank=True)
    is_profile_complete = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)     # app-level admin (can review submissions)
    is_staff = models.BooleanField(default=False)     # Django admin site access
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'email'   # used by Django's auth system for login lookup
    REQUIRED_FIELDS = []       # nothing extra needed for createsuperuser

    def __str__(self):
        return self.email


class OTPToken(models.Model):
    """
    A one-time password tied to an email address.
    We store it separately from User so we can issue OTPs before
    the user account is created (first-time signup).
    """
    email = models.EmailField()
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def generate_for(cls, email):
        """
        Invalidate any existing unused OTPs for this email,
        then create a fresh 8-character alphanumeric OTP with a 5-minute expiry.
        """
        cls.objects.filter(email=email, is_used=False).update(is_used=True)

        code = ''.join(secrets.choice(string.digits) for _ in range(6))
        expiry = timezone.now() + timezone.timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
        return cls.objects.create(email=email, code=code, expires_at=expiry)

    @classmethod
    def verify(cls, email, code):
        """
        Returns the OTPToken if valid, raises ValueError otherwise.
        Marks it as used so it can't be replayed.
        """
        try:
            otp = cls.objects.get(email=email, code=code.upper(), is_used=False)
        except cls.DoesNotExist:
            raise ValueError('Invalid OTP')

        if timezone.now() > otp.expires_at:
            raise ValueError('OTP has expired')

        otp.is_used = True
        otp.save()
        return otp

    def __str__(self):
        return f'{self.email} — {self.code}'
