const MemoryStoreService = game.GetService("MemoryStoreService");

export type DeleteKey = string;

export default class PromiseQueue<V> {
  private readonly queue: MemoryStoreQueue;

  constructor(public readonly name: string, public readonly invisibilityTimeout?: number) {
    this.queue = MemoryStoreService.GetQueue(name, invisibilityTimeout);
  }

  add(value: V, expiration: number, priority = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.queue.AddAsync(value, expiration, priority);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  read(count: number, allOrNothing = false, waitTimeout = -1): Promise<[V[], DeleteKey]> {
    return new Promise((resolve, reject) => {
      try {
        const [messages, key] = this.queue.ReadAsync(count, allOrNothing, waitTimeout) as LuaTuple<[V[], DeleteKey]>;
        resolve([messages, key]);
      } catch (err) {
        reject(err);
      }
    });
  }

  remove(key: DeleteKey): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.queue.RemoveAsync(key);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }
}
