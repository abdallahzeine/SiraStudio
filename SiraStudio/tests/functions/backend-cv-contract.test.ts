import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isValidCVData } from '../../src/features/saves/utils/snapshots';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const backendRoot = resolve(repoRoot, 'sirastudio_ai');
const virtualenvPython = process.platform === 'win32'
  ? resolve(repoRoot, '.venv/Scripts/python.exe')
  : resolve(repoRoot, '.venv/bin/python');
const python = process.env.PYTHON ?? (existsSync(virtualenvPython) ? virtualenvPython : 'python');

function runPython(script: string): string {
  return execFileSync(python, ['-c', script], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DJANGO_SETTINGS_MODULE: 'sirastudio_ai.settings',
    },
  }).trim();
}

function runContractProbe(): Record<string, boolean> {
  const script = String.raw`
import json
from copy import deepcopy
import django
django.setup()
from pydantic import ValidationError
from main.cv_schema import CVDataParseError, SCAFFOLD_CV_FIXTURE, dump_cv, parse_cv
from main.cv_documents import _validate_cv_json
from main.agent.tools.path_edit import CVEditOperation, _stage_edit, _unsupported_visual_mutation_error

results = {}

def rejected(name, mutate):
    value = deepcopy(SCAFFOLD_CV_FIXTURE)
    mutate(value)
    try:
        parse_cv(value)
    except CVDataParseError:
        results[name] = True
    else:
        results[name] = False

rejected('raw_empty', lambda value: value.clear())
rejected('unknown_section', lambda value: value['sections'][0].update(type='spacer'))
rejected('undeclared_field', lambda value: value['sections'][0]['content']['items'][0]['fields'].update(extra='x'))
rejected('missing_canonical_field', lambda value: value['sections'][0]['content']['schema'].clear())
rejected('duplicate_schema_key', lambda value: value['sections'][0]['content']['schema'].append(
    deepcopy(value['sections'][0]['content']['schema'][0])
))
rejected('string_kind_rejects_list', lambda value: value['sections'][0]['content']['items'][0]['fields'].update(
    body=['not a string']
))
rejected('list_kind_rejects_string', lambda value: (
    value['sections'][0].update(type='projects'),
    value['sections'][0]['content'].update(
        schema=[
            {'key': 'title', 'label': 'Project Name', 'kind': 'text'},
            {'key': 'subtitle', 'label': 'Tech Stack', 'kind': 'text'},
            {'key': 'date', 'label': 'Date', 'kind': 'date'},
            {'key': 'bullets', 'label': 'Details', 'kind': 'bullets'},
        ],
        items=[{'id': 'project-item', 'fields': {'bullets': 'not a list'}}],
    ),
))

custom = deepcopy(SCAFFOLD_CV_FIXTURE)
custom['sections'][0].update(type='custom')
custom['sections'][0]['content'] = {
    'schema': [{'key': 'portfolio', 'label': 'Portfolio', 'kind': 'tags'}],
    'items': [{'id': 'custom-item', 'fields': {'portfolio': ['Sira Studio']}}],
}
results['custom_schema_supported'] = parse_cv(custom).sections[0].content.items[0].fields['portfolio'] == ['Sira Studio']

project = deepcopy(SCAFFOLD_CV_FIXTURE)
project['sections'][0].update(type='projects')
project['sections'][0]['content'] = {
    'schema': [
        {'key': 'title', 'label': 'Project Name', 'kind': 'text'},
        {'key': 'subtitle', 'label': 'Tech Stack', 'kind': 'text'},
        {'key': 'date', 'label': 'Date', 'kind': 'date'},
        {'key': 'bullets', 'label': 'Details', 'kind': 'bullets'},
    ],
    'items': [{'id': 'project-item', 'fields': {
        'title': 'Sira Studio', 'subtitle': 'React, Django', 'date': '2026',
        'bullets': [{'id': 'project-bullet', 'text': 'Built it.'}],
    }}],
}
results['project_subtitle_round_trip'] = (
    parse_cv(project).sections[0].content.items[0].fields['subtitle'] == 'React, Django'
)
legacy_project = deepcopy(project)
legacy_project['sections'][0]['content']['items'][0]['fields']['bullets'] = ['Same text', 'Same text']
legacy_bullets = parse_cv(legacy_project).sections[0].content.items[0].fields['bullets']
results['legacy_bullets_migrate_with_unique_ids'] = (
    [bullet.text for bullet in legacy_bullets] == ['Same text', 'Same text']
    and legacy_bullets[0].id != legacy_bullets[1].id
)
duplicate_bullets = deepcopy(project)
duplicate_bullets['sections'][0]['content']['items'][0]['fields']['bullets'].append(
    {'id': 'project-bullet', 'text': 'Duplicate id'}
)
try:
    parse_cv(duplicate_bullets)
except CVDataParseError:
    results['duplicate_bullet_ids_rejected'] = True
else:
    results['duplicate_bullet_ids_rejected'] = False

for op in ('set', 'merge', 'append'):
    try:
        CVEditOperation.model_validate({'op': op, 'path': 'header.name'})
    except ValidationError:
        results[f'{op}_missing_value'] = True
    else:
        results[f'{op}_missing_value'] = False

results['explicit_null_distinguished'] = CVEditOperation.model_validate(
    {'op': 'set', 'path': 'header.name', 'value': None}
).value is None
rejected('explicit_null_schema_validation', lambda value: value['header'].update(name=None))

unsupported = ('template', 'template.id', 'dateFormat', 'sections[0].layout.separator', 'sections[0].layout.presetId')
for path in unsupported:
    try:
        CVEditOperation.model_validate({'op': 'set', 'path': path, 'value': 'x'})
    except ValidationError:
        results[f'unsupported:{path}'] = True
    else:
        results[f'unsupported:{path}'] = False

def blocks_visual(name, op, path, value=None):
    current = dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE))
    candidate = deepcopy(current)
    kwargs = {'value': value} if value is not None or op != 'delete' else {}
    ok, staged, err = _stage_edit(candidate, op, path, value)
    if not ok or staged is None:
        results[name] = False
        return
    results[name] = _unsupported_visual_mutation_error(current, staged) is not None

blocks_visual('bypass_root_set_template', 'set', '', {
    **dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE)),
    'template': {'id': 'sidebar-left', 'columns': 2, 'sidebarSide': 'left', 'sidebarSectionIds': ['summary']},
})
blocks_visual('bypass_root_set_dateFormat', 'set', '', {
    **dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE)),
    'dateFormat': 'YYYY',
})
blocks_visual('bypass_full_layout_set', 'set', 'sections[0].layout', {
    'dateSlot': 'hidden',
    'iconStyle': 'none',
    'separator': 'rule',
    'density': 'normal',
    'columns': 1,
})
blocks_visual('bypass_full_layout_merge', 'merge', 'sections[0].layout', {'separator': 'dot'})
blocks_visual('bypass_section_set', 'set', 'sections[0]', {
    **dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE))['sections'][0],
    'layout': {
        **dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE))['sections'][0]['layout'],
        'separator': 'rule',
        'presetId': 'classic',
    },
})

new_section = {
    'id': 'projects-new',
    'type': 'projects',
    'title': 'PROJECTS',
    'layout': {
        'dateSlot': 'hidden',
        'iconStyle': 'bullet',
        'separator': 'rule',
        'density': 'normal',
        'columns': 1,
        'presetId': 'classic',
    },
    'content': {
        'schema': [
            {'key': 'title', 'label': 'Project Name', 'kind': 'text'},
            {'key': 'subtitle', 'label': 'Tech Stack', 'kind': 'text'},
            {'key': 'date', 'label': 'Date', 'kind': 'date'},
            {'key': 'bullets', 'label': 'Details', 'kind': 'bullets'},
        ],
        'items': [],
    },
}
blocks_visual('bypass_sections_append_non_neutral', 'append', 'sections', new_section)

current = dump_cv(parse_cv(SCAFFOLD_CV_FIXTURE))
candidate = deepcopy(current)
neutral = deepcopy(new_section)
neutral['layout'] = {
    'dateSlot': 'hidden',
    'iconStyle': 'bullet',
    'separator': 'none',
    'density': 'normal',
    'columns': 1,
}
ok, staged, err = _stage_edit(candidate, 'append', 'sections', neutral)
results['neutral_section_append_allowed'] = ok and staged is not None and _unsupported_visual_mutation_error(current, staged) is None

linked = deepcopy(SCAFFOLD_CV_FIXTURE)
linked['sections'][0]['content']['items'][0]['links'] = [{
    'id': 'portfolio-link',
    'url': 'https://example.com',
    'label': 'Portfolio',
    'iconType': 'globe',
    'displayOrder': 0,
}]
current = dump_cv(parse_cv(linked))
replacement = deepcopy(current['sections'][0]['content']['items'][0])
replacement.pop('links')
replacement['fields']['body'] = 'Updated summary'
ok, staged, err = _stage_edit(deepcopy(current), 'set', 'sections[0].content.items[0]', replacement)
results['whole_item_set_preserves_omitted_links'] = (
    ok and staged is not None and staged['sections'][0]['content']['items'][0]['links'] == current['sections'][0]['content']['items'][0]['links']
)

dumped = _validate_cv_json(SCAFFOLD_CV_FIXTURE)
results['document_dump_omits_nulls'] = 'null' not in json.dumps(dumped)

print(json.dumps(results))
`;

  return JSON.parse(runPython(script)) as Record<string, boolean>;
}

describe('backend and agent CV contract', () => {
  it('rejects invalid CV shapes and unsupported edit operations', () => {
    for (const [behavior, passed] of Object.entries(runContractProbe())) {
      expect(passed, behavior).toBe(true);
    }
  });

  it('round-trips backend document dump into strict frontend validation', () => {
    const dumped = JSON.parse(runPython(String.raw`
import json
import django
django.setup()
from main.cv_documents import _validate_cv_json
from main.cv_schema import SCAFFOLD_CV_FIXTURE
print(json.dumps(_validate_cv_json(SCAFFOLD_CV_FIXTURE)))
`));

    expect(JSON.stringify(dumped)).not.toContain('null');
    expect(isValidCVData(dumped)).toBe(true);
  });
});
