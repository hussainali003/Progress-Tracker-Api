// SDL schema for the /graphql endpoint. Field names mirror what the frontend's
// HabitListItem type expects (Progress-Tracker-Web src/types/habit.ts), which is
// why `TimeDurations` is capitalized.
export const typeDefs = /* GraphQL */ `
  type Habit {
    id: ID!
    habit: String!
    color: String!
    completedDates: [String!]!
    TimeDurations: [Int!]!
  }

  type Query {
    habits: [Habit!]!
  }
`;
