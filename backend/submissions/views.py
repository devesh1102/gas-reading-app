from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
import logging

from .models import Submission
from .serializers import SubmissionSerializer, AdminSubmissionSerializer
from .permissions import IsAppAdmin
from .blob_service import upload_meter_image

logger = logging.getLogger('submissions')


class SubmissionCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        logger.info(f'Submission attempt | user={user.email} | block={user.block_number} | flat={user.flat_number}')

        if not user.is_profile_complete:
            logger.warning(f'Submission blocked — profile incomplete | user={user.email}')
            return Response(
                {'detail': 'Please complete your profile before submitting.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        image = request.FILES.get('image')
        if not image:
            logger.warning(f'Submission rejected — no image provided | user={user.email}')
            return Response({'detail': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        if not image.content_type.startswith('image/'):
            logger.warning(f'Submission rejected — invalid file type | user={user.email} | content_type={image.content_type}')
            return Response({'detail': 'File must be an image.'}, status=status.HTTP_400_BAD_REQUEST)

        logger.debug(f'Uploading image | user={user.email} | filename={image.name} | size={image.size} bytes')

        try:
            image_url = upload_meter_image(image, image.name)
        except Exception as e:
            logger.error(f'Image upload failed | user={user.email} | error={e}', exc_info=True)
            return Response(
                {'detail': 'Image upload failed. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        submission = Submission.objects.create(user=user, image_url=image_url)
        logger.info(f'Submission created | id={submission.id} | user={user.email} | url={image_url}')

        return Response(SubmissionSerializer(submission).data, status=status.HTTP_201_CREATED)


class AdminSubmissionListView(APIView):
    permission_classes = [IsAuthenticated, IsAppAdmin]

    def get(self, request):
        status_filter = request.query_params.get('status')
        logger.info(f'Admin listing submissions | admin={request.user.email} | filter={status_filter or "all"}')

        qs = Submission.objects.select_related('user', 'reviewed_by').all()
        if status_filter in (Submission.Status.PENDING, Submission.Status.REVIEWED):
            qs = qs.filter(status=status_filter)

        logger.debug(f'Returning {qs.count()} submissions')
        return Response(AdminSubmissionSerializer(qs, many=True).data)


class AdminSubmissionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAppAdmin]

    def patch(self, request, pk):
        logger.info(f'Admin reviewing submission | id={pk} | admin={request.user.email}')

        try:
            submission = Submission.objects.get(pk=pk)
        except Submission.DoesNotExist:
            logger.warning(f'Submission not found | id={pk}')
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminSubmissionSerializer(submission, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if request.data.get('status') == Submission.Status.REVIEWED:
            serializer.save(reviewed_at=timezone.now(), reviewed_by=request.user)
            logger.info(f'Submission marked reviewed | id={pk} | reading={request.data.get("reading_value")} | admin={request.user.email}')
        else:
            serializer.save()
            logger.debug(f'Submission updated (not yet reviewed) | id={pk}')

        return Response(serializer.data)

