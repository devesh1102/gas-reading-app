from rest_framework import serializers
from .models import Submission


class SubmissionSerializer(serializers.ModelSerializer):
    """Resident-facing: read-only view of their own submission."""
    email      = serializers.EmailField(source='user.email', read_only=True)
    flat       = serializers.CharField(source='user.flat_number', read_only=True)
    block      = serializers.CharField(source='user.block_number', read_only=True)

    class Meta:
        model  = Submission
        fields = ['id', 'email', 'flat', 'block', 'image_url',
                  'submitted_at', 'status', 'reading_value']
        read_only_fields = fields


class AdminSubmissionSerializer(serializers.ModelSerializer):
    """Admin-facing: includes all fields + writable reading_value / notes."""
    email  = serializers.EmailField(source='user.email', read_only=True)
    flat   = serializers.CharField(source='user.flat_number', read_only=True)
    block  = serializers.CharField(source='user.block_number', read_only=True)

    class Meta:
        model  = Submission
        fields = ['id', 'email', 'flat', 'block', 'image_url',
                  'submitted_at', 'status', 'reading_value', 'notes',
                  'reviewed_at', 'reviewed_by']
        read_only_fields = ['id', 'email', 'flat', 'block',
                            'image_url', 'submitted_at', 'reviewed_at', 'reviewed_by']
