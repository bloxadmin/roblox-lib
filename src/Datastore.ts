import { DataStoreService } from "@rbxts/services";

export default class Datastore {
  private options: { exponential: boolean, attempts: number, delay: number };
  private datastore: DataStore;


  public constructor(name: string, options: { exponential: boolean, attempts: number, delay: number }) {
    this.options = options;

    const datastore = this.retry({
      callback: () => {
        return DataStoreService.GetDataStore(name);
      }
    });

    this.datastore = datastore!;
  };

  public get<Value>(key: string) {
    return this.retry({
      callback: () => {
        const [result] = this.datastore.GetAsync<Value>(key);

        return result;
      }
    });
  };

  public set(key: string, value: unknown) {
    return this.retry({
      callback: () => {
        return this.datastore.SetAsync(key, value);
      }
    });
  };

  public update<Old, New = Old>(key: string, transform: (old: Old | undefined) => New) {
    return this.retry({
      callback: () => {
        const [result] = this.datastore.UpdateAsync<Old, New>(key, (old) => {
          const transformed = transform(old);

          return $tuple(transformed);
        });

        return result;
      }
    });
  };

  public remove<Value>(key: string) {
    return this.retry({
      callback: () => {
        const [result] = this.datastore.RemoveAsync<Value>(key);

        return result;
      }
    });
  };

  private retry<Result>({ callback, attempt = 0 }: { callback: () => Result, attempt?: number }) {
    const [success, result] = pcall(callback);

    if (success) {
      return result;
    } else {
      const duration = this.options.exponential ? this.options.delay * attempt : this.options.delay

      task.delay(duration, () => {
        attempt++ && this.retry({ callback, attempt })
      });
    };
  };
};

