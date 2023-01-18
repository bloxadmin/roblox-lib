export type Events = {
  [key: string]: unknown[];
};

export type Event<E extends string = string, A extends unknown[] = unknown[]> = [E, A];

export type EventCallback<A extends unknown[]> = (...args: A) => void;

export default class EventEmitter<E extends Events = {}> {
  private listeners: Record<keyof E | "*", unknown[]>;

  constructor() {
    this.listeners = {} as Record<keyof E | "*", unknown[]>;
  }

  public on<N extends keyof E>(event: N | "*", callback: EventCallback<E[N]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as EventCallback<E[N]>[]).push(callback);
  }

  private callListeners<N extends keyof E>(callbacks: EventCallback<E[N]>[], event: N, ...args: E[N]): boolean {
    let errored = false;
    callbacks.forEach((callback) => {
      const [success, err] = pcall(() => {
        callback(...args);
      });

      if (!success) {
        errored = true;
        pcall(error, `Error while calling event ${event as string}:\n${err}`, 0);
      }
    });

    return !errored;
  }

  public emit<N extends keyof E>(event: N, ...args: E[N]) {
    this.callListeners((this.listeners[event] as EventCallback<E[N]>[]) || [], event, ...args);
    this.callListeners(
      (this.listeners["*"] as EventCallback<E[N]>[]) || [],
      event,
      ...([event, ...args] as unknown as E[N]),
    );
  }

  public removeListener<N extends keyof E>(event: N | "*", callback: EventCallback<E[N]>) {
    if (this.listeners[event]) {
      this.listeners[event] = (this.listeners[event] as EventCallback<E[N]>[]).filter((c) => c !== callback);
    }
  }

  public removeAllListeners<N extends keyof E>(event: N) {
    this.listeners[event] = [];
    if (event === "*") {
      this.listeners = {} as Record<keyof E | "*", unknown[]>;
    }
  }

  public onAny(callback: EventCallback<unknown[]>) {
    this.on("*", callback);
  }

  public removeAnyListener(callback: EventCallback<unknown[]>) {
    this.removeListener("*", callback);
  }
}
