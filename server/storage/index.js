import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const fileQueues = new Map();

function cloneFallback(fallback) {
  const value = typeof fallback === 'function' ? fallback() : fallback;
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return cloneFallback(fallback);
  }
}

async function atomicWriteJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    // Windows antivirus/indexers can briefly hold the destination file open.
    // Retry only transient sharing/permission failures; never delete the
    // destination first, so an unsuccessful replacement keeps the old JSON.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmpPath, filePath);
        break;
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt >= 7) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(500, 25 * 2 ** attempt)));
      }
    }
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

function enqueueFile(filePath, task) {
  const previous = fileQueues.get(filePath) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  fileQueues.set(filePath, run);
  return run.finally(() => {
    if (fileQueues.get(filePath) === run) fileQueues.delete(filePath);
  });
}

export function writeJsonAtomic(filePath, data) {
  return enqueueFile(filePath, () => atomicWriteJson(filePath, data));
}

export function createAppStorage(storageRoot) {
  const libraryFile = path.join(storageRoot, 'library.json');
  const campaignsFile = path.join(storageRoot, 'campaigns.json');
  const platformProfilesFile = path.join(storageRoot, 'campaign-platform-profiles.json');

  const normalizeLibrary = value => value && Array.isArray(value.creators) ? value : { creators: [] };
  const normalizeCampaigns = value => value && Array.isArray(value.campaigns) ? value : { campaigns: [] };
  const normalizeProfiles = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  const readLibrary = async () => normalizeLibrary(await readJsonFile(libraryFile, { creators: [] }));
  const readCampaigns = async () => normalizeCampaigns(await readJsonFile(campaignsFile, { campaigns: [] }));
  const readPlatformProfiles = async () => normalizeProfiles(await readJsonFile(platformProfilesFile, {}));

  const writeLibrary = data => enqueueFile(libraryFile, () => atomicWriteJson(libraryFile, normalizeLibrary(data)));
  const writeCampaigns = data => enqueueFile(campaignsFile, () => atomicWriteJson(campaignsFile, normalizeCampaigns(data)));
  const writePlatformProfiles = data => enqueueFile(platformProfilesFile, () => atomicWriteJson(platformProfilesFile, normalizeProfiles(data)));

  const updateCampaigns = mutator => enqueueFile(campaignsFile, async () => {
    const current = normalizeCampaigns(await readJsonFile(campaignsFile, { campaigns: [] }));
    const result = await mutator(current);
    const next = normalizeCampaigns(result === undefined ? current : result);
    await atomicWriteJson(campaignsFile, next);
    return next;
  });

  const updatePlatformProfiles = mutator => enqueueFile(platformProfilesFile, async () => {
    const current = normalizeProfiles(await readJsonFile(platformProfilesFile, {}));
    const result = await mutator(current);
    const next = normalizeProfiles(result === undefined ? current : result);
    await atomicWriteJson(platformProfilesFile, next);
    return next;
  });

  return {
    readLibrary,
    writeLibrary,
    readCampaigns,
    writeCampaigns,
    updateCampaigns,
    readPlatformProfiles,
    writePlatformProfiles,
    updatePlatformProfiles
  };
}
