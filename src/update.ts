declare const __SCRIPT_VERSION__: string;

export const CURRENT_VERSION = __SCRIPT_VERSION__;
export const LATEST_RELEASE_API = 'https://api.github.com/repos/tuxco-de/rewards-points-farmer/releases/latest';

export interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    updateAvailable: boolean;
}

function normalizeVersion(version: string): string {
    return version.trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string): number {
    const parse = (version: string) => {
        const [core, prerelease = ''] = normalizeVersion(version).split('-', 2);
        const numbers = core.split('.').map(value => Number.parseInt(value, 10));
        if (numbers.some(Number.isNaN)) throw new Error(`Invalid version: ${version}`);
        return { numbers, prerelease };
    };
    const a = parse(left);
    const b = parse(right);
    const length = Math.max(a.numbers.length, b.numbers.length);

    for (let index = 0; index < length; index++) {
        const difference = (a.numbers[index] || 0) - (b.numbers[index] || 0);
        if (difference !== 0) return difference;
    }
    if (a.prerelease === b.prerelease) return 0;
    if (!a.prerelease) return 1;
    if (!b.prerelease) return -1;
    return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
    const response = await fetch(LATEST_RELEASE_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`);

    const release = await response.json();
    const latestVersion = normalizeVersion(String(release.tag_name || ''));
    if (!latestVersion) throw new Error('Latest release does not contain a version tag');

    return {
        currentVersion: CURRENT_VERSION,
        latestVersion,
        releaseUrl: String(release.html_url || 'https://github.com/tuxco-de/rewards-points-farmer/releases/latest'),
        updateAvailable: compareVersions(latestVersion, CURRENT_VERSION) > 0
    };
}
