import { IrcService } from "../../../../services/twitch/ircService";

describe("IrcService.sendMessage", () => {
  let svc: IrcService;

  beforeEach(() => {
    svc = new IrcService();
  });

  afterEach(() => {
    svc.shutdown();
  });

  test("throws when IRC is not connected", () => {
    expect(() => svc.sendMessage("chan", "hello")).toThrow(
      "IRC not connected, cannot send message to #chan",
    );
  });

  test("throws when not joined to the channel", () => {
    const fakeWs: any = { readyState: 1, send: jest.fn(), close: jest.fn() };
    (svc as any).ws = fakeWs;

    expect(() => svc.sendMessage("unknown", "hello")).toThrow(
      "Not joined to channel #unknown",
    );
  });

  test("sends PRIVMSG when connected and channel is joined", () => {
    const fakeWs: any = { readyState: 1, send: jest.fn(), close: jest.fn() };
    (svc as any).ws = fakeWs;
    (svc as any).joinedChannels.add("mychannel");

    svc.sendMessage("mychannel", "hello world");

    expect(fakeWs.send).toHaveBeenCalledWith("PRIVMSG #mychannel :hello world");
  });
});
