// Contrat commun à toutes les intégrations de services.
export class BaseService {
  constructor(name) {
    this.name = name;
  }

  /** Indique si le service est configuré (clés présentes). */
  isConfigured() {
    return false;
  }

  /**
   * Exécute une action sur le service.
   * @param {string} action - ex: 'send', 'list', 'create'
   * @param {object} params - paramètres de l'action
   * @returns {Promise<{ok: boolean, message: string, data?: any}>}
   */
  async execute(action, params = {}) {
    return {
      ok: false,
      message: `${this.name}: action « ${action} » non implémentée.`,
    };
  }
}
