import { Request, Response } from 'express';
import { MetricsService } from '../services/metricsService';


const metricsService = MetricsService.getInstance();


export const getAllMetrics = (_req: Request, res: Response) => {
    const data = metricsService.getAllMetrics();
    res.json(data);
};


export const getChannelMetrics = (req: Request, res: Response) => {
    const { channelId } = req.params;
    if (!channelId) {
        return res.status(400).json({ error: 'channelId is required' });
    }
    const data = metricsService.getChannelMetrics(channelId);
    res.json(data);
};


export const getUserMetrics = (req: Request, res: Response) => {
    const { channelId, userId } = req.params;
    if (!channelId || !userId) {
        return res.status(400).json({ error: 'channelId and userId are required' });
    }
    const data = metricsService.getUserMetrics(channelId, userId);
    res.json(data);
};