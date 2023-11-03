export type Events = {
  [key: string]: unknown[];
};

export type Event<E extends string = string, A extends unknown[] = unknown[]> = [E, A];

export type EventCallback<A extends unknown[]> = (...args: A) => void;

export class Connection<A extends unknown[]> {
  private Callback?: EventCallback<A>;
  public Connected: boolean = true;

  constructor(callback: EventCallback<A>, private Once: boolean) {
    this.Callback = callback;
  }

  public Disconnect() {
    this.Connected = false;
    this.Callback = undefined;
  }

  public Emit(...args: A) {
    const result = this.Callback?.(...args);
    if (this.Once) {
      this.Disconnect();
    }
    return result;
  }
}

export class Signal<N, A extends unknown[]> {
  private connections: Connection<A>[] = [];
  private parallelConnections: Connection<A>[] = [];

  constructor(private name: N) { }

  public Connect(callback: EventCallback<A>) {
    const conn = new Connection(callback, false);
    this.connections.push(conn);
    return conn;
  }

  public ConnectParallel(callback: EventCallback<A>) {
    const conn = new Connection(callback, false);
    this.parallelConnections.push(conn);
    return conn;
  }

  public Once(callback: EventCallback<A>) {
    const conn = new Connection(callback, true);
    this.connections.push(conn);
    return conn;
  }

  public OnceParallel(callback: EventCallback<A>) {
    const conn = new Connection(callback, true);
    this.parallelConnections.push(conn);
    return conn;
  }

  private CallListener(connection: Connection<A>, ...args: A): boolean {
    const [success, err] = pcall(() => {
      connection.Emit(...args);
    });

    if (!success) {
      pcall(error, `Error while calling event ${this.name as string}:\n${err}`, 0);
    }

    return success;
  }

  public Emit(...args: A) {
    this.connections.forEach((c) => {
      this.CallListener(c, ...args);
    });
    this.parallelConnections.forEach((c) => {
      spawn(() => {
        this.CallListener(c, ...args);
      });
    });
  }
}

export default class EventEmitter<E extends Events = {}> {
  private signals = {} as Record<keyof E, Signal<keyof E, E[keyof E]> | undefined>;
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

  public emit<N extends keyof E>(event: N, ...args: E[N]): boolean {
    this.callListeners((this.listeners[event] as EventCallback<E[N]>[]) || [], event, ...args);
    this.callListeners(
      (this.listeners["*"] as EventCallback<E[N]>[]) || [],
      event,
      ...([event, ...args] as unknown as E[N]),
    );

    this.signals[event]?.Emit(...args);

    return true;
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

  public getSignal<N extends keyof E>(name: N): Signal<N, E[N]> {
    if (!this.signals[name]) {
      this.signals[name] = new Signal(name);
    }
    return this.signals[name] as Signal<N, E[N]>;
  }
}
