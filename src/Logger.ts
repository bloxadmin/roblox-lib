export default class Logger {
  constructor(public readonly name: string, public level: Enum.AnalyticsLogLevel, public handlers: string[] | false) {}

  public fatal(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Fatal, ...msgs);
  }

  public error(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Error, ...msgs);
  }

  public warn(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Warning, ...msgs);
  }

  public info(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Information, ...msgs);
  }

  public debug(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Debug, ...msgs);
  }

  public verbose(...msgs: string[]) {
    this.log(Enum.AnalyticsLogLevel.Trace, ...msgs);
  }

  public log(level: Enum.AnalyticsLogLevel, ...msgs: string[]) {
    let levelName = "";
    switch (level) {
      case Enum.AnalyticsLogLevel.Fatal:
        levelName = "FATAL";
        break;
      case Enum.AnalyticsLogLevel.Error:
        levelName = "ERROR";
        break;
      case Enum.AnalyticsLogLevel.Warning:
        levelName = "WARN";
        break;
      case Enum.AnalyticsLogLevel.Debug:
        levelName = "DEBUG";
        break;
      case Enum.AnalyticsLogLevel.Trace:
        levelName = "VERBOSE";
        break;
      default:
        levelName = "INFO";
        break;
    }
    if (this.level.Value <= level.Value && (this.handlers === false || this.handlers.includes(levelName))) {
      const message = msgs.map((msg) => tostring(msg)).join(" ");
      print(`[${this.name}] <${levelName}> ${message}`);
    }
  }

  public sub(name: string) {
    return new Logger(`${this.name}/${name}`, this.level, this.handlers);
  }
}
