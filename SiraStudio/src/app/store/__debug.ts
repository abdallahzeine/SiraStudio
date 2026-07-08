import { initialCVData } from '../../features/cv-editor/data/initialCVData';
import type { CVData } from '../../shared/types';
import { applyPatch } from './applyPatch';
import { diffCVData } from './diff';
import type { Patch } from './types';

interface VerificationResult {
  test: string;
  passed: boolean;
  detail?: string;
}

function cloneCVData(data: CVData): CVData {
  return JSON.parse(JSON.stringify(data)) as CVData;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runSinglePatch(data: CVData, patch: Patch): { ok: boolean; next: CVData; detail?: string } {
  const result = applyPatch(data, patch);
  if (result.error) {
    return {
      ok: false,
      next: data,
      detail: `${result.error.code}: ${result.error.message}`,
    };
  }
  return { ok: true, next: result.next };
}

function verifyRoundTrip(base: CVData): VerificationResult {
  const patch: Patch = { op: 'set', path: 'header.name', value: 'Roundtrip Test Name' };
  const applied = applyPatch(base, patch);
  if (applied.error) {
    return { test: 'Round-trip identity', passed: false, detail: applied.error.message };
  }

  const reverted = applyPatch(applied.next, applied.inverse);
  if (reverted.error) {
    return { test: 'Round-trip identity', passed: false, detail: reverted.error.message };
  }

  return {
    test: 'Round-trip identity',
    passed: deepEqual(base, reverted.next),
    detail: deepEqual(base, reverted.next) ? undefined : 'State mismatch after inverse patch',
  };
}

function verifyOperations(base: CVData): VerificationResult {
  const working = cloneCVData(base);

  const steps: Array<{ name: string; patch: Patch; check: (data: CVData) => boolean }> = [
    {
      name: 'set',
      patch: { op: 'set', path: 'header.location', value: 'Amman, Jordan' },
      check: (data) => data.header.location === 'Amman, Jordan',
    },
    {
      name: 'replace',
      patch: {
        op: 'replace',
        path: 'header',
        value: {
          ...working.header,
          phone: '+962700000000',
        },
      },
      check: (data) => data.header.phone === '+962700000000',
    },
    {
      name: 'merge',
      patch: { op: 'merge', path: 'header', value: { email: 'patched@example.com' } },
      check: (data) => data.header.email === 'patched@example.com',
    },
    {
      name: 'insert append',
      patch: {
        op: 'insert',
        path: 'sections[4].items[-1]',
        value: { id: 'cert-x', title: 'Inserted Cert', subtitle: 'Org', date: '01/2026' },
      },
      check: (data) => data.sections[4].items[data.sections[4].items.length - 1]?.id === 'cert-x',
    },
    {
      name: 'delete',
      patch: { op: 'delete', path: 'sections[4].items[2]' },
      check: (data) => data.sections[4].items.every((item) => item.id !== 'cert-x'),
    },
    {
      name: 'move',
      patch: {
        op: 'move',
        from: 'sections[4].items[0]',
        path: 'sections[4].items[1]',
      },
      check: (data) => data.sections[4].items[1]?.id === base.sections[4].items[0]?.id,
    },
  ];

  let current = working;
  for (const step of steps) {
    const run = runSinglePatch(current, step.patch);
    if (!run.ok) {
      return { test: `Operation coverage (${step.name})`, passed: false, detail: run.detail };
    }

    if (!step.check(run.next)) {
      return { test: `Operation coverage (${step.name})`, passed: false, detail: 'Post-condition failed' };
    }

    current = run.next;
  }

  return { test: 'Operation coverage', passed: true };
}

function verifyAppendAndNested(base: CVData): VerificationResult {
  const appendPatch: Patch = {
    op: 'insert',
    path: 'sections[5].items[0].bullets[-1]',
    value: 'Nested appended bullet',
  };

  const appendResult = applyPatch(base, appendPatch);
  if (appendResult.error) {
    return { test: 'Append + nested path', passed: false, detail: appendResult.error.message };
  }

  const bullets = appendResult.next.sections[5].items[0].bullets ?? [];
  const nestedSet = applyPatch(appendResult.next, {
    op: 'set',
    path: `sections[5].items[0].bullets[${bullets.length - 1}]`,
    value: 'Nested updated bullet',
  });

  if (nestedSet.error) {
    return { test: 'Append + nested path', passed: false, detail: nestedSet.error.message };
  }

  const lastBullet = nestedSet.next.sections[5].items[0].bullets?.at(-1);
  return {
    test: 'Append + nested path',
    passed: lastBullet === 'Nested updated bullet',
    detail: lastBullet === 'Nested updated bullet' ? undefined : 'Nested update check failed',
  };
}

function verifyStructuralSharing(base: CVData): VerificationResult {
  const patched = applyPatch(base, { op: 'set', path: 'header.name', value: 'Sharing Test Name' });
  if (patched.error) {
    return { test: 'Structural sharing', passed: false, detail: patched.error.message };
  }

  const headerChanged = !Object.is(base.header, patched.next.header);
  const sectionsShared = Object.is(base.sections, patched.next.sections);

  return {
    test: 'Structural sharing',
    passed: headerChanged && sectionsShared,
    detail: headerChanged && sectionsShared ? undefined : 'Expected changed header ref and shared sections ref',
  };
}

function verifyErrorHandling(base: CVData): VerificationResult {
  const invalid = applyPatch(base, { op: 'set', path: 'sections[999].title', value: 'x' });
  return {
    test: 'Error handling invalid path',
    passed: Boolean(invalid.error),
    detail: invalid.error ? undefined : 'Expected error for out-of-bounds path',
  };
}

function verifyRootReplace(base: CVData): VerificationResult {
  const replacement = cloneCVData(base);
  replacement.header.name = 'Root Replace Name';

  const replaced = applyPatch(base, { op: 'replace', path: '', value: replacement });
  if (replaced.error) {
    return { test: 'Root path replace', passed: false, detail: replaced.error.message };
  }

  const reverted = applyPatch(replaced.next, replaced.inverse);
  if (reverted.error) {
    return { test: 'Root path replace', passed: false, detail: reverted.error.message };
  }

  return {
    test: 'Root path replace',
    passed: deepEqual(reverted.next, base),
    detail: deepEqual(reverted.next, base) ? undefined : 'Inverse did not restore original root value',
  };
}

function verifyPerformance(base: CVData): VerificationResult {
  let current = cloneCVData(base);
  const start = performance.now();

  for (let i = 0; i < 100; i += 1) {
    const run = runSinglePatch(current, {
      op: 'set',
      path: 'header.headline',
      value: `Headline ${i}`,
    });

    if (!run.ok) {
      return { test: 'Performance 100 patches', passed: false, detail: run.detail };
    }

    current = run.next;
  }

  const elapsed = performance.now() - start;
  return {
    test: 'Performance 100 patches',
    passed: elapsed < 100,
    detail: `Elapsed ${elapsed.toFixed(2)}ms`,
  };
}

function applyPatches(base: CVData, patches: Patch[]): { ok: boolean; next: CVData; detail?: string } {
  let current = base;

  for (const patch of patches) {
    const applied = applyPatch(current, patch);
    if (applied.error) {
      return {
        ok: false,
        next: current,
        detail: `${applied.error.code}: ${applied.error.message} @ ${patch.path}`,
      };
    }
    current = applied.next;
  }

  return { ok: true, next: current };
}

function verifyDiffRoundTrip(base: CVData): VerificationResult {
  const target = cloneCVData(base);
  target.header.name = 'Diff Engine Roundtrip';
  target.header.socialLinks[0].label = 'GitHub Profile';
  target.sections[0].items[0].title = 'Senior AI Engineer Intern';
  target.sections[4].items.splice(1, 1);
  target.sections[5].items[0].bullets = [...(target.sections[5].items[0].bullets ?? []), 'Diff-added bullet'];
  target.sections.push({
    id: 'custom-diff',
    type: 'custom',
    title: 'CUSTOM DIFF SECTION',
    layout: {
      dateSlot: 'hidden',
      iconStyle: 'none',
      separator: 'none',
      density: 'normal',
      columns: 1,
    },
    schema: {
      fields: [
        { key: 'outcome', label: 'Outcome', kind: 'text' },
        { key: 'highlights', label: 'Highlights', kind: 'bullets' },
      ],
    },
    items: [
      {
        id: 'custom-diff-item-1',
        values: {
          outcome: 'Patch round-trip validated',
          highlights: ['set', 'insert', 'delete'],
        },
      },
    ],
  });

  const patches = diffCVData(base, target);
  if (patches.length === 0) {
    return { test: 'Diff round-trip', passed: false, detail: 'Expected non-empty patch list for changed target' };
  }

  const replay = applyPatches(base, patches);
  if (!replay.ok) {
    return { test: 'Diff round-trip', passed: false, detail: replay.detail };
  }

  return {
    test: 'Diff round-trip',
    passed: deepEqual(replay.next, target),
    detail: deepEqual(replay.next, target) ? `Patches: ${patches.length}` : 'Replay result mismatched target',
  };
}

function verifyDiffNoOp(base: CVData): VerificationResult {
  const patches = diffCVData(base, cloneCVData(base));
  return {
    test: 'Diff no-op',
    passed: patches.length === 0,
    detail: patches.length === 0 ? undefined : `Expected 0 patches, got ${patches.length}`,
  };
}

function runPatchEngineVerification(): boolean {
  const baseline = cloneCVData(initialCVData);

  const results: VerificationResult[] = [
    verifyRoundTrip(baseline),
    verifyOperations(baseline),
    verifyAppendAndNested(baseline),
    verifyStructuralSharing(baseline),
    verifyErrorHandling(baseline),
    verifyRootReplace(baseline),
    verifyPerformance(baseline),
  ];

  console.group('[store] patch engine verification');
  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${status} - ${result.test}${result.detail ? ` (${result.detail})` : ''}`);
  }
  console.groupEnd();

  return results.every((result) => result.passed);
}

function runDiffEngineVerification(): boolean {
  const baseline = cloneCVData(initialCVData);

  const results: VerificationResult[] = [verifyDiffNoOp(baseline), verifyDiffRoundTrip(baseline)];

  console.group('[store] diff engine verification');
  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${status} - ${result.test}${result.detail ? ` (${result.detail})` : ''}`);
  }
  console.groupEnd();

  return results.every((result) => result.passed);
}

declare global {
  interface Window {
    runPatchEngineVerification?: () => boolean;
    runDiffEngineVerification?: () => boolean;
  }
}

if (typeof window !== 'undefined') {
  window.runPatchEngineVerification = runPatchEngineVerification;
  window.runDiffEngineVerification = runDiffEngineVerification;
}
