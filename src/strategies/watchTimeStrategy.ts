import { TwitchEvent } from '../models/event';

export class WatchTimeStrategy {

    estimateWatchTime(events: TwitchEvent[]): number {
        //TODO
        return events.length * 5;
    }
}