import crypto from "node:crypto";

import type {Request, Response} from "express";

import jwt from "jsonwebtoken";

import {pg} from "../config/db";

import {sendPasswordResetEmail} from "./mail";

export const register = async (req: Request, res: Response) => {
  const {name, email, password} = req.body;

  const existingUser = await pg("users").where("email", email).first();

  if (existingUser) {
    res.status(422).json({message: "Email is already taken."});
    return;
  }

  const [user] = await pg("users").insert(
    {name, email, password: pg.raw(`crypt(?, gen_salt('bf'))`, [password])},
    "id",
  );

  res.status(200).json({name, id: user.id});
};

export const login = async (req: Request, res: Response) => {
  const {email, password} = req.body;

  const user = await pg("users").where("email", email).first();

  if (!user) {
    res.status(401).json({message: "Invalid email or password."});
    return;
  }

  const isValidPassword = await pg("users")
    .where("id", user.id)
    .whereRaw("password = crypt(?, password)", [password])
    .first();

  if (!isValidPassword) {
    res.status(401).json({message: "Invalid email or password."});
    return;
  }

  const token = jwt.sign(
    {
      sub: user.id.toString(),
      name: user.name,
      "https://hasura.io/jwt/claims": {
        "x-hasura-user-id": user.id.toString(),
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"],
      },
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: "7d",
    },
  );

  res.status(200).json({
    id: user.id,
    name: user.name,
    token,
  });
};

export const me = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const user = await pg("users").where("id", userId).first();

    if (!user) {
      return res.status(404).json({message: "User not found."});
    }

    res.status(200).json({id: user.id, name: user.name});
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fetch user"});
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const {email} = req.body;

  const user = await pg("users").where("email", email).first();

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pg("password_resets").insert({
      user_id: user.id,
      token: hashedToken,
      expires_at: expiresAt,
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    await sendPasswordResetEmail(email, resetLink);
  }

  res.status(200).json({message: "If that email exists, a reset link has been sent."});
};

export const resetPassword = async (req: Request, res: Response) => {
  const {token, password} = req.body;

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const resetRecord = await pg("password_resets")
    .where("token", hashedToken)
    .where("used", false)
    .where("expires_at", ">", pg.fn.now())
    .first();

  if (!resetRecord) {
    res.status(400).json({message: "Invalid or expired reset token"});
    return;
  }

  await pg("users")
    .where("id", resetRecord.user_id)
    .update({password: pg.raw(`crypt(?, gen_salt('bf'))`, [password])});

  await pg("password_resets").where("id", resetRecord.id).update({used: true});

  res.status(200).json({message: "Password has been reset successfully"});
};
