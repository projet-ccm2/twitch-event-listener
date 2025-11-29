const getAllMetrics = jest.fn((_req, res) => res.json({ ok: true }));
const getChannelMetrics = jest.fn((_req, res) => res.json({ ok: true }));
const getUserMetrics = jest.fn((_req, res) => res.json({ ok: true }));

jest.mock('../controllers/metricsController', () => ({
    getAllMetrics,
    getChannelMetrics,
    getUserMetrics,
}));

import metricsRouter from '../routes/metricsRoutes';

const mockRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('metricsRoutes', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('routes / to getAllMetrics', async () => {
        const layer = (metricsRouter as any).stack.find((l: any) => l.route?.path === '/');
        const handler = layer.route.stack[0].handle;
        const res = mockRes();
        await handler({}, res);
        expect(getAllMetrics).toHaveBeenCalled();
    });

    test('routes /:channelId to getChannelMetrics', async () => {
        const layer = (metricsRouter as any).stack.find((l: any) => l.route?.path === '/:channelId');
        const handler = layer.route.stack[0].handle;
        const res = mockRes();
        await handler({ params: { channelId: '123' } }, res);
        expect(getChannelMetrics).toHaveBeenCalled();
    });

    test('routes /:channelId/users/:userId to getUserMetrics', async () => {
        const layer = (metricsRouter as any).stack.find((l: any) => l.route?.path === '/:channelId/users/:userId');
        const handler = layer.route.stack[0].handle;
        const res = mockRes();
        await handler({ params: { channelId: '1', userId: '2' } }, res);
        expect(getUserMetrics).toHaveBeenCalled();
    });
});
