"""
ASGI config for sirastudio_ai project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from asgiref.sync import sync_to_async
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sirastudio_ai.settings')

django_application = get_asgi_application()


async def application(scope, receive, send):
    if scope['type'] != 'lifespan':
        await django_application(scope, receive, send)
        return

    while True:
        message = await receive()
        if message['type'] == 'lifespan.startup':
            from main.jobs import recover_interrupted_jobs

            await sync_to_async(recover_interrupted_jobs, thread_sensitive=False)()
            await send({'type': 'lifespan.startup.complete'})
        elif message['type'] == 'lifespan.shutdown':
            await send({'type': 'lifespan.shutdown.complete'})
            return
