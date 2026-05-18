export interface TwitchEvent {
  id: string;
  source: string;
  type: string;
  timestamp: string;
  version: string;
  payload: any;
  channelId?: string;
  channelLogin?: string;
  userId?: string;
  userLogin?: string;
}
