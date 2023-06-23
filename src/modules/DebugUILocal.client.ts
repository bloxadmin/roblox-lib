const ReplicatedStorage = game.GetService("ReplicatedStorage");

const logEvent = ReplicatedStorage.WaitForChild("bloxadminEvents").WaitForChild("DebugLogEvent") as RemoteEvent<
  (data: string) => void
>;

logEvent.OnClientEvent.Connect((data) => {
  print(data);
});
