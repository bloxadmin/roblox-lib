const ReplicatedStorage = game.GetService("ReplicatedStorage");
const TextChatService = game.GetService("TextChatService");

const systemMessageEvent = ReplicatedStorage.WaitForChild("BloxAdminEvents").WaitForChild(
  "ModerationSystemMessageEvent",
) as RemoteEvent<(data: string) => void>;

systemMessageEvent.OnClientEvent.Connect((data) => {
  print("[BloxAdmin] Moderation System Message:", data);
  const channel = TextChatService.FindFirstChild("TextChannels")?.FindFirstChild("RBXSystem") as TextChannel;
  if (!channel) return;
  channel.DisplaySystemMessage(data, 'test');
}); 