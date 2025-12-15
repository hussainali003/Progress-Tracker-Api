import knex from "knex";

export const pg = knex({
  client: "pg",
  connection: {
    user: "neondb_owner",
    userName: "neondb_owner",
    connectionString: process.env.PG_CONNECTION_STRING,
  },
});
