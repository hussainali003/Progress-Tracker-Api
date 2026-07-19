import type {NextFunction, Request, Response} from "express";

import jwt from "jsonwebtoken";

// Shared across every protected route — verifies the JWT and puts the user id
// on the request for handlers to read via `req.user?.id`.
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({message: "No token provided"});
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      return res.status(401).json({message: "Invalid token"});
    }

    req.user = {id: decoded.sub};
    next();
  } catch (_err) {
    return res.status(401).json({message: "Invalid token"});
  }
};
