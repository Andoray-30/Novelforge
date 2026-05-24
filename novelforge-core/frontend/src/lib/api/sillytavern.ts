/**
 * SillyTavern API client.
 */

export interface SillyTavernCharacter {
  spec: string; // "chara_card_v3"
  spec_version: string; // "3.0"
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
  };
}

export interface WorldInfoEntry {
  uid: string;
  keys: string[];
  content: string;
  comment?: string;
  selective?: boolean;
  constant?: boolean;
  order?: number;
  insertion_order?: number;
  enabled?: boolean;
  local?: boolean;
  folder?: string;
}

export class SillyTavernAPI {
  private baseURL: string;

  constructor(baseURL: string = '/api/sillytavern') {
    this.baseURL = baseURL;
  }

  /**
   * Test the SillyTavern connection.
   */
  async testConnection(): Promise<{ success: boolean; version?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/status`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, version: data.version };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Import a character card.
   */
  async importCharacter(character: SillyTavernCharacter): Promise<{ success: boolean; id?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/characters/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(character),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, id: data.id };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Import character cards in a batch.
   */
  async importCharacters(characters: SillyTavernCharacter[]): Promise<{ success: boolean; results: { id?: string; error?: string }[] }> {
    try {
      const response = await fetch(`${this.baseURL}/api/characters/import/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ characters }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, results: data.results };
      }
      return {
        success: false,
        results: characters.map(() => ({ error: '导入失败' }))
      };
    } catch (error) {
      return {
        success: false,
        results: characters.map(() => ({ error: '网络错误' }))
      };
    }
  }

  /**
   * Import world info entries.
   */
  async importWorldInfo(worldInfo: WorldInfoEntry[]): Promise<{ success: boolean; imported: number }> {
    try {
      const response = await fetch(`${this.baseURL}/api/world/info/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries: worldInfo }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, imported: data.imported };
      }
      return { success: false, imported: 0 };
    } catch (error) {
      return { success: false, imported: 0 };
    }
  }

  /**
   * Get current characters.
   */
  async getCharacters(): Promise<{ success: boolean; characters?: any[] }> {
    try {
      const response = await fetch(`${this.baseURL}/api/characters`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, characters: data.characters };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Get world info entries.
   */
  async getWorldInfo(): Promise<{ success: boolean; worldInfo?: WorldInfoEntry[] }> {
    try {
      const response = await fetch(`${this.baseURL}/api/world/info`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, worldInfo: data.worldInfo };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Create a group chat.
   */
  async createGroupChat(characters: string[], name?: string): Promise<{ success: boolean; chatId?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/chats/group/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characters,
          name: name || 'NovelForge 生成群聊',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, chatId: data.chatId };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Get CSRF token.
   */
  async getCsrfToken(): Promise<{ success: boolean; token?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/csrf-token`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, token: data.token };
      }
      return { success: false };
    } catch (error) {
      return { success: false };
    }
  }
}
