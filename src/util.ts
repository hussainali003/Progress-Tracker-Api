const getNextDate = (currentDate: Date) => {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + 1);
  return date;
};

export const getStreaks = (dates: Date[]) => {
  let nextDay = dates ? getNextDate(new Date()) : getNextDate(dates[0]);

  let tempStreak = 0;

  const streaks = [0];

  for (let i = 0; i < dates.length; i++) {
    if (i === 0 && i === dates.length - 1) {
      tempStreak++;
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else if (i === 0) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else if (
      new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10) &&
      i === dates.length - 1
    ) {
      tempStreak++;
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else if (new Date(nextDay).toISOString().slice(0, 10) === new Date(dates[i]).toISOString().slice(0, 10)) {
      tempStreak++;
      nextDay = getNextDate(dates[i]);
    } else if (
      new Date(nextDay).toISOString().slice(0, 10) !== new Date(dates[i]).toISOString().slice(0, 10) &&
      i === dates.length - 1
    ) {
      streaks.push(tempStreak);
      tempStreak = 1;
      // first we push the tempStreak previous and then push last tempStreak
      streaks.push(tempStreak);
      nextDay = getNextDate(dates[i]);
    } else {
      streaks.push(tempStreak);
      tempStreak = 1;
      nextDay = getNextDate(dates[i]);
    }
  }

  // dates = [1,2,3,4,5, 24,25, 27,29] || [29] [28] [28,29]
  // error = [2,3,4,5, 28,29] || [2,3,4,5,6,29] solved

  if (nextDay < new Date()) {
    streaks.push(0);
  }

  return streaks;
};

const getCurrentWeekObjects = () => {
  const now = new Date();

  // Find the start of the week (Sunday)
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay());

  // Set time to midnight UTC
  startOfWeek.setUTCHours(0, 0, 0, 0);

  return Array.from({length: 7}, (_, i) => {
    const day = new Date(startOfWeek);
    day.setUTCDate(startOfWeek.getUTCDate() + i);
    return day; // Returns the actual Date Object
  });
};

export function getHabitMinutesSpentInWeek(lastSevenDates: any) {
  const demoArr = [];

  const weekArray = getCurrentWeekObjects();

  for (let i = 0; i < weekArray.length; i++) {
    let flag = false;
    for (let j = 0; j < lastSevenDates.length; j++) {
      if (
        weekArray[i].toISOString().split("T")[0] ===
        new Date(lastSevenDates[j].completed_date).toISOString().split("T")[0]
      ) {
        demoArr.push(lastSevenDates[j]);
        flag = true;
        break;
      }
    }
    if (flag === false) {
      demoArr.push({completed_date: weekArray[i], minutes_spent: 0});
    } else {
      flag = false;
    }
  }

  const currentWeekMinutesSpent = [];

  for (let i = 0; i < demoArr.length; i++) {
    currentWeekMinutesSpent.push({
      day: weekArray[i].toLocaleDateString("en-US", {weekday: "short"}),
      "Minutes spend per day": demoArr[i].minutes_spent,
    });
  }

  return currentWeekMinutesSpent;
}
