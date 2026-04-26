import { Request, Response, NextFunction } from "express";
import { config as envConfig } from "../config/environment";

export function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = envConfig.chatApiKey;
  if (!key) {
    res.status(503).json({ error: "Chat API key not configured" });
    return;
  }
  if (req.headers["x-api-key"] !== key) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
