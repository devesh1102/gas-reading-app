from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
import logging

from .models import User, OTPToken
from .serializers import (
    RequestOTPSerializer, VerifyOTPSerializer,
    SetupProfileSerializer, UserSerializer
)
from .email_service import send_otp_email

logger = logging.getLogger('authentication')


class RequestOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        logger.info(f'OTP requested for email: {email}')

        otp = OTPToken.generate_for(email)
        logger.debug(f'OTP generated for {email} | expires_at={otp.expires_at}')

        try:
            send_otp_email(email, otp.code)
            logger.info(f'OTP email sent successfully to {email}')
        except Exception as e:
            logger.error(f'Failed to send OTP email to {email} | error={e}', exc_info=True)
            return Response(
                {'detail': 'Failed to send OTP email. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        return Response({'detail': 'OTP sent to your email.'})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code  = serializer.validated_data['code']

        logger.info(f'OTP verification attempt for email: {email}')

        try:
            OTPToken.verify(email, code)
            logger.info(f'OTP verified successfully for {email}')
        except ValueError as e:
            logger.warning(f'OTP verification failed for {email} | reason={e}')
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        user, created = User.objects.get_or_create(email=email)
        if created:
            logger.info(f'New user created: {email}')
        else:
            logger.info(f'Existing user logged in: {email} | is_admin={user.is_admin} | profile_complete={user.is_profile_complete}')

        refresh = RefreshToken.for_user(user)
        refresh['email'] = user.email
        refresh['is_admin'] = user.is_admin
        refresh['is_profile_complete'] = user.is_profile_complete

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'is_profile_complete': user.is_profile_complete,
            'is_admin': user.is_admin,
        })


class SetupProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetupProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        logger.info(f'Profile setup for {user.email} | block={serializer.validated_data["block_number"]} flat={serializer.validated_data["flat_number"]}')

        user.flat_number = serializer.validated_data['flat_number']
        user.block_number = serializer.validated_data['block_number']
        user.is_profile_complete = True
        user.save()

        logger.info(f'Profile completed for {user.email}')

        refresh = RefreshToken.for_user(user)
        refresh['email'] = user.email
        refresh['is_admin'] = user.is_admin
        refresh['is_profile_complete'] = user.is_profile_complete

        return Response({
            'detail': 'Profile updated.',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        logger.debug(f'Me endpoint called by {request.user.email}')
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class UserListView(APIView):
    """
    GET /api/auth/users/
    Returns all registered users. Admin only.
    Used by the admin panel to manage who has admin access.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_admin:
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        users = User.objects.all().order_by('email')
        logger.info(f'User list fetched by {request.user.email} | count={users.count()}')
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)


class ToggleAdminView(APIView):
    """
    PATCH /api/auth/users/<pk>/toggle-admin/
    Toggles is_admin for a user. Admin only.
    An admin cannot remove their own admin access (safety guard).
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_admin:
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Prevent admin from accidentally locking themselves out
        if target.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot change your own admin status.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        target.is_admin = not target.is_admin
        target.save()

        action = 'granted' if target.is_admin else 'revoked'
        logger.info(f'Admin {action} | target={target.email} | by={request.user.email}')

        return Response(UserSerializer(target).data)


class AddAdminView(APIView):
    """
    POST /api/auth/users/add-admin/
    Grants admin access to any email — creates the account if it doesn't exist yet.
    This lets you pre-grant admin access before someone even logs in for the first time.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_admin:
            return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic email format check
        if '@' not in email or '.' not in email.split('@')[-1]:
            return Response({'detail': 'Invalid email address.'}, status=status.HTTP_400_BAD_REQUEST)

        # Prevent adding yourself (already admin)
        if email == request.user.email:
            return Response({'detail': 'You are already an admin.'}, status=status.HTTP_400_BAD_REQUEST)

        user, created = User.objects.get_or_create(email=email)

        if user.is_admin:
            return Response({'detail': f'{email} is already an admin.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_admin = True
        user.save()

        action = 'created and granted' if created else 'granted'
        logger.info(f'Admin {action} | target={email} | by={request.user.email}')

        return Response({
            'detail': f'Admin access {action} to {email}.',
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)
