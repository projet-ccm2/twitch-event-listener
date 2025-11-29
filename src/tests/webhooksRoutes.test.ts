import { createWebhookRouter } from '../routes/webhooksRoutes';

describe('createWebhookRouter', () => {
    test('delegates to EventSubService.handleWebhook', async () => {
        const handleWebhook = jest.fn();
        const router = createWebhookRouter({ handleWebhook } as any);

        const layer = (router as any).stack.find((l: any) => l.route?.path === '/eventsub/callback');
        const handler = layer.route.stack[1].handle;

        const req: any = { body: { hello: 'world' } };
        const res: any = {};
        await handler(req, res);

        expect(handleWebhook).toHaveBeenCalledWith(req, res);
    });
});
