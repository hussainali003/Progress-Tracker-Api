import {GraphQLError} from "graphql";
import {fetchHabitsWithRecords} from "../habits/controller";

export type GraphQLContext = {
  userId: string | null;
};

// completed_date comes back from pg as a Date — serialize it the same way the
// REST routes do (JSON.stringify → ISO string) so the frontend sees no difference.
const toISO = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value));

export const resolvers = {
  Query: {
    habits: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.userId) {
        throw new GraphQLError("Unauthorized", {
          extensions: {code: "UNAUTHENTICATED", http: {status: 401}},
        });
      }

      const {habits, records} = await fetchHabitsWithRecords(context.userId);

      return habits.map((habit) => {
        const habitRecords = records.filter((r) => r.habit_id === habit.id);

        return {
          ...habit,
          completedDates: habitRecords.map((r) => toISO(r.completed_date)),
          TimeDurations: habitRecords.map((r) => r.minutes_spent).filter((m): m is number => m != null),
        };
      });
    },
  },
};
