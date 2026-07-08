from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError
from pydantic import BaseModel, Field, field_validator

from .models import CVDocument

router = Router()

_DEFAULT_TITLE = "Untitled CV"
_REQUIRED_CV_KEYS = ("header", "sections", "template")


class ErrorResponse(BaseModel):
    detail: str


class _CVDocumentBase(BaseModel):
    cv: dict[str, Any] = Field(
        ...,
        description="Full CV JSON object. Must include header, sections, and template.",
    )
    title: str | None = Field(None, min_length=1, max_length=200)

    @field_validator("cv")
    @classmethod
    def validate_cv(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_cv_json(value)


class CVDocumentCreateRequest(_CVDocumentBase):
    pass


class CVDocumentUpdateRequest(_CVDocumentBase):
    base_revision: int | None = Field(
        None,
        ge=1,
        description="Optional revision the client edited from. Used for conflict detection.",
    )


class CVDocumentResponse(BaseModel):
    id: str
    title: str
    cv: dict[str, Any]
    revision: int
    created_at: str
    updated_at: str


class CVDocumentListResponse(BaseModel):
    documents: list[CVDocumentResponse]


def _validate_cv_json(value: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("cv must be an object")

    missing_keys = [key for key in _REQUIRED_CV_KEYS if key not in value]
    if missing_keys:
        raise ValueError(f"cv must include: {', '.join(missing_keys)}")

    if not isinstance(value.get("sections"), list):
        raise ValueError("cv.sections must be a list")

    for section_index, section in enumerate(value["sections"]):
        if not isinstance(section, dict):
            raise ValueError(f"cv.sections[{section_index}] must be an object")
        if not isinstance(section.get("id"), str):
            raise ValueError(f"cv.sections[{section_index}].id must be a string")
        if not isinstance(section.get("type"), str):
            raise ValueError(f"cv.sections[{section_index}].type must be a string")
        if not isinstance(section.get("title"), str):
            raise ValueError(f"cv.sections[{section_index}].title must be a string")
        if not isinstance(section.get("layout"), dict):
            raise ValueError(f"cv.sections[{section_index}].layout must be an object")

        content = section.get("content")
        if not isinstance(content, dict):
            raise ValueError(f"cv.sections[{section_index}].content must be an object")
        schema = content.get("schema")
        items = content.get("items")
        if not isinstance(schema, list):
            raise ValueError(f"cv.sections[{section_index}].content.schema must be a list")
        if not isinstance(items, list):
            raise ValueError(f"cv.sections[{section_index}].content.items must be a list")

        schema_keys = set()
        for field_index, field in enumerate(schema):
            if not isinstance(field, dict):
                raise ValueError(f"cv.sections[{section_index}].content.schema[{field_index}] must be an object")
            if not isinstance(field.get("key"), str):
                raise ValueError(f"cv.sections[{section_index}].content.schema[{field_index}].key must be a string")
            schema_keys.add(field["key"])

        for item_index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValueError(f"cv.sections[{section_index}].content.items[{item_index}] must be an object")
            if not isinstance(item.get("id"), str):
                raise ValueError(f"cv.sections[{section_index}].content.items[{item_index}].id must be a string")
            fields = item.get("fields")
            if not isinstance(fields, dict):
                raise ValueError(f"cv.sections[{section_index}].content.items[{item_index}].fields must be an object")
            for key, field_value in fields.items():
                if key not in schema_keys:
                    raise ValueError(
                        f"cv.sections[{section_index}].content.items[{item_index}].fields.{key} is not in schema"
                    )
                if isinstance(field_value, str):
                    continue
                if isinstance(field_value, list) and all(isinstance(entry, str) for entry in field_value):
                    continue
                raise ValueError(
                    f"cv.sections[{section_index}].content.items[{item_index}].fields.{key} must be a string or list of strings"
                )

    return value


def _normalize_title(title: str | None) -> str:
    if title is None:
        return _DEFAULT_TITLE
    stripped = title.strip()
    return stripped or _DEFAULT_TITLE


def _document_response(document: CVDocument) -> dict[str, Any]:
    return {
        "id": str(document.id),
        "title": document.title,
        "cv": document.cv_json,
        "revision": document.revision,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


def _get_active_document(document_id: str) -> CVDocument | None:
    try:
        return CVDocument.objects.get(id=document_id, is_deleted=False)
    except (CVDocument.DoesNotExist, ValidationError):
        return None


@router.get("", response=CVDocumentListResponse, summary="List CV documents")
def list_cv_documents(request, limit: int = 50, offset: int = 0):
    if limit < 1 or limit > 100:
        raise HttpError(400, "limit must be between 1 and 100")
    if offset < 0:
        raise HttpError(400, "offset must be greater than or equal to 0")

    documents = CVDocument.objects.filter(is_deleted=False).order_by("-updated_at")[offset : offset + limit]
    return {"documents": [_document_response(document) for document in documents]}


@router.post("", response={201: CVDocumentResponse}, summary="Create CV document")
def create_cv_document(request, body: CVDocumentCreateRequest):
    document = CVDocument.objects.create(
        title=_normalize_title(body.title),
        cv_json=body.cv,
    )
    return 201, _document_response(document)


@router.get("/{document_id}", response={200: CVDocumentResponse, 404: ErrorResponse}, summary="Get CV document")
def get_cv_document(request, document_id: str):
    document = _get_active_document(document_id)
    if document is None:
        return 404, {"detail": "CV document not found"}
    return _document_response(document)


@router.put(
    "/{document_id}",
    response={200: CVDocumentResponse, 404: ErrorResponse, 409: ErrorResponse},
    summary="Update CV document",
)
def update_cv_document(request, document_id: str, body: CVDocumentUpdateRequest):
    document = _get_active_document(document_id)
    if document is None:
        return 404, {"detail": "CV document not found"}

    if body.base_revision is not None and body.base_revision != document.revision:
        return 409, {
            "detail": (
                "Revision conflict: current revision is "
                f"{document.revision}, but base_revision was {body.base_revision}."
            )
        }

    # select_for_update() is a silent no-op on SQLite, so the revision check
    # above is unprotected against concurrent writers. Guard the write with an
    # atomic conditional UPDATE: the revision bump only applies if the row still
    # matches the revision we validated against.
    expected_revision = body.base_revision if body.base_revision is not None else document.revision
    update_fields_map: dict[str, Any] = {
        "cv_json": body.cv,
        "revision": F("revision") + 1,
        "updated_at": timezone.now(),
    }
    if body.title is not None:
        update_fields_map["title"] = _normalize_title(body.title)

    with transaction.atomic():
        rows = (
            CVDocument.objects.filter(
                id=document_id,
                is_deleted=False,
                revision=expected_revision,
            ).update(**update_fields_map)
        )

    if rows == 0:
        return 409, {"detail": "Revision conflict: document was modified concurrently."}

    document.refresh_from_db()
    return _document_response(document)


@router.delete(
    "/{document_id}",
    response={200: CVDocumentResponse, 404: ErrorResponse},
    summary="Archive CV document",
)
def delete_cv_document(request, document_id: str):
    document = _get_active_document(document_id)
    if document is None:
        return 404, {"detail": "CV document not found"}

    document.is_deleted = True
    document.save(update_fields=["is_deleted", "updated_at"])
    return _document_response(document)
