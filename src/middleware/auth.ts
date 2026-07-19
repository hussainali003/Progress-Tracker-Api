import type {NextFunction, Request, Response} from "express";

import jwt from "jsonwebtoken";

// Verifies a `Bearer <token>` Authorization header and returns the user id from
// the JWT's `sub` claim, or null if the header is missing/invalid. Shared by the
// REST middleware below and the GraphQL context (src/graphql/index.ts).
export const getUserIdFromAuthHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      return null;
    }

    return decoded.sub;
  } catch (_err) {
    return null;
  }
};

// Shared across every protected route — verifies the JWT and puts the user id
// on the request for handlers to read via `req.user?.id`.
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({message: "No token provided"});
  }

  const userId = getUserIdFromAuthHeader(authHeader);

  if (!userId) {
    return res.status(401).json({message: "Invalid token"});
  }

  req.user = {id: userId};
  next();
};
