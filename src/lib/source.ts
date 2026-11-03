/**
 * Where the data repo lives. GitHubSource talks to the GitHub REST API from the browser;
 * LocalSource (dev server only) reads/writes a local scratch copy.
 */

export interface FileChange {
  path: string;
  /** Build the new content from the freshest version of the file (null if it doesn't exist). */
  update: (current: string | null) => string;
}

export interface DataSource {
  read(path: string): Promise<string | null>;
  /** Apply all changes in a single commit, reading each file fresh right before writing. */
  commit(changes: FileChange[], message: string): Promise<void>;
}

export interface Settings {
  token: string;
  repo: string; // owner/name
  branch: string;
  local?: boolean; // dev only
}

export class GitHubSource implements DataSource {
  constructor(private s: Settings) {}

  private async api(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
    const res = await fetch(`https://api.github.com/repos/${this.s.repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.s.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    return res;
  }

  private async readAt(path: string, ref: string): Promise<string | null> {
    const res = await this.api(
      `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
      {},
      'application/vnd.github.raw+json',
    );
    if (res.status === 404) return null;
    if (!res.ok) throw await httpError(res);
    return res.text();
  }

  read(path: string) {
    return this.readAt(path, this.s.branch);
  }

  async commit(changes: FileChange[], message: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const refRes = await this.api(`/git/ref/heads/${this.s.branch}`);
      if (!refRes.ok) throw await httpError(refRes);
      const head: string = (await refRes.json()).object.sha;
      const commitRes = await this.api(`/git/commits/${head}`);
      if (!commitRes.ok) throw await httpError(commitRes);
      const baseTree: string = (await commitRes.json()).tree.sha;

      const tree = [];
      for (const c of changes) {
        tree.push({ path: c.path, mode: '100644', type: 'blob', content: c.update(await this.readAt(c.path, head)) });
      }
      const treeRes = await this.api('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
      if (!treeRes.ok) throw await httpError(treeRes);
      const newTree: string = (await treeRes.json()).sha;
      const newCommitRes = await this.api('/git/commits', {
        method: 'POST',
        body: JSON.stringify({ message, tree: newTree, parents: [head] }),
      });
      if (!newCommitRes.ok) throw await httpError(newCommitRes);
      const newCommit: string = (await newCommitRes.json()).sha;
      const upd = await this.api(`/git/refs/heads/${this.s.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit, force: false }),
      });
      if (upd.ok) return;
      if (upd.status !== 422 || attempt === 1) throw await httpError(upd);
      // 422 = someone pushed meanwhile: retry on top of the new head
    }
  }
}

export class LocalSource implements DataSource {
  async read(path: string) {
    const res = await fetch(`/__local-data/${path}`, { cache: 'no-store' });
    return res.ok ? res.text() : null;
  }
  async commit(changes: FileChange[]) {
    const files = [];
    for (const c of changes) files.push({ path: c.path, content: c.update(await this.read(c.path)) });
    const res = await fetch('/__local-data/__commit', { method: 'POST', body: JSON.stringify({ files }) });
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
  }
}

async function httpError(res: Response): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.json()).message ?? '';
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401
      ? 'Jeton invalide ou expiré'
      : res.status === 403 || res.status === 404
        ? 'Accès refusé : vérifie le jeton et le nom du repo'
        : `Erreur GitHub ${res.status}`;
  return new Error(detail ? `${hint} (${detail})` : hint);
}

export function makeSource(s: Settings): DataSource {
  if (import.meta.env.DEV && s.local) return new LocalSource();
  return new GitHubSource(s);
}
