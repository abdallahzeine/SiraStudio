from pydantic import BaseModel, Field
from typing import Any, Literal


class EditRequest(BaseModel):
    cv: dict[str, Any] = Field(
        ...,
        description="Full CVData JSON from the frontend. Contains header, sections, template.",
    )
    thread_id: str = Field(
        ...,
        min_length=1,
        description="Stable assistant conversation id used to persist memory between turns.",
    )
    message: str = Field(
        ...,
        description="User's editing request in natural language.",
        min_length=1,
        max_length=4000,
    )
    revision: int | None = Field(
        None,
        description="Current frontend CVDocument revision for concurrency checks.",
    )
    user_id: str | None = Field(
        None,
        description="Optional user id for persistent preferences and store namespace.",
    )
    checkpoint_id: str | None = Field(
        None,
        description="Optional checkpoint id to resume the agent run.",
    )


class EditResponse(BaseModel):
    cv: dict[str, Any] = Field(
        ...,
        description="Updated CVData JSON after the agent applied edits via tools.",
    )
    reply: str = Field(
        ...,
        description="Agent's natural language explanation of what was changed.",
    )
    run_id: str = Field(
        ...,
        description="Unique run id for the agent invocation.",
    )
    revision_mismatch: bool = Field(
        False,
        description="True if request CV revision was older than the last checkpointed revision.",
    )


class JobCreateResponse(BaseModel):
    job_id: str = Field(
        ...,
        description="Job identifier.",
    )


class JobCapacityErrorResponse(BaseModel):
    code: Literal["JOB_CAPACITY_EXCEEDED"]
    message: str


class JobStatusResponse(BaseModel):
    job_id: str = Field(
        ...,
        description="Job identifier.",
    )
    status: Literal["queued", "running", "completed", "failed"] = Field(
        ...,
        description="Job status: queued, running, completed, failed.",
    )
    created_at: str | None = Field(
        None,
        description="UTC creation timestamp.",
    )
    updated_at: str | None = Field(
        None,
        description="UTC last update timestamp.",
    )
    thread_id: str | None = Field(
        None,
        description="Assistant thread id for the job.",
    )
    message_preview: str | None = Field(
        None,
        description="Short preview of the user request.",
    )
    reply: str | None = Field(
        None,
        description="Agent reply when available.",
    )
    cv: dict[str, Any] | None = Field(
        None,
        description="Updated CVData JSON when job is completed.",
    )
    run_id: str | None = Field(
        None,
        description="Run id for the agent invocation.",
    )
    revision_mismatch: bool | None = Field(
        None,
        description="True if request CV revision was older than the last checkpointed revision.",
    )
    error: str | None = Field(
        None,
        description="Error message when job fails.",
    )
    error_code: str | None = Field(
        None,
        description="Short machine-readable failure code when available.",
    )


class ThreadCreateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    user_id: str | None = Field(None, min_length=1, max_length=120)


class ThreadRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class ThreadSummaryResponse(BaseModel):
    thread_id: str = Field(..., description="Assistant thread id.")
    title: str | None = None
    status: Literal["regular", "archived", "deleted"] = "regular"
    created_at: str
    updated_at: str
    last_message_at: str | None = None
    last_job_id: str | None = None
    message_preview: str | None = None


class ThreadListResponse(BaseModel):
    threads: list[ThreadSummaryResponse]


class ThreadMessageResponse(BaseModel):
    id: str
    thread_id: str
    role: Literal["user", "assistant", "system"]
    content: str
    status: Literal["queued", "running", "completed", "failed"] = "completed"
    created_at: str
    updated_at: str
    job_id: str | None = None
    run_id: str | None = None
    error: str | None = None


class ThreadDetailResponse(ThreadSummaryResponse):
    messages: list[ThreadMessageResponse]
