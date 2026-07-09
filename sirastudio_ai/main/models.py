import uuid

from django.db import models


class CVDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200, default="Untitled CV")
    cv_json = models.JSONField()
    revision = models.PositiveIntegerField(default=1)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["is_deleted", "-updated_at"], name="cv_doc_active_updated_idx"),
        ]

    def __str__(self):
        return self.title
