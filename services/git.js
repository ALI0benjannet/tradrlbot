import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { BaseService } from './base.js';

const execAsync = promisify(exec);

// Intégration Git locale — statut, commit, log dans un dépôt donné.
export class GitService extends BaseService {
  constructor() {
    super('git');
  }

  isConfigured() {
    return true; // utilise le binaire git local
  }

  async #run(cmd, cwd) {
    try {
      const { stdout } = await execAsync(cmd, { cwd, timeout: 10000 });
      return stdout.trim();
    } catch (err) {
      throw new Error(err.stderr || err.message);
    }
  }

  async execute(action, params = {}) {
    const cwd = params.repoPath || process.cwd();
    try {
      switch (action) {
        case 'status':
          return { ok: true, message: await this.#run('git status --short', cwd) };
        case 'log':
          return {
            ok: true,
            message: await this.#run('git log --oneline -n 10', cwd),
          };
        case 'commit':
          await this.#run('git add -A', cwd);
          return {
            ok: true,
            message: await this.#run(
              `git commit -m ${JSON.stringify(params.message || 'update')}`,
              cwd
            ),
          };
        default:
          return super.execute(action, params);
      }
    } catch (err) {
      return { ok: false, message: `Git: ${err.message}` };
    }
  }
}
