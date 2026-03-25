import type { ModelProvider } from "./provider-types.ts";

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);

    if (!provider) {
      throw new Error(`Unknown provider: ${id}`);
    }

    return provider;
  }
}
