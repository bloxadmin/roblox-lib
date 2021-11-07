export default class EventEmitter {
  private _listeners: { [key: string]: Callback[] } = {};

  public on(event: string, callback: Callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  }

  private callListeners(callbacks: Callback[], event: string, ...args: unknown[]) {
    callbacks.forEach((callback) => {
      const [success, err] = pcall(() => {
        callback(...args);
      });

      if (!success) {
        pcall(error, `Error while calling event ${event}:\n${err}`, 0);
      }
    });
  }

  public emit(event: string, ...args: unknown[]) {
    this.callListeners(this._listeners[event] || [], event, ...args);
    this.callListeners(this._listeners["*"] || [], event, event, ...args);
  }

  public removeListener(event: string, callback: Callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter((c) => c !== callback);
    }
  }

  public removeAllListeners(event: string) {
    this._listeners[event] = [];
    if (event === "*") {
      this._listeners = {};
    }
  }

  public onAny(callback: Callback) {
    this.on("*", callback);
  }

  public removeAnyListener(callback: Callback) {
    this.removeListener("*", callback);
  }
}
