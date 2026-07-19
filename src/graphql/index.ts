import {createSchema, createYoga} from "graphql-yoga";
import {getUserIdFromAuthHeader} from "../middleware/auth";
import {type GraphQLContext, resolvers} from "./resolvers";
import {typeDefs} from "./schema";

// GraphiQL is dev-only; in production /graphql only answers POSTed queries.
export const graphiqlEnabled = process.env.NODE_ENV !== "production";

export const yoga = createYoga({
  schema: createSchema<GraphQLContext>({typeDefs, resolvers}),
  graphiql: graphiqlEnabled,
  context: ({request}): GraphQLContext => ({
    userId: getUserIdFromAuthHeader(request.headers.get("authorization") ?? undefined),
  }),
});
