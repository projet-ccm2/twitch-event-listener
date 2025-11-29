import { TwitchEvent } from "../models/event";

export class WatchTimeStrategy {
  private static readonly MOCK_WATCH_TIME_PER_EVENT = 5;

  estimateWatchTime(events: TwitchEvent[]): number {
    //TODO
    return events.length * WatchTimeStrategy.MOCK_WATCH_TIME_PER_EVENT;
  }
}
