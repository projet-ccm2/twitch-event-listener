/**
 * Configuration for a channel that we listen to. When a
 * broadcaster authorizes our application we create an entry
 * like this and store it in our configuration service.
 *
 * In development mode these values come from a static JSON
 * file located under `src/config/<env>/channels.json`. In
 * production a separate microservice would supply us with
 * these records via an API call or database lookup.
 */
export interface ChannelConfig {
  /** The Twitch user ID of the broadcaster (numeric string). */
  twitch_user_id: string;
  /** The login (username) of the broadcaster. */
  login: string;
  /** OAuth scopes the broadcaster has granted to us. */
  scopes: string[];
  /** Whether to register EventSub subscriptions for this channel. */
  listen_eventsub: boolean;
  /** Whether to connect to the IRC chat for this channel. */
  listen_chat_irc: boolean;
  /**
   * List of EventSub topics we should subscribe to.
   * Can be a simple string (defaults to v1 and broadcaster_user_id condition)
   * or a detailed object for custom versions and conditions.
   */
  eventsub_topics: (string | EventSubTopicConfig)[];
}

export interface EventSubTopicConfig {
  name: string;
  version?: string;
  condition?: Record<string, string>;
}
