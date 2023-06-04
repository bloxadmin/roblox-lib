const MemoryStoreService = game.GetService("MemoryStoreService");

export type DeleteKey = string;

export interface Entry<V> {
  value: V;
  expiration: number;
  priority: number;
}

export interface ReadEntry<V> {
  key: DeleteKey;
  at: number;
  entry: Entry<V>;
}

export default class LocalPromiseQueue<V extends defined> {
  private queue: Entry<V>[];
  private readQueue: ReadEntry<V>[];

  constructor(public readonly name: string, public readonly invisibilityTimeout?: number) {
    this.queue = [];
    this.readQueue = [];
  }

  add(value: V, expiration: number, priority = 0): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ value, expiration, priority });
      resolve();
    });
  }

  read(count: number, allOrNothing = false, waitTimeout = -1): Promise<[V[], DeleteKey]> {
    return new Promise((resolve) => {
      const key = tostring(os.time());
      const messages: V[] = [];

      if (allOrNothing) {

      } else {
        while (messages.size() < count) {
          const entry = this.queue.shift();
          if (!entry) break;

          messages.push(entry.value);
        }
      }

      resolve([messages, key]);
    });
  }

  remove(key: DeleteKey): Promise<void> {
    return new Promise((resolve) => {
      this.readQueue = this.readQueue.filter((entry) => entry.key !== key);
      resolve();
    });
  }
}
