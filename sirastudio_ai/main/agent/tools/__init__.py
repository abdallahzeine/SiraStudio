from .header import read_cv
from .path_edit import edit_cv_path
from .resolve import resolve_sections, resolve_items

ALL_TOOLS = [
    # Inspection (1)
    read_cv,
    # Resolvers (2)
    resolve_sections, resolve_items,
    # Edits (1)
    edit_cv_path,
]
