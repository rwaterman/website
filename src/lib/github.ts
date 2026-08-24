/**
 * Build-time GitHub repo listing for /projects and the home teaser.
 * Any failure throws so `astro build` fails instead of shipping an empty list.
 */

export interface Repo {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  homepage: string | null;
  pushed_at: string | null;
  fork: boolean;
  archived: boolean;
}

export interface RepoSelection {
  /** Shown first, in this order. */
  pinned: readonly string[];
  /** Never shown. */
  hidden: readonly string[];
}

const API_VERSION = '2022-11-28';

export async function fetchRepos(owner: string, token: string | undefined): Promise<Repo[]> {
  const url = `https://api.github.com/users/${owner}/repos?type=owner&per_page=100&sort=pushed`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new Error(
      `GitHub ${response.status} ${response.statusText} for ${url} (x-ratelimit-remaining=${remaining}): ${await response.text()}`,
    );
  }
  if (response.headers.get('link')?.includes('rel="next"')) {
    throw new Error(`GitHub returned more than one page of repos for ${owner}; pagination is not implemented`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error(`GitHub returned a non-array body for ${url}`);
  return body as Repo[];
}

/** Drops forks, archived, and hidden repos; pinned first, then most recently pushed. */
export function selectRepos(repos: readonly Repo[], selection: RepoSelection): Repo[] {
  const pinnedIndex = (repo: Repo): number => {
    const index = selection.pinned.indexOf(repo.name);
    return index === -1 ? selection.pinned.length : index;
  };
  const pushedAt = (repo: Repo): number => (repo.pushed_at ? Date.parse(repo.pushed_at) : 0);

  return repos
    .filter((repo) => !repo.fork && !repo.archived && !selection.hidden.includes(repo.name))
    .sort((a, b) => pinnedIndex(a) - pinnedIndex(b) || pushedAt(b) - pushedAt(a));
}

let cached: Promise<Repo[]> | undefined;

/** One GitHub request per build, shared by every page that lists repos. */
export async function loadRepos(owner: string, token: string | undefined, selection: RepoSelection): Promise<Repo[]> {
  cached ??= fetchRepos(owner, token);
  return selectRepos(await cached, selection);
}
