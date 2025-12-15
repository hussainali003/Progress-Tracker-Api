import type {Request, Response} from "express";

import jwt from "jsonwebtoken";

import {pg} from "../config/db";

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
