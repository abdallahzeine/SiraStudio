from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from main.api import router as agent_router
from main.cv_documents import router as cv_documents_router

_AGENT_REQUEST_FAILED = {
    "code": "AGENT_REQUEST_FAILED",
    "message": "The agent request could not be completed. Please try again.",
}

agent_api = NinjaAPI(
    title="SiraStudio AI Agent",
    version="1.0.0",
    description="CV editing agent API",
    urls_namespace="agent_api",
)


@agent_api.exception_handler(Exception)
def agent_request_failed(request, exc):
    return agent_api.create_response(request, _AGENT_REQUEST_FAILED, status=500)


agent_api.add_router("", agent_router)

api = NinjaAPI(
    title="SiraStudio AI",
    version="1.0.0",
    description="CV editing agent API",
)
api.add_router("/cv-documents", cv_documents_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/agent/', agent_api.urls),
    path('api/', api.urls),
]
