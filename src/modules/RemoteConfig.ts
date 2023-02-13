import { BloxAdmin } from "BloxAdmin";
import { Module } from "Module";
import { EventType } from "types";

export default class RemoteConfig extends Module {
  private remoteConfig?: Record<string, unknown>;
  private watching: Record<string, Array<(newValue: unknown) => void>> = {};

  constructor(admin: BloxAdmin) {
    super("RemoteConfig", admin);
  }

  enable(): void {
    this.getRemoteConfig();

    this.admin.messenger.on("message", ([eventType, config]) => {
      if (eventType !== EventType.RemoteConfig) return;

      this.updateRemoteConfig(config as Record<string, unknown>);
    });
  }

  async getRemoteConfig(): Promise<Record<string, unknown>> {
    if (this.remoteConfig) {
      return this.remoteConfig;
    }
    const options = await this.admin.messenger.waitForRemoteOptions();

    const config = (options.options?.config as Record<string, unknown>) || {};

    this.updateRemoteConfig(config);

    return config;
  }

  private callWatchers(key: string, value: unknown) {
    if (this.watching[key]) {
      this.watching[key].forEach((callback) => {
        try {
          callback(value);
        } catch (e) {
          this.admin.logger.error("Error in RemoteConfig watch callback");
          error(e);
        }
      });
    }
  }

  updateRemoteConfigKey(key: string, value: unknown) {
    if (!this.remoteConfig) {
      this.remoteConfig = {};
    }

    this.remoteConfig[key] = value;

    this.callWatchers(key, value);
  }

  updateRemoteConfig(newConfig: Record<string, unknown>) {
    const loaded = !!this.remoteConfig;
    const didKeys: string[] = [];

    // eslint-disable-next-line roblox-ts/no-array-pairs
    for (const [key, value] of pairs(newConfig)) {
      if (this.remoteConfig?.[key] !== value) {
        didKeys.push(key);
        this.updateRemoteConfigKey(key, value);
      }
    }

    if (!loaded) {
      // eslint-disable-next-line roblox-ts/no-array-pairs
      for (const [key] of pairs(this.watching)) {
        if (didKeys.includes(key)) continue;

        this.callWatchers(key, undefined);
      }
    }
  }

  watch<T>(key: string, callback: (newValue: T) => void) {
    if (!this.watching[key]) this.watching[key] = [];

    this.watching[key].push(callback as (newValue: unknown) => void);

    if (this.remoteConfig) {
      callback(this.remoteConfig[key] as T);
    }
  }
}
