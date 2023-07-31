export default class Logger {
  constructor(
    public readonly name: string,
    public level: Enum.AnalyticsLogLevel,
    public handlers: { [key: string]: Enum.AnalyticsLogLevel } | undefined,
    public emitter?: (log: string) => void
  ) { }

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
    const loggerLevel = this.handlers?.[this.name] || this.level;

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

    const message = msgs.map((msg) => tostring(msg)).join(" ");

    this.emitter?.(`[${this.name}] <${levelName}> ${message}`);

    if (level.Value < loggerLevel.Value)
      return;

    print(`[${this.name}] <${levelName}> ${message}`);
  }

  public sub(name: string) {
    return new Logger(`${this.name}/${name}`, this.level, this.handlers, this.emitter);
  }

  public updateConfig(level: Enum.AnalyticsLogLevel, handlers: { [key: string]: Enum.AnalyticsLogLevel } | undefined) {
    this.level = level;
    this.handlers = handlers;
  }
}
