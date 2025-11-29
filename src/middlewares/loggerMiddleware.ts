import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';


export const loggerMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const start = process.hrtime();

    res.on('finish', () => {
        const diff = process.hrtime(start);
        const duration = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2); // ms
        logger.info(
            `${req.method} ${req.url} ${res.statusCode} - ${duration} ms`
        );
    });
    next();
};