export interface RouteContext {
  watchedRepoRoots: Set<string>;
  watchRepo: (repoRoot: string) => void;
  broadcast: () => void;
}
