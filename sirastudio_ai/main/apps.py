from typing import Any

from django.apps import AppConfig as _AppConfig

AppConfig: Any = _AppConfig


class MainConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'
    verbose_name = 'SiraStudio AI Main'