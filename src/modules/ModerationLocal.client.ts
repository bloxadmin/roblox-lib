const ReplicatedStorage = game.GetService("ReplicatedStorage");
const TextChatService = game.GetService("TextChatService");

const systemMessageEvent = ReplicatedStorage.WaitForChild("bloxadminEvents").WaitForChild(
  "ModerationSystemMessageEvent",
) as RemoteEvent<(data: string) => void>;

systemMessageEvent.OnClientEvent.Connect((data) => {
  print("[bloxadmin] Moderation System Message:", data);
  const channel = TextChatService.FindFirstChild("TextChannels")?.FindFirstChild("RBXSystem") as TextChannel;
  if (!channel) return;
  channel.DisplaySystemMessage(data, 'test');
}); 
