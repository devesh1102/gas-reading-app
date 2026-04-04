from django.urls import path
from .views import SubmissionCreateView, AdminSubmissionListView, AdminSubmissionDetailView

urlpatterns = [
    path('',              SubmissionCreateView.as_view(),      name='submission-create'),
    path('admin/',        AdminSubmissionListView.as_view(),   name='admin-submission-list'),
    path('admin/<int:pk>/', AdminSubmissionDetailView.as_view(), name='admin-submission-detail'),
]

