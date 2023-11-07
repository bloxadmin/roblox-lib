import { DataStoreService } from "@rbxts/services";

export default class Datastore<DefaultValue> {
  private options: { exponential: boolean, attempts: number, delay: number };
  private _datastore?: DataStore;


  public constructor(name: string, options: { exponential: boolean, attempts: number, delay: number }) {
    this.options = options;

    this.getDatastore(name);
  };

  private async getDatastore(name: string) {
    this._datastore = await this.retry(() => {
      return DataStoreService.GetDataStore(name);
    });
  }

  datastore() {
    if (!this.datastore) error("Datastore not set");
    return this._datastore!;
  }

  public get<Value = DefaultValue>(key: string) {
    return this.retry(() => {
      return this.datastore().GetAsync<Value>(key);
    });
  };

  public set<Value = DefaultValue>(key: string, value: Value, userIds?: number[], options?: DataStoreSetOptions) {
    return this.retry(() => {
      return this.datastore().SetAsync(key, value, userIds, options);
    });
  };

  public update<Old = DefaultValue, New = Old>(key: string, transform: (old: Old | undefined, keyInfo: DataStoreKeyInfo | undefined) => [New, number[] | undefined, object | undefined]): Promise<New> {
    return this.retry(() => {
      const [result] = this.datastore().UpdateAsync<Old, New>(key, (old, keyInfo) => {
        const [transformed, ids, metadata] = transform(old, keyInfo);

        return $tuple(
          transformed,
          ids || keyInfo?.GetUserIds() as number[] | undefined,
          metadata || keyInfo?.GetMetadata()
        )
      });

      return result as New;
    });
  };

  public remove<Value = DefaultValue>(key: string) {
    return this.retry(() => {
      const [result] = this.datastore().RemoveAsync<Value>(key);

      return result;
    });
  };

  private retry<Result>(callback: () => Result, attempt = 0): Promise<Result> {
    return new Promise((resolve, reject) => {
      try {
        resolve(callback());
      } catch (e) {
        const duration = this.options.exponential ? this.options.delay * attempt : this.options.delay;

        if (attempt === this.options.attempts) {
          reject(e);
        }

        task.delay(duration, () => {
          resolve(this.retry(callback, attempt + 1));
        });
      }
    });
  };
};
