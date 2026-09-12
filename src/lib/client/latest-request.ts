export class LatestRequestCommitter {
  private readonly versions = new Map<string, number>();

  async run<T>(
    key: string,
    request: () => Promise<T>,
    commit: (value: T) => void
  ): Promise<T | null> {
    const version = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, version);
    const value = await request();

    if (this.versions.get(key) !== version) {
      return null;
    }

    commit(value);
    return value;
  }
}
