import type { ModelRole } from "./provider-types.ts";

export type ProviderRoutingTable = Partial<Record<ModelRole, string>>;
export type ResolvedProviderRoute = {
  providerId: string;
  model: string;
};

function parseRoute(route: string): ResolvedProviderRoute {
  const separatorIndex = route.indexOf(":");

  if (separatorIndex === -1) {
    return {
      providerId: route,
      model: `${route}/default`,
    };
  }

  return {
    providerId: route.slice(0, separatorIndex),
    model: route.slice(separatorIndex + 1),
  };
}

export class ProviderRouter {
  private readonly routes: ProviderRoutingTable;

  constructor(routes: ProviderRoutingTable) {
    this.routes = routes;
  }

  resolve(role: ModelRole): ResolvedProviderRoute {
    const route = this.routes[role] ?? this.routes.main;

    if (!route) {
      throw new Error(`No provider configured for role: ${role}`);
    }

    return parseRoute(route);
  }
}
