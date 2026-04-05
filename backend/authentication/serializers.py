from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User


class RequestOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code  = serializers.CharField(max_length=6, min_length=6)


class SetupProfileSerializer(serializers.Serializer):
    flat_number = serializers.CharField(max_length=20)
    block_number = serializers.CharField(max_length=20)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'flat_number', 'block_number', 'is_profile_complete', 'is_admin']
        read_only_fields = fields


class CustomTokenObtainSerializer(TokenObtainPairSerializer):
    """
    Adds extra claims into the JWT payload so the React frontend
    knows immediately whether the user is an admin or needs profile setup —
    without making an extra API call.
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['user_id'] = user.id
        token['is_admin'] = user.is_admin
        token['is_profile_complete'] = user.is_profile_complete
        return token
