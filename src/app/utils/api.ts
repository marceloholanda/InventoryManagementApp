import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-6a5c4630`;

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${publicAnonKey}`,
};

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      const isLast = attempt === retries - 1;
      if (isLast) throw error;
      // Espera progressiva: 1s, 2s, 3s
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

export const api = {
  async checkHealth(): Promise<boolean> {
    try {
      await fetchWithRetry(`${BASE_URL}/health`, {}, 1);
      return true;
    } catch {
      return false;
    }
  },

  // ─── Produtos ────────────────────────────────────────────────────────────

  async getProdutos(): Promise<any[]> {
    const data = await fetchWithRetry(`${BASE_URL}/produtos`);
    return data.produtos ?? [];
  },

  async saveProduto(produto: any): Promise<any> {
    return fetchWithRetry(`${BASE_URL}/produtos`, {
      method: 'POST',
      body: JSON.stringify(produto),
    });
  },

  async saveProdutosBatch(produtos: any[]): Promise<any> {
    return fetchWithRetry(`${BASE_URL}/produtos/batch`, {
      method: 'POST',
      body: JSON.stringify({ produtos }),
    });
  },

  async deleteProduto(id: string): Promise<any> {
    return fetchWithRetry(`${BASE_URL}/produtos/${id}`, {
      method: 'DELETE',
    });
  },

  // ─── Movimentações ───────────────────────────────────────────────────────

  async getMovimentacoes(): Promise<any[]> {
    const data = await fetchWithRetry(`${BASE_URL}/movimentacoes`);
    return data.movimentacoes ?? [];
  },

  async saveMovimentacao(movimentacao: any): Promise<any> {
    return fetchWithRetry(`${BASE_URL}/movimentacoes`, {
      method: 'POST',
      body: JSON.stringify(movimentacao),
    });
  },

  async deleteMovimentacao(id: string): Promise<any> {
    return fetchWithRetry(`${BASE_URL}/movimentacoes/${id}`, {
      method: 'DELETE',
    });
  },
};
