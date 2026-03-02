import { cases } from './cdp/cases/index.mjs';
import { createCdpHarness, getFreePort } from './cdp/harness.mjs';

function parseArgs(argv) {
  const selectedCases = [];
  let listCases = false;
  let cdpPort;
  let headless;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--list') {
      listCases = true;
      continue;
    }
    if (arg === '--case') {
      const id = argv[index + 1];
      if (!id) {
        throw new Error('Missing value for --case');
      }
      selectedCases.push(id);
      index += 1;
      continue;
    }
    if (arg === '--cases') {
      const raw = argv[index + 1];
      if (!raw) {
        throw new Error('Missing value for --cases');
      }
      selectedCases.push(...raw.split(',').map((value) => value.trim()).filter(Boolean));
      index += 1;
      continue;
    }
    if (arg === '--cdp-port') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --cdp-port');
      }
      cdpPort = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--cdp-port=')) {
      cdpPort = arg.slice('--cdp-port='.length);
    }
    if (arg === '--headless') {
      headless = true;
      continue;
    }
    if (arg === '--headed' || arg === '--no-headless') {
      headless = false;
      continue;
    }
    if (arg.startsWith('--headless=')) {
      const raw = arg.slice('--headless='.length).trim().toLowerCase();
      if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
        headless = true;
        continue;
      }
      if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
        headless = false;
        continue;
      }
      throw new Error(`Invalid value for --headless: ${raw}`);
    }
  }

  return {
    listCases,
    selectedCases: selectedCases.length > 0 ? selectedCases : null,
    cdpPort,
    headless
  };
}

function getCaseMap() {
  const map = new Map();
  for (const entry of cases) {
    map.set(entry.id, entry);
  }
  return map;
}

function collectDependencies(caseMap, requestedIds) {
  const selected = new Set();
  const stack = [...requestedIds];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || selected.has(id)) {
      continue;
    }
    const entry = caseMap.get(id);
    if (!entry) {
      throw new Error(`Unknown CDP case: ${id}`);
    }
    selected.add(id);
    for (const dependency of entry.dependsOn ?? []) {
      stack.push(dependency);
    }
  }

  return selected;
}

function orderCases(caseList, selectedIds) {
  const ordered = [];
  for (const entry of caseList) {
    if (selectedIds.has(entry.id)) {
      ordered.push(entry);
    }
  }
  return ordered;
}

async function runCases(ctx, selected) {
  for (const entry of selected) {
    console.log(`[verify:cdp] case:start ${entry.id} — ${entry.title}`);
    await entry.run(ctx);
    console.log(`[verify:cdp] case:pass ${entry.id}`);
  }
}

function resolveEnvPort(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (value === 'auto') {
    return 'auto';
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid CDP port: ${value}`);
  }
  return parsed;
}

async function resolveCdpPort(argsPort) {
  const candidate = argsPort;
  const resolved = resolveEnvPort(candidate);
  if (resolved === 'auto') {
    return getFreePort();
  }
  return resolved ?? 9222;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const caseMap = getCaseMap();

  if (args.listCases) {
    for (const entry of cases) {
      console.log(`${entry.id}\t${entry.title}`);
    }
    return;
  }

  const cdpPort = await resolveCdpPort(args.cdpPort);
  const harness = await createCdpHarness({
    cdpPort,
    headless: args.headless ?? true
  });

  let ctx;
  try {
    ctx = await harness.start();

    const requested = args.selectedCases ?? cases.map((entry) => entry.id);
    const selectedIds = collectDependencies(caseMap, requested);
    const ordered = orderCases(cases, selectedIds);
    await runCases(ctx, ordered);

    console.log('[verify:cdp] config path:', ctx.configPath);
    console.log('[verify:cdp] logs:', ctx.logDir);
  } catch (error) {
    console.error('[verify:cdp] failed:', error);
    console.error('[verify:cdp] logs:', harness.logDir);
    process.exitCode = 1;
  } finally {
    await harness.cleanup();
  }
}

await main();
