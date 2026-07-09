from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from main.api import router as agent_router
from main.cv_documents import router as cv_documents_router

api = NinjaAPI(
    title="SiraStudio AI",
    version="1.0.0",
    description="CV editing agent API",
)
api.add_router("/agent", agent_router)
api.add_router("/cv-documents", cv_documents_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]
