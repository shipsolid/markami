export interface MarkdownFeature {
  readonly id: string;
  readonly sourceKinds: readonly string[];
}

export class FeatureRegistry {
  private readonly features = new Map<string, MarkdownFeature>();

  public register(feature: MarkdownFeature): void {
    if (this.features.has(feature.id)) {
      throw new Error(`feature already registered: ${feature.id}`);
    }
    this.features.set(feature.id, feature);
  }

  public list(): readonly MarkdownFeature[] {
    return [...this.features.values()];
  }
}
