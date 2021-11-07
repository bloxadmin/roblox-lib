export default class Logger {
  private name: string;
  level: Enum.AnalyticsLogLevel;

  constructor(name: string, level: Enum.AnalyticsLogLevel = Enum.AnalyticsLogLevel.Warning) {
    this.name = name;
    this.level = level;
  }

  public info(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Information, ...msgs);
  }

  public warn(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Warning, ...msgs);
  }

  public error(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Error, ...msgs);
  }

  public debug(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Debug, ...msgs);
  }

  public log(level: Enum.AnalyticsLogLevel, ...msgs: string[]) {
    let levelName = "";
    switch (level) {
      case Enum.AnalyticsLogLevel.Warning:
        levelName = "WARN";
        break;
      case Enum.AnalyticsLogLevel.Error:
        levelName = "ERROR";
        break;
      case Enum.AnalyticsLogLevel.Debug:
        levelName = "DEBUG";
        break;
      default:
        levelName = "INFO";
        break;
    }
    if (this.level.Value >= level.Value) {
      const message = msgs.map((msg) => tostring(msg)).join(" ");
      print(`[${this.name}] <${levelName}> ${message}`);
    }
  }

  public sub(name: string) {
    return new Logger(`${this.name}/${name}`);
  }
}
